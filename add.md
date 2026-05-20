You are a senior UX-focused full-stack engineer, Three.js specialist, canvas compositing engineer, and computer graphics engineer. You are working on GlassFit, a Next.js + FastAPI photo-based visualization system for customized glass and aluminum client-space fitting.

PROJECT CONTEXT:
GlassFit already supports:
- image upload
- backend lighting analysis
- YOLO segmentation
- 3D model overlay
- multiple placed overlays
- per-overlay object-aware occlusion
- ambient light adjustment
- position-based ambient matching
- spatial ambient relighting
- realistic shadows
- window glass view modes
- final PNG export
- Auto Realism Engine

CURRENT UX PROBLEM:
The overlay controls currently show two separate feature toggles:

1. Position-based ambient matching
   - Refines lighting from the exact area when the overlay is placed.

2. Spatial ambient relighting
   - Varies the model’s shading based on the lighting around its exact placement area.

These are too technical and redundant for customers. They should be combined into one understandable feature because both are part of the same goal: making the product overlay match the lighting of the uploaded photo while the user works in the visualization workspace.

NEW UX GOAL:
Combine these two features into one customer-facing feature:

Ambient Light Adjustment

This should work in the actual workspace/preview while the user is editing the active overlay.

When the user saves/applies the overlay, the same Ambient Light Adjustment should be preserved in the placed overlay.

Then, when the user generates or saves the final output, Auto Realism should be applied on top as an output-only enhancement.

IMPORTANT CONCEPTUAL SEPARATION:

A. Ambient Light Adjustment
This is a workspace feature.
It should be visible and active while the user is editing the overlay.

It includes:
- global ambient matching,
- position-based local matching,
- spatial ambient relighting.

It should help the overlay look matched during editing and after applying.

B. Auto Realism
This is an output enhancement feature.
It should not be confused with workspace ambient adjustment.

It includes:
- final camera quality matching,
- edge blending,
- enhanced grounding shadows,
- face-based shading,
- optional auto-fit/perspective refinement,
- output polish.

Auto Realism should be applied when the user clicks:
- Apply Overlay, if the overlay is being flattened for placed layer preview, OR
- Generate Output, if the final image is being exported.

However, in the customer-facing explanation, Auto Realism should be described mainly as final/output polish.

PREFERRED USER-FACING UX:
In OverlayControls.tsx, replace these two separate cards/toggles:

- Position-based ambient matching
- Spatial ambient relighting

with one single card/toggle:

Ambient Light Adjustment

Description:
“Automatically matches the product lighting to the uploaded photo while you edit.”

Default:
ON

Optional small detail text:
“Uses the overall photo lighting and the overlay’s current position.”

Do not show “position-based” and “spatial relighting” as separate customer-facing terms.

NEW CONTROL LAYOUT:
The normal customer-facing controls should have:

1. Ambient Light Adjustment
   - Toggle ON/OFF
   - Works in the workspace while editing.

2. Auto Realism
   - Toggle ON/OFF
   - Description: “Adds final output polish such as grounding, edge blending, and camera matching.”
   - Output-focused.
   - Default ON.

Optional:
Advanced / Developer Tuning collapsed section
- Position-based matching toggle
- Spatial relighting toggle
- Spatial relighting strength
- Grid size
- Camera blur
- Grain
- Edge feather
- Shadow strength

But these must be hidden by default and should not appear in normal customer workflow.

TERMINOLOGY REQUIREMENTS:
Use customer-facing language:
- Ambient Light Adjustment
- Auto Realism
- Final Output Polish
- Match photo lighting
- Improve realism

Avoid customer-facing language:
- position-based ambient matching
- spatial ambient relighting
- grid map
- bilinear interpolation
- local luminance
- alpha feathering
- pixel pass

Internal code can still use technical names if useful.

TYPE REFACTOR:
In src/lib/types.ts, create or update:

interface AmbientLightAdjustmentSettings {
  enabled: boolean;

  // Internal subfeatures, hidden from normal UI
  useGlobalMatch: boolean;
  usePositionMatch: boolean;
  useSpatialRelight: boolean;
  spatialRelightStrength: number;
}

Default:
{
  enabled: true,
  useGlobalMatch: true,
  usePositionMatch: true,
  useSpatialRelight: true,
  spatialRelightStrength: 0.35
}

Deprecate or wrap old fields:
- positionBasedAmbientEnabled
- spatialRelight.enabled
- spatialRelight.intensity

Do not break existing placed overlays. Add compatibility migration:
- If old placed overlay has positionBasedAmbientEnabled or spatialRelight, map them into AmbientLightAdjustmentSettings.
- If new field is missing, initialize default ON.

Add to ActiveOverlayState and PlacedOverlay:

ambientAdjustment?: AmbientLightAdjustmentSettings;

Keep existing lighting metadata if needed:
- localLighting
- localAmbientAdjustments
- spatialRelightResult

But these should be internal metadata, not customer-facing UI.

AUTO REALISM TYPE:
Keep existing AutoRealismSettings or create if missing:

interface AutoRealismSettings {
  enabled: boolean;
  placementType: "floor-standing" | "wall-mounted" | "tabletop";
  autoPerspective: boolean;
  autoCameraMatch: boolean;
  autoGroundingShadow: boolean;
  autoEdgeBlend: boolean;
  autoFaceShading: boolean;
}

Do not merge Auto Realism into Ambient Light Adjustment.

They are separate:
- Ambient Light Adjustment = workspace lighting match
- Auto Realism = output polish / save polish

WORKSPACE BEHAVIOR:
While the user is editing an active overlay:
- If Ambient Light Adjustment is ON:
  - use global lighting match immediately,
  - update position-based local match when the overlay stops moving/resizing/rotating or after a debounce,
  - update spatial relighting preview if performance allows.
- If performance is a concern:
  - use global match during dragging,
  - update local/spatial match after drag end or after 300–500ms debounce.
- Do not run heavy processing continuously every animation frame.

When Ambient Light Adjustment is OFF:
- render the model with neutral/default lighting,
- do not apply position-based or spatial relighting,
- still allow user to move/resize/rotate.

APPLY OVERLAY BEHAVIOR:
When the user clicks Apply Overlay:
1. Render the active 3D model.
2. If Ambient Light Adjustment is ON:
   - apply global match,
   - apply position-based local match,
   - apply spatial ambient relighting.
3. Flatten/save the overlay as a placed layer.
4. If Auto Realism is ON:
   - optionally apply output polish to the placed layer preview,
   - or store the auto realism settings and apply them at final export.
5. Preserve both settings:
   - ambientAdjustment
   - autoRealism

Important:
The placed overlay should visually look close to the final output, but Auto Realism should be treated as final/output polish.

GENERATE OUTPUT BEHAVIOR:
When user clicks Generate Output:
1. Draw uploaded room photo.
2. Draw all visible placed overlays.
3. For each overlay:
   - ensure Ambient Light Adjustment result is included.
   - apply Auto Realism output polish if Auto Realism is ON.
4. Draw shadows and object-aware cutouts in correct order.
5. Export final PNG.

If Auto Realism was already baked into a placed overlay at Apply Overlay:
- avoid double-applying the same effect.
- Store a flag such as:
  autoRealismBaked?: boolean;
- If already baked, do not apply again during Generate Output.
- If not baked, apply during Generate Output.

Recommended:
Use one consistent strategy:
- Ambient Light Adjustment is baked when overlay is applied.
- Auto Realism is applied during final output generation, unless a preview bake is needed.
- If you generate a placed overlay preview with Auto Realism, store separate source render and final render to avoid double processing.

Simpler MVP-safe strategy:
- Bake Ambient Light Adjustment into placed overlay on Apply Overlay.
- Bake Auto Realism into placed overlay on Apply Overlay only for preview/final consistency.
- Mark autoRealismBaked = true.
- During Generate Output, draw the baked placed overlay as-is.
- For active overlay not yet applied, run both Ambient Light Adjustment and Auto Realism during Generate Output.

Choose the simpler strategy unless the existing architecture supports separate source/final layers.

UI CHANGES:
Update OverlayControls.tsx.

Remove visible cards/toggles:
- Position-based ambient matching
- Spatial ambient relighting

Replace with:

Card:
Title: Ambient Light Adjustment
Description: Automatically matches the product lighting to the uploaded photo while you edit.
Toggle: ON/OFF

Card:
Title: Auto Realism
Description: Adds final output polish such as grounding, edge blending, and camera matching.
Toggle: ON/OFF

Optional button near Auto Realism:
Auto-fit to Scene

Placement dropdown:
Placement Type:
- Floor-standing
- Wall-mounted
- Tabletop / Surface-mounted

Default:
- Cabinet: Floor-standing
- Window: Wall-mounted

Developer tuning:
Add collapsed section:
Advanced / Developer Tuning

Inside it, move old controls:
- position-based matching
- spatial relighting
- spatial relighting strength
- shadow strength
- blur/grain/edge feather
- any technical sliders

This section must be collapsed by default.

CANVAS EDITOR CHANGES:
Update CanvasEditor.tsx so that rendering reads from ambientAdjustment instead of separate customer-facing booleans.

Pseudo behavior:

const ambientEnabled = activeOverlay.ambientAdjustment?.enabled ?? true;

