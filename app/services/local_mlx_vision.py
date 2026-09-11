"""Opt-in, local-only visual check-ins for the companion.

Camera pixels are decoded in memory for one MLX-VLM request and are never
written to MongoDB, a file, or an application log.  The persisted result is a
coarse observation report, not a diagnosis or identity record.
"""
from __future__ import annotations

import base64
import io
import json
import re
import threading
from typing import Any


MAX_CAMERA_BYTES = 2_000_000
MAX_IMAGE_EDGE = 640


class VisionAnalysisError(RuntimeError):
    pass


class LocalMLXVisionProvider:
    def __init__(self) -> None:
        self._runtime: tuple[object, object, object, object, object] | None = None
        self._model_id: str | None = None
        self._load_lock = threading.Lock()
        self._generate_lock = threading.Lock()

    def _runtime_for(self, model_id: str) -> tuple[object, object, object, object, object]:
        with self._load_lock:
            if self._runtime is not None and self._model_id == model_id:
                return self._runtime
            try:
                from mlx_vlm import generate, load
                from mlx_vlm.prompt_utils import apply_chat_template
                from mlx_vlm.utils import load_config
            except ImportError as exc:
                raise VisionAnalysisError(
                    "Local vision support is not installed. Run `pip install -r requirements.txt` "
                    "or turn camera check-ins off."
                ) from exc
            try:
                model, processor = load(model_id)
                config = load_config(model_id)
            except Exception as exc:
                raise VisionAnalysisError(
                    f"Could not load local vision model '{model_id}'. Its first use downloads into "
                    f"the Hugging Face cache and can be retried safely: {exc}"
                ) from exc
            self._runtime = (model, processor, config, generate, apply_chat_template)
            self._model_id = model_id
            return self._runtime

    @staticmethod
    def _image_from_data_url(data_url: str):
        if not data_url.startswith("data:image/") or ";base64," not in data_url:
            raise VisionAnalysisError("Camera check-in must be a JPEG, PNG, or WebP image.")
        try:
            encoded = data_url.split(";base64,", 1)[1]
            raw = base64.b64decode(encoded, validate=True)
        except Exception as exc:
            raise VisionAnalysisError("Camera image could not be decoded.") from exc
        if len(raw) > MAX_CAMERA_BYTES:
            raise VisionAnalysisError("Camera image is too large; please try again.")
        try:
            from PIL import Image
            image = Image.open(io.BytesIO(raw)).convert("RGB")
            image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
            return image
        except Exception as exc:
            raise VisionAnalysisError("Camera image is invalid or unsupported.") from exc

    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]:
        image = self._image_from_data_url(data_url)
        model, processor, config, generate, apply_chat_template = self._runtime_for(model_id)
        prompt = (
            "This is an opt-in companion camera check-in. Return JSON only with keys: "
            "visible (boolean), expression (pleasant|neutral|tense|sad|surprised|unclear), "
            "engagement (engaged|away|uncertain), confidence (0 to 1), "
            "summary (maximum 18 words), supportCue (maximum 14 words). "
            "Describe only clearly visible, momentary facial expression and attention cues. "
            "Never identify a person or infer age, gender, race, health, diagnosis, personality, "
            "or inner emotions. If uncertain, use unclear and low confidence."
        )
        try:
            formatted = apply_chat_template(processor, config, prompt, num_images=1)
            with self._generate_lock:
                raw = generate(model, processor, formatted, [image], max_tokens=max_tokens, verbose=False)
        except Exception as exc:
            raise VisionAnalysisError(f"Local vision analysis failed: {exc}") from exc
        return parse_visual_report(str(raw or ""))

    def unload_models(self) -> None:
        with self._load_lock:
            self._runtime = None
            self._model_id = None


def parse_visual_report(raw: str) -> dict[str, Any]:
    text = re.sub(r"^\s*<think>.*?</think>\s*", "", raw, flags=re.DOTALL).strip()
    match = re.search(r"\{[\s\S]*\}", text)
    try:
        value = json.loads(match.group(0) if match else text)
    except Exception as exc:
        raise VisionAnalysisError("The local vision model returned an unreadable check-in.") from exc
    if not isinstance(value, dict):
        raise VisionAnalysisError("The local vision model returned an unreadable check-in.")
    expression = str(value.get("expression", "unclear")).lower()
    engagement = str(value.get("engagement", "uncertain")).lower()
    if expression not in {"pleasant", "neutral", "tense", "sad", "surprised", "unclear"}:
        expression = "unclear"
    if engagement not in {"engaged", "away", "uncertain"}:
        engagement = "uncertain"
    try:
        confidence = max(0.0, min(1.0, float(value.get("confidence", 0.0))))
    except (TypeError, ValueError):
        confidence = 0.0
    clean = lambda key, fallback: " ".join(str(value.get(key, fallback)).split())[:180]
    return {
        "version": "vision-checkin.v1",
        "visible": bool(value.get("visible", False)),
        "expression": expression,
        "engagement": engagement,
        "confidence": round(confidence, 2),
        "summary": clean("summary", "Visual check-in was inconclusive."),
        "supportCue": clean("supportCue", "Ask a gentle, open question."),
    }


local_mlx_vision = LocalMLXVisionProvider()
