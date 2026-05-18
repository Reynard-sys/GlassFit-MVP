# GlassFit MVP Implementation Guide

This document records what was implemented in the GlassFit MVP, what technologies were used, why the choices were made, and how this prototype can guide the real project build.

## 1. Project Goal

GlassFit is a photo-based visualization system for customized glass and aluminum fitting. The MVP focuses only on proving the core feasibility pipeline:

1. Upload a real room or space photo.
2. Analyze the uploaded photo with a backend service.
3. Detect visible real-world objects and generate segmentation masks.
4. Place a 3D product model into the uploaded photo.
5. Move, resize, rotate, and adjust the 3D overlay.
6. Place multiple product overlays in one photo session.
7. Toggle whether each 3D product appears behind detected objects.
8. Match the 3D model lighting/color/quality to the uploaded photo.
9. Generate and download the final composed visualization image.

The MVP intentionally does not include authentication, database storage, quotation, booking, admin tools, product catalogs, Messenger/Viber handoff, or full real-time AR.

## 2. High-Level Architecture

The project is split into two applications:

```text
Next.js frontend
  |
  | uploads image as multipart/form-data
  v
FastAPI image analysis service
  |
  | returns brightness, lighting, detected objects, masks
  v
Next.js canvas editor
  |
  | composites uploaded photo + placed overlay layers + active 3D model + selected object cutouts
  v
Final downloadable PNG
```

The frontend handles the user experience, 3D rendering, canvas composition, overlay layer state, object toggle behavior, and final export. The backend handles image analysis, brightness/ambience estimation, object segmentation, and mask generation.

## 3. Technologies Used

### Frontend

- **Next.js 16.2.6**
  - App Router project structure.
  - Uses `src/app/page.tsx` as the main route.
  - `next.config.ts` sets `turbopack.root` to avoid workspace-root warnings.

- **React 19.2.4**
  - Used for interactive UI state, upload flow, object toggles, and canvas controls.

- **TypeScript**
  - Used for shared frontend interfaces such as `DetectedObject`, `ImageAnalysisResponse`, `LightingAnalysis`, and `OverlayTransform`.

- **Tailwind CSS 4**
  - Used for layout and styling.
  - The UI is a clean MVP tool layout: left-side controls, main canvas, and output preview.

- **Three.js 0.184.0**
  - Used to render the 3D product model in the browser.
  - The 3D render is drawn into a transparent WebGL canvas, then composited into the 2D output canvas.

- **HTML Canvas**
  - Used for final image composition and PNG export.
  - Layers:
    1. Uploaded original photo.
    2. Directional cast shadow.
    3. Contact shadow.
    4. Rendered 3D product model.
    5. Object cutouts from the original photo for enabled occlusion toggles.

### Backend

- **Python FastAPI 0.124.2**
  - Provides the `/analyze-image` API endpoint.

- **Uvicorn 0.38.0**
  - Runs the local FastAPI development server.

- **python-multipart 0.0.20**
  - Required by FastAPI for image uploads using `multipart/form-data`.

- **OpenCV 4.11.0.86**
  - Reads uploaded images.
  - Computes grayscale brightness.
  - Computes image contrast, saturation, sharpness, noise, and light-direction estimates.
  - Writes generated object masks as PNG images.

- **NumPy 1.26.4**
  - Used for numerical image statistics and pixel operations.

- **Ultralytics 8.3.235**
  - Provides YOLOv8 segmentation.
  - Default model is `yolov8s-seg.pt`.
  - Produces object labels, confidence values, bounding boxes, and masks.

- **Torch / Torchvision**
  - Installed as dependencies of Ultralytics.
  - Used internally by YOLO.

### 3D Asset Tooling

- **Blender**
  - Required externally to convert `.blend` files into browser-loadable `.glb`.
  - Browsers cannot load `.blend` files directly.

- **GLB / glTF**
  - The browser-ready 3D model format expected by the app.
  - Target paths:

