You are a senior computer graphics engineer, Three.js specialist, canvas compositing engineer, and UX-focused full-stack developer. You are working on GlassFit, a Next.js + FastAPI photo-based visualization system for customized glass and aluminum client-space fitting.

PROJECT CONTEXT:
GlassFit is a web-based visualization system that allows users to upload a room/space photo, analyze the photo through a backend image analysis service, detect objects using YOLOv8 segmentation, place 3D product overlays, adjust overlays, use per-overlay object-aware occlusion, manage multiple overlay layers, configure window glass view modes, apply realistic shadows, and export a final PNG visualization.

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
- position-based ambient matching
- spatial ambient relighting using a 5x5 local lighting map
- realistic contact shadow and directional cast shadow
- object-aware occlusion using original-image object cutouts
- multiple overlays using one active editable overlay and flattened placed layers
- cabinet and window model options
- window glass view modes
- final PNG export

IMPORTANT:
Do not rebuild global ambient matching, position-based ambient matching, or spatial ambient relighting. Those already exist.

This feature must build on top of the existing realism pipeline.

CURRENT REALISM PROBLEM:
Even with ambient matching and spatial relighting, overlays can still look unrealistic because they may not match:
1. room perspective,
2. floor plane direction,
3. contact with the floor,
4. camera softness/noise,
5. edge blending,
6. model footprint grounding,
7. material roughness and imperfections.

A cabinet overlay, for example, can still look pasted on if it is too front-facing, too sharp, too clean, or lacks strong contact shadows under its legs/base.

NEW FEATURE GOAL:
Implement Perspective and Grounding Realism Controls.

This feature should help users make the active overlay look more naturally placed in the uploaded photo by adding:
1. manual perspective/skew controls,
2. floor anchor and floor guide support,
3. enhanced local contact shadows under the model base and feet/legs,
4. camera quality matching,
5. edge softness/alpha feathering,
6. optional material realism improvements for procedural fallback models,
7. final export support for all of these effects.

FEATURE NAME:
Perspective and Grounding Realism Controls

Suggested internal names:
- groundingRealism
- perspectiveGroundingControls
- perspectiveWarpSettings
- floorAnchorSettings
- cameraMatchSettings
- edgeBlendSettings

PRIMARY UX PRINCIPLE:
Keep this practical and MVP-friendly.

Do not implement full automatic depth estimation, automatic floor-plane detection, or true camera calibration yet.

Use manual controls with good defaults.

The user should be able to adjust perspective and grounding only for the active overlay. Once the user clicks Apply Overlay, the perspective and grounding effects should be flattened into the placed overlay layer.

CURRENT RELEVANT FILES:
- src/components/GlassFitMvp.tsx
- src/components/CanvasEditor.tsx
- src/components/OverlayControls.tsx
- src/components/PlacedOverlayPanel.tsx
- src/lib/types.ts
- src/lib/canvasUtils.ts
- src/lib/modelRenderer.ts

CURRENT RENDERING PIPELINE CONTEXT:
The app currently renders the active model using Three.js, applies ambient/model matching, position-based matching, spatial ambient relighting, shadows, and object-aware cutouts. Placed overlays are flattened layers. Only one overlay is actively editable at a time.

Do not break this architecture.

The new pipeline should become approximately:

1. Render 3D model to transparent canvas.
2. Apply existing global ambient matching.
3. Apply existing position-based ambient matching on Apply Overlay.
4. Apply existing spatial ambient relighting on Apply Overlay.
5. Apply new camera quality matching and edge blending.
6. Draw directional cast shadow.
7. Draw enhanced grounding/contact shadows.
8. Draw model with perspective/skew/tilt transform.
9. Draw object-aware cutouts above the model.
10. Save as flattened placed overlay on Apply Overlay.
11. Include all visible placed overlays in final PNG export.

A. ADD TYPES

In src/lib/types.ts, add:

interface PerspectiveSettings {
  enabled: boolean;
  skewX: number;
  skewY: number;
  verticalTilt: number;
  floorAngle: number;
  perspectiveX: number;
  perspectiveY: number;
}

interface FloorAnchorSettings {
  enabled: boolean;
  anchorX: number;
  anchorY: number;
  showGuide: boolean;
  snapBottomToAnchor: boolean;
}

interface GroundingShadowSettings {
  enabled: boolean;
  baseContactStrength: number;
  legContactStrength: number;
  contactBlur: number;
  floorFade: number;
  useFootPoints: boolean;
}

