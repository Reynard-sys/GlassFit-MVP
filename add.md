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
The overlay controls currently expose too many technical and product-inappropriate options.

There are currently two separate ambient-related toggles:
1. Position-based ambient matching
2. Spatial ambient relighting

These are too technical and redundant for non-technical customers.

There is also a window glass color/tint feature. Remove this customer-facing color feature because it does not align well with R.R.D Glass and Aluminum’s actual business products. Customers should not be choosing arbitrary glass colors in the visualization workspace unless those colors exist as real product variations from the catalog.

NEW UX GOAL:
Simplify the customer-facing controls.

Combine these two features:
- Position-based ambient matching
- Spatial ambient relighting

into one single customer-facing feature:

Ambient Light Adjustment

This feature should work in the actual workspace while the user is editing the overlay.

Auto Realism should remain separate and should be treated as final/output polish.

Also replace the current window glass color/tint control with a business-aligned glass appearance system that makes the glass component look good and not see-through by default, without exposing arbitrary color selection.

IMPORTANT CONCEPTUAL SEPARATION:

A. Ambient Light Adjustment
This is a workspace feature.
It should be visible and active while the user is editing the overlay.

It internally includes:
- global ambient matching
- position-based local matching
- spatial ambient relighting

Customer-facing meaning:
“Match the product lighting to the uploaded photo.”

B. Auto Realism
This is an output enhancement feature.
It should not be confused with workspace ambient adjustment.

It includes:
- final camera quality matching
- edge blending
- enhanced grounding shadows
- face-based shading
- optional auto-fit / perspective refinement
- output polish

Customer-facing meaning:
“Make the final output look more natural.”

C. Glass Appearance
This is a window/glass-overlay-specific feature.
It should not expose arbitrary tint/color controls.

It should make the glass area look clean, realistic, and business-aligned.

Customer-facing meaning:
“Choose how the glass area should appear.”

USER-FACING CONTROL CHANGES:

1. Remove these normal customer-facing cards:
- Position-based ambient matching
- Spatial ambient relighting

Replace with one card:

Title:
Ambient Light Adjustment

Description:
Automatically matches the product lighting to the uploaded photo while you edit.

Toggle:
ON / OFF

Default:
ON

Optional helper text:
Uses the overall photo lighting and the overlay’s current position.

2. Keep Auto Realism as a separate card:

Title:
Auto Realism

Description:
Adds final output polish such as grounding, edge blending, and camera matching.

Toggle:
ON / OFF

Default:
ON

Optional button:
Auto-fit to Scene

3. Replace current Window Glass View / glass tint controls with:

Title:
Glass Appearance

Show only for window or glass-type overlays.

Options:
- Clear Glass
- Frosted Glass
- Opaque Glass
- Reflective Glass
- Outdoor View

Default:
Frosted Glass or Opaque Glass, whichever looks better and blocks the uploaded room photo behind the pane.

IMPORTANT:
Remove arbitrary tint color picker from normal customer UI.
Remove Solid Tint as a customer-facing option.
Do not allow users to choose random colors for the glass pane unless the color comes from real product catalog variations.

Glass should look like a real glass/aluminum product, not a colored design filter.

GLASS APPEARANCE BEHAVIOR:

1. Clear Glass
- Slightly transparent.
- Allows some uploaded photo to show through.
- Should still have glass highlight/reflection so it does not disappear.
- Use only if the user wants see-through glass.

2. Frosted Glass
- Mostly blocks background detail.
- Uses soft translucent white/gray glass material.
- Adds subtle blur/frosted appearance if feasible.
- No arbitrary color tint.

3. Opaque Glass
- Blocks the uploaded photo behind the glass area.
- Uses a clean neutral glass-like panel, such as off-white, light gray, or slightly blue-gray, but this should be an internal material choice, not a user color picker.
- Should look like privacy glass / non-see-through glass.

4. Reflective Glass
- Blocks most background detail.
- Adds subtle reflection-like highlight or gradient.
- Uses neutral gray/blue-gray internal material.
- No user color picker.

5. Outdoor View
- Replaces the pane with an outdoor texture if available.
- If /textures/outdoor-view.jpg is missing, use procedural sky/ground fallback.
- Do not expose color controls.

BUSINESS ALIGNMENT:
The system should avoid implying that arbitrary glass colors are available unless they are defined as product variations in the product catalog.

If product catalog variations later include real glass types, such as:
- clear glass
- frosted glass
- reflective glass
- tinted bronze glass
- tinted gray glass