```text
public/models/ikea-3-drawer.glb
public/models/glass_window.glb
```

## 4. Main Files and Responsibilities

### Frontend Files

```text
src/app/page.tsx
```

Loads the main GlassFit MVP component.

```text
src/app/layout.tsx
```

Sets app metadata and global layout shell.

```text
src/app/globals.css
```

Imports Tailwind and defines global base styles.

```text
src/components/GlassFitMvp.tsx
```

Main state coordinator. Handles:

- selected uploaded image
- backend analysis response
- active editable overlay state
- placed overlay layer state
- selected overlay layer
- output image state
- warnings and errors

```text
src/components/CollapsiblePanel.tsx
```

Reusable collapsible panel shell used by the sidebar controls so upload, model selection, placed overlays, occlusion, and overlay adjustment sections can be opened or collapsed independently.

```text
src/components/UploadPanel.tsx
```

Handles user image selection and displays:

- selected filename
- upload/analysis loading state
- brightness category
- mean pixel intensity
- active detector mode
- ambient match summary and detected ambient color

```text
src/components/ObjectTogglePanel.tsx
```

Displays detected objects for the active overlay. Each object has an independent toggle:

- ON means the object cutout renders above the 3D model.
- OFF means the 3D model renders in front of that object.

The toggle state is saved per overlay as `occlusionObjectIds`.

```text
src/components/OverlayControls.tsx
```

Controls the active editable 3D overlay:

- resize
- rotate on photo
- 3D yaw
- 3D pitch
- opacity
- nudge left/up/right/down
- reset
- apply/place overlay
- cancel active editing
- duplicate active overlay
- window glass view mode for window overlays
- enable/disable ambient light adjustment
- enable/disable realistic shadows
- reset automatic shadow settings
- generate output

```text
src/components/ProductModelPanel.tsx
```

Lists product model choices and starts a new active overlay:

- cabinet
- window

```text
src/components/PlacedOverlayPanel.tsx
```

Lists flattened placed overlays and exposes layer actions:

- select
- edit
- duplicate
- hide/show
- delete
- move up/down

```text
src/components/CanvasEditor.tsx
```

Core visual compositor. Handles:

- uploaded image drawing
- placed overlay image layer drawing
- active 3D model rendering/compositing
- dragging only the active overlay on the canvas
- applying ambient model matching
- drawing directional cast shadows
- drawing contact shadows
- drawing per-overlay original-image object cutouts above the model
- exporting the final visualization as PNG

```text
src/components/ResultPreview.tsx
```

Shows before-and-after preview and download link for the generated final image.

```text
src/lib/types.ts
```

Shared TypeScript interfaces:

- `BrightnessAnalysis`
- `LightingAnalysis`
- `DetectedObject`
- `ImageAnalysisResponse`
- `ProductModelType`
- `ProductModelOption`
- `GlassViewMode`
- `WindowGlassSettings`
- `OverlayTransform`
- `ShadowSettings`
- `PlacedOverlay`
- `ActiveOverlayState`
- `CanvasEditorHandle`

```text
src/lib/imageApi.ts
```

Frontend API client for `/analyze-image`. Also handles:

- accepted image file types
- max upload size
- API base URL
- mask URL normalization

```text
src/lib/canvasUtils.ts
```

Canvas helpers:

- initial overlay transform
- automatic shadow-setting derivation
- ambient filter helpers
- image loading
- confidence formatting
- value clamping

```text
src/lib/modelRenderer.ts
```

Three.js model renderer. Handles:

- loading `/models/ikea-3-drawer.glb`
- loading `/models/glass_window.glb`
- procedural 3D drawer fallback if the GLB is missing
- procedural aluminum/glass window fallback if the window GLB is missing
- normalizing model scale
- setting camera and lights
- relighting the model using photo-derived ambience
- detecting and replacing window glass materials
- adding a procedural glass fill plane when a window GLB has no detected glass mesh
- generating an outdoor glass fallback texture when `/textures/outdoor-view.jpg` is missing
- rendering the model into a transparent canvas