interface CameraMatchSettings {
  enabled: boolean;
  blurPx: number;
  grainAmount: number;
  edgeFeatherPx: number;
  compressionSoftness: number;
}

interface GroundingRealismSettings {
  perspective: PerspectiveSettings;
  floorAnchor: FloorAnchorSettings;
  groundingShadow: GroundingShadowSettings;
  cameraMatch: CameraMatchSettings;
}

Add optional field to ActiveOverlayState and PlacedOverlay:

groundingRealism?: GroundingRealismSettings;

Default values:

const DEFAULT_GROUNDING_REALISM: GroundingRealismSettings = {
  perspective: {
    enabled: true,
    skewX: 0,
    skewY: 0,
    verticalTilt: 0,
    floorAngle: 0,
    perspectiveX: 0,
    perspectiveY: 0
  },
  floorAnchor: {
    enabled: true,
    anchorX: 0.5,
    anchorY: 0.85,
    showGuide: true,
    snapBottomToAnchor: false
  },
  groundingShadow: {
    enabled: true,
    baseContactStrength: 0.35,
    legContactStrength: 0.45,
    contactBlur: 10,
    floorFade: 0.8,
    useFootPoints: true
  },
  cameraMatch: {
    enabled: true,
    blurPx: 0.6,
    grainAmount: 0.06,
    edgeFeatherPx: 0.8,
    compressionSoftness: 0.08
  }
};

When adding a new overlay, initialize groundingRealism with these defaults.

When duplicating an overlay, copy groundingRealism but allow the duplicate to be edited independently.

When editing a placed overlay, restore groundingRealism into the active overlay state.

When applying an overlay, include groundingRealism effects in the flattened layer.

B. PERSPECTIVE / SKEW CONTROLS

Add manual perspective controls for the active overlay.

The goal is to make the overlay follow the room/floor perspective better.

Controls:
- Enable perspective adjustment
- Skew X
- Skew Y
- Vertical tilt
- Floor angle
- Perspective X
- Perspective Y

Suggested ranges:
- skewX: -0.35 to 0.35
- skewY: -0.20 to 0.20
- verticalTilt: -0.25 to 0.25
- floorAngle: -45 to 45 degrees
- perspectiveX: -0.30 to 0.30
- perspectiveY: -0.30 to 0.30

Implementation requirements:
- Start with affine canvas transforms. Do not attempt complex camera calibration.
- Apply skew/tilt after the model is rendered to a transparent canvas.
- It is acceptable to use ctx.transform() for the first implementation.
- If feasible, add a simple four-corner warp helper later, but do not make the feature depend on it.
- The transformation must work in editor preview and final PNG export.
- Object-aware cutouts must still be drawn above the transformed overlay.

Suggested helper:

drawImageWithPerspectiveTransform(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement | HTMLImageElement,
  bounds: Rect,
  perspective: PerspectiveSettings
): void

If true perspective warp is too complex, implement:

drawImageWithAffinePerspectiveApproximation(...)

Use:
- translate to overlay center
- rotate by overlay rotation
- apply skewX/skewY
- apply verticalTilt using scaleY/skewY
- draw image centered
- restore context

C. FLOOR ANCHOR AND GUIDE

Add a simple floor anchor system.

Purpose:
Help users align the object with the floor visually.

Settings:
- show floor guide
- snap bottom to anchor
- anchorX
- anchorY
- floorAngle

Behavior:
- Show a subtle guide point or guide line in the editor preview only.
- Do not show the guide in final export.
- The floor guide should help users align cabinet/window base with the apparent floor.
- If snapBottomToAnchor is enabled, align the active overlay bottom center to the anchor point.
- If not enabled, the guide is only visual.

Implementation:
- Add guide rendering in CanvasEditor preview mode.
- Use normalized anchor coordinates relative to the canvas.
- Provide a button or mode: “Set floor anchor”.
- If click-to-set is too much for now, allow sliders or numeric normalized controls.
- Keep this simple.

D. ENHANCED CONTACT / GROUNDING SHADOWS

The current contact shadow is too generic. Improve grounding with stronger localized contact shadows.

Add helper:

drawGroundingContactShadows(
  ctx: CanvasRenderingContext2D,
  overlayBounds: Rect,
  overlayTransform: OverlayTransform,
  grounding: GroundingShadowSettings,
  perspective?: PerspectiveSettings
): void

