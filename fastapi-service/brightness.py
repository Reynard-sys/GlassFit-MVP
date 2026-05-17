from pathlib import Path
from typing import Literal, TypedDict

import cv2
import numpy as np

BrightnessCategory = Literal["dim", "normal", "bright"]
TemperatureCategory = Literal["cool", "neutral", "warm"]


class BrightnessAnalysis(TypedDict):
    mean_pixel_intensity: float
    category: BrightnessCategory


class LightDirection(TypedDict):
    x: float
    y: float


class SuggestedModelAdjustments(TypedDict):
    brightness: float
    contrast: float
    saturation: float
    color_mix: float
    blur_px: float
    grain: float
    shadow_opacity: float


class LightingAnalysis(TypedDict):
    mean_rgb: list[int]
    ambient_rgb: list[int]
    ambient_hex: str
    contrast: float
    saturation: float
    warmth: float
    tint: float
    temperature: TemperatureCategory
    sharpness: float
    noise: float
    light_direction: LightDirection
    suggested: SuggestedModelAdjustments


def analyze_brightness(image_path: Path) -> BrightnessAnalysis:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError("Unable to read image for brightness analysis.")

    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mean_intensity = float(grayscale.mean())

    return {
        "mean_pixel_intensity": round(mean_intensity, 2),
        "category": classify_brightness(mean_intensity),
    }


def analyze_lighting(image_path: Path) -> LightingAnalysis:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError("Unable to read image for lighting analysis.")

    image = _downscale_for_analysis(image)
    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    mean_intensity = float(grayscale.mean())
    contrast = float(np.std(grayscale) / 64)
    saturation = float(np.mean(hsv[:, :, 1]) / 255)
    mean_rgb_array = np.mean(rgb.reshape(-1, 3), axis=0)
    mean_rgb = [int(round(value)) for value in mean_rgb_array]
    ambient_rgb = _compute_ambient_rgb(rgb, grayscale)

    red, green, blue = mean_rgb_array
    warmth = float(np.clip((red - blue) / 90, -1, 1))
    tint = float(np.clip((green - ((red + blue) / 2)) / 90, -1, 1))
    sharpness = float(np.clip(cv2.Laplacian(grayscale, cv2.CV_64F).var() / 850, 0, 1.5))
    noise = _estimate_noise(grayscale)
    light_direction = _estimate_light_direction(grayscale)

    return {
        "mean_rgb": mean_rgb,
        "ambient_rgb": ambient_rgb,
        "ambient_hex": _rgb_to_hex(ambient_rgb),
        "contrast": round(float(np.clip(contrast, 0, 2)), 3),
        "saturation": round(float(np.clip(saturation, 0, 1)), 3),
        "warmth": round(warmth, 3),
        "tint": round(tint, 3),
        "temperature": _classify_temperature(warmth),
        "sharpness": round(sharpness, 3),
        "noise": round(noise, 3),
        "light_direction": light_direction,
        "suggested": _suggest_model_adjustments(
            mean_intensity=mean_intensity,
            contrast=contrast,
            saturation=saturation,
            sharpness=sharpness,
            noise=noise,
        ),
    }


def classify_brightness(mean_intensity: float) -> BrightnessCategory:
    if mean_intensity <= 85:
        return "dim"
    if mean_intensity <= 170:
        return "normal"
    return "bright"


def _downscale_for_analysis(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= 900:
        return image

    scale = 900 / longest
    return cv2.resize(
        image,
        (int(width * scale), int(height * scale)),
        interpolation=cv2.INTER_AREA,
    )


def _compute_ambient_rgb(rgb: np.ndarray, grayscale: np.ndarray) -> list[int]:
    lower = np.percentile(grayscale, 25)
    upper = np.percentile(grayscale, 92)
    mask = (grayscale >= lower) & (grayscale <= upper)
    sampled = rgb[mask] if np.any(mask) else rgb.reshape(-1, 3)
    ambient = np.mean(sampled, axis=0)
    neutralized = ambient * 0.72 + np.array([128, 128, 128]) * 0.28
    return [int(round(value)) for value in np.clip(neutralized, 0, 255)]


def _estimate_noise(grayscale: np.ndarray) -> float:
    blurred = cv2.GaussianBlur(grayscale, (3, 3), 0)
    residual = grayscale.astype(np.float32) - blurred.astype(np.float32)
    return float(np.clip(np.std(residual) / 18, 0, 1))


def _estimate_light_direction(grayscale: np.ndarray) -> LightDirection:
    height, width = grayscale.shape[:2]
    left = float(grayscale[:, : max(1, width // 3)].mean())
    right = float(grayscale[:, max(0, width - width // 3) :].mean())
    top = float(grayscale[: max(1, height // 3), :].mean())
    bottom = float(grayscale[max(0, height - height // 3) :, :].mean())

    return {
        "x": round(float(np.clip((right - left) / 70, -1, 1)), 3),
        "y": round(float(np.clip((top - bottom) / 70, -1, 1)), 3),
    }


def _suggest_model_adjustments(
    mean_intensity: float,
    contrast: float,
    saturation: float,
    sharpness: float,
    noise: float,
) -> SuggestedModelAdjustments:
    brightness = float(np.clip(mean_intensity / 132, 0.68, 1.22))
    contrast_adjustment = float(np.clip(0.78 + contrast * 0.2, 0.72, 1.18))
    saturation_adjustment = float(np.clip(0.82 + saturation * 0.55, 0.72, 1.16))
    blur_px = float(np.clip((0.85 - sharpness) * 1.1, 0, 1.15))

    return {
        "brightness": round(brightness, 3),
        "contrast": round(contrast_adjustment, 3),
        "saturation": round(saturation_adjustment, 3),
        "color_mix": round(float(np.clip(0.12 + saturation * 0.18, 0.1, 0.28)), 3),
        "blur_px": round(blur_px, 3),
        "grain": round(float(np.clip(noise * 0.55, 0.015, 0.18)), 3),
        "shadow_opacity": round(float(np.clip(0.26 - (mean_intensity - 128) / 600, 0.12, 0.36)), 3),
    }


def _classify_temperature(warmth: float) -> TemperatureCategory:
    if warmth <= -0.18:
        return "cool"
    if warmth >= 0.18:
        return "warm"
    return "neutral"


def _rgb_to_hex(rgb: list[int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)