```text
src/lib/productModels.ts
```

Defines the available product models:

- `cabinet` -> `/models/ikea-3-drawer.glb`
- `window` -> `/models/glass_window.glb`

It also provides helpers used to name new overlays, such as `Cabinet 1` and `Window 1`, and to initialize default window glass settings.

### Backend Files

```text
fastapi-service/main.py
```

FastAPI application. Handles:

- CORS for local frontend development
- `/health`
- `/analyze-image`
- temporary upload saving
- brightness analysis
- lighting analysis
- segmentation analysis
- serving generated masks from `/masks`

```text
fastapi-service/brightness.py
```

Image analysis module. Despite the filename, it now handles both basic brightness and richer ambience matching data.

It computes:

- mean pixel intensity
- brightness category: `dim`, `normal`, or `bright`
- ambient RGB color
- ambient hex color
- contrast
- saturation
- warmth
- tint
- warm/cool/neutral temperature category
- sharpness
- estimated noise
- estimated light direction
- suggested model adjustments

```text
fastapi-service/segmentation.py
```

Object segmentation module. Handles:

- YOLOv8 segmentation by default
- mock segmentation fallback
- confidence filtering
- object size filtering
- room-relevant COCO class filtering
- duplicate overlap filtering
- mask PNG generation

```text
fastapi-service/requirements.txt
```

Python dependencies for the backend.

```text
fastapi-service/generated/masks/
```

Runtime output folder for generated object masks.

```text
fastapi-service/generated/uploads/
```

Temporary upload folder. Uploaded images are deleted after analysis.

### Asset and Script Files

```text
Ikea 3-Drawer.blend
```

Source Blender model file.

```text
public/models/ikea-3-drawer.glb
```

Expected browser-ready GLB model path. This file must be exported from Blender.

```text
public/models/README.md
```

Documents the expected 3D model asset path.

```text
scripts/export_blend_to_glb.py
```

Blender script for exporting the `.blend` source file to `.glb`.

Run with:

```powershell
blender --background "Ikea 3-Drawer.blend" --python scripts/export_blend_to_glb.py -- public/models/ikea-3-drawer.glb
```

## 5. Current User Flow

1. User opens the app.
2. User uploads a JPG, JPEG, or PNG room photo.
3. Frontend validates the file.
4. Frontend sends the image to FastAPI using `multipart/form-data`.
5. Backend computes:
   - brightness
   - ambient lighting profile
   - YOLO object segmentation
   - mask images
6. Frontend displays:
   - uploaded image
   - brightness category
   - detector mode
   - ambient match info
   - detected objects
7. User adds a cabinet or window as the active editable overlay.
8. User adjusts the active 3D model:
   - move
   - resize
   - rotate on photo
   - yaw
   - pitch
   - opacity
9. User toggles object occlusion for that active overlay:
   - enabled object masks restore original photo pixels above that model
10. User clicks **Apply Overlay** to flatten the active 3D render into a placed layer.
11. User can add more models, edit placed overlays, duplicate overlays, hide/show layers, delete layers, and reorder layers.
12. User clicks **Generate Output**.
13. Canvas exports a final PNG with all visible placed overlays plus the active overlay if one is being edited.
14. User downloads the final visualization.

## 6. API Contract

Endpoint:

```text
POST /analyze-image
```

Input:

```text
multipart/form-data
image: JPG, JPEG, or PNG
```

Output shape:

```json
{
  "brightness": {
    "mean_pixel_intensity": 116.43,
    "category": "normal"
  },
  "lighting": {
    "mean_rgb": [120, 118, 116],
    "ambient_rgb": [135, 132, 132],
    "ambient_hex": "#878484",
    "contrast": 1.034,
    "saturation": 0.273,
    "warmth": 0.04,
    "tint": -0.02,
    "temperature": "neutral",
    "sharpness": 1.2,
    "noise": 0.33,
    "light_direction": {
      "x": -0.12,
      "y": 0.28
    },
    "suggested": {
      "brightness": 0.882,
      "contrast": 0.987,
      "saturation": 0.97,
      "color_mix": 0.169,
      "blur_px": 0,
      "grain": 0.18,
      "shadow_opacity": 0.279
    }
  },
  "objects": [
    {
      "id": "obj_1",
      "label": "chair",
      "confidence": 0.87,
      "bbox": [100, 160, 300, 420],
      "mask_url": "/masks/example_obj_1.png"
    }
  ],
  "segmentation": {
    "mode": "yolo",
    "model": "yolov8s-seg.pt"
  },
  "warning": null
}
```

## 7. Object Detection and Masking

### Original MVP Version

The first version used mock objects:

- sofa
- table
- chair

These were fixed rectangles/ellipses and were not accurate for real images.

### Current Version

The backend now uses YOLOv8 segmentation by default:

```text
YOLO_MODEL=yolov8s-seg.pt
SEGMENTATION_MODE=auto
```

Modes:

```text
auto
```

Uses YOLO if available. Falls back to mock masks if YOLO is not available.

```text
yolo
```

Strict real segmentation. If YOLO fails, no mock fallback is used.

```text
mock
```

Offline UI testing only.

### Filtering Rules

The segmentation module filters detections by:

- confidence
- mask area
- bounding box area
- duplicate overlap
- room-relevant COCO labels

Relevant labels include:

- person
- chair
- sofa/couch
- potted plant
- bed
- table/dining table
- TV
- laptop
- keyboard
- sink
- refrigerator
- vase
- clock

This reduces clutter and avoids tiny detections that do not help occlusion.

### Tuning Variables

```powershell
$env:YOLO_CONFIDENCE="0.35"
$env:YOLO_IOU="0.5"
$env:YOLO_IMAGE_SIZE="1024"
$env:MIN_OBJECT_AREA_RATIO="0.018"
$env:MAX_DETECTED_OBJECTS="5"
$env:YOLO_ALLOW_ALL_CLASSES="false"
```

Use `YOLO_ALLOW_ALL_CLASSES=true` if you want to see all COCO detections.

## 8. Object-Aware Occlusion

The selected object masks are not drawn as colored shapes.

Instead, the app uses the mask to cut the object pixels from the original uploaded image, then draws those original pixels above the relevant 3D model.

Layering:

```text
1. Full uploaded room photo
2. For each visible placed overlay in layer order:
   - directional cast shadow
   - contact shadow
   - flattened model render
   - original-image object cutouts for that overlay's toggled objects
3. Active editable overlay, if present:
   - directional cast shadow
   - contact shadow
   - live Three.js model render
   - original-image object cutouts for the active overlay
```

This creates the illusion that each 3D product is behind selected real-world objects. Occlusion is now per overlay, so `Cabinet 1` can be behind a sofa while `Window 1` can use a different object mask or no mask at all.

If two overlays use the same object mask, the cutout may be drawn more than once. That is acceptable for this MVP because it preserves the expected visual layering.

## 9. 3D Model Overlay

The user requested that the overlay be a 3D model, not a PNG.

Important browser limitation:

```text
Browsers cannot load .blend files directly.
```

Therefore:

- `.blend` is treated as the source file.
- `.glb` is the browser runtime asset.
- Three.js loads the GLB.
- If a GLB is missing, the app uses a procedural 3D fallback.

Expected model paths:

```text
public/models/ikea-3-drawer.glb
public/models/glass_window.glb
```

Export command:

```powershell
blender --background "Ikea 3-Drawer.blend" --python scripts/export_blend_to_glb.py -- public/models/ikea-3-drawer.glb
```

The procedural fallback is only for development continuity. The real project should use actual product GLB files.

### Multiple Overlay Strategy

The MVP uses a hybrid active-overlay plus flattened-layer approach:

- Only one overlay is actively editable with a live Three.js renderer at a time.
- Clicking **Apply Overlay** stores the current model render as a transparent flattened image layer.
- The placed overlay also keeps its source settings: model type, model path, transform, shadows, ambient setting, and occlusion object IDs.
- Placed overlays are previewed and exported from their flattened image layer instead of keeping many live WebGL model instances.

This reduces GPU load, avoids multiple simultaneous Three.js renderers, and makes PNG export more reliable on mid-range devices.

### Duplicate, Edit, Delete, Hide, and Reorder

Placed overlays can be selected, edited, duplicated, hidden, deleted, and moved up or down in the layer order.

Editing restores the saved overlay settings into the active editor and temporarily hides that placed layer to avoid a double image. Applying the edit replaces the placed layer's flattened render and saved settings. Canceling an edit leaves the original placed overlay unchanged.

Duplicating a placed overlay opens the duplicate as the active editable overlay with a small offset. Duplicating the active overlay first stores the current overlay as a placed layer, then opens the offset copy as the active overlay.

### Window Glass View Replacement

Window overlays support a window-specific `Window Glass View` control with four modes:

- `Transparent`: keeps the glass partially transparent, so the uploaded room photo can show through.
- `Frosted / Empty`: uses a mostly opaque soft tint to hide background detail behind the pane.
- `Outdoor View`: fills the pane with `/textures/outdoor-view.jpg` when present, or a generated sky/ground texture when the image is missing.
- `Solid Tint`: fills the pane with a plain tint and blocks the uploaded photo behind it.

This exists because the final output is a 2D canvas composite over the uploaded photo. Transparent glass naturally reveals the uploaded photo behind it, which is not always desirable for a window visualization. Frosted, outdoor, and solid modes make the pane visually block or replace that background area.

The renderer tries to detect glass meshes by checking mesh, material, and parent names for glass-related terms such as `glass`, `pane`, `transparent`, and `glazing`. If the GLB does not expose a clearly named glass mesh, the renderer adds a procedural rectangular glass fill plane inside the window bounds. The procedural window fallback uses the same material system.

Window glass settings are saved per overlay. This means `Window 1` can use Outdoor View while `Window 2` uses Frosted / Empty, and duplicated or edited windows preserve their own glass mode, opacity, and tint.

Limitations: this is not physical refraction, true depth estimation, or real outdoor reconstruction. It is an MVP material replacement that improves the visual result for a photo-based canvas composite.

## 10. Ambient Light and Realism Matching

### Original MVP Version

The first implementation only used:

```text
dim    -> brightness(0.85) contrast(0.95)
normal -> brightness(1.0) contrast(1.0)
bright -> brightness(1.12) contrast(1.05)
```

That was too simple and made the model look pasted on.

### Current Version

The backend now estimates the photo's visual environment.

It analyzes:

- overall brightness
- ambient color
- warm/cool cast
- green/magenta tint
- contrast
- saturation
- sharpness
- noise/grain
- rough light direction

The frontend uses this data in two places.

### Three.js Lighting

`modelRenderer.ts` uses the photo lighting data to adjust:

- renderer exposure
- ambient light color
- ambient light intensity
- key light color
- key light intensity
- key light position
- rim light color
- rim light intensity

This makes the 3D model lighting respond to the uploaded photo.

### Canvas Color Matching

`CanvasEditor.tsx` post-processes the rendered model pixels:

- brightness matching
- contrast matching
- saturation matching
- ambient color mixing
- subtle deterministic grain
- optional blur/softness
- grounding shadow opacity

This makes the model texture and overall quality better match the photo.

### Shadow System

The canvas draws two shadow layers before drawing the model itself.

The directional cast shadow is generated from the rendered model alpha. The app turns the 3D render into a dark silhouette, blurs it, flattens it vertically, skews it slightly, and offsets it away from the estimated light direction. This approximates a model shadow on the uploaded photo without needing true 3D floor geometry.

The contact shadow is a soft radial ellipse under the model. It anchors the model to the apparent floor or surface and becomes slightly stronger when the model is placed lower in the uploaded image.

Shadow defaults are derived from:

