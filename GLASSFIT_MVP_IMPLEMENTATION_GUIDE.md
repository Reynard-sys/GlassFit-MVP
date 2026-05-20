# GlassFit MVP Implementation Guide

This document records what was implemented in the GlassFit MVP, what technologies were used, why the choices were made, and how this prototype can guide the real project build.

Last source audit: May 19, 2026. This guide reflects the current checked-in project files under `src/`, `fastapi-service/`, `scripts/`, `public/`, and the project configuration files.

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
  - `next.config.ts` enables the React Compiler and sets `turbopack.root` to avoid workspace-root warnings.

- **React 19.2.4**
  - Used for interactive UI state, upload flow, object toggles, and canvas controls.
  - The project includes `babel-plugin-react-compiler` and keeps the source compatible with compiler-driven optimization.

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
    2. Directional cast shadow for non-window overlays when enabled.
    3. Contact/grounding shadow passes for non-window overlays when Auto Realism is off and those paths are enabled.
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
- nudge left/up/right/down
- reset
- apply/place overlay
- cancel active editing
- duplicate active overlay
- glass appearance presets for window overlays
- Ambient Light Adjustment toggle
- Auto Realism toggle
- Auto-fit to Scene action
- placement type selection
- enable/disable realistic shadows
- reset automatic shadow settings
- collapsed advanced/developer tuning for position matching, spatial relighting, perspective, floor guide, grounding shadow, camera match, and shadow controls
- generate output

General product opacity exists in the transform type but is not currently exposed as a customer-facing slider. Window glass opacity is an internal preset value controlled by the selected Glass Appearance mode.

```text
src/components/ProductModelPanel.tsx
```

Lists product model choices and starts a new active overlay:

- cabinet
- window

```text
src/components/PlacedOverlayPanel.tsx
```

Lists cached placed overlays and exposes layer actions:

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
- cached placed overlay image layer drawing
- active 3D model rendering/compositing
- dragging only the active overlay on the canvas
- applying Ambient Light Adjustment, which wraps global ambient matching, position-based local matching, and spatial relighting
- applying Auto Realism, perspective, camera matching, face shading, and edge feathering
- drawing directional cast shadows for non-window overlays
- drawing contact shadows for non-window overlays when Auto Realism is off
- drawing enhanced grounding/foot shadows only as an advanced non-window path when Auto Realism is off
- drawing per-overlay original-image object cutouts above the model
- drawing editor-only outline and floor guide helpers in preview
- exporting the final visualization as PNG

Placed overlays are not full background composites. The app stores a transparent model render plus saved overlay metadata, then re-applies the saved visual effects during preview and export.

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
- `CanvasBounds`
- `LocalLightingAnalysis`
- `LocalAmbientAdjustments`
- `LocalAmbientState`
- `LightingGridCell`
- `SpatialLightingMap`
- `SpatialRelightSettings`
- `SpatialRelightResult`
- `PerspectiveSettings`
- `FloorAnchorSettings`
- `GroundingShadowSettings`
- `CameraMatchSettings`
- `GroundingRealismSettings`
- `PlacementType`
- `AutoRealismSettings`
- `AutoRealismResult`
- `DetectedObject`
- `ImageAnalysisResponse`
- `ProductModelType`
- `ProductModelOption`
- `AmbientLightAdjustmentSettings`
- `GlassAppearanceMode`
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
- 12 MB frontend upload size validation
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
- detecting and replacing window glass materials with fixed Glass Appearance presets
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
- upload cleanup after analysis
- brightness analysis
- lighting analysis
- segmentation analysis
- serving generated masks from `/masks`

CORS is limited to `localhost` and `127.0.0.1` development origins on any port.

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
   - Ambient Light Adjustment
   - Auto Realism / placement type
   - Glass Appearance when editing a window overlay
   - advanced perspective, grounding, lighting, and shadow settings when needed
9. User toggles object occlusion for that active overlay:
   - enabled object masks restore original photo pixels above that model
10. User clicks **Apply Overlay** to capture the active 3D render plus its saved settings into a placed layer.
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

