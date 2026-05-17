import type { ImageAnalysisResponse } from "./types";

const FALLBACK_API_URL = "http://localhost:8000";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function getImageApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_IMAGE_API_URL || FALLBACK_API_URL).replace(
    /\/$/,
    "",
  );
}

export function validateImageFile(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Upload a JPG, JPEG, or PNG image.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "Upload an image smaller than 12 MB.";
  }

  return null;
}

export async function analyzeImage(file: File): Promise<ImageAnalysisResponse> {
  const formData = new FormData();
  formData.append("image", file);

  const apiBaseUrl = getImageApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/analyze-image`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "Image analysis failed.";

    try {
      const errorBody = (await response.json()) as { detail?: string };
      if (errorBody.detail) {
        message = errorBody.detail;
      }
    } catch {
      // Keep the generic message when the service returns non-JSON errors.
    }

    throw new Error(message);
  }

  const payload = (await response.json()) as ImageAnalysisResponse;

  return {
    ...payload,
    objects: (payload.objects || []).map((object) => ({
      ...object,
      mask_url: toAbsoluteMaskUrl(object.mask_url, apiBaseUrl),
    })),
  };
}

function toAbsoluteMaskUrl(maskUrl: string, apiBaseUrl: string) {
  if (/^https?:\/\//i.test(maskUrl)) {
    return maskUrl;
  }

  return `${apiBaseUrl}${maskUrl.startsWith("/") ? "" : "/"}${maskUrl}`;
}