Behavior:
1. Draw soft base shadow under the model body.
2. Draw smaller darker ellipses under estimated feet/legs.
3. Apply floor angle if available.
4. Draw before the model.
5. Include in flattened overlay and final PNG export.

Estimated foot positions if model-specific foot points are unavailable:
- left front foot: x + width * 0.18, y + height * 0.94
- right front foot: x + width * 0.82, y + height * 0.94
- optional rear feet: x + width * 0.25 and 0.75, y + height * 0.88

For cabinet model:
- use foot/contact shadows by default.
- base contact should be visible but soft.
- leg shadows should be darker and smaller than the base shadow.

For window model:
- use weaker grounding if it is wall-mounted or not floor-standing.
- If there is no floor contact, reduce leg contact shadows or disable useFootPoints by default for windows.

Do not replace the existing directional cast shadow. This enhanced grounding shadow should complement it.

E. CAMERA QUALITY MATCHING

The rendered model can look too sharp and clean compared with phone photos.

Add utility in src/lib/canvasUtils.ts:

applyCameraMatchToOverlayCanvas(
  modelCanvas: HTMLCanvasElement,
  settings: CameraMatchSettings,
  seed?: string
): HTMLCanvasElement

Behavior:
- Apply slight blur.
- Add subtle deterministic grain.
- Apply alpha edge feathering.
- Optionally simulate compression softness slightly.
- Preserve transparency.
- Only affect visible pixels.
- Keep it subtle.

Suggested default:
- blurPx: 0.6
- grainAmount: 0.06
- edgeFeatherPx: 0.8
- compressionSoftness: 0.08

Do not make the model obviously blurry.

F. EDGE SOFTNESS / ALPHA FEATHERING

Add utility:

applyAlphaFeather(
  canvas: HTMLCanvasElement,
  featherPx: number
): HTMLCanvasElement

Goal:
Reduce the overly sharp cutout edge of the rendered model.

Possible implementation:
- Use alpha mask blur.
- Or use canvas filter blur on alpha channel.
- Or perform a simple alpha erosion/softening pass.
- Preserve main model detail while softening only the edge.

If implementing full alpha feathering is complex, use a subtle canvas blur and re-mask alpha as a first version.

G. MATERIAL REALISM IMPROVEMENTS

Improve procedural fallback materials in modelRenderer.ts.

For procedural cabinet/drawer fallback:
- add slightly beveled edges if feasible,
- darken drawer grooves,
- add subtle roughness,
- avoid perfectly flat gray/white material,
- add slight face variation: top face slightly brighter, lower/side surfaces slightly darker,
- improve handles so they catch small shadows/highlights.

For procedural window fallback:
- preserve existing window glass modes,
- keep frame roughness realistic,
- avoid overly perfect flat colors.

For loaded GLB:
- do not override original materials aggressively.
- only apply subtle roughness/exposure adjustments if already done.
- keep existing window glass material replacement working.

H. UI CHANGES

In OverlayControls.tsx, add a collapsible section:

Perspective & Grounding

Show it only when there is an active overlay.

Controls:
- Enable perspective adjustment
- Skew X slider
- Skew Y slider
- Vertical tilt slider
- Floor angle slider
- Show floor guide toggle
- Snap bottom to floor anchor toggle
- Enhanced contact shadows toggle
- Contact shadow strength slider
- Leg shadow strength slider
- Camera match toggle
- Edge softness slider
- Blur slider
- Grain slider

Keep the UI clean.

Suggested grouping:
1. Perspective
2. Floor Guide
3. Grounding Shadows
4. Camera Match

Do not expose too many advanced controls by default if the panel becomes crowded. It is acceptable to hide advanced controls in a sub-section.

I. MULTIPLE OVERLAY BEHAVIOR

Placed overlays remain flattened visual layers.

When applying an overlay:
- include perspective transform,
- enhanced contact shadows,
- camera matching,
- edge blending,
- existing ambient matching,
- existing spatial relighting,
- existing object-aware occlusion,
- existing window glass mode.

When editing a placed overlay:
- restore groundingRealism settings into active overlay.
- temporarily hide the placed layer while editing.
- on Apply Overlay, replace the flattened layer with updated realism effects.

When duplicating:
- copy groundingRealism settings.
- offset duplicate position.
- open duplicate as active overlay.
- user can adjust settings independently.

J. WINDOW OVERLAY BEHAVIOR

Window overlays should support the same perspective and camera matching.