The frontend accepts `image/jpeg` and `image/png` up to 12 MB. The backend also
rejects other content types, but it currently relies on the frontend for the
upload-size limit.

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
- toilet
- TV
- laptop
- mouse
- remote
- keyboard
- cell phone
- microwave
- oven
- sink
- refrigerator
- book
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
   - directional cast shadow for non-window overlays
   - contact shadow for non-window overlays when Auto Realism is off
   - enhanced grounding shadow only in advanced non-window tuning when Auto Realism is off
   - cached transparent model render with saved ambient/spatial/Auto Realism processing
   - original-image object cutouts for that overlay's toggled objects
3. Active editable overlay, if present:
   - directional cast shadow for non-window overlays
   - contact shadow for non-window overlays when Auto Realism is off
   - enhanced grounding shadow only in advanced non-window tuning when Auto Realism is off
   - live Three.js model render with preview processing
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
- Clicking **Apply Overlay** stores a transparent render of the current model in `flattenedImageDataUrl`.
- The placed overlay also keeps source settings and derived metadata: model type, model path, transform, shadows, ambient settings, local ambient sample, spatial relighting result, Auto Realism result, grounding settings, window glass settings, and occlusion object IDs.
- Placed overlays are previewed and exported from this cached model image plus saved metadata instead of keeping many live WebGL model instances.
- Shadows, perspective transforms, camera matching, spatial relighting, Auto Realism, and object cutouts are applied by `CanvasEditor` during preview/export. They are not permanently baked into the stored background photo.

This reduces GPU load, avoids multiple simultaneous Three.js renderers, and makes PNG export more reliable on mid-range devices.

### Duplicate, Edit, Delete, Hide, and Reorder

Placed overlays can be selected, edited, duplicated, hidden, deleted, and moved up or down in the layer order.

Editing restores the saved overlay settings into the active editor and temporarily hides that placed layer to avoid a double image. Applying the edit replaces the placed layer's flattened render and saved settings. Canceling an edit leaves the original placed overlay unchanged.

Duplicating a placed overlay opens the duplicate as the active editable overlay with a small offset. Duplicating the active overlay first stores the current overlay as a placed layer, then opens the offset copy as the active overlay.

### Glass Appearance

Window overlays support a window-specific `Glass Appearance` control with fixed, business-aligned presets:

- `Clear Glass`: keeps the pane slightly transparent while preserving glass highlights so it does not disappear.
- `Frosted Glass`: uses a mostly opaque neutral frosted material to block most room detail behind the pane.
- `Opaque Glass`: uses a clean neutral privacy-glass panel and blocks the uploaded room photo behind the pane.
- `Reflective Glass`: uses a neutral gray/blue-gray reflective material with a subtle highlight.
- `Outdoor View`: fills the pane with `/textures/outdoor-view.jpg` when present, or a generated sky/ground texture when the image is missing.

The previous arbitrary glass tint/color picker and `Solid Tint` customer-facing mode were removed. Specialty colors or tinted glass options should come from real product catalog variations, not a free color picker in the visualization workspace.

This exists because the final output is a 2D canvas composite over the uploaded photo. Clear Glass can intentionally show some of the uploaded room through the pane. Frosted, Opaque, Reflective, and Outdoor View modes make the pane visually block or replace that background area.

The renderer tries to detect glass meshes by checking mesh, material, and parent names for glass-related terms such as `glass`, `pane`, `transparent`, and `glazing`. If the GLB does not expose a clearly named glass mesh, the renderer adds a procedural rectangular glass fill plane inside the window bounds. The procedural window fallback uses the same Glass Appearance material system.

Window glass settings are saved per overlay. This means `Window 1` can use Outdoor View while `Window 2` uses Frosted Glass, and duplicated or edited windows preserve their own appearance mode, preset opacity, and outdoor texture path. Older saved modes are migrated as follows: `transparent` -> `clear`, `solid` -> `opaque`, `frosted` -> `frosted`, and `outdoor` -> `outdoor`. Old `tintColor` values are ignored by the normal UI.

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

