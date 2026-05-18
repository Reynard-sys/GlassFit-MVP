You are a senior computer graphics engineer, image processing engineer, Three.js specialist, and UX-focused full-stack developer. You are working on the GlassFit web-based photo visualization system.

PROJECT CONTEXT:
GlassFit is a Next.js + FastAPI photo-based visualization system for customized glass and aluminum client-space fitting. The system allows users to upload a room/space image, analyze the image, place 3D product overlays, adjust the overlays, apply ambient light matching, use object-aware occlusion, add realistic shadows, manage multiple overlay layers, and export a final visualization image.

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
- object-aware occlusion
- realistic contact and cast shadows
- multiple overlays using one active editable overlay and placed flattened layers
- apply/place overlay workflow
- window glass view modes

The system currently performs ambient light matching based mostly on the uploaded image’s general/global lighting characteristics. This helps the overlay match the overall image, but it may be inaccurate when different parts of the room have different lighting. For example, the left side of a room may be dark while the area near a window may be bright.

NEW FEATURE GOAL:
Add Position-Based Ambient Light Matching.

When the user clicks “Apply Overlay” or “Place Overlay,” the system should run a second ambient matching pass based on the exact region where the overlay is positioned in the uploaded photo.

This means:
1. Initial/global ambient matching still happens after image upload.
2. User moves, resizes, rotates, and configures the overlay.
3. User clicks Apply Overlay.
4. The system samples the background image around the overlay’s current position.
5. The system computes local brightness, local ambient color, local contrast, local saturation, local warmth/tint, and optional local noise/sharpness.
6. The system adjusts the overlay render based on the local region.
7. The locally matched overlay is flattened and saved as a placed layer.
8. The final output uses the locally matched placed overlay.

FEATURE NAME:
Use the feature name:

Position-Based Ambient Matching

Alternative internal function names may use:

localAmbientMatching
deriveLocalLightingFromRegion
applyPositionBasedAmbientMatch

PRIMARY UX RULE:
This feature should happen automatically when the user clicks “Apply Overlay.”

Do not force the user to manually trigger it every time. However, add a small UI option if appropriate:

- Toggle: “Position-based ambient matching”
- Default: ON

Optional advanced button:
- “Re-match lighting at current position”

If this adds too much UI complexity, use only the toggle and keep it enabled by default.

IMPORTANT ARCHITECTURE DECISION:
Implement the first version on the frontend using Canvas image data.

Do not require another FastAPI call for this first implementation.

Reason:
- The uploaded image is already available in the browser.
- The overlay position and size are already known in the canvas.
- The sampled region is small.
- This avoids extra network latency.
- This supports the system’s goal of being more accessible and responsive.

The backend global lighting analysis should remain unchanged.

CURRENT RELEVANT FILES:
Frontend:
- src/components/GlassFitMvp.tsx
- src/components/CanvasEditor.tsx
- src/components/OverlayControls.tsx
- src/lib/types.ts
- src/lib/canvasUtils.ts
- src/lib/modelRenderer.ts

Potentially relevant existing types:
- LightingAnalysis
- BrightnessAnalysis
- OverlayTransform
- PlacedOverlay
- ActiveOverlayState
- ShadowSettings
- WindowGlassSettings

MAIN TASK:
Implement a frontend position-based ambient matching pass that runs when an overlay is applied/placed.

The local ambient matching should:
- Analyze the uploaded background image at the overlay’s placement region.
- Use that local analysis to adjust the rendered overlay.
- Apply the final adjusted overlay to the flattened placed layer.
- Preserve all existing overlay features, including shadows, object-aware occlusion, window glass view modes, and multiple overlay support.

LOCAL SAMPLING REQUIREMENTS:
When the user clicks Apply Overlay, compute the overlay’s bounding region on the canvas.

Use:
- overlay x
- overlay y
- overlay rendered width
- overlay rendered height
- overlay rotation if available

For MVP reliability, it is acceptable to use an axis-aligned bounding box around the overlay, even if the overlay is rotated.

Sample a padded region around the overlay:

Example:
- paddingX = overlayWidth * 0.15
- paddingY = overlayHeight * 0.15
- sampleX = overlayX - paddingX
- sampleY = overlayY - paddingY
- sampleWidth = overlayWidth + paddingX * 2
- sampleHeight = overlayHeight + paddingY * 2

Clamp the sample region so it stays inside the background image/canvas bounds.

Do not sample the full image. Only sample the local region around the overlay.

LOCAL ANALYSIS REQUIREMENTS:
Create a utility function in src/lib/canvasUtils.ts:

analyzeLocalImageRegion(imageData: ImageData): LocalLightingAnalysis

Suggested type:

interface LocalLightingAnalysis {
  meanRgb: [number, number, number];
  ambientRgb: [number, number, number];
  ambientHex: string;
  meanIntensity: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  noise?: number;
  sampleBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

Use a robust calculation:
- Compute luminance per pixel.
- Ignore fully transparent pixels if any.
- Use trimmed averages to avoid extreme outliers.
- Ignore extreme brightest and darkest values if possible.
- Example: discard bottom 5% and top 5% of luminance values before computing averages.
- If trimming is too complex, implement a simple clamp/outlier filter:
  - ignore pixels with luminance < 5
  - ignore pixels with luminance > 250
- Compute local mean RGB.
- Compute local mean pixel intensity.
- Compute local contrast using luminance standard deviation.
- Compute local saturation using RGB max/min difference.
- Compute warmth as red-blue difference.
- Compute tint as green-magenta tendency.

Suggested luminance:
luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

Suggested saturation approximation:
saturation = average((max(r,g,b) - min(r,g,b)) / max(max(r,g,b), 1))

Suggested warmth:
warmth = (meanR - meanB) / 255

Suggested tint:
tint = (meanG - ((meanR + meanB) / 2)) / 255

LOCAL MATCHING REQUIREMENTS:
Create a function in src/lib/canvasUtils.ts:

deriveLocalAmbientAdjustments(
  localLighting: LocalLightingAnalysis,
  globalLighting?: LightingAnalysis
): LocalAmbientAdjustments

Suggested type:

interface LocalAmbientAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  colorMix: number;
  color: [number, number, number];
  blurPx: number;
  grain: number;
  shadowOpacityMultiplier: number;
}

The adjustment should combine global and local lighting:
- Use global lighting as the base.
- Use local lighting as the refinement.
- Do not allow extreme changes.
- Clamp adjustment values to safe ranges.

Suggested behavior:
- If local region is darker than global image, reduce overlay brightness slightly.
- If local region is brighter than global image, increase overlay brightness slightly.
- If local contrast is low, soften overlay contrast slightly.
- If local contrast is high, increase overlay contrast slightly, but not too much.
- Mix local ambient color into the overlay subtly.
- Use local saturation to adjust overlay saturation.
- Use local brightness/contrast to slightly adjust shadow opacity.

Suggested clamps:
- brightness: 0.75 to 1.25
- contrast: 0.80 to 1.20
- saturation: 0.75 to 1.25
- colorMix: 0.05 to 0.30
- blurPx: 0 to 2
- grain: 0 to 0.25
- shadowOpacityMultiplier: 0.75 to 1.30

IMPORTANT:
The local matching should improve realism subtly. It should not make the model look heavily filtered or unnatural.

CANVAS IMPLEMENTATION:
In CanvasEditor.tsx, identify the function that handles applying/flattening an active overlay into a placed layer.

Before saving the flattened overlay:
1. Render the active 3D model normally using the existing Three.js renderer.
2. Determine the overlay’s current bounding box on the uploaded image/canvas.
3. Extract image data from the original uploaded photo/background canvas at that region.
4. Analyze the local image region.
5. Apply local ambient adjustments to the rendered model image.
6. Draw shadow layers using either:
   - existing shadow settings adjusted with local shadow opacity multiplier, or
   - existing shadow settings unchanged if this is safer.
7. Save the resulting locally matched flattened overlay image/data URL.
8. Store the localLighting result or localAmbientAdjustments in the placed overlay state if useful.

LOCAL MATCHING SHOULD NOT BREAK:
- global ambient matching
- manual ambient toggle
- shadow controls
- object-aware occlusion
- window glass view modes
- multiple overlay support
- duplicate overlay
- edit overlay
- final PNG export

TYPE UPDATES:
In src/lib/types.ts, add:

interface LocalLightingAnalysis {
  meanRgb: [number, number, number];
  ambientRgb: [number, number, number];
  ambientHex: string;
  meanIntensity: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  noise?: number;
  sampleBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface LocalAmbientAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  colorMix: number;
  color: [number, number, number];
  blurPx: number;
  grain: number;
  shadowOpacityMultiplier: number;
}

Add to ActiveOverlayState or overlay settings:
positionBasedAmbientEnabled?: boolean;

Add to PlacedOverlay:
positionBasedAmbientEnabled?: boolean;
localLighting?: LocalLightingAnalysis;
localAmbientAdjustments?: LocalAmbientAdjustments;

If adding these directly is too invasive, store them in a nested optional property:

localAmbient?: {
  enabled: boolean;
  lighting?: LocalLightingAnalysis;
  adjustments?: LocalAmbientAdjustments;
};

UI REQUIREMENTS:
In OverlayControls.tsx, add an option under the ambient/visual matching section:

Label:
Position-based ambient matching

Description:
“Refines the overlay’s lighting based on the exact area where it is placed when applying the overlay.”

Default:
Enabled

Behavior:
- If enabled, run local ambient matching when Apply Overlay is clicked.
- If disabled, use only existing global ambient matching.

Optional:
Show a small note when active overlay exists:
“Local matching is applied when the overlay is placed.”

Do not add too many controls. Keep the UI simple.

APPLY OVERLAY WORKFLOW:
Update the Apply Overlay behavior:

Current behavior:
- Active overlay is rendered and flattened into placed overlay.

New behavior:
- Active overlay is rendered.
- If positionBasedAmbientEnabled is true:
  - analyze local region
  - apply local ambient adjustments
  - save local analysis metadata
- Then flatten overlay into placed layer.
- Store the locally adjusted flattened image.
- Store original settings too, so editing still works.

