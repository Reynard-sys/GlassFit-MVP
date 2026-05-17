You are a senior computer graphics engineer, Three.js specialist, and full-stack MVP engineer. You are working on the GlassFit MVP, a Next.js + FastAPI photo-based visualization prototype.

PROJECT CONTEXT:
The current GlassFit MVP allows users to upload a room photo, detect objects using the FastAPI image analysis service, place a 3D product model into the uploaded photo, adjust the 3D model using move/resize/rotate/yaw/pitch controls, toggle object-aware occlusion, apply ambience matching, and export the final PNG.

The current MVP already has a basic grounding shadow, but I want you to improve it into a more realistic shadow system for the 3D model. The goal is to make the 3D model look more naturally placed inside the uploaded photo instead of looking pasted on.

YOUR ROLE:
Act as a senior computer graphics engineer and technical architect. Think carefully about realistic but practical shadow generation for a browser-based MVP. Prioritize a solution that works reliably with a single uploaded photo, without requiring true depth estimation, real camera calibration, or full physically based rendering.

MAIN TASK:
Add a realistic shadow system for the 3D model overlay in the GlassFit MVP.

The shadow system should:
1. Create a believable contact shadow under the 3D model.
2. Create a soft directional cast shadow based on the estimated light direction from the uploaded image.
3. Use the existing backend lighting analysis data if available.
4. Allow the user to manually adjust shadow settings if the automatic estimate is not perfect.
5. Include the shadow in the final exported PNG.
6. Keep the implementation clean, reusable, and easy to tune.

CURRENT RELEVANT FILES:
Frontend:
- src/components/CanvasEditor.tsx
- src/components/OverlayControls.tsx
- src/lib/modelRenderer.ts
- src/lib/canvasUtils.ts
- src/lib/types.ts

Backend:
- fastapi-service/brightness.py
- fastapi-service/main.py

The current backend already returns lighting information such as:
- brightness category
- ambient RGB
- contrast
- saturation
- warmth
- tint
- sharpness
- noise
- light_direction
- suggested.shadow_opacity

Use these values if useful.

DESIRED SHADOW DESIGN:

Implement two shadow layers:

A. CONTACT SHADOW
This shadow should appear directly under the model to visually anchor it to the floor or surface.

Behavior:
- Soft elliptical shadow below the model.
- Positioned near the bottom center of the 3D model overlay.
- Width should scale with the overlay width.
- Height should be smaller than width.
- Opacity should depend on photo brightness and backend suggested shadow opacity.
- Blur should increase slightly for bright or low-contrast photos.
- Contact shadow should become stronger when the model is near the bottom/floor area.
- Contact shadow should be included before drawing the model layer.

Suggested logic:
- shadowWidth = overlayWidth * 0.65 to 0.85
- shadowHeight = overlayHeight * 0.08 to 0.16
- shadowX = overlayCenterX
- shadowY = overlayBottomY - smallOffset
- opacity = lighting.suggested.shadow_opacity or derived from brightness
- blur = clamp(overlayWidth * 0.03, 8, 32)

B. DIRECTIONAL CAST SHADOW
This shadow should simulate the model casting a soft shadow away from the light source.

Behavior:
- Direction should use backend `lighting.light_direction` when available.
- If light direction is unavailable, use a default direction such as down-right or down-left.
- Shadow should be an approximate transformed silhouette of the rendered model.
- Shadow should be soft, semi-transparent, and slightly blurred.
- Shadow should appear behind the model but above the background image.
- Shadow should respond to model scale, rotation, yaw/pitch if possible.
- Shadow should be included in final export.

Suggested practical approach:
1. Render the 3D model into a transparent offscreen canvas as already done.
2. Extract the alpha channel of the rendered model to create a silhouette mask.
3. Draw this silhouette onto the main canvas using:
   - black or dark neutral color
   - reduced opacity
   - blur filter
   - transform/skew/scale
   - offset based on estimated light direction
4. Draw the cast shadow before drawing the actual 3D model.

Layer order should become:
1. Full uploaded room photo
2. Directional cast shadow
3. Contact shadow
4. Rendered 3D model
5. Object cutouts for enabled occlusion toggles

IMPORTANT:
The selected object cutouts should still render above the model and above the shadows when toggled, so the object-aware occlusion behavior remains correct.

SHADOW CONTROLS:
Add shadow controls to the existing OverlayControls component.

Controls should include:
- Enable/disable shadow
- Shadow opacity slider
- Shadow blur slider
- Shadow direction X slider
- Shadow direction Y slider
- Shadow length slider
- Reset shadow settings button

Default behavior:
- Shadows should be enabled by default.
- Automatic lighting-based values should be used at first.
- Manual controls should override automatic values.

Suggested TypeScript interface:

interface ShadowSettings {
  enabled: boolean;
  contactEnabled: boolean;
  castEnabled: boolean;
  opacity: number;
  blur: number;
  directionX: number;
  directionY: number;
  length: number;
  contactOpacity: number;
  contactScale: number;
  autoFromLighting: boolean;
}

Add this to src/lib/types.ts if appropriate.

AUTOMATIC SHADOW ESTIMATION:
Create a utility function in src/lib/canvasUtils.ts:

function deriveShadowSettingsFromLighting(
  lighting?: LightingAnalysis,
  brightness?: BrightnessAnalysis
): ShadowSettings