### Ambient Light Adjustment

The previous `Position-based ambient matching` and `Spatial ambient relighting`
customer controls are now combined under one normal workspace control:
`Ambient Light Adjustment`.

Customer-facing meaning: match the product lighting to the uploaded photo while
the user edits the overlay.

Internally, Ambient Light Adjustment includes:

- global ambient matching from the uploaded photo analysis
- position-based local matching from the overlay's current canvas position
- non-uniform spatial relighting from a small local lighting grid

Global matching happens after image upload and describes the overall photo.
Position-based matching samples the background region around the overlay's
current canvas position, including padding around the model bounds. The local
sample estimates mean RGB, brightness, contrast, saturation, warm/cool cast,
green/magenta tint, and local noise. The app derives conservative local
adjustments for brightness, contrast, saturation, ambient color mix, subtle
blur/grain, and shadow opacity.

Spatial relighting builds a small 5x5 lighting map from the same local region.
Each cell estimates mean RGB, mean luminance, contrast, and saturation. When
the overlay is drawn, the renderer samples that map at visible model pixels
with bilinear interpolation, subtly brightening pixels near brighter background
cells and darkening pixels near darker cells.

The customer sees only the single `Ambient Light Adjustment` toggle, enabled by
default. The technical subfeatures remain available in the collapsed
`Advanced / Developer Tuning` section for debugging: global match,
position-based matching, spatial relighting, relighting strength, and grid or
shadow controls.

While an active overlay is being edited, global matching is live. The
position-based and spatial preview samples run after a short debounce, so heavy
sampling does not run continuously during dragging. When the user applies the
overlay, the current local ambient sample and spatial lighting result are saved
with the placed overlay. Editing or duplicating an overlay preserves the
Ambient Light Adjustment settings and recomputes the local/spatial result when
the overlay is applied again.

When Ambient Light Adjustment is off, the renderer uses neutral/default model
lighting and skips position-based and spatial relighting. The user can still
move, resize, and rotate the overlay.

Window overlays keep their glass behavior. Outdoor View reduces color influence
and clamps brightness more tightly so the outdoor scene stays visible. Shadows
and object-aware occlusion keep the same layer order: shadows first, adjusted
model next, then original-image cutouts above the model. If sampling or
`getImageData` fails, the overlay still applies with the available global or
neutral render path.

This is an image-based approximation. It improves realism when one side of the
scene is brighter or darker than another, but it is not physically accurate
global illumination or true scene relighting.

### Auto Realism Engine

The Auto Realism Engine remains separate from Ambient Light Adjustment.
Customer-facing meaning: make the final output look more natural.

Auto Realism is output-focused polish. It keeps the technical shadow, blur,
grain, edge feathering, face shading, and perspective sliders out of the normal
workflow and exposes only practical controls: `Auto Realism`,
`Auto-fit to Scene`, and `Placement Type`.

Auto Realism derives camera quality matching, edge blending, face shading, and
simple perspective assistance from the uploaded image, overlay position, model
type, placement type, and backend lighting analysis. Ambient Light Adjustment
still handles workspace lighting matching; Auto Realism runs on top as final
polish rather than replacing it.

When an overlay is applied, the canvas samples the local image region around the
model, reuses the spatial relighting map when available, and stores an
`autoRealismResult` with the derived blur, grain, edge feathering, contact
shadow strength, leg shadow strength, shadow softness, perspective skew, and
face-shading strength. Duplicated and edited overlays keep their Auto Realism
settings but recompute the result when they are applied again.

For active overlay preview, `CanvasEditor` does not run heavy Auto Realism
processing continuously while the user drags the overlay. The active workspace
preview focuses on placement plus Ambient Light Adjustment. Auto Realism is
derived when an overlay is applied, for placed overlay preview/export, and when
generating output with an active unapplied overlay.

Placement type changes the defaults for perspective/camera behavior and face
shading. Cabinets start as `Floor-standing` and windows start as
`Wall-mounted`, while preserving Glass Appearance modes.

