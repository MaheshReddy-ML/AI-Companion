from __future__ import annotations

import re
import threading
import time
from typing import Any, Iterator

from app.config import settings
from app.inference.base import VisionAnalysisError
from app.services.local_mlx_vision import LocalMLXVisionProvider, parse_visual_report


class TransformersChatProvider:
    """Lazy Qwen chat runtime shared by CUDA and CPU deployments."""

    def __init__(self, device: str) -> None:
        self.device = device
        self._lock = threading.RLock()
        self._model = None
        self._tokenizer = None
        self._model_id: str | None = None
        self._last_load_ms: float | None = None
        self._last_generation_ms: float | None = None
        self._generation_count = 0

    def _runtime_for(self, model_id: str):
        effective_model = settings.chat_transformers_model.strip() or model_id
        with self._lock:
            if self._model is not None and self._model_id == effective_model:
                return self._model, self._tokenizer
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer
            except ImportError as exc:
                raise RuntimeError(
                    f"The {self.device.upper()} backend requires torch and transformers; install the matching requirements file."
                ) from exc
            started = time.perf_counter()
            dtype = torch.bfloat16 if self.device == "cuda" and torch.cuda.is_bf16_supported() else (
                torch.float16 if self.device == "cuda" else torch.float32
            )
            kwargs: dict[str, Any] = {"torch_dtype": dtype, "low_cpu_mem_usage": True}
            if self.device == "cuda":
                # Force the full model onto CUDA. Automatic placement may
                # silently offload layers to CPU and hide insufficient VRAM.
                kwargs["device_map"] = {"": "cuda:0"}
            try:
                tokenizer = AutoTokenizer.from_pretrained(effective_model, use_fast=True)
                model = AutoModelForCausalLM.from_pretrained(effective_model, **kwargs)
                if self.device == "cpu":
                    model.to("cpu")
                model.eval()
            except Exception as exc:
                raise RuntimeError(f"Could not load {self.device.upper()} chat model '{effective_model}': {exc}") from exc
            self._model, self._tokenizer, self._model_id = model, tokenizer, effective_model
            self._last_load_ms = round((time.perf_counter() - started) * 1000, 1)
            return model, tokenizer

    def generate(
        self,
        *,
        model_id: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
        enable_thinking: bool = True,
        tools: list[dict[str, Any]] | None = None,
    ) -> str:
        model, tokenizer = self._runtime_for(model_id)
        template_kwargs: dict[str, Any] = {
            "tokenize": True,
            "add_generation_prompt": True,
            "return_tensors": "pt",
            "enable_thinking": enable_thinking,
        }
        if tools:
            template_kwargs["tools"] = tools
        try:
            inputs = tokenizer.apply_chat_template(messages, **template_kwargs)
        except TypeError:
            template_kwargs.pop("enable_thinking", None)
            inputs = tokenizer.apply_chat_template(messages, **template_kwargs)
        target = next(model.parameters()).device
        inputs = inputs.to(target)
        started = time.perf_counter()
        try:
            import torch

            generation_kwargs: dict[str, Any] = {"max_new_tokens": max_tokens}
            if temperature > 0:
                generation_kwargs.update(do_sample=True, temperature=temperature)
            else:
                generation_kwargs["do_sample"] = False
            with self._lock, torch.inference_mode():
                output = model.generate(inputs, **generation_kwargs)
            generated = output[0, inputs.shape[-1] :]
            reply = tokenizer.decode(generated, skip_special_tokens=True)
        except Exception as exc:
            raise RuntimeError(f"{self.device.upper()} Qwen generation failed: {exc}") from exc
        text = re.sub(r"^\s*<think>.*?</think>\s*", "", str(reply or ""), count=1, flags=re.DOTALL).strip()
        if not text:
            raise RuntimeError(f"{self.device.upper()} Qwen returned an empty response.")
        self._last_generation_ms = round((time.perf_counter() - started) * 1000, 1)
        self._generation_count += 1
        return text

    def stream(self, **kwargs: Any) -> Iterator[str]:
        # Keep the public streaming contract stable. True token streaming can
        # be added behind this interface without changing application code.
        yield self.generate(**kwargs)

    def health_check(self) -> tuple[bool, str]:
        try:
            import torch
            import transformers  # noqa: F401
        except ImportError:
            return False, "torch/transformers are not installed"
        if self.device == "cuda" and not torch.cuda.is_available():
            return False, "CUDA is not available to PyTorch"
        return True, f"{self.device} runtime available; model loads on first use"

    def runtime_stats(self) -> dict[str, Any]:
        return {
            "provider": self.device,
            "model": self._model_id or settings.chat_transformers_model,
            "loaded": self._model is not None,
            "lastModelLoadMs": self._last_load_ms,
            "lastGenerationMs": self._last_generation_ms,
            "generationCount": self._generation_count,
        }

    def unload_models(self) -> None:
        with self._lock:
            self._model = self._tokenizer = None
            self._model_id = None
            if self.device == "cuda":
                try:
                    import torch

                    torch.cuda.empty_cache()
                except Exception:
                    pass