But grounding behavior should differ:
- If the window is wall-mounted, strong floor contact shadows may look wrong.
- For window overlays, default legContactStrength should be lower or useFootPoints false.
- Still allow user to enable stronger shadows manually.

Window glass modes must remain working:
- Transparent
- Frosted / Empty
- Outdoor View
- Solid Tint

Camera matching and edge feathering should apply to the whole window render, but avoid making Outdoor View glass too blurry or dark.

K. OBJECT-AWARE OCCLUSION INTERACTION

Object-aware cutouts must still render above the transformed/grounded model.

Layer order:
1. Uploaded room photo
2. Existing directional cast shadow
3. New enhanced grounding/contact shadows
4. Perspective-transformed, camera-matched, spatially relit model
5. Object cutouts for the overlay’s enabled occlusion objects
6. Editor-only guides, if preview mode only

Do not include editor guides in final export.

L. FINAL PNG EXPORT

Final export must include:
- uploaded background photo,
- all visible placed overlays,
- perspective-adjusted overlay images,
- enhanced grounding shadows,
- existing directional shadows,
- camera-matched overlay result,
- spatial relighting result,
- object-aware cutouts,
- active overlay if one is being edited.

Final export must NOT include:
- floor guide,
- anchor point marker,
- debug bounding boxes.

M. ERROR HANDLING

If any perspective/grounding/camera effect fails:
- log a warning if useful,
- fall back to existing render pipeline,
- still allow Apply Overlay,
- do not crash.

Handle:
- invalid transform math,
- invalid bounds,
- canvas filter unsupported,
- imageData failure,
- alpha feathering failure,
- settings missing,
- model canvas missing.

N. PERFORMANCE REQUIREMENTS

Keep performance acceptable on low- to mid-range devices.

Rules:
- Do not run expensive camera matching continuously during drag if it causes lag.
- Use lightweight preview while dragging.
- Run full camera match and edge feathering on Apply Overlay.
- Cache processed overlay result when possible.
- Keep only one active live Three.js renderer.
- Avoid full-image pixel processing.

O. VALIDATION TESTS

After implementation, verify:

1. Upload a real room photo with visible floor perspective.
2. Add cabinet overlay.
3. Adjust skew/floor angle until cabinet better follows the room perspective.
4. Confirm the cabinet no longer looks perfectly flat/front-facing.
5. Enable floor guide and confirm it appears only in editor preview.
6. Enable snap bottom to anchor and confirm overlay bottom aligns to the floor anchor.
7. Increase contact shadow strength and confirm the model feels more grounded.
8. Confirm smaller darker shadows appear under estimated feet/legs.
9. Enable camera match and confirm the model edges are less digitally sharp.
10. Increase edge softness and confirm edge blending improves.
11. Apply overlay and confirm all realism effects are flattened into the placed layer.
12. Duplicate overlay and confirm duplicate has independent grounding/perspective settings.
13. Edit placed overlay and confirm grounding settings are restored.
14. Test window overlay and confirm perspective controls work.
15. Test window glass modes and confirm they are not broken.
16. Confirm object-aware occlusion still works after perspective changes.
17. Confirm spatial ambient relighting still works.
18. Confirm final PNG includes perspective/grounding/camera match effects.
19. Confirm final PNG excludes floor guides and debug visuals.
20. Confirm app remains responsive with 3 to 5 overlays.
21. Confirm system falls back gracefully if any canvas effect fails.

P. DOCUMENTATION

Update the implementation guide with a new section:

Perspective and Grounding Realism Controls

Explain:
- ambient matching and spatial relighting already improve lighting,
- but overlays may still look unrealistic without perspective and grounding,
- manual perspective/skew controls help align the model with room perspective,
- floor anchoring helps users place the object on the floor,
- enhanced contact shadows make the object feel physically grounded,
- camera matching reduces overly sharp digital render edges,
- this is a practical approximation and not true camera calibration, depth estimation, or physical relighting.

Q. DELIVERABLE

Implement Perspective and Grounding Realism Controls in the existing GlassFit codebase.

Provide:
1. changed files,
2. short explanation of new settings,
3. how perspective/skew is applied,
4. how floor anchoring works,
5. how enhanced contact shadows work,
6. how camera matching and edge blending work,
7. how it interacts with existing spatial ambient relighting,
8. how it interacts with shadows, object-aware occlusion, window glass modes, and multiple overlays,
9. fallback behavior if a realism effect fails.