`Auto-fit to Scene` applies a safe heuristic perspective adjustment. It uses the
overlay position in the photo to add small skew and vertical tilt values, enough
to avoid a perfectly flat front-facing look without attempting true floor-plane
detection or camera calibration.

Advanced tuning controls still exist in collapsed sections for debugging or
developer adjustment. They include perspective, grounding, camera matching,
ambient subfeature, spatial relighting, and shadow sliders, but normal users do
not need to open them.

This feature improves visual realism but remains a practical approximation. It
does not perform true depth estimation, automatic floor-plane detection, camera
calibration, or physically accurate rendering. If auto sampling or canvas
post-processing fails, the app falls back to the existing ambient, spatial
relighting, shadow, and occlusion pipeline and still allows the overlay to be
applied.

### Perspective and Grounding Realism Controls

Ambient matching and spatial relighting improve how the overlay matches the
photo lighting, but they do not solve camera perspective, floor contact, overly
sharp render edges, or model footprint grounding. The `Perspective & Grounding`
controls add a practical manual realism pass on top of the existing lighting
pipeline.

Auto Realism enables effective perspective assistance by default. The advanced
manual perspective controls start conservative and collapsed, then use an affine
canvas approximation after the 3D model has been rendered to a transparent
overlay canvas. The user can adjust skew X/Y, vertical tilt, floor angle, and
simple perspective X/Y values so a cabinet or window can better follow the room
perspective without requiring true camera calibration.

Floor anchoring gives each overlay a normalized anchor point on the uploaded
photo. The editor can show a subtle floor guide and, when `Snap bottom to floor
anchor` is enabled, align the transformed overlay bottom center to that anchor.
The guide is editor-only and is never included in the flattened overlay or final
PNG export.

Enhanced grounding shadows are now an advanced-only manual path for
non-window overlays when Auto Realism is off. The canvas can draw a soft base
contact shadow plus smaller darker foot or leg ellipses before drawing the
model.

Camera matching runs on the prepared model canvas after Ambient Light
Adjustment has prepared the workspace lighting match. It applies subtle
softness, deterministic grain, compression-style smoothing, and alpha edge
feathering while preserving transparency. This helps the rendered model avoid
the too-clean digital edge that can stand out against phone photos.

Placed overlays remain cached layer records rather than live WebGL renderers.
Duplicating an overlay copies the grounding realism settings into an
independent duplicate, and editing a placed overlay restores those settings
into the active overlay. Object-aware cutouts still draw above the transformed
model, and Glass Appearance presets continue to run before camera matching and
edge blending.

This feature is intentionally manual and MVP-friendly. It is not automatic
floor-plane detection, depth estimation, true perspective warp, physical
relighting, or camera calibration. If canvas sampling, filtering, or image-data
processing fails, the app falls back to the existing render path and still
allows the overlay to be applied.

### Shadow System

The current canvas shadow behavior is intentionally constrained:

1. `window` overlays skip floor-shadow rendering entirely. No directional cast,
contact, or grounding floor-shadow pass is drawn for windows.
2. When `Auto Realism` is enabled, the compositor does not run ground-shadow
passes.
3. For non-window overlays with Auto Realism off, directional cast and contact
shadow behavior remains available through the shadow controls.
4. Advanced grounding/foot shadows are a manual non-window path and are only
relevant when Auto Realism is off.

For the non-window path, directional cast shadow is generated from the rendered
model alpha. The app turns the 3D render into a dark silhouette, blurs it,
flattens it vertically, skews it slightly, and offsets it away from the
estimated light direction. Contact shadow is a soft radial ellipse under the
model and becomes slightly stronger when the model is placed lower in the
uploaded image.

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
- directional cast and contact shadows for non-window overlays when those passes are enabled
- no floor-shadow rendering for window overlays
- each overlay's ambience-matched 3D model render
- each overlay's Ambient Light Adjustment result, including local position matching and spatial relighting when enabled
- each overlay's Glass Appearance preset for window overlays
- each overlay's Auto Realism camera match, edge blend, face shading, and perspective transform, when enabled and not already baked
- each overlay's enabled object cutouts
- the active overlay if one is being edited

