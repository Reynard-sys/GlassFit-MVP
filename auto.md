You are a senior computer graphics engineer, Three.js specialist, image compositing engineer, and UX-focused full-stack developer. You are working on GlassFit, a Next.js + FastAPI photo-based visualization system for customized glass and aluminum client-space fitting.

PROJECT CONTEXT:
GlassFit already supports image upload, backend lighting analysis, YOLO segmentation, 3D model overlay, multiple placed overlays, per-overlay object-aware occlusion, ambient matching, position-based ambient matching, spatial ambient relighting, shadow support, window glass view modes, and final PNG export.

The current implementation has too many realism controls exposed to the user, such as sliders for lighting, quality matching, blur, grain, shadows, perspective, and edge softness.

NEW UX DIRECTION:
Remove or hide most technical realism sliders from the customer-facing interface.

The target users are non-technical customers and R.R.D Glass and Aluminum staff. They should not need to manually understand lighting, blur, grain, edge feathering, shadow direction, or color matching.

Instead, implement an automated realism system.

FEATURE NAME:
Auto Realism Engine

GOAL:
The system should automatically improve the realism of the overlay using the uploaded image, overlay position, model type, and existing backend lighting data.

The customer-facing UI should be simple:
1. Toggle: Auto Realism
2. Button: Auto-fit to Scene
3. Optional dropdown: Placement Type
   - Floor-standing
   - Wall-mounted
   - Tabletop / Surface-mounted

Do not expose technical sliders by default.

Advanced controls may remain available only behind a collapsed “Advanced” or “Developer tuning” section, but they should not be visible in the normal customer flow.

CURRENT PROBLEM:
The overlay still looks unrealistic because:
- the model is too clean and uniform,
- contact shadows are not strong enough under the feet/base,
- the model does not fully match the floor perspective,
- edges look too digitally sharp,
- lighting is still too even across the model,
- the model does not visually interact enough with the floor/wall.

MAIN TASK:
Replace customer-facing realism sliders with an automated realism pipeline that runs during preview and especially when the user clicks Apply Overlay.

The system should automatically:
1. Estimate local image quality around the overlay.
2. Apply camera softness and subtle grain automatically.
3. Apply edge feathering automatically.
4. Strengthen contact shadows based on placement type.
5. Apply shadow direction based on backend light direction.
6. Apply spatial relighting using the existing lighting map.
7. Add simple face-based shading for box-like models.
8. Apply basic perspective auto-fit where feasible.
9. Save all realism effects into the flattened placed overlay.

IMPORTANT:
Do not remove the existing global ambient matching, position-based ambient matching, or spatial ambient relighting. Use them as part of the Auto Realism Engine.

CUSTOMER-FACING UI REQUIREMENTS:
In OverlayControls.tsx, replace the visible technical realism controls with:

Section: Realism

Controls:
- Toggle: Auto Realism
  Description: “Automatically matches lighting, shadows, edges, and camera quality to the uploaded photo.”
  Default: ON

- Button: Auto-fit to Scene
  Description: “Attempts to align the overlay with the photo’s floor and perspective.”

- Dropdown: Placement Type
  Options:
  - Floor-standing
  - Wall-mounted
  - Tabletop / Surface-mounted

Default:
- Cabinet: Floor-standing
- Window: Wall-mounted

Optional:
- Collapsible section: Advanced tuning
  Hidden by default.
  Contains existing sliders only for developer/testing use.

Do not show many sliders in the main UI.

TYPE UPDATES:
In src/lib/types.ts, add:

type PlacementType = "floor-standing" | "wall-mounted" | "tabletop";

interface AutoRealismSettings {
  enabled: boolean;
  placementType: PlacementType;
  autoPerspective: boolean;
  autoCameraMatch: boolean;
  autoGroundingShadow: boolean;
  autoEdgeBlend: boolean;
  autoFaceShading: boolean;
}

interface AutoRealismResult {
  cameraBlurPx: number;
  grainAmount: number;
  edgeFeatherPx: number;
  contactShadowStrength: number;
  legShadowStrength: number;
  shadowSoftness: number;
  perspectiveSkewX: number;
  perspectiveSkewY: number;
  verticalTilt: number;
  faceShadingStrength: number;
  notes?: string[];
}

Add optional fields to ActiveOverlayState and PlacedOverlay:

autoRealism?: AutoRealismSettings;
autoRealismResult?: AutoRealismResult;