then those should come from actual product variation data, not from a free color picker.

For now, remove arbitrary glass color control and use fixed professional glass appearance presets.

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

Add to ActiveOverlayState and PlacedOverlay:
ambientAdjustment?: AmbientLightAdjustmentSettings;

Keep internal metadata if needed:
- localLighting
- localAmbientAdjustments
- spatialRelightResult

But these must not appear in normal customer UI.

Update glass types:

Replace or update GlassViewMode:

type GlassAppearanceMode =
  | "clear"
  | "frosted"
  | "opaque"
  | "reflective"
  | "outdoor";

Update WindowGlassSettings:

interface WindowGlassSettings {
  mode: GlassAppearanceMode;
  opacity?: number;
  outdoorTexturePath?: string;
}

Remove from normal state and UI:
- tintColor
- arbitrary color picker
- solid tint mode as a user-facing mode

If older code requires tintColor internally, keep it as an internal optional fallback but do not expose it in UI:
internalTintColor?: string;

DEFAULT GLASS SETTINGS:
For window overlays:

windowGlass: {
  mode: "frosted",
  opacity: 0.9,
  outdoorTexturePath: "/textures/outdoor-view.jpg"
}

Alternative default if frosted looks weak:
mode: "opaque"

AUTO REALISM TYPE:
Keep AutoRealismSettings separate:

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
- still allow the user to move/resize/rotate.

APPLY OVERLAY BEHAVIOR:
When the user clicks Apply Overlay:
1. Render the active 3D model.
2. If Ambient Light Adjustment is ON:
   - apply global match,
   - apply position-based local match,
   - apply spatial ambient relighting.
3. Apply glass appearance material if the model is a window/glass type.
4. Flatten/save the overlay as a placed layer.
5. If Auto Realism is ON:
   - apply output polish to the placed layer, or store the setting for final output.
6. Preserve:
   - ambientAdjustment
   - autoRealism
   - windowGlass, if applicable

Recommended MVP-safe strategy:
- Bake Ambient Light Adjustment into placed overlay on Apply Overlay.
- Bake Auto Realism into placed overlay on Apply Overlay only if the current architecture uses flattened layers for preview/final consistency.
- Mark autoRealismBaked = true.
- During Generate Output, draw the baked placed overlay as-is.
- For active overlay not yet applied, run both Ambient Light Adjustment and Auto Realism during Generate Output.

Avoid double-applying Auto Realism.

GENERATE OUTPUT BEHAVIOR:
When user clicks Generate Output:
1. Draw uploaded room photo.
2. Draw all visible placed overlays.
3. For each overlay:
   - ensure Ambient Light Adjustment result is included.
   - ensure glass appearance is preserved.
   - apply Auto Realism only if not already baked.
4. Draw shadows and object-aware cutouts in correct order.
5. Export final PNG.

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

For window/glass overlays, replace Window Glass View with:

Card:
Title: Glass Appearance
Description: Controls how the glass area appears in the visualization.
Options:
- Clear Glass
- Frosted Glass
- Opaque Glass
- Reflective Glass
- Outdoor View

Remove:
- tint color picker
- arbitrary color input
- solid tint customer-facing option
- wording that suggests free color customization for glass

Optional note:
“Glass appearance presets are visual approximations. Actual glass types depend on available product options.”

Advanced / Developer Tuning:
Add collapsed section:
Advanced / Developer Tuning

Inside it, move old technical controls if still needed:
- position-based matching toggle
- spatial relighting toggle
- spatial relighting strength
- grid size
- shadow strength
- blur/grain/edge feather
- any debugging sliders

This section must be collapsed by default.

MODEL RENDERER CHANGES:
Update modelRenderer.ts glass material handling.

Replace old modes:
- transparent
- frosted
- outdoor
- solid
- solid tint / color tint

with:
- clear
- frosted
- opaque
- reflective
- outdoor

Material behavior:

Clear Glass:
- transparent true
- opacity around 0.25–0.4
- slight roughness
- subtle highlights
- depthWrite false if needed

Frosted Glass:
- transparent true
- opacity around 0.75–0.9
- roughness high
- neutral white/gray material
- should hide most background detail

Opaque Glass:
- transparent false or nearly opaque
- neutral off-white/light gray/blue-gray internal material
- no color picker
- blocks background behind pane

Reflective Glass:
- mostly opaque
- neutral gray/blue-gray
- add subtle gradient or reflection-like highlight if feasible
- no color picker

Outdoor View:
- use /textures/outdoor-view.jpg if available
- fallback to generated sky/ground texture
- no color picker

