# GlassFit MVP

Photo-based visualization prototype for placing a glass/aluminum overlay into an uploaded room image with brightness-aware adjustment and object-aware layering.

## What is Included

- Next.js App Router frontend with TypeScript and Tailwind CSS.
- HTML Canvas editor for moving, resizing, rotating, and exporting the overlay.
- Three.js 3D product overlay composited into the final PNG export.
- FastAPI image analysis service with OpenCV brightness and ambient-light analysis.
- YOLOv8 segmentation for real detected objects and generated alpha masks.
- Mock segmentation fallback only when explicitly requested or when YOLO is unavailable.

## Frontend Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Create `.env.local` if you need to override the API URL:

```bash
NEXT_PUBLIC_IMAGE_API_URL=http://localhost:8000
```

## Backend Setup

```bash
cd fastapi-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

On macOS or Linux, use:

```bash
source venv/bin/activate
```

## Segmentation Modes

Default mode is real YOLO segmentation with automatic mock fallback:

```powershell
$env:SEGMENTATION_MODE="auto"
$env:YOLO_MODEL="yolov8s-seg.pt"
uvicorn main:app --reload --port 8000
```

Strict YOLO mode disables mock fallback:

```powershell
$env:SEGMENTATION_MODE="yolo"
uvicorn main:app --reload --port 8000
```

Mock mode is available for offline UI testing only:

```powershell
$env:SEGMENTATION_MODE="mock"
uvicorn main:app --reload --port 8000
```

Useful tuning variables:

- `YOLO_CONFIDENCE`, default `0.35`
- `YOLO_IOU`, default `0.5`
- `YOLO_IMAGE_SIZE`, default `1024`
- `MIN_OBJECT_AREA_RATIO`, default `0.018`
- `MAX_DETECTED_OBJECTS`, default `5`
- `YOLO_ALLOW_ALL_CLASSES=true` to show every COCO class instead of room-relevant classes only

## Ambient Matching

The backend returns both the original brightness category and a richer `lighting` block. It estimates:

- ambient RGB color and warm/cool temperature
- photo contrast and saturation
- rough light direction from left/right/top/bottom luminance
- sharpness and image noise

The frontend uses that data to relight the Three.js model, color-grade the rendered model pixels, add subtle photo-like grain/softness, and derive realistic shadow defaults before final PNG export.

## Shadow System

Shadows are generated in the 2D canvas composition pipeline rather than relying only on Three.js real-time shadows. This is intentional because the uploaded photo does not contain real 3D floor geometry, but the exported PNG must include the shadows.

The compositor draws two shadow layers before the model:

- Directional cast shadow: a soft, blurred silhouette from the rendered model alpha, offset opposite the estimated light direction.
- Contact shadow: a soft ellipse under the model that anchors it to the floor/surface.

The `Shadow & Grounding` controls let the user enable/disable shadows, use automatic photo-derived settings, adjust opacity, blur, length, and direction, then reset back to automatic estimates.

## 3D Model Asset

The browser uses a GLB model, not a PNG overlay:

```text
public/models/ikea-3-drawer.glb
```

Browsers cannot load Blender `.blend` files directly. Convert the root `Ikea 3-Drawer.blend` file with Blender:

```powershell
blender --background "Ikea 3-Drawer.blend" --python scripts/export_blend_to_glb.py -- public/models/ikea-3-drawer.glb
```

If the GLB has not been exported yet, the editor uses a procedural Three.js drawer model so the overlay pipeline remains genuinely 3D.

## Main Files

- `src/components/GlassFitMvp.tsx` coordinates upload, analysis state, toggles, controls, and output.
- `src/components/CanvasEditor.tsx` renders the background, Three.js model overlay, selected object cutouts, and PNG export.
- `src/components/ObjectTogglePanel.tsx` manages independent object occlusion toggles.
- `src/lib/modelRenderer.ts` loads a GLB model or builds the procedural 3D fallback.
- `src/lib/imageApi.ts` calls the FastAPI service and normalizes mask URLs.
- `fastapi-service/main.py` exposes `/analyze-image` and serves generated masks.
- `fastapi-service/brightness.py` computes mean pixel intensity plus ambient color, contrast, saturation, light direction, sharpness, and noise.
- `fastapi-service/segmentation.py` provides YOLOv8-seg detection, mask filtering, and mock fallback.
- `scripts/export_blend_to_glb.py` exports the Blender source file to the browser-ready GLB format.