DEFAULT AUTO REALISM SETTINGS:
For cabinet:
{
  enabled: true,
  placementType: "floor-standing",
  autoPerspective: true,
  autoCameraMatch: true,
  autoGroundingShadow: true,
  autoEdgeBlend: true,
  autoFaceShading: true
}

For window:
{
  enabled: true,
  placementType: "wall-mounted",
  autoPerspective: true,
  autoCameraMatch: true,
  autoGroundingShadow: false,
  autoEdgeBlend: true,
  autoFaceShading: true
}

AUTO REALISM PIPELINE:
When the user clicks Apply Overlay, run:

1. Get overlay bounds and transform.
2. Sample the local image region around the overlay.
3. Use existing lighting and spatial relighting data.
4. Derive automatic realism values.
5. Apply camera match.
6. Apply edge feathering.
7. Apply enhanced contact shadows depending on placement type.
8. Apply simple model face shading.
9. Apply perspective/skew if Auto-fit to Scene or autoPerspective is enabled.
10. Flatten the result into the placed overlay layer.

Create a utility function in canvasUtils.ts:

deriveAutoRealismSettings({
  modelType,
  placementType,
  overlayBounds,
  localLighting,
  spatialLightingMap,
  globalLighting,
  imageSharpness,
  imageNoise
}): AutoRealismResult

AUTOMATIC CAMERA MATCHING:
The system should automatically derive camera blur and grain from the uploaded image.

Rules:
- If background sharpness is low, increase overlay blur slightly.
- If image noise is high, add more subtle grain.
- If image is clean/sharp, keep blur and grain low.
- Never over-blur the model.

Suggested clamp:
cameraBlurPx: 0.2 to 1.2
grainAmount: 0.02 to 0.10
edgeFeatherPx: 0.4 to 1.4

AUTOMATIC GROUNDING SHADOWS:
For floor-standing models:
- Use stronger contact shadows under feet/base.
- Add small dark ellipses under estimated feet.
- Add broader soft shadow under the cabinet body.
- Use backend light direction for cast shadow direction.
- Increase shadow strength when the object is near the lower part of the image.
- Keep the result subtle but visible.

For wall-mounted models:
- Use reduced or no floor contact shadow.
- Use softer edge shadow or wall shadow if feasible.

For tabletop/surface-mounted:
- Use contact shadow directly under the base but weaker than floor-standing.

Suggested cabinet values:
contactShadowStrength: 0.35 to 0.55
legShadowStrength: 0.45 to 0.70
shadowSoftness: 8 to 18

AUTOMATIC EDGE BLENDING:
Edges should not look like a perfect digital cutout.

Apply:
- alpha feathering around the model edge,
- slight local blur,
- optional subtle background color bleed only near edges.

Keep the object readable and avoid making it muddy.

AUTOMATIC FACE-BASED SHADING:
For box-like models such as cabinets, apply simple material/face shading so the model is not one uniform shade.

If the model render is flattened, apply post-processing zones:
- top region: slightly brighter,
- lower front region: slightly darker,
- side/edge regions: slightly darker,
- drawer grooves: preserve/darken existing darker lines,
- feet/underside: darker.

This is not true physical relighting. It is a practical visual enhancement.

Create helper:

applyBoxModelFaceShading(
  modelCanvas: HTMLCanvasElement,
  modelType: ProductModelType,
  strength: number
): HTMLCanvasElement

Rules:
- Apply mainly to cabinet/floor-standing rectangular products.
- Do not over-darken.
- Preserve texture and material color.
- Use alpha channel so transparent pixels are unaffected.

AUTOMATIC PERSPECTIVE / AUTO-FIT:
The system should attempt simple automatic perspective assistance, but avoid heavy AI or full camera calibration.

When user clicks Auto-fit to Scene:
- estimate basic floor direction from visible floor tile lines if possible,
- otherwise use a safe default,
- apply a small skew/vertical tilt to avoid perfectly flat front-facing appearance.

If automatic floor-line detection is too complex:
- implement heuristic auto-fit based on overlay position:
  - objects lower in the image get slightly stronger vertical perspective,
  - objects near the left/right side get slight horizontal skew,
  - floor-standing objects get more perspective than wall-mounted ones.

Suggested safe values:
- skewX: -0.08 to 0.08
- skewY: -0.04 to 0.04
- verticalTilt: -0.05 to 0.08

Do not produce extreme warping.

AUTO-FIT BUTTON:
When the user clicks Auto-fit to Scene:
- derive perspective settings,
- apply them to the active overlay,
- update preview,
- show a small message: “Auto-fit applied. You can still move, resize, or rotate the overlay.”

