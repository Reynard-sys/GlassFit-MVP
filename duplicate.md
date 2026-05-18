You are a senior full-stack engineer, Three.js specialist, canvas rendering engineer, and UX-focused technical architect. You are working on the GlassFit MVP, a Next.js + FastAPI photo-based visualization prototype.

PROJECT CONTEXT:
The current GlassFit MVP allows users to upload a room photo, analyze brightness and lighting through FastAPI, detect objects using YOLOv8 segmentation, place a 3D model into the uploaded photo, adjust the model using move/resize/rotate/yaw/pitch controls, toggle object-aware occlusion, apply ambient light matching, add realistic shadows, and export a final PNG.

The current rendering pipeline uses:
- Next.js frontend
- TypeScript
- Three.js for 3D model rendering
- HTML Canvas for final composition
- FastAPI for image analysis
- YOLOv8 segmentation for object masks

The current canvas layer order is approximately:
1. Uploaded original photo
2. Directional cast shadow
3. Contact shadow
4. Rendered 3D product model
5. Original-image object cutouts for enabled occlusion toggles

The current MVP has one active 3D overlay. I now want to extend it to support multiple overlays in one session.

NEW FEATURE GOAL:
Add support for multiple product overlays in a single uploaded photo session.

I will add another mock 3D model asset, this time a window. The user should be able to add multiple 3D overlays, such as:
- one cabinet
- one window
- duplicated cabinet
- duplicated window
- multiple individually configured copies of the same model

Example:
The user adds a cabinet, adjusts it, duplicates it, then configures the second cabinet independently in the same picture.

IMPORTANT UX AND TECHNICAL DECISION:
For reliability and performance, do NOT keep many live Three.js model instances rendering simultaneously.

Use a hybrid approach:
- Only one overlay should be actively editable with live Three.js controls at a time.
- When the user clicks “Apply Overlay” or “Place Overlay,” render that active 3D model into a flattened canvas/image layer with its current:
  - model type
  - position
  - size
  - rotation
  - yaw
  - pitch
  - opacity
  - ambient matching
  - shadow settings
  - occlusion settings
- Store the placed overlay as a session layer.
- The user can then add another model without stacking many live Three.js renderers.
- The user can select a placed overlay later and re-edit it by restoring its saved transform/settings into the active editor.
- The final export should composite all placed overlay layers plus the active overlay if present.

This approach is preferred because:
1. It reduces GPU/WebGL load.
2. It avoids many simultaneous Three.js canvases.
3. It improves performance on mid-range devices.
4. It makes final PNG export more reliable.
5. It keeps the UX manageable.
6. It still allows multiple overlays in one final image.

YOUR ROLE:
Act as a senior engineer. Prioritize reliability, clean state management, understandable UX, and maintainable code. Think carefully before changing the architecture. Keep the MVP practical and avoid over-engineering.

MAIN TASK:
Implement multiple overlay support with:
1. Add Model button.
2. Model selection between cabinet and window.
3. Active editable overlay.
4. Apply/Place Overlay action.
5. Placed overlay layer list.
6. Select/edit placed overlay.
7. Duplicate overlay.
8. Delete overlay.
9. Hide/show overlay.
10. Reorder overlays if reasonable.
11. Final export with all overlays included.

NEW 3D MODEL:
Add support for a second mock 3D model asset:
- Window model

Expected model paths:
- public/models/ikea-3-drawer.glb
- public/models/window.glb

If window.glb is missing, create a procedural Three.js fallback window model.

The procedural window fallback should look like:
- rectangular aluminum frame
- inner glass pane
- optional divider lines
- slightly transparent glass material
- metallic/dark frame material

Update modelRenderer.ts so it can render different model types:
- cabinet
- window

Suggested model type:
type ProductModelType = "cabinet" | "window";

UPDATE TYPES:
In src/lib/types.ts, add or update interfaces.

Suggested interfaces:

type ProductModelType = "cabinet" | "window";

interface ProductModelOption {
  id: ProductModelType;
  name: string;
  modelPath: string;
  fallback: "drawer" | "window";
}

interface OverlayTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  yaw: number;
  pitch: number;
  opacity: number;
}

