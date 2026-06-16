import os
import subprocess
import logging

from .engine import ENV

logger = logging.getLogger("rpa")


def _screenshot(path: str) -> str:
    try:
        subprocess.run(
            ["scrot", "-u", "-b", path],
            capture_output=True, timeout=10, env=ENV,
        )
        return path
    except Exception as e:
        logger.warning("screenshot failed: %s", e)
        return ""


def _ocr(image_path: str, psm: int = 3) -> str:
    if not os.path.exists(image_path):
        return ""
    try:
        r = subprocess.run(
            ["tesseract", image_path, "stdout", "--psm", str(psm)],
            capture_output=True, text=True, timeout=30, env=ENV,
        )
        return r.stdout.strip()
    except Exception as e:
        logger.warning("OCR failed: %s", e)
        return ""


def _screenshot_area(full_path: str, out_path: str, x: int, y: int, w: int, h: int) -> str:
    """Crop a region from a screenshot using ImageMagick."""
    try:
        subprocess.run(
            ["convert", full_path, "-crop", f"{w}x{h}+{x}+{y}", out_path],
            capture_output=True, timeout=10,
        )
        return out_path
    except Exception as e:
        logger.warning("crop failed: %s", e)
        return full_path


def _parse_brokers(ocr_text: str) -> list[dict]:
    if not ocr_text:
        return []
    lines = [l.strip() for l in ocr_text.split("\n") if l.strip()]
    brokers = []
    skip_phrases = [
        "add new company", "companyname", "find your", "select a",
        "company.com", "search", "broker", "cancel", "open an account",
    ]
    for line in lines:
        lower = line.lower()
        # Skip UI text/instructions
        if any(p in lower for p in skip_phrases):
            continue
        # Skip lines with "pany" (OCR artifact of "company")
        if "pany" in lower or "com!" in lower:
            continue
        # Skip single words or very short lines
        if len(line) < 5:
            continue
        # Skip lines that are mostly numbers
        digits = sum(c.isdigit() for c in line)
        if digits > len(line) * 0.5:
            continue
        # Clean up common OCR artifacts
        cleaned = line.strip()
        brokers.append({"name": cleaned})
    return brokers[:20]