EDITING A PLACED OVERLAY:
When editing a placed overlay:
- Restore its settings into activeOverlay.
- It is acceptable to recompute local ambient matching again when the user reapplies it.
- Do not permanently reuse stale localLighting if the overlay position changed.
- If the user edits and applies again, update localLighting and localAmbientAdjustments based on the new position.

DUPLICATING AN OVERLAY:
When duplicating:
- Copy positionBasedAmbientEnabled setting.
- Do not copy localLighting as final if the duplicate is offset to a new position.
- When the duplicate is applied, recompute local lighting for the duplicate’s new position.

Recommended:
- Duplicate opens as active overlay.
- When user applies it, local ambient matching runs for the new location.

SHADOW INTERACTION:
Use local lighting to refine shadows subtly.

Suggested:
- If local region is bright, shadow may be slightly stronger but softer.
- If local region is dark, shadow should be softer or lower contrast.
- Use shadowOpacityMultiplier but clamp it safely.

Do not override the user’s manual shadow settings too aggressively.

WINDOW GLASS INTERACTION:
For window overlays:
- Position-based matching should apply to the overall window model and frame.
- Be careful with Outdoor View glass mode.
- Outdoor texture should remain visible.
- Do not over-darken or over-color the outdoor view texture.
- If necessary, reduce local color mixing for window glass outdoor mode.

Suggested rule:
If modelType is "window" and windowGlass.mode is "outdoor":
- apply local matching to the frame and overall render subtly
- limit colorMix to max 0.12
- keep brightness between 0.85 and 1.15

ERROR HANDLING:
Handle:
- missing background image
- invalid sample bounds
- sample area too small
- getImageData failure
- canvas tainted error
- local analysis returns NaN
- overlay partly outside image bounds
- active overlay missing

Fallback:
If local analysis fails, continue applying overlay using global ambient matching only.
Do not block the user from placing the overlay.

PERFORMANCE REQUIREMENTS:
- Sample only the local region.
- If the sample region is very large, downscale or sample every nth pixel.
- Avoid processing millions of pixels unnecessarily.
- Use a max sample size strategy if needed.

Example:
If sampleWidth * sampleHeight > 250,000 pixels:
- sample every 2nd, 3rd, or 4th pixel
- or draw the region into a smaller offscreen canvas before analysis.

This must remain responsive on low- to mid-range devices.

OPTIONAL DEBUG FEATURE:
For development only, optionally add a debug overlay or console log showing:
- local mean intensity
- local ambient color
- local adjustment values
- sample bounds

Do not show debug details to normal users unless a debug flag is enabled.

DOCUMENTATION:
Update the implementation guide or project notes with a section:

Position-Based Ambient Matching

Explain:
- Global matching happens after image upload.
- Position-based matching happens when an overlay is applied.
- It samples the local image region around the overlay.
- It refines brightness, contrast, saturation, color mix, and shadow behavior.
- It improves realism when different parts of the uploaded image have different lighting.
- It remains an approximation and does not provide physically accurate relighting.

VALIDATION TESTS:
After implementation, verify:

1. Upload a room image.
2. Add a product overlay.
3. Move the overlay to a dark region.
4. Click Apply Overlay.
5. The placed overlay should become slightly darker/more locally matched.
6. Add another overlay or duplicate the overlay.
7. Move it to a bright region.
8. Click Apply Overlay.
9. The second overlay should use different local matching values.
10. Edit a placed overlay and move it to a new region.
11. Apply again and confirm local matching recomputes.
12. Disable position-based ambient matching and confirm only global matching is used.
13. Confirm shadows still render correctly.
14. Confirm object-aware occlusion still works.
15. Confirm window glass modes still work.
16. Confirm final PNG export includes the locally matched overlays.
17. Confirm app does not crash if local sampling fails.
18. Confirm performance remains acceptable with 3–5 overlays.

IMPLEMENTATION ORDER:
Build this feature in this order:

1. Add LocalLightingAnalysis and LocalAmbientAdjustments types.
2. Add positionBasedAmbientEnabled setting to active and placed overlays.
3. Add UI toggle in OverlayControls.
4. Add utility function to compute overlay sample bounds.
5. Add utility function to extract local image region from canvas.
6. Add analyzeLocalImageRegion function.
7. Add deriveLocalAmbientAdjustments function.
8. Add function to apply local adjustments to rendered overlay canvas.
9. Integrate local matching into Apply Overlay workflow.
10. Store local lighting metadata in PlacedOverlay.
11. Recompute local matching when editing/reapplying overlays.
12. Ensure duplication recomputes local matching after new placement.
13. Test with dark, bright, and mixed-light images.
14. Update documentation.

DELIVERABLE:
Implement Position-Based Ambient Matching in the existing GlassFit codebase. Provide the changed files and a short explanation of:
- how global matching and local matching differ,
- when local matching runs,
- how the local sample region is selected,
- how local adjustments are applied,
- how it behaves with duplicate/edit overlays,
- how it interacts with shadows, occlusion, and window glass modes,
- and how failures fall back to global ambient matching.