if (ambientEnabled) {
  applyGlobalAmbientMatch();
  if (ambientAdjustment.usePositionMatch) applyPositionBasedMatch();
  if (ambientAdjustment.useSpatialRelight) applySpatialRelight();
}

Auto Realism should be separate:

const autoRealismEnabled = activeOverlay.autoRealism?.enabled ?? true;

if (autoRealismEnabled && isApplyOrExportPhase) {
  applyAutoRealism();
}

Important:
- Ambient Light Adjustment can affect workspace preview.
- Auto Realism should not run expensive output polish continuously while dragging.

STATE MIGRATION:
Update GlassFitMvp.tsx or state initialization helpers.

When creating new overlay:
- ambientAdjustment default ON.
- autoRealism default ON.

When duplicating:
- copy ambientAdjustment settings.
- copy autoRealism settings.
- recompute local/spatial lighting when applied at new position.

When editing:
- restore ambientAdjustment.
- restore autoRealism.

When applying:
- save ambientAdjustment.
- save autoRealism.
- save internal local/spatial result metadata if needed.

BACKWARD COMPATIBILITY:
Existing placed overlay objects may still have:
- ambientEnabled
- positionBasedAmbientEnabled
- spatialRelight
- localLighting
- localAmbientAdjustments
- spatialRelightResult

Support them during migration:
- ambientAdjustment.enabled = ambientEnabled ?? true
- ambientAdjustment.usePositionMatch = positionBasedAmbientEnabled ?? true
- ambientAdjustment.useSpatialRelight = spatialRelight?.enabled ?? true
- ambientAdjustment.spatialRelightStrength = spatialRelight?.intensity ?? 0.35

Do not delete old fields until all code references are updated safely.

PERFORMANCE:
Ambient Light Adjustment should be responsive in workspace:
- Global match can be live.
- Position/spatial matching should use debounce or run on drag end.
- Auto Realism should only run on Apply Overlay or Generate Output.
- Do not run camera match, face shading, strong edge blending, or expensive grounding passes every time the user drags.

QUALITY TARGET:
Customer should understand:
- Ambient Light Adjustment = makes the product match the photo lighting while editing.
- Auto Realism = adds final realistic polish to output.

Customer should not need to understand:
- local grid analysis,
- pixel relighting,
- blur/grain,
- edge feather,
- shadow math.

VALIDATION TESTS:
After implementation, verify:

1. The UI no longer shows separate Position-based ambient matching and Spatial ambient relighting cards in the normal view.
2. A single Ambient Light Adjustment card appears instead.
3. Ambient Light Adjustment is ON by default.
4. Turning Ambient Light Adjustment OFF disables global/local/spatial lighting matching.
5. Turning it ON restores the combined lighting behavior.
6. Auto Realism appears as a separate output-polish feature.
7. Auto Realism is ON by default.
8. Auto Realism effects are applied when Apply Overlay or Generate Output is used.
9. Auto Realism does not run heavy processing continuously while dragging.
10. Cabinet and window overlays get correct default placement type.
11. Advanced/Developer tuning section is collapsed by default.
12. Old position-based/spatial controls are available only inside advanced section, if retained.
13. Duplicating overlays preserves Ambient Light Adjustment and Auto Realism settings.
14. Editing overlays restores both settings.
15. Placed overlays do not double-apply Auto Realism during final export.
16. Window glass modes still work.
17. Object-aware occlusion still works.
18. Final PNG export includes ambient-adjusted and auto-realism-polished overlays.
19. App remains responsive with 3–5 overlays.

DOCUMENTATION:
Update GLASSFIT_MVP_IMPLEMENTATION_GUIDE.md.

Add or revise section:

Ambient Light Adjustment

Explain:
- The previous Position-based Ambient Matching and Spatial Ambient Relighting are now combined under one customer-facing Ambient Light Adjustment control.
- It works in the visualization workspace.
- It includes global lighting, local position-based matching, and non-uniform spatial relighting internally.
- These technical subfeatures are hidden from normal users.

Add or revise section:

Auto Realism

Explain:
- Auto Realism is separate from Ambient Light Adjustment.
- It is output-focused.
- It adds final polish such as grounding, camera quality matching, edge blending, and face shading.
- It runs mainly when applying an overlay or generating the final output.
- It is not intended as a set of manual technical sliders for customers.

DELIVERABLE:
Implement the UI and state refactor.

Provide:
1. changed files,
2. explanation of the new simplified UX,
3. how the two previous ambient features were combined,
4. how Ambient Light Adjustment works in the workspace,
5. how Auto Realism works as output polish,
6. how backward compatibility was handled,
7. how double-applying Auto Realism is avoided,
8. how this affects apply overlay, duplicate, edit, and final export.