If GLB has no glass mesh:
- keep the procedural glass fill plane fallback
- apply the selected Glass Appearance material to that fill plane

STATE MIGRATION:
Existing overlays may still use:
- windowGlass.mode: "transparent"
- windowGlass.mode: "frosted"
- windowGlass.mode: "outdoor"
- windowGlass.mode: "solid"
- windowGlass.tintColor

Map old modes:
- "transparent" -> "clear"
- "frosted" -> "frosted"
- "outdoor" -> "outdoor"
- "solid" -> "opaque"

Ignore old tintColor in normal UI.

If tintColor exists:
- do not display it.
- do not allow editing it.
- optionally ignore it unless needed for backward compatibility.

PAPER / DOCUMENTATION ALIGNMENT:
Update GLASSFIT_MVP_IMPLEMENTATION_GUIDE.md.

Revise Ambient Light section:
- The previous Position-based Ambient Matching and Spatial Ambient Relighting are now combined under one customer-facing Ambient Light Adjustment control.
- It works in the visualization workspace.
- It internally uses global lighting, local position-based matching, and non-uniform spatial relighting.
- Technical subfeatures are hidden from normal users.

Revise Auto Realism section:
- Auto Realism is separate from Ambient Light Adjustment.
- It is output-focused.
- It adds final polish such as grounding, camera quality matching, edge blending, and face shading.
- It runs mainly when applying an overlay or generating the final output.

Revise Window / Glass section:
- Remove arbitrary tint/color customization from customer-facing glass controls.
- Replace “Window Glass View” with “Glass Appearance.”
- Explain that Glass Appearance uses business-aligned presets such as Clear Glass, Frosted Glass, Opaque Glass, Reflective Glass, and Outdoor View.
- Explain that actual colors or specialty glass types should come from product catalog variations, not from a free color picker.

BACKWARD COMPATIBILITY:
Do not break existing placed overlays.

Support old fields:
- ambientEnabled
- positionBasedAmbientEnabled
- spatialRelight
- windowGlass.mode
- windowGlass.tintColor

Migration behavior:
- Create ambientAdjustment from old ambient fields.
- Convert old glass modes to new GlassAppearanceMode.
- Hide old tintColor from UI.

PERFORMANCE:
Ambient Light Adjustment should be responsive in workspace:
- Global match can be live.
- Local/spatial matching should use debounce or run after drag end.
- Auto Realism should only run on Apply Overlay or Generate Output.
- Do not run camera match, face shading, strong edge blending, or expensive grounding passes every frame.

VALIDATION TESTS:
After implementation, verify:

1. The normal UI no longer shows separate Position-based ambient matching and Spatial ambient relighting cards.
2. A single Ambient Light Adjustment card appears instead.
3. Ambient Light Adjustment is ON by default.
4. Turning Ambient Light Adjustment OFF disables global/local/spatial lighting matching.
5. Turning it ON restores the combined lighting behavior.
6. Auto Realism appears as a separate output-polish feature.
7. Auto Realism is ON by default.
8. Auto Realism does not run heavy processing continuously while dragging.
9. Window/glass overlays no longer show tint color picker.
10. Solid Tint is no longer shown as a customer-facing mode.
11. Glass Appearance shows Clear, Frosted, Opaque, Reflective, and Outdoor View.
12. Frosted or Opaque mode blocks most of the uploaded background behind the glass.
13. Clear mode allows some background visibility but still looks like glass.
14. Reflective mode looks like neutral reflective glass without arbitrary color.
15. Outdoor View still works with texture or procedural fallback.
16. Duplicating overlays preserves Ambient Light Adjustment, Auto Realism, and Glass Appearance settings.
17. Editing overlays restores these settings.
18. Placed overlays do not double-apply Auto Realism during final export.
19. Object-aware occlusion still works.
20. Final PNG export includes ambient-adjusted, glass-appearance-correct, auto-realism-polished overlays.
21. App remains responsive with 3–5 overlays.

DELIVERABLE:
Implement the UI, state, renderer, and documentation refactor.

Provide:
1. changed files,
2. explanation of the simplified customer UX,
3. how the two previous ambient features were combined,
4. how Ambient Light Adjustment works in the workspace,
5. how Auto Realism works as output polish,
6. how the window/glass color feature was removed,
7. how Glass Appearance presets work,
8. how backward compatibility was handled,
9. how double-applying Auto Realism is avoided,
10. how this affects apply overlay, duplicate, edit, and final export.