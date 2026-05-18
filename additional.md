You are a senior Three.js engineer, 3D asset integration specialist, canvas compositing engineer, and UX-focused full-stack developer. You are working on the GlassFit MVP, a Next.js + FastAPI photo-based visualization prototype.

PROJECT CONTEXT:
The current GlassFit MVP allows users to upload a room photo, analyze brightness and lighting through FastAPI, detect real-world objects using YOLOv8 segmentation, place a 3D product model into the uploaded photo, adjust the model using move/resize/rotate/yaw/pitch controls, toggle object-aware occlusion, apply ambient light matching, add realistic contact and cast shadows, support multiple overlays using a hybrid active-overlay plus flattened-layer approach, and export a final PNG.

The current rendering pipeline uses:
- Next.js frontend
- TypeScript
- Three.js for 3D model rendering
- HTML Canvas for final composition and export
- FastAPI for image analysis
- YOLOv8 segmentation for object-aware masks

A new 3D model file has been added:
- glass_window.glb

The user wants to test a new window overlay behavior:
The inside glass area of the window should not always show the uploaded room/background photo behind it. The user wants the window glass area to optionally look like:
1. transparent glass,
2. frosted / empty glass,
3. outdoor view,
4. solid tinted glass.

The goal is to make the window overlay more realistic and prevent the uploaded background image from unintentionally showing through the window glass when the user wants an outdoor/empty view.

YOUR ROLE:
Act as a senior graphics engineer and product-minded MVP architect. Prioritize reliability, clean implementation, and a simple UX. Do not over-engineer. Build this as a practical MVP feature that works even if the GLB file does not have perfectly named meshes.

MAIN TASK:
Implement a window-specific “Glass View Mode” feature for the window 3D model overlay.

The feature should allow the user to choose how the inner glass pane of a window model is rendered:
- Transparent
- Frosted / Empty
- Outdoor View
- Solid Tint

The selected glass view mode should apply only to window-type overlays, not cabinet overlays.

EXPECTED MODEL FILE:
Use the new window model:

public/models/glass_window.glb

If the current app expects:

public/models/window.glb

then either:
- update the model option to use public/models/glass_window.glb, or
- support both paths if simple.

Do not break the existing cabinet model.

FEATURE REQUIREMENTS:

A. GLASS VIEW MODES

Add a new type in src/lib/types.ts:

type GlassViewMode = "transparent" | "frosted" | "outdoor" | "solid";

Add optional window-specific settings to overlay state:

interface WindowGlassSettings {
  mode: GlassViewMode;
  opacity: number;
  tintColor: string;
  outdoorTexturePath?: string;
}

Add this to ActiveOverlayState and PlacedOverlay only for window overlays, or as an optional property:

windowGlass?: WindowGlassSettings;

Default settings for window overlays:
{
  mode: "frosted",
  opacity: 0.9,
  tintColor: "#dbeafe",
  outdoorTexturePath: "/textures/outdoor-view.jpg"
}

Cabinet overlays should ignore this property.

B. UI / UX

In OverlayControls.tsx, add a window-only section called:

“Window Glass View”

Show this section only when the active overlay’s modelType is "window".

Controls:
1. Mode selector:
   - Transparent
   - Frosted / Empty
   - Outdoor View
   - Solid Tint

2. Opacity slider:
   - min: 0
   - max: 1
   - step: 0.05
   - visible for transparent, frosted, and solid modes
   - outdoor can remain opacity 1 by default, but still allow opacity if simple

3. Tint color input:
   - visible for frosted and solid modes

4. Optional outdoor texture selector:
   - for MVP, use one default texture:
     /textures/outdoor-view.jpg
   - if that texture is missing, use a procedural sky/gradient fallback.

Suggested UI text:
- Transparent: “Room photo remains visible through the glass.”
- Frosted / Empty: “Blocks most background detail using a soft glass tint.”
- Outdoor View: “Replaces the glass pane with an outdoor scene.”
- Solid Tint: “Uses a plain colored glass fill.”

C. RENDERING BEHAVIOR

Update src/lib/modelRenderer.ts so it can apply different materials to the glass area of a window model.

The ideal GLB structure would have a separate mesh or material for glass, for example:
- Window_Glass
- Glass
- Pane
- WindowPane
- material name containing glass

But the implementation must be robust even if the model is not perfectly named.

Implement a function:

function isGlassMesh(mesh: THREE.Mesh): boolean

Detection strategy:
Return true if any of the following contain glass-related terms:
- mesh.name
- material.name
- parent.name

Keywords:
- "glass"
- "pane"
- "window_glass"
- "windowglass"
- "transparent"
- "glazing"

Use case-insensitive matching.

D. MATERIAL REPLACEMENT

When loading/rendering a window model, traverse the scene:

model.traverse((child) => {
  if child is mesh and isGlassMesh(child):
    replace or update its material based on windowGlassSettings
});

Implement these material modes:

1. Transparent mode:
The glass should behave like regular transparent glass.

Suggested material:
new THREE.MeshPhysicalMaterial({
  color: tintColor or "#dbeafe",
  transparent: true,
  opacity: windowGlass.opacity ?? 0.28,
  roughness: 0.05,
  metalness: 0,
  transmission: 0.4,
  thickness: 0.02,
  clearcoat: 0.4,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
  depthWrite: false
});

2. Frosted / Empty mode:
The background behind the glass should mostly not be visible. It should look like frosted or empty light glass.

Suggested material:
new THREE.MeshStandardMaterial({
  color: tintColor or "#dbeafe",
  transparent: true,
  opacity: windowGlass.opacity ?? 0.88,
  roughness: 0.9,
  metalness: 0,
  side: THREE.DoubleSide,
  depthWrite: true
});

3. Outdoor View mode:
The glass should be filled with an outdoor texture or sky-like placeholder so the uploaded room photo is not visible behind it.

Use:
- /textures/outdoor-view.jpg

If the texture exists:
new THREE.MeshStandardMaterial({
  map: outdoorTexture,
  transparent: false,
  opacity: 1,
  roughness: 0.45,
  metalness: 0,
  side: THREE.DoubleSide
});

If the texture fails to load:
Use a procedural canvas texture with a simple sky/ground gradient:
- upper part light blue
- lower part pale green/gray
- optional simple cloud-like shapes if easy

4. Solid Tint mode:
The glass should be opaque or nearly opaque colored panel.

Suggested material:
new THREE.MeshStandardMaterial({
  color: tintColor or "#bcd7e8",
  transparent: windowGlass.opacity < 1,
  opacity: windowGlass.opacity ?? 1,
  roughness: 0.65,
  metalness: 0,
  side: THREE.DoubleSide,
  depthWrite: true
});

E. IMPORTANT COMPOSITING DETAIL

Because the final output is a 2D canvas composite over an uploaded photo, transparent glass naturally shows the uploaded photo behind the window. That is expected for Transparent mode.

For Frosted, Outdoor, and Solid modes, make the glass material sufficiently opaque so it blocks the uploaded room photo behind the window area.

The goal:
- Transparent mode = background can be visible through glass.
- Frosted mode = background is mostly hidden.
- Outdoor mode = background is replaced by outdoor scene.
- Solid mode = background is blocked by solid tint.

F. FALLBACK IF GLB HAS NO SEPARATE GLASS MESH

If no glass mesh is detected in glass_window.glb, implement a reliable fallback.

Fallback strategy:
1. Add a procedural rectangular glass fill plane inside the window model.
2. Position it approximately in the window opening.
3. Apply the selected glass material to that plane.
4. Make it slightly behind the frame or centered inside the frame.
5. Scale it relative to the model bounding box.

Suggested logic:
- Compute the model bounding box.
- Create a plane geometry sized around:
  width = modelWidth * 0.72
  height = modelHeight * 0.72
- Position it at the center of the model bounding box.
- Set it slightly forward/backward depending on the model orientation.
- Name it "Procedural_Window_Glass_Fill".
- Apply selected glass material.

This fallback does not need to be perfect, but it should visually fill the inner window area enough for MVP demonstration.

If the model already has a detected glass mesh, do not add the procedural plane.

G. PROCEDURAL WINDOW FALLBACK

The app may already have a procedural window fallback if window.glb is missing.

Update the procedural window fallback so it supports the same glass view modes:
- frame material stays solid/metallic
- glass plane uses selected window glass material

The procedural window should include:
- rectangular frame
- inner glass pane
- optional crossbars/dividers
- material settings based on GlassViewMode

H. MULTIPLE OVERLAY SUPPORT

The current MVP may support multiple overlays using placedOverlays and activeOverlay.

Make sure window glass settings are stored per overlay.

Requirements:
- Window 1 can be Outdoor View.
- Window 2 can be Frosted.
- Cabinet overlays ignore glass settings.
- Duplicating a window overlay should duplicate its glass mode and settings.
- Editing a placed window overlay should restore its glass settings.
- Applying a window overlay should flatten the rendered output with the selected glass view.
- Final export should preserve the selected glass view for every visible window overlay.

I. STATE MANAGEMENT REQUIREMENTS

When adding a new window overlay:
- initialize windowGlass settings with default mode "frosted".

When changing glass mode in the UI:
- update activeOverlay.windowGlass.mode.
- trigger canvas/model rerender.

When duplicating a window:
- copy windowGlass settings.
- offset duplicate position slightly.
- keep it independently configurable.

When applying a window:
- save windowGlass settings into PlacedOverlay.
- flatten visual output with selected glass view.

When editing a placed window:
- restore windowGlass settings into active overlay state.

J. TEXTURE ASSETS

Add or expect:

public/textures/outdoor-view.jpg

If the file is not available, the system should not crash.
Use a generated canvas texture fallback.