class TransformersVisionProvider:
    """Qwen2-VL adapter for CUDA/CPU with the same privacy-safe report shape."""

    def __init__(self, device: str) -> None:
        self.device = device
        self._lock = threading.RLock()
        self._model = None
        self._processor = None
        self._model_id: str | None = None

    def _runtime_for(self, model_id: str):
        effective_model = settings.vision_transformers_model.strip() or model_id
        with self._lock:
            if self._model is not None and self._model_id == effective_model:
                return self._model, self._processor
            try:
                import torch
                from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
            except ImportError as exc:
                raise VisionAnalysisError("Vision requires torch and a Transformers build with Qwen2-VL support.") from exc
            dtype = torch.bfloat16 if self.device == "cuda" and torch.cuda.is_bf16_supported() else (
                torch.float16 if self.device == "cuda" else torch.float32
            )
            kwargs: dict[str, Any] = {"torch_dtype": dtype, "low_cpu_mem_usage": True}
            if self.device == "cuda":
                kwargs["device_map"] = {"": "cuda:0"}
            try:
                processor = AutoProcessor.from_pretrained(effective_model)
                model = Qwen2VLForConditionalGeneration.from_pretrained(effective_model, **kwargs)
                if self.device == "cpu":
                    model.to("cpu")
                model.eval()
            except Exception as exc:
                raise VisionAnalysisError(f"Could not load {self.device.upper()} vision model '{effective_model}': {exc}") from exc
            self._model, self._processor, self._model_id = model, processor, effective_model
            return model, processor

    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]:
        image = LocalMLXVisionProvider._image_from_data_url(data_url)
        model, processor = self._runtime_for(model_id)
        prompt = (
            "Return JSON only with keys visible, expression, engagement, confidence, summary, supportCue. "
            "Expression must be pleasant, neutral, tense, sad, surprised, or unclear; engagement must be engaged, away, or uncertain. "
            "Describe only clearly visible momentary cues. Never identify the person or infer protected traits, health, diagnosis, or personality."
        )
        messages = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt}]}]
        try:
            inputs = processor.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt"
            )
            target = next(model.parameters()).device
            inputs = inputs.to(target)
            with self._lock:
                output = model.generate(**inputs, max_new_tokens=max_tokens)
            trimmed = output[:, inputs["input_ids"].shape[-1] :]
            raw = processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
            return parse_visual_report(raw)
        except VisionAnalysisError:
            raise
        except Exception as exc:
            raise VisionAnalysisError(f"{self.device.upper()} vision analysis failed: {exc}") from exc

    def unload_models(self) -> None:
        with self._lock:
            self._model = self._processor = None
            self._model_id = None
            if self.device == "cuda":
                try:
                    import torch

                    torch.cuda.empty_cache()
                except Exception:
                    pass


__all__ = ["TransformersChatProvider", "TransformersVisionProvider"]