- `lighting.light_direction`
- `lighting.suggested.shadow_opacity`
- brightness category
- photo contrast

The user can override the automatic estimate using the `Shadow & Grounding` controls:

- enable shadow
- auto shadow from photo lighting
- contact/cast toggles
- shadow opacity
- shadow softness
- shadow length
- direction X
- direction Y
- reset shadow

The shadow is generated in 2D canvas rather than relying only on Three.js real-time shadows because the final composition happens against a flat uploaded photo with no real 3D floor/depth geometry.

## 11. Image Export

Final export is handled by the browser canvas:

```ts
canvas.toDataURL("image/png")
```

The exported image includes:

- original uploaded photo
- all visible placed overlays in layer order
- each overlay's directional cast shadow
- each overlay's contact shadow
- each overlay's ambience-matched 3D model render
- each overlay's enabled object cutouts
- the active overlay if one is being edited

The output is shown in the before/after panel and can be downloaded as:

```text
glassfit-visualization.png
```

## 12. Error Handling

The MVP handles:

- unsupported file types
- upload failure
- backend analysis failure
- missing segmentation
- missing object masks
- missing GLB model
- missing window GLB model
- editing conflicts when another active overlay has unsaved changes
- exporting with no visible overlays
- canvas export failure

If the backend fails, the frontend allows manual overlay editing.

If the GLB is missing, the frontend uses a procedural Three.js model so the 3D overlay pipeline remains testable.

## 13. Local Development

### Frontend

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Backend

