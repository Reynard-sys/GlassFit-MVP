import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LightingAnalysis, OverlayTransform } from "./types";

export interface ModelLoadResult {
  isFallback: boolean;
  message: string;
}

export class ProductModelRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly modelGroup = new THREE.Group();
  private readonly rimLight: THREE.DirectionalLight;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private modelRoot: THREE.Object3D | null = null;

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
    this.camera.position.set(3.7, 2.3, 5.5);
    this.camera.lookAt(0, 0.8, 0);

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

  async loadModel(modelSrc: string): Promise<ModelLoadResult> {
    this.clearModel();

    try {
      const gltf = await new GLTFLoader().loadAsync(modelSrc);
      this.modelRoot = gltf.scene;
      this.modelGroup.add(this.modelRoot);
      this.normalizeModel();

      return {
        isFallback: false,
        message: "Loaded browser-ready 3D model.",
      };
    } catch {
      this.modelRoot = createProceduralDrawerModel();
      this.modelGroup.add(this.modelRoot);
      this.normalizeModel();

      return {
        isFallback: true,
        message:
          "Ikea 3-Drawer GLB is not available yet, so the editor is using a procedural 3D drawer placeholder. Export the .blend to public/models/ikea-3-drawer.glb to use the exact model.",
      };
    }
  }

  render(transform: OverlayTransform, lighting?: LightingAnalysis) {
    if (!this.modelRoot) {
      return null;
    }

    this.applyLighting(lighting);
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
    this.renderer.dispose();
  }

  private clearModel() {
    if (!this.modelRoot) {
      return;
    }

    this.modelGroup.remove(this.modelRoot);
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        disposeMaterial(child.material);
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
    const scale = 2.6 / maxAxis;

    this.modelRoot.position.sub(center);
    this.modelRoot.scale.setScalar(scale);
    this.modelRoot.position.y += (size.y * scale) / 2 - 1.1;
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

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function colorFromRgb(rgb: [number, number, number]) {
  return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}
