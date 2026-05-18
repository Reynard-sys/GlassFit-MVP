import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  LightingAnalysis,
  OverlayTransform,
  ProductModelOption,
  ProductModelType,
  WindowGlassSettings,
} from "./types";

export interface ModelLoadResult {
  isFallback: boolean;
  message: string;
}

const FALLBACK_WINDOW_GLASS_SETTINGS: WindowGlassSettings = {
  mode: "frosted",
  opacity: 0.9,
  tintColor: "#dbeafe",
  outdoorTexturePath: "/textures/outdoor-view.jpg",
};

const GLASS_KEYWORDS = [
  "glass",
  "pane",
  "window_glass",
  "windowglass",
  "transparent",
  "glazing",
];

export class ProductModelRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly modelGroup = new THREE.Group();
  private readonly rimLight: THREE.DirectionalLight;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private currentModelType: ProductModelType | null = null;
  private glassMaterialCacheKey = "";
  private glassMaterial: THREE.Material | null = null;
  private glassMaterials: THREE.Material[] = [];
  private glassMeshes: THREE.Mesh[] = [];
  private modelRoot: THREE.Object3D | null = null;
  private outdoorTextures = new Map<string, THREE.Texture | "loading" | "failed">();
  private proceduralGlassFill: THREE.Mesh | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 1024;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: this.canvas,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(1024, 1024, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(3.4, 1.8, 5.6);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(this.modelGroup);
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    this.keyLight.position.set(3.5, 5, 4);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0xd8f2ff, 0.9);
    this.rimLight.position.set(-4, 3, -3);
    this.scene.add(this.rimLight);
  }

  async loadModel(
    modelType: ProductModelType,
    modelSrc: string,
    fallback: ProductModelOption["fallback"],
  ): Promise<ModelLoadResult> {
    this.clearModel();
    this.currentModelType = modelType;
    this.modelGroup.rotation.set(0, 0, 0);

    try {
      const gltf = await new GLTFLoader().loadAsync(modelSrc);
      this.modelRoot = gltf.scene;
      this.modelGroup.add(this.modelRoot);
      this.normalizeModel();
      this.setupWindowGlassTargets();

      return {
        isFallback: false,
        message: "Loaded browser-ready 3D model.",
      };
    } catch {
      this.modelRoot =
        fallback === "window"
          ? createProceduralWindowModel()
          : createProceduralDrawerModel();
      this.modelGroup.add(this.modelRoot);
      this.normalizeModel();
      this.setupWindowGlassTargets();

      const modelLabel = modelType === "window" ? "Window" : "Ikea 3-Drawer";
      const assetName =
        modelType === "window" ? "public/models/glass_window.glb" : "public/models/ikea-3-drawer.glb";

      return {
        isFallback: true,
        message:
          `${modelLabel} GLB is not available yet, so the editor is using a procedural ${fallback} placeholder. Add ${assetName} to use the exact model.`,
      };
    }
  }

  render(
    transform: OverlayTransform,
    lighting?: LightingAnalysis,
    windowGlass?: WindowGlassSettings,
  ) {
    if (!this.modelRoot) {
      return null;
    }

    this.applyLighting(lighting);
    if (this.currentModelType === "window") {
      this.applyWindowGlassSettings(windowGlass);
    }
    this.modelGroup.rotation.set(
      THREE.MathUtils.degToRad(transform.modelPitch),
      THREE.MathUtils.degToRad(transform.modelYaw),
      0,
    );
    this.renderer.render(this.scene, this.camera);

    return this.canvas;
  }

  dispose() {
    this.clearModel();
    for (const texture of this.outdoorTextures.values()) {
      if (texture instanceof THREE.Texture) {
        texture.dispose();
      }
    }
    this.outdoorTextures.clear();
    this.renderer.dispose();
  }

  private clearModel() {
    const cachedGlassMaterials = new Set(this.glassMaterials);
    if (this.glassMaterial) {
      cachedGlassMaterials.add(this.glassMaterial);
    }

    if (this.proceduralGlassFill) {
      this.modelGroup.remove(this.proceduralGlassFill);
      this.proceduralGlassFill.geometry.dispose();
      this.proceduralGlassFill = null;
    }

    this.glassMeshes = [];
    this.disposeGlassMaterial();
    this.glassMaterialCacheKey = "";
    this.currentModelType = null;

    if (!this.modelRoot) {
      return;
    }

    this.modelGroup.remove(this.modelRoot);
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (!materialSetContains(cachedGlassMaterials, child.material)) {
          disposeMaterial(child.material);
        }
      }
    });
    this.modelRoot = null;
  }

  private normalizeModel() {
    if (!this.modelRoot) {
      return;
    }

    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.2 / maxAxis;

    this.modelRoot.scale.setScalar(scale);
    this.modelRoot.position.set(
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    );
  }

  private setupWindowGlassTargets() {
    this.glassMeshes = [];

    if (this.currentModelType !== "window" || !this.modelRoot) {
      return;
    }

    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh && isGlassMesh(child)) {
        this.glassMeshes.push(child);
      }
    });

    if (this.glassMeshes.length === 0) {
      this.addProceduralGlassFill();
    }
  }

  private addProceduralGlassFill() {
    if (!this.modelRoot || this.proceduralGlassFill) {
      return;
    }

    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const width = Math.max(size.x * 0.72, 0.45);
    const height = Math.max(size.y * 0.72, 0.45);
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = createWindowGlassMaterial(
      FALLBACK_WINDOW_GLASS_SETTINGS,
      this.getOutdoorTexture(FALLBACK_WINDOW_GLASS_SETTINGS.outdoorTexturePath),
    );
    const plane = new THREE.Mesh(geometry, material);

    plane.name = "Procedural_Window_Glass_Fill";
    plane.position.set(center.x, center.y, center.z + Math.max(size.z * 0.04, 0.02));
    this.modelGroup.add(plane);
    this.proceduralGlassFill = plane;
    this.glassMeshes.push(plane);
  }

  private applyWindowGlassSettings(windowGlass?: WindowGlassSettings) {
    const settings = normalizeWindowGlassSettings(windowGlass);
    const meshSignature = this.glassMeshes
      .map((mesh) => `${mesh.name}:${getGlassMeshAspect(mesh).toFixed(3)}`)
      .join(",");
    const cacheKey = [
      settings.mode,
      settings.opacity,
      settings.tintColor,
      settings.outdoorTexturePath ?? "",
      this.getOutdoorTextureCacheState(settings.outdoorTexturePath),
      meshSignature,
    ].join("|");

    if (cacheKey !== this.glassMaterialCacheKey || this.glassMaterials.length === 0) {
      this.disposeGlassMaterial();
      const outdoorTexture = this.getOutdoorTexture(settings.outdoorTexturePath);
      this.glassMaterials = this.glassMeshes.map((mesh) =>
        createWindowGlassMaterial(
          settings,
          createOutdoorTextureForPane(
            outdoorTexture,
            getGlassMeshAspect(mesh),
            shouldCounterRotateOutdoorTexture(mesh, this.proceduralGlassFill),
          ),
        ),
      );
      this.glassMaterialCacheKey = cacheKey;
    }

    this.glassMeshes.forEach((mesh, index) => {
      mesh.material = this.glassMaterials[index] ?? this.glassMaterials[0];
      mesh.renderOrder = settings.mode === "transparent" ? 2 : 1;
    });
  }

  private getOutdoorTexture(path: string | undefined) {
    const texturePath = path || FALLBACK_WINDOW_GLASS_SETTINGS.outdoorTexturePath;
    if (!texturePath) {
      return createProceduralOutdoorTexture();
    }

    const cachedTexture = this.outdoorTextures.get(texturePath);
    if (cachedTexture instanceof THREE.Texture) {
      return cachedTexture;
    }

    if (!cachedTexture) {
      this.outdoorTextures.set(texturePath, "loading");
      new THREE.TextureLoader().load(
        texturePath,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          this.outdoorTextures.set(texturePath, texture);
          this.glassMaterialCacheKey = "";
        },
        undefined,
        () => {
          this.outdoorTextures.set(texturePath, "failed");
          this.glassMaterialCacheKey = "";
        },
      );
    }

    return createProceduralOutdoorTexture();
  }

  private getOutdoorTextureCacheState(path: string | undefined) {
    const texturePath = path || FALLBACK_WINDOW_GLASS_SETTINGS.outdoorTexturePath;
    const cachedTexture = texturePath ? this.outdoorTextures.get(texturePath) : undefined;

    if (cachedTexture instanceof THREE.Texture) {
      return "loaded";
    }

    return cachedTexture ?? "procedural";
  }

  private disposeGlassMaterial() {
    if (this.glassMaterial) {
      disposeMaterial(this.glassMaterial);
      this.glassMaterial = null;
    }

    for (const material of new Set(this.glassMaterials)) {
      disposeMaterial(material);
    }
    this.glassMaterials = [];
  }

  private applyLighting(lighting?: LightingAnalysis) {
    if (!lighting) {
      this.renderer.toneMappingExposure = 1;
      this.ambientLight.color.set(0xffffff);
      this.ambientLight.intensity = 1.8;
      this.keyLight.color.set(0xffffff);
      this.keyLight.intensity = 2.1;
      this.keyLight.position.set(3.5, 5, 4);
      this.rimLight.color.set(0xd8f2ff);
      this.rimLight.intensity = 0.9;
      this.rimLight.position.set(-4, 3, -3);
      return;
    }

    const ambientColor = colorFromRgb(lighting.ambient_rgb);
    const meanIntensity = lighting.mean_rgb.reduce((sum, value) => sum + value, 0) / 3;
    const exposure = THREE.MathUtils.clamp(meanIntensity / 135, 0.72, 1.24);
    const direction = lighting.light_direction;

    this.renderer.toneMappingExposure = exposure;
    this.ambientLight.color.copy(ambientColor);
    this.ambientLight.intensity = THREE.MathUtils.clamp(
      1.15 + lighting.saturation * 0.5 + exposure * 0.35,
      1.1,
      2.05,
    );
    this.keyLight.color.copy(ambientColor).lerp(new THREE.Color(0xffffff), 0.32);
    this.keyLight.intensity = THREE.MathUtils.clamp(
      1.45 + lighting.contrast * 0.45,
      1.25,
      2.6,
    );
    this.keyLight.position.set(
      direction.x * 4.5 || 2.8,
      4.2 + direction.y * 1.8,
      4.4,
    );
    this.rimLight.color.set(lighting.warmth >= 0 ? 0xffead3 : 0xd8eeff);
    this.rimLight.intensity = THREE.MathUtils.clamp(0.35 + lighting.sharpness * 0.45, 0.28, 1);
    this.rimLight.position.set(-direction.x * 3.5 || -3, 2.4, -3.4);
  }
}