```powershell
cd fastapi-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### Frontend Environment Variable

Create `.env.local` if needed:

```text
NEXT_PUBLIC_IMAGE_API_URL=http://localhost:8000
```

## 14. Validation Performed

The project was checked with:

```powershell
npm run lint
npm run build
python -m py_compile fastapi-service\main.py fastapi-service\brightness.py fastapi-service\segmentation.py
```

The backend was also smoke-tested with a real image through `/analyze-image`.

Confirmed response included:

- `brightness`
- `lighting`
- `segmentation`
- detected objects
- generated mask URLs

## 15. Git Ignore / Generated Files

Generated analysis artifacts are ignored:

```text
fastapi-service/generated/masks/*
fastapi-service/generated/uploads/*
```

YOLO model weights are ignored:

```text
fastapi-service/*.pt
```

This prevents large runtime files from being committed.

## 16. Current Limitations

### Object Detection

YOLOv8 is trained on COCO classes. It detects common objects well, but it will not perfectly understand every interior object or every custom glass/aluminum product.

Expected good classes:

- person
- chair
- sofa
- table
- bed
- TV
- plant

Expected weak classes:

- custom aluminum frames
- frameless glass partitions
- local product-specific cabinets
- custom sliding systems
- unusual furniture

For the real project, better detection will require custom dataset labeling and fine-tuning.

### Depth and Scale

The MVP does not estimate true room depth, floor plane, camera intrinsics, or perspective automatically.

Users manually place, scale, and rotate the model.

### Lighting

The lighting match is an image-based approximation from a single photo. It is not true physically based relighting or HDR environment estimation.

It is good enough for MVP feasibility but should be improved for production.

### Multiple Overlay Editing

Multiple overlays are supported through flattened canvas layers for reliability. Only one overlay is actively editable at a time. This is intentional: it keeps WebGL usage low, avoids many live Three.js renderers, and makes final PNG generation more predictable.

Placed overlays can still be re-edited because the app saves their model type, transform, shadows, ambient setting, and per-overlay occlusion IDs.

### 3D Assets

The app needs GLB files. Blender files must be exported first. If `public/models/glass_window.glb` is not available, the frontend uses a procedural aluminum/glass window fallback.

For production, each product should have:

- optimized GLB model
- correct scale
- PBR materials
- compressed textures
- thumbnail preview
- metadata for dimensions and product type

## 17. Recommendations for the Real Project

### Product Model Pipeline

Create a standard product asset pipeline:

```text
Blender / CAD source
  -> cleaned model
  -> GLB export
  -> texture compression
  -> web preview
  -> product metadata
```

Recommended GLB checks:

- low enough polygon count for web
- centered origin
- consistent unit scale
- named meshes/materials
- compressed textures
- no hidden unused geometry

### Detection and Segmentation

For the real version, collect and label your own dataset:

- real client spaces
- chairs/tables/sofas/plants/cabinets
- glass/aluminum installation areas
- common occluding objects
- Philippine interior examples if that is the target context

Fine-tune segmentation using:

- YOLOv8-seg
- YOLOv11-seg
- Segment Anything assisted labeling
- Roboflow or CVAT for annotation workflow

### Better Realism

Possible upgrades:

- estimate floor plane
- estimate horizon/perspective
- improve contact shadows using actual model footprint
- estimate floor surface normal
- use environment-map approximation from uploaded image
- add manual shadow direction control
- add material roughness/metalness controls
- add automatic scale hints using known object sizes

### Backend Production Setup

For production, separate concerns:

```text
Frontend app
API service
AI inference service
File storage
Database
Authentication
Job queue
```

The current FastAPI service is acceptable for MVP, but production should likely add:

- async job processing for heavy segmentation
- GPU deployment if available
- persistent object/mask storage
- request size limits
- image cleanup jobs
- model warmup
- health and metrics endpoints

### Frontend Production Setup

Future frontend features:

- product catalog
- saved configurations
- project/session persistence
- before/after comparison slider
- manual mask correction
- perspective controls
- quotation request flow
- consultation link generation
- Messenger/Viber handoff

## 18. Important Design Decisions

### Why Next.js App Router

It matches the requested stack and gives a clean structure for a modern React app.

### Why FastAPI

It is simple, fast, and works well for Python-based computer vision services.

### Why Three.js

It allows the overlay to be a real 3D model, not a PNG.

### Why HTML Canvas

Canvas gives direct control over final composition and PNG export.

### Why YOLOv8-seg

It returns the required MVP data:

- labels
- confidence
- bounding boxes
- masks

### Why Keep Mock Mode

Mock mode is useful when:

- YOLO is not installed
- the model cannot download
- the frontend needs to be tested offline
- the AI service fails during a demo

The UI now clearly shows whether mock or YOLO segmentation is active.

## 19. Practical Demo Notes

For the best demo results:

1. Use a clear room photo with visible furniture.
2. Avoid very dark or blurry photos.
3. Add a cabinet or window and place it near the floor or wall area.
4. Click **Apply Overlay** before adding a second product.
5. Toggle objects that should visually block each product.
6. Use yaw/pitch to make the 3D model face the same direction as the room perspective.
7. Keep opacity near 90-100 percent for solid products.
8. Use ambience matching ON for the most realistic output.

## 20. MVP Status Summary

Completed:

- image upload
- backend image analysis
- brightness category
- richer ambient-light analysis
- YOLO segmentation
- generated masks
- object toggle panel
- product model panel with cabinet and window choices
- collapsible sidebar adjustment panels
- 3D model rendering with Three.js
- `.blend` to `.glb` export script
- procedural window fallback
- window glass view modes
- window glass mesh detection and material replacement
- procedural window glass fill fallback
- procedural outdoor view texture fallback
- model movement
- model resize
- model rotation
- 3D yaw/pitch controls
- active editable overlay state
- multiple placed overlay layers
- apply/place overlay workflow
- edit placed overlay workflow
- duplicate active and placed overlays
- hide/show, delete, and reorder placed overlays
- ambience-based relighting
- ambience-based model color matching
- automatic directional cast shadow
- automatic contact shadow
- manual shadow controls
- per-overlay object-aware occlusion
- final PNG export with all visible overlays
- before/after preview
- download button
- local development documentation

This MVP is a strong feasibility prototype. For the real project, the biggest next steps are custom model assets, custom segmentation training, better perspective/depth estimation, and persistent project/product workflows.

