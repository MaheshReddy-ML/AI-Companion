"""Modal / CUDA GPU inference provider (skeleton).

This implementation lazily loads `transformers`/`torch` and exposes a
compatible interface. It is intentionally conservative: it raises a clear
RuntimeError if required CUDA/transformers dependencies are missing so the
local MLX runtime remains unaffected.

Before using this provider on Modal you should set `INFERENCE_PROVIDER=modal`
and set `CHAT_MODAL_MODEL` / `VISION_MODAL_MODEL` to the desired HF-compatible
model IDs. The provider caches loaded model objects for process lifetime.
"""
from __future__ import annotations

import threading
from typing import Any

from app.config import settings
from app.inference.base import ChatProvider, VisionProvider, VisionAnalysisError


class ModalChatProvider:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._model = None
        self._tokenizer = None

    def _ensure_loaded(self) -> None:
        with self._lock:
            if self._loaded:
                return
            try:
                import torch
                from transformers import AutoTokenizer, AutoModelForCausalLM
            except Exception as exc:
                raise RuntimeError("Modal provider requires 'torch' and 'transformers' in the image. Install them in requirements-modal.txt") from exc
            model_id = settings.chat_modal_model.strip() or settings.chat_mlx_model
            try:
                # Conservative loading: use device_map='auto' on Modal CUDA nodes
                self._tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True)
                self._model = AutoModelForCausalLM.from_pretrained(model_id, device_map='auto', torch_dtype=torch.float16)
                self._torch = torch
            except Exception as exc:
                raise RuntimeError(f"Could not load cloud model '{model_id}': {exc}") from exc
            self._loaded = True

    def generate(self, *, model_id: str, messages: list[dict[str, Any]], max_tokens: int, temperature: float, enable_thinking: bool = True, tools: list[dict[str, Any]] | None = None) -> str:
        self._ensure_loaded()
        try:
            prompt = self._tokenizer.apply_chat_template(messages, tools=tools or None, tokenize=False, add_generation_prompt=True)
        except (TypeError, ValueError):
            prompt = "\n".join([f"[{m['role']}] {m.get('content', '')}" for m in messages])
        inputs = self._tokenizer(prompt, return_tensors='pt')
        # move input tensors to model device(s) using torch
        device = next(self._model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with self._torch.no_grad():
            out = self._model.generate(**inputs, max_new_tokens=max_tokens, do_sample=True, temperature=temperature)
        reply = self._tokenizer.decode(out[0], skip_special_tokens=True)
        return reply

    def runtime_stats(self) -> dict[str, Any]:
        return {"model": settings.chat_modal_model or settings.chat_mlx_model, "loaded": self._loaded}


class ModalVisionProvider:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._processor = None
        self._model = None

    def _ensure_loaded(self) -> None:
        with self._lock:
            if self._loaded:
                return
            try:
                import torch
                from transformers import AutoProcessor, AutoModelForVision2Seq
            except Exception as exc:
                raise RuntimeError("Modal vision provider requires 'torch' and 'transformers' in the image.") from exc
            model_id = settings.vision_modal_model.strip() or settings.vision_mlx_model
            try:
                    self._processor = AutoProcessor.from_pretrained(model_id)
                    self._model = AutoModelForVision2Seq.from_pretrained(model_id, device_map='auto', torch_dtype=torch.float16)
                    self._torch = torch
            except Exception as exc:
                raise RuntimeError(f"Could not load cloud vision model '{model_id}': {exc}") from exc
            self._loaded = True

    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]:
        self._ensure_loaded()
        # Basic behavior: cloud provider will accept a bytes image and run the
        # model; precise behavior depends on target model. Here we raise a
        # helpful error indicating configuration is required.
        raise VisionAnalysisError("Modal vision provider is configured but the analyze() implementation requires adaptation to the chosen vision model.")


modal_chat_provider = ModalChatProvider()
modal_vision_provider = ModalVisionProvider()