PLACEMENT TYPE BEHAVIOR:
Cabinet default:
- floor-standing
- strong grounding shadows
- face shading enabled
- camera match enabled

Window default:
- wall-mounted
- weak grounding shadows
- edge blending enabled
- glass view modes remain unchanged

Tabletop/surface-mounted:
- moderate contact shadow
- no foot shadows unless model has visible legs

ADVANCED CONTROLS:
Move existing technical sliders into a collapsed panel:

Advanced tuning

This section can include:
- skew sliders
- blur slider
- grain slider
- edge feather slider
- shadow strength slider
- shadow direction slider
- spatial relighting strength

But it must be collapsed by default and labeled as optional.

Do not remove advanced controls entirely if they are useful for debugging, but do not show them to normal users by default.

CANVAS RENDERING ORDER:
The layer order should remain:

1. Uploaded room photo
2. Directional cast shadow
3. Enhanced grounding/contact shadow
4. Auto-realism processed model render
5. Object-aware cutouts above the model
6. Editor-only guides if any, not included in final export

FINAL EXPORT:
Final PNG must include:
- auto camera match,
- edge blending,
- enhanced grounding shadows,
- spatial relighting,
- face-based shading,
- perspective/skew transform,
- object-aware cutouts,
- all visible placed overlays.

Final PNG must not include:
- debug guides,
- floor anchor markers,
- advanced UI overlays.

MULTIPLE OVERLAY BEHAVIOR:
Each overlay should have its own autoRealism settings and autoRealismResult.

When duplicating:
- copy autoRealism settings,
- do not blindly reuse old autoRealismResult if duplicate position changes,
- recompute autoRealismResult when applying duplicate.

When editing:
- restore autoRealism settings,
- recompute when applied again.

ERROR HANDLING:
If auto realism fails:
- fall back to existing ambient/spatial relighting pipeline,
- still apply the overlay,
- do not crash.

Handle:
- invalid bounds,
- canvas getImageData failure,
- missing local lighting,
- failed edge feather,
- failed face shading,
- failed perspective transform.

PERFORMANCE:
Auto Realism should run mostly on Apply Overlay, not continuously while dragging.

Preview can be lightweight.
Full realism processing happens when the overlay is placed.

This keeps the app responsive on low- to mid-range devices.

VALIDATION TESTS:
After implementation, verify:

1. Normal customers see only simple Realism controls, not many technical sliders.
2. Auto Realism is ON by default.
3. Cabinet uses floor-standing placement by default.
4. Window uses wall-mounted placement by default.
5. Cabinet gets stronger contact shadows under feet/base.
6. Cabinet gets subtle face shading and no longer looks uniformly flat.
7. Camera match makes edges less digitally sharp.
8. Auto-fit to Scene applies a subtle perspective adjustment.
9. Advanced tuning is hidden by default.
10. Disabling Auto Realism returns closer to the old behavior.
11. Duplicated overlays recompute auto realism after placement.
12. Edited overlays recompute auto realism after reapplying.
13. Window glass view modes still work.
14. Object-aware occlusion still works.
15. Spatial ambient relighting still works.
16. Final PNG includes all auto realism effects.
17. App remains responsive with 3 to 5 overlays.
18. If any auto realism step fails, overlay still applies.

DOCUMENTATION:
Update GLASSFIT_MVP_IMPLEMENTATION_GUIDE.md with a new section:

Auto Realism Engine

Explain:
- The system hides technical realism sliders from normal users.
- Auto Realism automatically derives camera match, edge blending, grounding shadows, face shading, and simple perspective assistance.
- Global ambient matching, position-based ambient matching, and spatial ambient relighting still remain part of the pipeline.
- Auto Realism runs mainly when Apply Overlay is clicked.
- Advanced tuning controls exist only for debugging or developer adjustment.
- The feature improves visual realism but does not perform true camera calibration, depth estimation, or physically accurate rendering.

DELIVERABLE:
Implement Auto Realism Engine in the existing GlassFit codebase.

Provide:
1. changed files,
2. explanation of the simplified UX,
3. explanation of automatic realism settings,
4. how cabinet and window defaults differ,
5. how Auto-fit to Scene works,
6. how enhanced grounding shadows work,
7. how camera match and edge blending are automated,
8. how face-based shading works,
9. how this interacts with existing spatial ambient relighting, object-aware occlusion, shadows, window glass modes, multiple overlays, and final export.