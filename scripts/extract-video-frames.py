"""
Extract the sharpest still frame from each source video.
Uses ffmpeg to pull candidate frames, then scores sharpness via Laplacian
variance (higher = sharper). The winner from each video is saved as an
optimised WebP.

Requirements: ffmpeg on PATH, Pillow
"""

import subprocess
import tempfile
import shutil
import os
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter
import numpy as np

FFMPEG = "ffmpeg"

# ---------- helpers ----------------------------------------------------------

def laplacian_variance(img: Image.Image) -> float:
    """Higher = sharper. Crude but fast sharpness metric."""
    grey = img.convert("L").resize((256, 256), Image.LANCZOS)
    import array
    pixels = list(grey.getdata())
    w, h = grey.size
    total = 0.0
    count = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            lap = (
                -pixels[(y-1)*w + x]
                - pixels[(y+1)*w + x]
                - pixels[y*w + (x-1)]
                - pixels[y*w + (x+1)]
                + 4 * pixels[y*w + x]
            )
            total += lap * lap
            count += 1
    return total / count if count else 0.0


def extract_frame(video_path: str, timestamp: float, out_path: str) -> bool:
    """Extract a single JPEG frame at `timestamp` seconds."""
    result = subprocess.run(
        [FFMPEG, "-y", "-ss", str(timestamp), "-i", video_path,
         "-frames:v", "1", "-q:v", "2", "-vf", "scale='min(1400,iw)':-2",
         out_path],
        capture_output=True, text=True
    )
    return result.returncode == 0 and os.path.exists(out_path)


def save_webp(img: Image.Image, out_path: str, max_w: int, quality: int):
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    if w > max_w:
        img = img.resize((max_w, int(h * max_w / w)), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "WEBP", quality=quality, method=6)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"  → saved {out_path}  ({img.width}×{img.height}, {size_kb} KB)")


def best_frame(video_path: str, timestamps: list[float]) -> tuple[Image.Image, float, float]:
    """Return (best PIL Image, best_score, best_ts)."""
    best_img = None
    best_score = -1.0
    best_ts = timestamps[0]

    with tempfile.TemporaryDirectory() as td:
        for ts in timestamps:
            out = str(Path(td) / f"frame_{ts:.1f}.jpg")
            if not extract_frame(video_path, ts, out):
                continue
            try:
                img = Image.open(out)
                img.load()
            except Exception:
                continue
            score = laplacian_variance(img)
            print(f"    ts={ts:.1f}s  sharpness={score:.1f}  ({img.width}×{img.height})")
            if score > best_score:
                best_score = score
                best_img = img.copy()
                best_ts = ts

    return best_img, best_score, best_ts


# ---------- configuration ----------------------------------------------------

BASE_OD = Path(r"C:\Users\shawn\OneDrive\Shawn\Happy Faces LA")
OUT_BASE = Path(r"C:\HappyFaceLA\public\images\gallery")

JOBS = [
    # (video_path, candidate_timestamps, output_filename, max_w, quality)
    (
        BASE_OD / "04_Glitter_Tattoos" / "IMG_4558.mov",
        [1.5, 3, 5, 7, 9, 11, 13],
        OUT_BASE / "glitter-tattoos" / "happy-faces-la-glitter-tattoo-kids-party-los-angeles-01.webp",
        1400, 85,
    ),
    (
        BASE_OD / "04_Glitter_Tattoos" / "IMG_4559.mov",
        [1, 2, 3, 4, 5, 6, 7],
        OUT_BASE / "glitter-tattoos" / "happy-faces-la-glitter-tattoo-kids-party-los-angeles-02.webp",
        1400, 85,
    ),
    (
        BASE_OD / "04_Glitter_Tattoos" / "IMG_4562.mov",
        [1.5, 3, 5, 7, 9, 11],
        OUT_BASE / "glitter-tattoos" / "happy-faces-la-glitter-tattoo-kids-party-los-angeles-03.webp",
        1400, 85,
    ),
    (
        BASE_OD / "04_Glitter_Tattoos" / "IMG_4563.mov",
        [1.5, 3, 5, 7, 9, 11],
        OUT_BASE / "glitter-tattoos" / "happy-faces-la-glitter-tattoo-kids-party-los-angeles-04.webp",
        1400, 85,
    ),
    # Event atmosphere — 60 s portrait video; sample broadly, skip first/last 3 s
    (
        BASE_OD / "06_Event_Atmosphere" / "482ad2ac6e9f40debfee764111a26912.MOV",
        [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 57],
        OUT_BASE / "event-atmosphere" / "happy-faces-la-event-atmosphere-party-los-angeles-01.webp",
        1400, 85,
    ),
]

# ---------- main -------------------------------------------------------------

SHARPNESS_THRESHOLD = 5.0  # reject frames below this (motion blur / near-black)

for video_path, timestamps, out_path, max_w, quality in JOBS:
    print(f"\n{'='*60}")
    print(f"Video : {video_path.name}")
    print(f"Output: {out_path}")

    if not video_path.exists():
        print("  SKIPPED — source file not found")
        continue

    img, score, ts = best_frame(str(video_path), timestamps)

    if img is None:
        print("  FAILED — could not extract any frame")
        continue

    if score < SHARPNESS_THRESHOLD:
        print(f"  WARNING — best sharpness score {score:.1f} is very low (possible motion blur); saving anyway")

    print(f"  Best frame at t={ts:.1f}s  score={score:.1f}")
    save_webp(img, str(out_path), max_w, quality)

print("\nDone.")
