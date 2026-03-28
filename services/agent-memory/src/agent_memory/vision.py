from __future__ import annotations

import os
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class VisualAsset:
    kind: str
    relative_path: str
    absolute_path: Path
    label: str


_EASYOCR_READER: Any | None = None


def _optional_import(module_name: str) -> Any | None:
    try:
        return import_module(module_name)
    except Exception:
        return None


def _resolve_easyocr_reader() -> tuple[Any | None, str | None]:
    global _EASYOCR_READER
    if _EASYOCR_READER is not None:
        return _EASYOCR_READER, None
    easyocr = _optional_import("easyocr")
    if easyocr is None:
        return None, "easyocr is not installed"
    try:
        # Keep defaults conservative for developer hosts with limited RAM.
        _EASYOCR_READER = easyocr.Reader(
            ["en"],
            gpu=os.environ.get("CLARTK_VISION_GPU", "0") == "1",
            download_enabled=os.environ.get("CLARTK_VISION_DOWNLOAD_MODELS", "0") == "1",
            verbose=False,
        )
    except Exception as error:
        return None, str(error)
    return _EASYOCR_READER, None


def _summarize_text_snippets(items: list[str], *, limit: int = 8) -> list[str]:
    snippets: list[str] = []
    for item in items:
        normalized = " ".join(str(item).split()).strip()
        if not normalized:
            continue
        snippets.append(normalized[:160])
        if len(snippets) >= limit:
            break
    return snippets


def run_local_visual_enrichment(
    assets: list[VisualAsset],
    *,
    analyzer_kind: str,
    max_assets: int = 4,
) -> dict[str, Any]:
    available_assets = [asset for asset in assets if asset.absolute_path.exists()]
    summary: dict[str, Any] = {
        "kind": analyzer_kind,
        "mode": "local-only",
        "status": "unavailable",
        "assetsConsidered": len(available_assets[:max_assets]),
        "models": {
            "ocr": {"status": "disabled"},
            "semantic": {"status": "disabled"},
        },
        "images": [],
        "signals": [],
    }
    if not available_assets:
        summary["reason"] = "no image assets were available for enrichment"
        return summary

    cv2 = _optional_import("cv2")
    if cv2 is None:
        summary["reason"] = "opencv-python-headless is not installed"
        return summary

    numpy = _optional_import("numpy")
    if numpy is None:
        summary["reason"] = "numpy runtime is unavailable"
        return summary

    summary["status"] = "ready"
    ocr_reader, ocr_error = _resolve_easyocr_reader()
    if ocr_reader is None:
        summary["models"]["ocr"] = {
            "status": "unavailable",
            "reason": ocr_error or "reader unavailable",
        }
    else:
        summary["models"]["ocr"] = {
            "status": "ready",
            "engine": "easyocr",
        }

    for asset in available_assets[:max_assets]:
        image = cv2.imread(str(asset.absolute_path))
        if image is None:
            summary["signals"].append(
                {
                    "severity": "warning",
                    "kind": "image_unreadable",
                    "label": asset.label,
                    "relativePath": asset.relative_path,
                }
            )
            continue

        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        contrast = float(gray.std())
        near_white_ratio = float((gray >= 245).mean())
        near_black_ratio = float((gray <= 12).mean())
        low_edge_ratio = 0.0
        try:
          edges = cv2.Canny(gray, 80, 180)
          low_edge_ratio = float((edges > 0).mean())
        except Exception:
          low_edge_ratio = 0.0

        image_summary: dict[str, Any] = {
            "kind": asset.kind,
            "label": asset.label,
            "relativePath": asset.relative_path,
            "width": int(width),
            "height": int(height),
            "brightnessMean": round(brightness, 2),
            "contrastStdDev": round(contrast, 2),
            "nearWhiteRatio": round(near_white_ratio, 4),
            "nearBlackRatio": round(near_black_ratio, 4),
            "edgeDensity": round(low_edge_ratio, 4),
        }

        if contrast < 18:
            summary["signals"].append(
                {
                    "severity": "warning",
                    "kind": "low_contrast",
                    "label": asset.label,
                    "relativePath": asset.relative_path,
                    "contrastStdDev": round(contrast, 2),
                }
            )
        if near_white_ratio > 0.95 or near_black_ratio > 0.95:
            summary["signals"].append(
                {
                    "severity": "warning",
                    "kind": "dominant_flat_region",
                    "label": asset.label,
                    "relativePath": asset.relative_path,
                    "nearWhiteRatio": round(near_white_ratio, 4),
                    "nearBlackRatio": round(near_black_ratio, 4),
                }
            )
        if low_edge_ratio < 0.0025:
            summary["signals"].append(
                {
                    "severity": "warning",
                    "kind": "sparse_structure",
                    "label": asset.label,
                    "relativePath": asset.relative_path,
                    "edgeDensity": round(low_edge_ratio, 4),
                }
            )

        if ocr_reader is not None:
            try:
                texts = ocr_reader.readtext(image, detail=0, paragraph=False)
                snippets = _summarize_text_snippets([str(item) for item in texts])
                image_summary["ocrPreview"] = snippets
                image_summary["ocrTokenCount"] = len(snippets)
                if not snippets:
                    summary["signals"].append(
                        {
                            "severity": "warning",
                            "kind": "ocr_empty",
                            "label": asset.label,
                            "relativePath": asset.relative_path,
                        }
                    )
            except Exception as error:
                image_summary["ocrError"] = str(error)

        summary["images"].append(image_summary)

    summary["signalCount"] = len(summary["signals"])
    return summary