Editor-only outlines and floor guide markers are redrawn only for preview and are omitted from export.

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
- exporting with no visible overlays, which generates the uploaded photo and shows a warning
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

The repo does not commit `node_modules`. Run `npm install` before using local
Next.js package docs or build tooling.

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

Historical implementation validation was recorded with:

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

For the May 19, 2026 source-audit documentation update, no application code was
changed and these validation commands were not rerun.

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

Multiple overlays are supported through cached transparent model renders plus saved metadata for reliability. Only one overlay is actively editable at a time. This is intentional: it keeps WebGL usage low, avoids many live Three.js renderers, and makes final PNG generation more predictable.

Placed overlays can still be re-edited because the app saves their model type, transform, shadows, ambient settings, local/spatial realism metadata, Auto Realism settings, grounding settings, window glass settings, and per-overlay occlusion IDs.

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
7. For window overlays, choose Frosted Glass, Opaque Glass, Reflective Glass, or Outdoor View when the uploaded room photo should not show through the pane.
8. Keep Ambient Light Adjustment and Auto Realism ON for the most realistic output.

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
- Glass Appearance presets
- window glass mesh detection and material replacement
- procedural window glass fill fallback
- procedural outdoor view texture fallback
- model movement
- model resize
- model rotation
- 3D yaw/pitch controls
- active editable overlay state
- multiple placed overlay layers
- cached transparent model renders plus saved per-overlay realism metadata
- apply/place overlay workflow
- edit placed overlay workflow
- duplicate active and placed overlays
- hide/show, delete, and reorder placed overlays
- Ambient Light Adjustment
- ambience-based model color matching
- position-based ambient matching and spatial relighting as internal Ambient Light Adjustment subfeatures
- Auto Realism Engine
- Auto-fit to Scene
- placement type defaults for floor-standing, wall-mounted, and tabletop overlays
- advanced perspective and grounding controls
- advanced manual enhanced grounding/foot shadows for non-window overlays when Auto Realism is off
- camera match, edge feathering, grain, and face-shading passes
- automatic directional cast shadow for non-window overlays
- automatic contact shadow for non-window overlays when Auto Realism is off
- no floor-shadow rendering for window overlays
- no Auto Realism ground-shadow pass
- manual shadow controls
- per-overlay object-aware occlusion
- final PNG export with all visible overlays
- before/after preview
- download button
- local development documentation
- React Compiler enabled in `next.config.ts`

This MVP is a strong feasibility prototype. For the real project, the biggest next steps are custom model assets, custom segmentation training, better perspective/depth estimation, and persistent project/product workflows.

## 21. May 19, 2026 Source Audit Notes

This audit reconciled the guide against the current repo contents.

- Git status was clean before this documentation update.
- The main runtime code is in `src/`, the image-analysis service is in `fastapi-service/`, runtime model assets are in `public/models/`, and optional window texture assets are in `public/textures/`.
- Planning prompt files such as `MVP.md`, `shadow.md`, `upgrade.md`, `refine.md`, `duplicate.md`, `additional.md`, and `auto.md` describe the feature requests that led to the current implementation.
- The current frontend config uses Next.js 16.2.6, React 19.2.4, Tailwind CSS 4, Three.js 0.184.x, TypeScript 5, and the React Compiler.
- The current backend dependency file includes FastAPI, Uvicorn, OpenCV, NumPy, python-multipart, and Ultralytics in `fastapi-service/requirements.txt`.
- Runtime uploads are deleted after analysis. Generated mask images and YOLO weight files are intentionally ignored by git.
- `node_modules` is not part of the repo; run `npm install` before using local Next.js package docs or build tooling.
- The most important architecture clarification from this audit is that placed overlays store a cached transparent model render plus saved metadata. The canvas compositor reapplies shadows, ambient matching, local/spatial relighting, Auto Realism, perspective/camera matching, and object cutouts during preview and export.

