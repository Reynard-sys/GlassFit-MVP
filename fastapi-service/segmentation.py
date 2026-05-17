import os
from pathlib import Path
from typing import Any, Literal, TypedDict
from uuid import uuid4

import cv2
import numpy as np

DetectorMode = Literal["auto", "yolo", "mock"]

DEFAULT_CONFIDENCE = 0.35
DEFAULT_IOU = 0.5
DEFAULT_MAX_OBJECTS = 5
DEFAULT_MIN_AREA_RATIO = 0.018
DEFAULT_MODEL = "yolov8s-seg.pt"

RELEVANT_COCO_LABELS = {
    "person",
    "chair",
    "couch",
    "sofa",
    "potted plant",
    "bed",
    "dining table",
    "table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
}

LABEL_ALIASES = {
    "couch": "sofa",
    "dining table": "table",
    "tv": "television",
}

_YOLO_MODEL_CACHE: dict[str, Any] = {}


class SegmentationError(RuntimeError):
    pass


class SegmentationResult(TypedDict):
    objects: list[dict[str, Any]]
    mode: str
    model: str | None
    warning: str | None


def analyze_objects(image_path: Path, mask_dir: Path) -> SegmentationResult:
    mode = _get_mode()

    if mode in {"auto", "yolo"}:
        try:
            return _analyze_objects_with_yolo(image_path, mask_dir)
        except SegmentationError:
            if mode == "yolo":
                raise
            objects = _analyze_objects_with_mock_masks(image_path, mask_dir)
            return {
                "objects": objects,
                "mode": "mock",
                "model": None,
                "warning": (
                    "Real segmentation is unavailable, so mock masks were used. "
                    "Install the YOLO requirements for accurate real-world detection."
                ),
            }

    return {
        "objects": _analyze_objects_with_mock_masks(image_path, mask_dir),
        "mode": "mock",
        "model": None,
        "warning": "Mock segmentation mode is active.",
    }


def _analyze_objects_with_yolo(
    image_path: Path,
    mask_dir: Path,
) -> SegmentationResult:
    try:
        model = _get_yolo_model()
    except ImportError as exc:
        raise SegmentationError(
            "YOLO segmentation requires ultralytics and torch. "
            "Install fastapi-service/requirements-yolo.txt."
        ) from exc

    image = cv2.imread(str(image_path))
    if image is None:
        raise SegmentationError("Unable to read image for YOLO segmentation.")

    height, width = image.shape[:2]
    result = model(
        str(image_path),
        conf=_get_float_env("YOLO_CONFIDENCE", DEFAULT_CONFIDENCE),
        iou=_get_float_env("YOLO_IOU", DEFAULT_IOU),
        imgsz=_get_int_env("YOLO_IMAGE_SIZE", 1024),
        retina_masks=True,
        verbose=False,
    )[0]

    if result.boxes is None or result.masks is None:
        return {
            "objects": [],
            "mode": "yolo",
            "model": _get_model_name(),
            "warning": "YOLO did not find maskable objects in this image.",
        }

    request_prefix = uuid4().hex
    candidates: list[dict[str, Any]] = []
    min_area_ratio = _get_float_env("MIN_OBJECT_AREA_RATIO", DEFAULT_MIN_AREA_RATIO)
    min_mask_area = width * height * min_area_ratio

    for index, box in enumerate(result.boxes):
        confidence = float(box.conf.item())
        x1, y1, x2, y2 = _clamp_bbox(box.xyxy[0].tolist(), width, height)
        bbox_area = max(0, x2 - x1) * max(0, y2 - y1)

        if bbox_area < min_mask_area:
            continue

        class_id = int(box.cls.item())
        raw_label = str(result.names.get(class_id, "object"))
        if not _is_relevant_label(raw_label):
            continue

        mask_alpha = _resize_mask(result.masks.data[index].cpu().numpy(), width, height)
        mask_area = int(np.count_nonzero(mask_alpha > 0.5))
        if mask_area < min_mask_area:
            continue

        score = _rank_score(confidence, mask_area / (width * height), raw_label)
        candidates.append(
            {
                "confidence": round(confidence, 3),
                "label": _normalize_label(raw_label),
                "bbox": [x1, y1, x2, y2],
                "mask_alpha": mask_alpha,
                "score": score,
            }
        )

    candidates = _remove_duplicate_overlaps(candidates)
    candidates.sort(key=lambda item: item["score"], reverse=True)

    objects: list[dict[str, Any]] = []
    for candidate in candidates[: _get_int_env("MAX_DETECTED_OBJECTS", DEFAULT_MAX_OBJECTS)]:
        object_id = f"obj_{len(objects) + 1}"
        filename = f"{request_prefix}_{object_id}.png"
        mask_rgba = np.zeros((height, width, 4), dtype=np.uint8)
        mask_rgba[candidate["mask_alpha"] > 0.5] = (255, 255, 255, 255)
        cv2.imwrite(str(mask_dir / filename), mask_rgba)

        objects.append(
            {
                "id": object_id,
                "label": candidate["label"],
                "confidence": candidate["confidence"],
                "bbox": candidate["bbox"],
                "mask_url": f"/masks/{filename}",
            }
        )

    return {
        "objects": objects,
        "mode": "yolo",
        "model": _get_model_name(),
        "warning": None if objects else "YOLO found objects, but none passed the relevance and size filters.",
    }


