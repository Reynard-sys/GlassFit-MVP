You are a senior computer graphics engineer, image processing engineer, Three.js specialist, and canvas compositing engineer. You are working on GlassFit, a Next.js + FastAPI web-based photo visualization system for customized glass and aluminum client-space fitting.

PROJECT CONTEXT:
GlassFit allows users to upload a room/space image, analyze brightness and lighting through a backend service, detect objects using YOLO segmentation, place 3D product overlays, adjust overlays, apply ambient light matching, add shadows, configure object-aware occlusion, manage multiple overlay layers, configure window glass view modes, and export a final visualization image.

The current system already supports:
- Next.js frontend
- React + TypeScript
- Tailwind CSS
- Three.js 3D product rendering
- HTML Canvas final composition
- FastAPI backend image analysis
- OpenCV / NumPy image analysis
- YOLOv8 segmentation
- global ambient light matching
- realistic contact and cast shadows
- object-aware occlusion
- multiple overlay layers using one active editable overlay and placed flattened layers
- window glass view modes

NEW FEATURE GOAL:
Implement Spatial Ambient Relighting for applied overlays.

The current ambient matching applies a general/global adjustment to the rendered model. This can make the model look uniformly filtered, where the whole object has the same brightness or color adjustment.

I want a more realistic approach:
When the user clicks “Apply Overlay,” the system should analyze the lighting distribution around the overlay’s exact position and apply non-uniform lighting variation across the rendered model.

The model should NOT receive the same shade everywhere.

Instead:
- different parts of the model should be slightly brighter or darker depending on the lighting behind and around that part of the uploaded image;
- the model should receive subtle local color influence from nearby regions;
- the model should respond to approximate light direction;
- shadows should still work;
- object-aware occlusion should still work;
- window glass view modes should still work;
- multiple overlays should each compute their own spatial relighting when applied.

FEATURE NAME:
Use the feature name:

Spatial Ambient Relighting

Alternative internal names:
- spatialAmbientRelighting
- localLightingMap
- regionAwareRelighting
- applySpatialLightingToModel

PRIMARY UX RULE:
Spatial Ambient Relighting should happen automatically when the user clicks “Apply Overlay” or “Place Overlay.”

Add a simple toggle in the UI:
Label: “Spatial ambient relighting”
Default: ON
Description: “Applies varied lighting across the model based on the exact area where it is placed.”

Do not add too many advanced user controls.

IMPORTANT BEHAVIOR:
Do not simply compute one brightness value and apply it to the entire model.

Instead, generate a small lighting map from the background image region around the overlay.

Recommended approach:
1. Determine the overlay bounding box on the canvas.
2. Sample the background image around the overlay with padding.
3. Divide the sampled region into a grid, such as 3x3 or 5x5.
4. Compute local brightness/color statistics for each grid cell.
5. Smooth/interpolate those values.
6. Apply the resulting lighting map across the rendered model canvas.
7. Use the model alpha channel so only visible model pixels are modified.
8. Add directional lighting influence based on estimated light direction.
9. Flatten the adjusted overlay into the placed layer.

RECOMMENDED GRID:
Use 5x5 by default for smoother variation.

If performance is a concern, use 3x3.

The grid should generate:
- brightness multiplier per cell
- ambient color per cell
- contrast/saturation influence if feasible

The adjustment should be subtle. It should improve realism without making the model look patchy or overprocessed.

CURRENT RELEVANT FILES:
- src/components/GlassFitMvp.tsx
- src/components/CanvasEditor.tsx
- src/components/OverlayControls.tsx
- src/lib/types.ts
- src/lib/canvasUtils.ts
- src/lib/modelRenderer.ts

TYPES TO ADD:
In src/lib/types.ts, add:

type LightingGridCell = {
  row: number;
  col: number;
  meanRgb: [number, number, number];
  meanIntensity: number;
  contrast: number;
  saturation: number;
};

type SpatialLightingMap = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rows: number;
  cols: number;
  globalMeanIntensity: number;
  cells: LightingGridCell[];
  lightDirection?: {
    x: number;
    y: number;
  };
};

type SpatialRelightSettings = {
  enabled: boolean;
  intensity: number;
  colorInfluence: number;
  directionalInfluence: number;
  gridSize: 3 | 5;
};

type SpatialRelightResult = {
  lightingMap: SpatialLightingMap;
  applied: boolean;
};

Add to ActiveOverlayState:
spatialRelight?: SpatialRelightSettings;

Add to PlacedOverlay:
spatialRelight?: SpatialRelightSettings;
spatialRelightResult?: SpatialRelightResult;

DEFAULT SETTINGS:
When creating a new overlay, set:

spatialRelight: {
  enabled: true,
  intensity: 0.35,
  colorInfluence: 0.12,
  directionalInfluence: 0.20,
  gridSize: 5
}

These values should make the effect subtle.

CANVAS UTILS:
In src/lib/canvasUtils.ts, add these functions:

1. computeOverlaySampleBounds(...)
Purpose:
Compute the padded sample region around the overlay.

Requirements:
- Use overlay x, y, width, height.
- Include padding around the overlay.
- Clamp to canvas/image bounds.
- Axis-aligned bounding box is acceptable for MVP even if overlay is rotated.

2. buildSpatialLightingMap(...)
Purpose:
Create a lighting map from the background image.

Signature example:
buildSpatialLightingMap(
  ctx: CanvasRenderingContext2D,
  sampleBounds: Rect,
  rows: number,
  cols: number,
  globalLighting?: LightingAnalysis
): SpatialLightingMap

Behavior:
- Divide sampleBounds into rows x cols cells.
- For each cell, call getImageData.
- Compute mean RGB.
- Compute mean luminance/intensity.
- Compute contrast using luminance standard deviation.
- Compute saturation using RGB max/min.
- Store each cell result.

Luminance formula:
luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

Outlier handling:
- ignore pixels with luminance < 5
- ignore pixels with luminance > 250
- ignore transparent pixels if any
- if too few pixels remain, fall back to all pixels

Performance:
- If a cell has too many pixels, sample every nth pixel.
- Do not process millions of pixels unnecessarily.
- Keep this fast on low- to mid-range devices.

3. sampleLightingMapAtNormalizedPoint(...)
Purpose:
Given x and y normalized from 0 to 1 across the overlay canvas, return interpolated lighting from nearby grid cells.

Use bilinear interpolation if feasible.
If not, nearest cell is acceptable for first implementation, but bilinear is preferred.

4. applySpatialRelightingToOverlayCanvas(...)
Purpose:
Modify the rendered model canvas using the spatial lighting map.

Signature example:
applySpatialRelightingToOverlayCanvas(
  modelCanvas: HTMLCanvasElement,
  lightingMap: SpatialLightingMap,
  settings: SpatialRelightSettings,
  globalLighting?: LightingAnalysis,
  modelType?: ProductModelType,
  windowGlass?: WindowGlassSettings
): HTMLCanvasElement

Behavior:
- Create an offscreen canvas same size as modelCanvas.
- Read modelCanvas image data.
- For each non-transparent pixel:
  - determine normalized x,y position within model canvas
  - sample lighting map at that x,y
  - compute local brightness multiplier compared with lightingMap.globalMeanIntensity or global lighting intensity
  - apply subtle brightness adjustment
  - apply subtle local ambient color influence
  - apply subtle directional lighting gradient
  - preserve alpha
- Return adjusted canvas.

IMPORTANT:
Only modify pixels where alpha > 0.

Do not create harsh patchy blocks.
Use smooth interpolation or blur/smoothing.
Keep brightness multipliers clamped.

Suggested clamp:
brightnessMultiplier: 0.82 to 1.18

Suggested final effect:
finalPixel = originalPixel * mixedBrightness + localColorInfluence

Do not overdo color mixing:
colorInfluence should be around 0.08 to 0.18.

DIRECTIONAL LIGHTING:
Use existing backend global light direction if available.

If lightDirection exists:
- create a directional gradient across the overlay.
- If light comes from upper left, the upper-left side of the model should be slightly brighter and lower-right slightly darker.
- If light comes from right, right side should be slightly brighter and left side slightly darker.

Suggested:
directionalFactor = dot(normalizedPositionFromCenter, lightDirection)
directionalAdjustment = 1 + directionalFactor * settings.directionalInfluence * 0.15

Clamp directionalAdjustment between 0.90 and 1.10.

Important:
Shadow direction is opposite the light direction, but model brightening should generally follow the light direction.

LOCAL BRIGHTNESS LOGIC:
For each pixel:
- localIntensity = interpolated cell intensity
- baseIntensity = lightingMap.globalMeanIntensity or global lighting mean
- delta = (localIntensity - baseIntensity) / 255
- brightnessMultiplier = 1 + delta * settings.intensity
- clamp brightnessMultiplier between 0.82 and 1.18

This means if one side of the background region is brighter, the corresponding side of the model becomes subtly brighter.

LOCAL COLOR LOGIC:
For each pixel:
- localRgb = interpolated cell RGB
- blend localRgb into pixel using settings.colorInfluence
- do not fully recolor the model
- preserve product material identity

Suggested:
newR = originalR * brightnessMultiplier
newR = newR * (1 - colorInfluence) + localR * colorInfluence

Repeat for G and B.

WINDOW GLASS MODES:
Be careful with window overlays.

If modelType is "window" and windowGlass.mode is "outdoor":
- reduce colorInfluence by 50%
- clamp brightnessMultiplier between 0.88 and 1.12
- do not make the outdoor texture invisible or overly tinted

If windowGlass.mode is "transparent":
- normal spatial relighting is okay
- but avoid making glass too dark

If windowGlass.mode is "frosted" or "solid":
- apply relighting normally but subtly

SHADOW INTERACTION:
Spatial relighting should not replace the existing contact and cast shadows.