Suggested logic:
- If image is dim:
  - lower cast shadow opacity because the scene is already dark
  - slightly larger blur
- If image is normal:
  - moderate opacity
  - moderate blur
- If image is bright:
  - stronger but softer shadow
  - higher blur
- If contrast is high:
  - slightly sharper shadow
- If contrast is low:
  - softer shadow
- Use lighting.light_direction to determine shadow direction.
  - If light comes from left, shadow should cast to the right.
  - If light comes from right, shadow should cast to the left.
  - If light comes from above, shadow should go downward.
- Use lighting.suggested.shadow_opacity if available.

Example:
const lightX = lighting.light_direction?.x ?? -0.25;
const lightY = lighting.light_direction?.y ?? -0.5;

Shadow direction should usually be opposite the light direction:
directionX = -lightX;
directionY = Math.abs(lightY) + 0.4;

Normalize direction values so the shadow does not become extreme.

CANVAS IMPLEMENTATION DETAILS:
In CanvasEditor.tsx, create helper functions such as:

drawContactShadow(ctx, overlayTransform, shadowSettings, lighting)
drawCastShadow(ctx, modelCanvas, overlayTransform, shadowSettings)

drawContactShadow:
- Use ctx.save()
- Use ctx.globalAlpha
- Use ctx.filter = `blur(${blur}px)`
- Draw radial gradient ellipse if possible.
- Use ctx.ellipse() with a gradient or semi-transparent fill.
- Restore context.

drawCastShadow:
- Use modelCanvas alpha as silhouette.
- Create an offscreen canvas.
- Draw the model silhouette as black/dark pixels.
- Apply blur.
- Draw it onto the main canvas with offset and transform.
- Use directionX, directionY, and length to compute offset.
- Suggested offset:
  shadowOffsetX = directionX * length * overlayWidth * 0.25
  shadowOffsetY = directionY * length * overlayHeight * 0.15
- Scale shadow vertically to make it look like it lies on a surface:
  ctx.scale(1.05, 0.55)
- Optional skew based on directionX:
  ctx.transform(1, 0, directionX * 0.15, 0.55, offsetX, offsetY)
- Keep it subtle.

Make sure canvas filters are reset after drawing:
ctx.filter = "none";
ctx.globalAlpha = 1;

THREE.JS OPTION:
Do not rely only on Three.js real-time shadows because the final composition happens in 2D canvas and the uploaded photo has no real 3D floor geometry. You may improve Three.js lighting, but the main final shadow should be generated in the 2D canvas composition pipeline so that it appears in the exported PNG.

QUALITY REQUIREMENTS:
- The shadow should not look like a hard black blob.
- The shadow should be soft, subtle, and adjustable.
- The contact shadow should anchor the model.
- The cast shadow should follow the estimated or manual light direction.
- The final exported image should include shadows.
- The app should still work if lighting analysis is missing.
- The app should still work if the model GLB is missing and procedural fallback is used.
- The app should still work if object detection fails.

ERROR HANDLING:
- If modelCanvas is unavailable, skip cast shadow but still draw contact shadow.
- If shadow settings are missing, use safe defaults.
- If canvas filter is unsupported, draw a simpler transparent ellipse and silhouette.
- Do not crash the app.

UI REQUIREMENTS:
In OverlayControls, add a collapsible or grouped section called:

"Shadow & Grounding"

It should include:
- Toggle: Enable shadow
- Toggle: Auto shadow from photo lighting
- Slider: Shadow opacity
- Slider: Shadow softness / blur
- Slider: Shadow length
- Slider: Direction X
- Slider: Direction Y
- Button: Reset shadow

Keep the UI clean and not too cluttered. Use Tailwind styling consistent with the existing app.

STATE MANAGEMENT:
Store shadow settings in the main GlassFitMvp component or wherever overlay transform state is currently stored.

When a new image analysis result is received:
- derive automatic shadow settings from the lighting data
- apply it only if autoFromLighting is true

When the user changes a shadow slider:
- set autoFromLighting to false
- update the canvas preview

When the user clicks Reset Shadow:
- regenerate shadow settings from the current lighting data
- set autoFromLighting to true

TESTING:
After implementation, verify the following:

1. Upload an image and load the 3D model.
2. The model has a visible but subtle contact shadow.
3. The model has a directional cast shadow.
4. Shadow opacity can be increased/decreased.
5. Shadow blur can be adjusted.
6. Shadow direction can be adjusted.
7. Shadow length can be adjusted.
8. Final exported PNG includes both shadows.
9. Object-aware occlusion still works.
10. If an object toggle is ON, the object cutout appears above the model and shadows.
11. If lighting data is missing, default shadows still work.
12. If segmentation fails, shadows still work.

DOCUMENTATION:
Update the implementation guide or add comments explaining:
- The difference between contact shadow and cast shadow.
- Why the shadow is generated in 2D canvas instead of relying on real Three.js shadows.
- How automatic shadow settings are derived from the uploaded photo lighting analysis.
- The limitations of the approach.

LIMITATION NOTE:
Add or keep a small MVP note in the UI:
"Shadow and lighting are estimated from a single photo and are intended for visual realism support only. They do not represent physically exact lighting or depth."

DELIVERABLE:
Implement the realistic shadow system in the current GlassFit MVP codebase. Provide the changed files and a short explanation of what changed.