def _analyze_objects_with_mock_masks(
    image_path: Path,
    mask_dir: Path,
) -> list[dict[str, Any]]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise SegmentationError("Unable to read image for mock segmentation.")

    height, width = image.shape[:2]
    request_prefix = uuid4().hex
    specs = [
        {
            "id": "obj_1",
            "label": "mock sofa",
            "confidence": 0.91,
            "shape": "rounded_rect",
            "bbox": _bbox(width, height, 0.08, 0.54, 0.52, 0.9),
        },
        {
            "id": "obj_2",
            "label": "mock table",
            "confidence": 0.84,
            "shape": "ellipse",
            "bbox": _bbox(width, height, 0.32, 0.6, 0.72, 0.86),
        },
        {
            "id": "obj_3",
            "label": "mock chair",
            "confidence": 0.79,
            "shape": "rounded_rect",
            "bbox": _bbox(width, height, 0.62, 0.42, 0.88, 0.86),
        },
    ]

    objects: list[dict[str, Any]] = []
    for spec in specs:
        filename = f"{request_prefix}_{spec['id']}.png"
        mask_path = mask_dir / filename
        _write_mock_mask(mask_path, width, height, spec["bbox"], spec["shape"])

        objects.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "confidence": spec["confidence"],
                "bbox": spec["bbox"],
                "mask_url": f"/masks/{filename}",
            }
        )

    return objects


def _get_yolo_model() -> Any:
    from ultralytics import YOLO

    model_name = _get_model_name()
    if model_name not in _YOLO_MODEL_CACHE:
        _YOLO_MODEL_CACHE[model_name] = YOLO(model_name)

    return _YOLO_MODEL_CACHE[model_name]


def _get_model_name() -> str:
    return os.getenv("YOLO_MODEL", DEFAULT_MODEL)


def _get_mode() -> DetectorMode:
    mode = os.getenv("SEGMENTATION_MODE", "auto").lower()
    if mode in {"auto", "yolo", "mock"}:
        return mode
    return "auto"


def _is_relevant_label(label: str) -> bool:
    allow_all = os.getenv("YOLO_ALLOW_ALL_CLASSES", "false").lower() == "true"
    return allow_all or label in RELEVANT_COCO_LABELS


def _normalize_label(label: str) -> str:
    return LABEL_ALIASES.get(label, label)


def _resize_mask(mask: np.ndarray, width: int, height: int) -> np.ndarray:
    resized = cv2.resize(mask.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(resized, (3, 3), 0)


def _rank_score(confidence: float, area_ratio: float, label: str) -> float:
    label_bonus = 0.15 if label in {"chair", "couch", "sofa", "dining table", "bed"} else 0
    return confidence + min(area_ratio * 2.5, 0.35) + label_bonus


def _remove_duplicate_overlaps(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []

    for candidate in sorted(candidates, key=lambda item: item["score"], reverse=True):
        if all(_bbox_iou(candidate["bbox"], other["bbox"]) < 0.72 for other in kept):
            kept.append(candidate)

    return kept


def _bbox_iou(first: list[int], second: list[int]) -> float:
    ax1, ay1, ax2, ay2 = first
    bx1, by1, bx2, by2 = second
    intersection_x1 = max(ax1, bx1)
    intersection_y1 = max(ay1, by1)
    intersection_x2 = min(ax2, bx2)
    intersection_y2 = min(ay2, by2)
    intersection_area = max(0, intersection_x2 - intersection_x1) * max(0, intersection_y2 - intersection_y1)

    first_area = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    second_area = max(0, bx2 - bx1) * max(0, by2 - by1)
    union_area = first_area + second_area - intersection_area

    return intersection_area / union_area if union_area else 0


def _clamp_bbox(values: list[float], width: int, height: int) -> list[int]:
    x1, y1, x2, y2 = values
    return [
        max(0, min(width, int(round(x1)))),
        max(0, min(height, int(round(y1)))),
        max(0, min(width, int(round(x2)))),
        max(0, min(height, int(round(y2)))),
    ]


def _get_float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _get_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _bbox(
    width: int,
    height: int,
    x1_ratio: float,
    y1_ratio: float,
    x2_ratio: float,
    y2_ratio: float,
) -> list[int]:
    return [
        int(width * x1_ratio),
        int(height * y1_ratio),
        int(width * x2_ratio),
        int(height * y2_ratio),
    ]


def _write_mock_mask(
    mask_path: Path,
    width: int,
    height: int,
    bbox: list[int],
    shape: str,
) -> None:
    mask = np.zeros((height, width, 4), dtype=np.uint8)
    x1, y1, x2, y2 = bbox

    if shape == "ellipse":
        center = ((x1 + x2) // 2, (y1 + y2) // 2)
        axes = (max(8, (x2 - x1) // 2), max(8, (y2 - y1) // 2))
        cv2.ellipse(mask, center, axes, 0, 0, 360, (255, 255, 255, 255), -1)
    else:
        radius = max(8, min(x2 - x1, y2 - y1) // 10)
        _rounded_rectangle(mask, (x1, y1), (x2, y2), radius)

    cv2.imwrite(str(mask_path), mask)


def _rounded_rectangle(
    image: np.ndarray,
    top_left: tuple[int, int],
    bottom_right: tuple[int, int],
    radius: int,
) -> None:
    x1, y1 = top_left
    x2, y2 = bottom_right
    color = (255, 255, 255, 255)

    cv2.rectangle(image, (x1 + radius, y1), (x2 - radius, y2), color, -1)
    cv2.rectangle(image, (x1, y1 + radius), (x2, y2 - radius), color, -1)
    cv2.circle(image, (x1 + radius, y1 + radius), radius, color, -1)
    cv2.circle(image, (x2 - radius, y1 + radius), radius, color, -1)
    cv2.circle(image, (x1 + radius, y2 - radius), radius, color, -1)
    cv2.circle(image, (x2 - radius, y2 - radius), radius, color, -1)