function createProceduralDrawerModel() {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3f0e8,
    metalness: 0.08,
    roughness: 0.42,
  });
  const drawerMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7e0d1,
    metalness: 0.05,
    roughness: 0.38,
  });
  const aluminumMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c989d,
    metalness: 0.65,
    roughness: 0.24,
  });
  const shadowMaterial = new THREE.MeshStandardMaterial({
    color: 0x48433d,
    metalness: 0.08,
    roughness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 1.45), bodyMaterial);
  body.position.y = 1.35;
  group.add(body);

  for (let index = 0; index < 3; index += 1) {
    const drawer = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.66, 0.08),
      drawerMaterial,
    );
    drawer.position.set(0, 2.12 - index * 0.78, 0.765);
    group.add(drawer);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.08, 0.08),
      aluminumMaterial,
    );
    handle.position.set(0, drawer.position.y, 0.84);
    group.add(handle);
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.14, 1.58), aluminumMaterial);
  top.position.set(0, 2.78, 0);
  group.add(top);

  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.36, 18), shadowMaterial);
      leg.position.set(x, -0.18, z);
      group.add(leg);
    }
  }

  return group;
}

function createProceduralWindowModel() {
  const group = new THREE.Group();

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f3438,
    metalness: 0.72,
    roughness: 0.22,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x98a2a8,
    metalness: 0.8,
    roughness: 0.2,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xbdd8e6,
    metalness: 0.02,
    opacity: 0.38,
    roughness: 0.08,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.05, 2.9, 0.035), glassMaterial);
  glass.name = "Procedural_Window_Glass_Pane";
  glass.position.y = 1.45;
  group.add(glass);

  const outerFrameParts = [
    { size: [0.16, 3.25, 0.16], position: [-1.16, 1.45, 0] },
    { size: [0.16, 3.25, 0.16], position: [1.16, 1.45, 0] },
    { size: [2.48, 0.16, 0.16], position: [0, 3.08, 0] },
    { size: [2.48, 0.16, 0.16], position: [0, -0.18, 0] },
  ] as const;

  for (const part of outerFrameParts) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(...part.size),
      frameMaterial,
    );
    frame.position.set(part.position[0], part.position[1], part.position[2]);
    group.add(frame);
  }

  const dividerParts = [
    { size: [0.08, 3.0, 0.13], position: [0, 1.45, 0.04] },
    { size: [2.18, 0.08, 0.13], position: [0, 1.45, 0.04] },
  ] as const;

  for (const part of dividerParts) {
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(...part.size),
      edgeMaterial,
    );
    divider.position.set(part.position[0], part.position[1], part.position[2]);
    group.add(divider);
  }

  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    opacity: 0.28,
    roughness: 0.05,
    transparent: true,
  });
  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 2.45, 0.04),
    highlightMaterial,
  );
  highlight.position.set(-0.58, 1.52, 0.08);
  highlight.rotation.z = THREE.MathUtils.degToRad(-12);
  group.add(highlight);

  return group;
}