Use local lighting map to slightly improve shadows:
- If local lower region is bright, contact shadow can be slightly more visible but softer.
- If local lower region is dark, contact shadow should be more subtle.

Optional:
Compute a shadowOpacityMultiplier from the lower row of the lighting grid.

But keep this optional. Do not break existing shadow controls.

APPLY OVERLAY WORKFLOW:
In CanvasEditor.tsx, update the apply/place overlay pipeline.

Current likely behavior:
- render active model with Three.js
- apply global ambient matching
- draw shadow
- flatten overlay
- store placed overlay

New behavior:
- render active model with Three.js using existing global ambient matching
- compute overlay sample bounds based on current placement
- build spatial lighting map from uploaded background image
- apply spatial relighting to model canvas
- draw shadows
- flatten adjusted model as placed overlay
- store spatialRelightResult metadata on the placed overlay

Layer order should remain:
1. Uploaded background image
2. For each visible placed overlay:
   - directional cast shadow
   - contact shadow
   - spatially relit model render
   - original-image object cutouts for that overlay’s enabled occlusion objects
3. Active overlay if present:
   - directional cast shadow
   - contact shadow
   - live model render
   - object cutouts

For active live preview:
- It is acceptable to use global matching only for responsiveness.
- Spatial relighting should run when applying/placing the overlay.
- Optional: add live preview only if performance remains acceptable.

DUPLICATE AND EDIT BEHAVIOR:
When duplicating:
- Copy spatialRelight settings.
- Do not reuse the old spatialRelightResult if the duplicate is moved to a different position.
- Recompute spatial relighting when the duplicate is applied.

When editing a placed overlay:
- Restore settings to active overlay.
- Recompute spatial relighting when the edited overlay is applied again.

ERROR HANDLING:
If spatial relighting fails:
- fall back to existing global ambient matching
- still apply the overlay
- do not crash

Handle:
- missing background canvas
- getImageData errors
- tainted canvas
- invalid bounds
- sample area too small
- NaN values
- unsupported OffscreenCanvas

PERFORMANCE REQUIREMENTS:
- Use 5x5 grid by default.
- Downsample pixels inside each grid cell if needed.
- Avoid iterating over huge full-resolution images unnecessarily.
- Keep the app responsive on low- to mid-range devices.
- Do not run spatial relighting continuously while dragging.
- Run it only on Apply Overlay by default.

UI REQUIREMENTS:
In OverlayControls.tsx, add this inside the visual/ambient section:

Toggle:
Spatial ambient relighting

Description:
“Varies the model’s shading based on the lighting around its exact placement area.”

Default:
ON

Optional simple slider:
Relighting strength
Range: 0 to 1
Default: 0.35

Do not expose grid size or advanced technical values unless there is an existing advanced controls section.

QUALITY REQUIREMENTS:
The effect must be subtle and realistic.
Avoid:
- harsh square grid artifacts
- over-darkened model
- over-saturated colors
- strong tint that destroys material appearance
- making window outdoor view too dark
- changing fully transparent pixels
- breaking final PNG export

VALIDATION TESTS:
After implementation, verify:

1. Upload a room photo with uneven lighting.
2. Add a cabinet overlay.
3. Place it partly in a darker area.
4. Click Apply Overlay.
5. Confirm the model is not uniformly shaded.
6. Confirm darker side/region of the model subtly matches the darker background area.
7. Add a second overlay in a brighter area.
8. Click Apply Overlay.
9. Confirm the second overlay has different spatial lighting.
10. Duplicate an overlay and move it elsewhere.
11. Apply it and confirm spatial relighting recomputes.
12. Edit a placed overlay and move it to a new area.
13. Apply and confirm relighting updates.
14. Test a window overlay with transparent glass.
15. Test a window overlay with frosted glass.
16. Test a window overlay with outdoor glass.
17. Confirm outdoor view remains visible.
18. Confirm shadows still render.
19. Confirm object-aware occlusion still works.
20. Confirm final PNG export includes spatially relit overlays.
21. Confirm disabling the toggle uses the previous global-only behavior.
22. Confirm performance is acceptable with 3 to 5 placed overlays.

DOCUMENTATION:
Update the implementation guide with a new section:

Spatial Ambient Relighting

Explain:
- Global ambient matching estimates overall image lighting.
- Spatial ambient relighting runs when an overlay is applied.
- It samples the local image region around the overlay.
- It builds a small lighting map, such as 5x5.
- It applies subtle non-uniform brightness and color variation across the model.
- It improves realism when one side of the scene is brighter or darker than another.
- It is an image-based approximation, not physically accurate relighting or true global illumination.

DELIVERABLE:
Implement Spatial Ambient Relighting in the existing GlassFit codebase. Provide changed files and a concise explanation of:
- how the lighting map is generated,
- how non-uniform shading is applied to the model,
- when the feature runs,
- how it works with multiple overlays,
- how it works with duplicate/edit overlays,
- how it interacts with shadows, occlusion, and window glass modes,
- and how the system falls back if the relighting process fails.