interface PlacedOverlay {
  id: string;
  name: string;
  modelType: ProductModelType;
  modelPath: string;
  transform: OverlayTransform;
  shadowSettings: ShadowSettings;
  occlusionObjectIds: string[];
  ambientEnabled: boolean;
  visible: boolean;
  locked?: boolean;
  flattenedImageDataUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface ActiveOverlayState {
  mode: "none" | "adding" | "editing";
  overlayId?: string;
  modelType: ProductModelType;
  transform: OverlayTransform;
  shadowSettings: ShadowSettings;
  ambientEnabled: boolean;
  occlusionObjectIds: string[];
}

STATE MANAGEMENT:
Update GlassFitMvp.tsx or the main coordinator component to manage:

- placedOverlays: PlacedOverlay[]
- activeOverlay: ActiveOverlayState | null
- selectedOverlayId: string | null
- productModelOptions: ProductModelOption[]

Important:
Do not lose the existing uploaded image, analysis response, detected object toggles, lighting data, or final output behavior.

USER EXPERIENCE REQUIREMENTS:

A. Model Selection
Add a panel section called “Product Models.”

It should show:
- Cabinet
- Window

The user can click:
- Add Cabinet
- Add Window

When user adds a model:
- Create activeOverlay with the selected model type.
- Load that model in the canvas editor.
- Use default transform centered in the photo.
- Use automatic shadow settings from current lighting.
- Use ambient matching enabled by default.
- Use no occlusion toggles enabled by default unless current global toggles are intentionally reused.

B. Active Overlay Editing
Only the active overlay should show live manipulation controls.

Controls should include existing:
- move/drag
- resize
- rotate on photo
- yaw
- pitch
- opacity
- ambient match toggle
- shadow controls
- object-aware occlusion toggles
- reset

Add buttons:
- Apply Overlay
- Cancel
- Duplicate Active Overlay

Apply Overlay behavior:
- Render the active 3D overlay into a flattened image layer.
- Store it in placedOverlays.
- Clear activeOverlay.
- Keep the placed layer visible on the canvas.
- Show it in the overlay list.

Cancel behavior:
- If adding a new overlay, discard it.
- If editing an existing overlay, discard unsaved changes and return to previously placed version.

C. Overlay Layer List
Add a panel section called “Placed Overlays.”

Each placed overlay should show:
- overlay name, such as “Cabinet 1” or “Window 1”
- model type
- visible toggle
- edit button
- duplicate button
- delete button

Optional:
- move layer up/down
- lock/unlock

Example UI:
Placed Overlays
- Cabinet 1
  [Visible] [Edit] [Duplicate] [Delete]
- Window 1
  [Visible] [Edit] [Duplicate] [Delete]
- Cabinet 2
  [Visible] [Edit] [Duplicate] [Delete]

D. Editing a Placed Overlay
When user clicks Edit:
- If there is already an active overlay with unsaved changes, ask for confirmation or show a simple warning.
- Restore the selected placed overlay into activeOverlay mode.
- Hide or temporarily remove the flattened placed version from the layer list while editing, to avoid seeing duplicate versions.
- User can adjust transform, model orientation, shadow, ambient, and occlusion settings.
- When user clicks Apply Overlay, update that placed overlay’s flattened image and settings.
- If user clicks Cancel, restore original placed overlay unchanged.

E. Duplicate Feature
Duplicate behavior should work for both active and placed overlays.

When duplicating:
- Create a new overlay with the same:
  - model type
  - transform
  - shadow settings
  - ambient setting
  - occlusion object IDs
  - opacity
- Offset the duplicate slightly, for example:
  - x + 40
  - y + 40
- Give it a new ID and name:
  - Cabinet 2
  - Window 2
- The duplicate should be independently configurable.
- After duplication, either:
  Option 1: add it as a placed overlay immediately, or
  Option 2: open it as the active overlay for editing.

Preferred UX:
- If duplicating a placed overlay, create the duplicate and immediately open it as active editing mode so the user can move/configure it.
- If duplicating the active overlay, create a second active copy is not allowed. Instead, apply or clone into placedOverlays, then open the duplicate as active.

F. Hide / Show
Each placed overlay should have a visible toggle.
If visible is false:
- Do not render it on the canvas.
- Do not include it in final export.

G. Delete
Delete should remove the placed overlay.
If deleting the active overlay:
- Clear activeOverlay.

H. Reorder
If simple to implement, add move up/down buttons.
Layer order should matter:
- Later/higher overlays should render above earlier/lower overlays, except object cutouts should still appear above all overlays when occlusion is enabled for each overlay.

If reordering is too complex, implement basic list order rendering and add reordering later.

RENDERING ARCHITECTURE:

Recommended pipeline for canvas preview and export:

1. Draw uploaded background image.
2. For each visible placed overlay in order:
   a. Draw its directional cast shadow.
   b. Draw its contact shadow.
   c. Draw its flattened rendered model image.
   d. Draw object cutouts for that overlay’s enabled occlusion objects.
3. If activeOverlay exists:
   a. Render active 3D model using Three.js into transparent canvas.
   b. Draw active cast shadow.
   c. Draw active contact shadow.
   d. Draw active rendered model.
   e. Draw object cutouts for active overlay’s enabled occlusion objects.
4. Export final PNG.

Important:
Each overlay should have its own occlusion settings. Example:
- Cabinet 1 can be behind sofa.
- Window 1 can be behind curtain.
- Cabinet 2 can be in front of everything.

Do not use one global object toggle state for all overlays unless it is only used as a temporary active overlay control.

OBJECT-AWARE OCCLUSION WITH MULTIPLE OVERLAYS:
The existing object-aware occlusion restores original-image cutouts above the model.

Extend this so each overlay has its own occlusionObjectIds array.

For each overlay:
- Only draw cutouts for objects enabled for that specific overlay.
- Draw those cutouts after drawing that overlay’s model.
- This allows different overlays to be hidden behind different objects.

Possible issue:
If multiple overlays overlap, drawing cutouts after each overlay may repeat the same object cutout several times. That is acceptable for MVP if visually correct. If needed, optimize later.

FLATTENED OVERLAY STRATEGY:
When the user clicks Apply Overlay:
- Render the model and its visual adjustments into an offscreen canvas or data URL.
- Save that rendered result to placedOverlay.flattenedImageDataUrl.
- Store transform/shadow/occlusion settings separately too, so it can be edited later.
- During preview, draw the flattened image instead of live-rendering all 3D models.

Important:
Store enough data to re-render the model later:
- modelType
- modelPath
- transform
- shadowSettings
- ambientEnabled
- occlusionObjectIds

The flattened image is for fast preview, not the only source of truth.

PERFORMANCE REQUIREMENTS:
- Only one live Three.js renderer should be active for the active overlay.
- Placed overlays should use flattened image layers.
- Avoid keeping many WebGL renderers alive.
- Clean up Three.js resources when switching active models.
- Avoid memory leaks when duplicating/deleting overlays.
- Revoke object URLs when no longer needed if applicable.

MODEL RENDERER CHANGES:
Update modelRenderer.ts:
- Accept modelType and modelPath.
- Load cabinet GLB for cabinet.
- Load window GLB for window.
- If cabinet GLB missing, use existing procedural drawer fallback.
- If window GLB missing, create procedural window fallback.
- Make sure renderer can re-render when modelType changes.
- Dispose old model resources when switching model type.

CANVAS EDITOR CHANGES:
Update CanvasEditor.tsx to:
- Accept placedOverlays array.
- Accept activeOverlay.
- Render multiple placed overlays.
- Render active overlay on top.
- Support dragging only the active overlay.
- Support selection/click if possible:
  - clicking a placed overlay can select it in the overlay list
  - editing still happens through the Edit button for reliability
- Export all visible overlays.

OVERLAY CONTROLS CHANGES:
Update OverlayControls.tsx:
- Show controls only when activeOverlay exists.
- Add Apply Overlay button.
- Add Cancel button.
- Add Duplicate Active Overlay button.
- Existing transform controls should update activeOverlay.transform.
- Existing shadow controls should update activeOverlay.shadowSettings.
- Existing ambient toggle should update activeOverlay.ambientEnabled.

OBJECT TOGGLE PANEL CHANGES:
Update ObjectTogglePanel.tsx:
- It should control the active overlay’s occlusionObjectIds.
- Disable toggles or show message if no active overlay exists:
  “Add or edit an overlay to configure object-aware occlusion.”
- Each detected object still has an individual toggle.
- Toggle state must be per active overlay, not global.

NEW COMPONENT:
Create ProductModelPanel.tsx:
- Lists available model types.
- Buttons:
  - Add Cabinet
  - Add Window
- Maybe show small description.

Create PlacedOverlayPanel.tsx:
- Lists placed overlays.
- Controls:
  - visible toggle
  - edit
  - duplicate
  - delete
  - move up/down if implemented

NAMING:
Automatically name overlays:
- Cabinet 1
- Cabinet 2
- Window 1
- Window 2

Use helper:
getNextOverlayName(modelType, placedOverlays)

EXPORT REQUIREMENTS:
The final PNG should include:
- uploaded background photo
- all visible placed overlays
- active overlay if present
- each overlay’s shadows
- each overlay’s ambient matching
- each overlay’s object-aware cutouts

If active overlay has unsaved changes and user clicks Generate Output:
- Either include the active overlay in the export,
- or prompt the user to apply it first.

Preferred MVP behavior:
- Include active overlay in export and show a small note:
  “The active overlay is included in the generated output.”

ERROR HANDLING:
Handle:
- missing window.glb
- failed model load
- failed duplicate
- failed apply overlay
- no active overlay
- editing one overlay while another has unsaved changes
- deleting selected overlay
- exporting with no overlays
- mask loading failure

UX SAFETY:
Avoid confusing simultaneous editing.

Rules:
- Only one active overlay can be edited at a time.
- If user tries to add/edit another overlay while one is active, show a confirmation:
  “You have an active overlay. Apply or cancel it before adding another.”
- Keep this simple for MVP.

IMPORTANT LIMITATION NOTE:
Add or update the MVP note:
“This MVP supports multiple placed overlays using flattened canvas layers for reliability. Only one overlay is actively editable at a time. Lighting, shadow, scale, and occlusion are visual approximations based on a single uploaded photo.”

VALIDATION TESTS:
After implementation, verify:

1. User can upload a room photo.
2. User can add a cabinet model.
3. User can apply/place the cabinet.
4. User can add a window model.
5. Both cabinet and window appear in the same photo.
6. User can duplicate the cabinet.
7. Cabinet duplicate appears independently.
8. User can edit the duplicated cabinet without changing the original.
9. User can toggle occlusion for Cabinet 1 behind sofa.
10. User can toggle different occlusion for Window 1 behind another object.
11. User can hide/show overlays.
12. User can delete overlays.
13. Final PNG includes all visible overlays.
14. Final PNG excludes hidden overlays.
15. Shadows still render for each overlay.
16. Ambient matching still applies for each overlay.
17. The app does not lag heavily with 3–5 overlays.
18. Only one live 3D overlay is editable at a time.
19. Missing window GLB falls back to procedural window model.
20. Existing single-overlay behavior still works.

DOCUMENTATION:
Update the implementation guide with:
- Multiple overlay support
- Hybrid active-overlay plus flattened-layer approach
- Duplicate overlay behavior
- Per-overlay occlusion settings
- Window model support
- Why only one overlay is actively edited at a time
- Limitations

IMPLEMENTATION ORDER:
Build this feature in the following order:

1. Add ProductModelType and PlacedOverlay types.
2. Add cabinet/window model options.
3. Update modelRenderer.ts to support modelType and procedural window fallback.
4. Add activeOverlay and placedOverlays state to GlassFitMvp.tsx.
5. Add ProductModelPanel.
6. Add PlacedOverlayPanel.
7. Update OverlayControls to work with activeOverlay.
8. Update ObjectTogglePanel to use activeOverlay occlusion settings.
9. Update CanvasEditor to render placed overlays plus active overlay.
10. Implement Apply Overlay.
11. Implement Duplicate Overlay.
12. Implement Edit Overlay.
13. Implement Delete and Hide/Show.
14. Update final export to include all visible overlays.
15. Add validation and documentation.

DELIVERABLE:
Implement multiple overlay support in the current GlassFit MVP codebase. Provide changed files and a short explanation of:
- How multiple overlays work
- Why the hybrid flattening approach was used
- How duplicate/edit/delete/hide works
- How per-overlay occlusion works
- How the final export handles multiple overlays