function isGlassMesh(mesh: THREE.Mesh) {
  const materialNames = Array.isArray(mesh.material)
    ? mesh.material.map((material) => material.name).join(" ")
    : mesh.material.name;
  const searchableText = [
    mesh.name,
    materialNames,
    mesh.parent?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return GLASS_KEYWORDS.some((keyword) => searchableText.includes(keyword));
}

function normalizeWindowGlassSettings(
  settings: WindowGlassSettings | undefined,
): WindowGlassSettings {
  return {
    ...FALLBACK_WINDOW_GLASS_SETTINGS,
    ...settings,
    tintColor: settings?.tintColor || FALLBACK_WINDOW_GLASS_SETTINGS.tintColor,
    opacity:
      typeof settings?.opacity === "number"
        ? THREE.MathUtils.clamp(settings.opacity, 0, 1)
        : FALLBACK_WINDOW_GLASS_SETTINGS.opacity,
  };
}

function createWindowGlassMaterial(
  settings: WindowGlassSettings,
  outdoorTexture: THREE.Texture,
) {
  const tintColor = new THREE.Color(settings.tintColor);

  switch (settings.mode) {
    case "transparent":
      return new THREE.MeshPhysicalMaterial({
        color: tintColor,
        transparent: true,
        opacity: settings.opacity,
        roughness: 0.05,
        metalness: 0,
        transmission: 0.4,
        thickness: 0.02,
        clearcoat: 0.4,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    case "outdoor":
      return new THREE.MeshStandardMaterial({
        map: outdoorTexture,
        transparent: settings.opacity < 1,
        opacity: settings.opacity,
        roughness: 0.45,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
    case "solid":
      return new THREE.MeshStandardMaterial({
        color: tintColor,
        transparent: settings.opacity < 1,
        opacity: settings.opacity,
        roughness: 0.65,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
    case "frosted":
    default:
      return new THREE.MeshStandardMaterial({
        color: tintColor,
        transparent: settings.opacity < 1,
        opacity: settings.opacity,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
  }
}

function createOutdoorTextureForPane(
  sourceTexture: THREE.Texture,
  paneAspect: number,
  counterRotate: boolean,
) {
  const image = sourceTexture.image as CanvasImageSource | undefined;
  if (!image) {
    return sourceTexture;
  }

  const targetWidth = 1024;
  const targetHeight = Math.max(256, Math.round(targetWidth / Math.max(paneAspect, 0.25)));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return sourceTexture;
  }

  drawImageCover(context, image, targetWidth, targetHeight);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = counterRotate ? -Math.PI / 2 : 0;
  texture.needsUpdate = true;

  return texture;
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
) {
  const imageWidth = getCanvasImageSourceWidth(image);
  const imageHeight = getCanvasImageSourceHeight(image);

  if (!imageWidth || !imageHeight) {
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return;
  }

  const sourceAspect = imageWidth / imageHeight;
  const targetAspect = targetWidth / targetHeight;
  let sourceWidth = imageWidth;
  let sourceHeight = imageHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceAspect > targetAspect) {
    sourceWidth = imageHeight * targetAspect;
    sourceX = (imageWidth - sourceWidth) / 2;
  } else {
    sourceHeight = imageWidth / targetAspect;
    sourceY = (imageHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
}

function getCanvasImageSourceWidth(image: CanvasImageSource) {
  if ("naturalWidth" in image && typeof image.naturalWidth === "number") {
    return image.naturalWidth;
  }

  if ("videoWidth" in image && typeof image.videoWidth === "number") {
    return image.videoWidth;
  }

  if ("displayWidth" in image && typeof image.displayWidth === "number") {
    return image.displayWidth;
  }

  if ("width" in image && typeof image.width === "number") {
    return image.width;
  }

  return 0;
}

function getCanvasImageSourceHeight(image: CanvasImageSource) {
  if ("naturalHeight" in image && typeof image.naturalHeight === "number") {
    return image.naturalHeight;
  }

  if ("videoHeight" in image && typeof image.videoHeight === "number") {
    return image.videoHeight;
  }

  if ("displayHeight" in image && typeof image.displayHeight === "number") {
    return image.displayHeight;
  }

  if ("height" in image && typeof image.height === "number") {
    return image.height;
  }

  return 0;
}

function getGlassMeshAspect(mesh: THREE.Mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);

  const width = Math.max(size.x, size.z, 0.01);
  const height = Math.max(size.y, 0.01);

  return THREE.MathUtils.clamp(width / height, 0.25, 6);
}

function shouldCounterRotateOutdoorTexture(
  mesh: THREE.Mesh,
  proceduralGlassFill: THREE.Mesh | null,
) {
  return mesh !== proceduralGlassFill && getGlassMeshAspect(mesh) > 1.1;
}

function createProceduralOutdoorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const sky = context.createLinearGradient(0, 0, 0, canvas.height * 0.68);
  sky.addColorStop(0, "#bfdbfe");
  sky.addColorStop(1, "#eff6ff");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height * 0.68);

  const ground = context.createLinearGradient(0, canvas.height * 0.58, 0, canvas.height);
  ground.addColorStop(0, "#d9e6d2");
  ground.addColorStop(1, "#94a38e");
  context.fillStyle = ground;
  context.fillRect(0, canvas.height * 0.62, canvas.width, canvas.height * 0.38);

  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.beginPath();
  context.ellipse(132, 96, 62, 22, 0, 0, Math.PI * 2);
  context.ellipse(176, 90, 48, 18, 0, 0, Math.PI * 2);
  context.ellipse(356, 132, 74, 24, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(84, 110, 92, 0.35)";
  for (let index = 0; index < 7; index += 1) {
    const x = 42 + index * 72;
    context.beginPath();
    context.moveTo(x, 330);
    context.lineTo(x + 34, 246);
    context.lineTo(x + 68, 330);
    context.closePath();
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  const map = "map" in material ? material.map : null;
  if (map instanceof THREE.Texture && map instanceof THREE.CanvasTexture) {
    map.dispose();
  }

  material.dispose();
}

function materialSetContains(
  materialSet: Set<THREE.Material>,
  material: THREE.Material | THREE.Material[],
) {
  if (Array.isArray(material)) {
    return material.some((entry) => materialSet.has(entry));
  }

  return materialSet.has(material);
}

function colorFromRgb(rgb: [number, number, number]) {
  return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}