Optional:
Create a simple README in public/textures/README.md explaining:
- outdoor-view.jpg is an optional placeholder image for MVP outdoor window glass mode.

Do not include copyrighted images unless explicitly provided. If no image is provided, use procedural gradient fallback.

K. MODEL RENDERER API

Update the model renderer function signatures to accept windowGlass settings.

Example:

renderModelToCanvas({
  modelType,
  modelPath,
  transform,
  lighting,
  ambientEnabled,
  windowGlass
});

or update the existing renderer options interface:

interface ModelRenderOptions {
  modelType: ProductModelType;
  modelPath: string;
  yaw: number;
  pitch: number;
  opacity: number;
  lighting?: LightingAnalysis;
  ambientEnabled: boolean;
  windowGlass?: WindowGlassSettings;
}

Make sure cabinet rendering still works with no windowGlass.

L. SHADOWS AND AMBIENT MATCHING

The glass view should still work with existing:
- ambient matching
- Three.js lighting adjustment
- canvas color matching
- contact shadow
- directional cast shadow

Do not let the outdoor texture become overly dark or invisible due to ambient matching. If needed:
- apply less color mixing to outdoor texture materials
- keep outdoor glass mode reasonably visible
- but still match the overall scene slightly

M. OBJECT-AWARE OCCLUSION

Object-aware occlusion should still work:
- If a window is placed behind a sofa and sofa toggle is ON, sofa cutout appears above the window.
- The glass mode should not break occlusion.
- Per-overlay occlusion settings should continue working.

N. FINAL EXPORT

The final exported PNG should include:
- uploaded photo
- all visible overlays
- each window overlay with its selected glass view mode
- shadows
- ambient matching
- object cutouts

O. ERROR HANDLING

Handle:
- missing glass_window.glb
- missing outdoor-view.jpg
- GLB has no glass mesh
- texture load failure
- material replacement failure
- duplicate window overlay with glass settings
- editing placed overlay with missing old settings

If anything fails:
- do not crash
- fall back to procedural window
- fall back to frosted glass mode
- show a warning only if useful

P. UX SAFETY

Do not expose too many technical controls.

Keep the MVP UI simple:
Window Glass View
- Mode dropdown/radio
- Opacity slider
- Tint color
- Optional note

Suggested note:
“Outdoor and frosted modes block the uploaded photo behind the window glass. Transparent mode allows the photo to show through.”

Q. VALIDATION TESTS

After implementation, verify:

1. User can add a window overlay.
2. Window model loads from glass_window.glb.
3. If GLB is missing, procedural window fallback appears.
4. Window Glass View controls appear only for window overlays.
5. Cabinet overlay does not show Window Glass View controls.
6. Transparent mode allows uploaded photo/background to show through the glass.
7. Frosted mode mostly blocks the uploaded background.
8. Solid mode blocks the background with a colored tint.
9. Outdoor mode shows outdoor texture or procedural sky/ground fallback.
10. Changing glass mode updates the preview.
11. Changing opacity updates the preview.
12. Duplicating a window preserves its glass settings.
13. Editing a placed window restores its glass settings.
14. Multiple windows can have different glass modes.
15. Final PNG export includes the selected glass mode.
16. Object-aware occlusion still works with window overlays.
17. Shadows still render correctly for window overlays.
18. The app does not crash when outdoor texture is missing.
19. The app does not crash when no glass mesh is detected.
20. Existing cabinet behavior still works.

R. DOCUMENTATION

Update the implementation guide with a new section:

“Window Glass View Replacement”

Explain:
- Why transparent glass shows the uploaded photo behind it.
- How Frosted, Outdoor, and Solid modes block or replace the visible background.
- How the app detects glass meshes.
- How the fallback procedural glass pane works.
- How this feature applies per window overlay.
- Limitations: this is not true physical refraction, depth estimation, or real outdoor reconstruction.

S. IMPLEMENTATION ORDER

Build in this order:

1. Add GlassViewMode and WindowGlassSettings types.
2. Add windowGlass to ActiveOverlayState and PlacedOverlay.
3. Update default window overlay creation to include windowGlass settings.
4. Update duplicate/edit/apply logic to preserve windowGlass settings.
5. Add Window Glass View UI in OverlayControls.
6. Update modelRenderer.ts to accept windowGlass settings.
7. Implement isGlassMesh detection.
8. Implement material creation for transparent/frosted/outdoor/solid modes.
9. Add outdoor texture loading with procedural fallback.
10. Add procedural glass fill plane if no glass mesh is found.
11. Update procedural window fallback to use the selected glass material.
12. Test with glass_window.glb.
13. Test cabinet to ensure it is unaffected.
14. Update documentation.

DELIVERABLE:
Implement the window glass view replacement feature in the existing GlassFit MVP codebase. Provide the changed files and a short explanation of:
- how glass modes work,
- how glass mesh detection works,
- how the fallback glass plane works,
- how multiple window overlays preserve independent glass settings,
- and how final export handles the selected glass view.