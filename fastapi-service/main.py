from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from brightness import analyze_brightness, analyze_lighting
from segmentation import SegmentationError, analyze_objects

BASE_DIR = Path(__file__).resolve().parent
GENERATED_DIR = BASE_DIR / "generated"
MASK_DIR = GENERATED_DIR / "masks"
UPLOAD_DIR = GENERATED_DIR / "uploads"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}

MASK_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="GlassFit Image Analysis Service")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/masks", StaticFiles(directory=MASK_DIR), name="masks")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-image")
async def analyze_image(image: UploadFile = File(...)) -> dict:
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, JPEG, or PNG image.")

    suffix = ".png" if image.content_type == "image/png" else ".jpg"
    upload_path = UPLOAD_DIR / f"{uuid4().hex}{suffix}"

    try:
        contents = await image.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")

        upload_path.write_bytes(contents)
        brightness = analyze_brightness(upload_path)
        lighting = analyze_lighting(upload_path)
        warning = None
        segmentation = {
            "mode": "none",
            "model": None,
        }

        try:
            segmentation_result = analyze_objects(upload_path, MASK_DIR)
            objects = segmentation_result["objects"]
            segmentation = {
                "mode": segmentation_result["mode"],
                "model": segmentation_result["model"],
            }
            warning = segmentation_result["warning"]
        except SegmentationError as exc:
            objects = []
            warning = str(exc)
        except Exception as exc:
            objects = []
            warning = f"Segmentation failed: {exc}"

        return {
            "brightness": brightness,
            "lighting": lighting,
            "objects": objects,
            "segmentation": segmentation,
            "warning": warning,
        }
    finally:
        if upload_path.exists():
            upload_path.unlink()
