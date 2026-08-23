"""Local Qwen chat runtime for Apple Silicon.

The model is intentionally loaded on the first chat request instead of during
FastAPI startup.  Hugging Face keeps the downloaded weights in its local cache;
the in-process cache below keeps those weights resident for every later request
until the server stops.  A failed load is never cached, so a completed download
or a corrected environment works on the next request (including after restart).
"""
from __future__ import annotations

import threading
import re
import time
from typing import Any, Callable


class LocalMLXChatProvider:
    """Thread-safe, process-lifetime MLX-LM model cache."""

    def __init__(self) -> None:
        self._runtime: tuple[object, object, Callable[..., str], Callable[..., object]] | None = None
        self._model_id: str | None = None
        self._load_lock = threading.Lock()
        # MLX generation uses shared model state; serialize it rather than
        # allowing simultaneous requests to corrupt/overcommit that state.
        self._generate_lock = threading.Lock()
        self._stats_lock = threading.Lock()
        self._last_load_ms: float | None = None
        self._last_generation_ms: float | None = None
        self._last_output_tokens_approx: int | None = None
        self._generation_count = 0

    def _runtime_for(self, model_id: str) -> tuple[object, object, Callable[..., str], Callable[..., object]]:
        with self._load_lock:
            if self._runtime is not None and self._model_id == model_id:
                return self._runtime
            try:
                from huggingface_hub.utils import disable_progress_bars
                from mlx_lm import generate, load
                from mlx_lm.sample_utils import make_sampler
            except ImportError as exc:
                raise RuntimeError(
                    "Local MLX chat is not installed in the Python environment running the server. "
                    "Start Emora with `../.venv/bin/python -m uvicorn app.main:app --reload`, "
                    "or install requirements into that interpreter."
                ) from exc

            try:
                load_started = time.perf_counter()
                disable_progress_bars()
                model, tokenizer = load(model_id)
            except Exception as exc:
                raise RuntimeError(
                    f"Could not load local Qwen model '{model_id}'. The first run downloads it "
                    f"to the Hugging Face cache and can be retried safely: {exc}"
                ) from exc

            self._runtime = (model, tokenizer, generate, make_sampler)
            self._model_id = model_id
            with self._stats_lock:
                self._last_load_ms = round((time.perf_counter() - load_started) * 1000, 1)
            return self._runtime

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
        model, tokenizer, generate, make_sampler = self._runtime_for(model_id)
        # The cached Qwen3 1.7B MLX tokenizer predates its
        # ``enable_thinking`` chat-template flag.  Qwen's native directive
        # still works for that tokenizer. Any trace is stripped before a reply
        # can leave this provider.
        rendered_messages = [dict(item) for item in messages]
        if rendered_messages and rendered_messages[-1].get("role") == "user":
            directive = "/think" if enable_thinking else "/no_think"
            rendered_messages[-1]["content"] = f"{rendered_messages[-1].get('content', '').rstrip()}\n{directive}"
        try:
            template_kwargs: dict[str, Any] = {"add_generation_prompt": True, "enable_thinking": enable_thinking}
            if tools:
                template_kwargs["tools"] = tools
            rendered = tokenizer.apply_chat_template(rendered_messages, **template_kwargs)
        except TypeError:
            fallback_kwargs: dict[str, Any] = {"add_generation_prompt": True}
            if tools:
                fallback_kwargs["tools"] = tools
            rendered = tokenizer.apply_chat_template(rendered_messages, **fallback_kwargs)
        except Exception as exc:
            raise RuntimeError(f"Could not format the local Qwen chat prompt: {exc}") from exc

        try:
            with self._generate_lock:
                generation_started = time.perf_counter()
                reply = generate(
                    model,
                    tokenizer,
                    prompt=rendered,
                    max_tokens=max_tokens,
                    sampler=make_sampler(temp=temperature),
                    verbose=False,
                )
        except Exception as exc:
            raise RuntimeError(f"Local Qwen generation failed: {exc}") from exc

        text = re.sub(r"^\s*<think>.*?</think>\s*", "", str(reply or ""), count=1, flags=re.DOTALL).strip()
        if not text:
            raise RuntimeError("Local Qwen returned an empty response.")
        with self._stats_lock:
            self._last_generation_ms = round((time.perf_counter() - generation_started) * 1000, 1)
            self._last_output_tokens_approx = len(re.findall(r"\S+", text))
            self._generation_count += 1
        return text

    def runtime_stats(self) -> dict[str, Any]:
        """Return coarse local runtime telemetry without exposing prompts or replies."""
        with self._stats_lock:
            return {
                "model": self._model_id,
                "loaded": self._runtime is not None,
                "lastModelLoadMs": self._last_load_ms,
                "lastGenerationMs": self._last_generation_ms,
                "lastOutputTokensApprox": self._last_output_tokens_approx,
                "generationCount": self._generation_count,
            }


local_mlx_chat = LocalMLXChatProvider()
