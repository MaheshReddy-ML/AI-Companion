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
                    "Local MLX chat is not installed. Run `pip install -r requirements.txt`."
                ) from exc

            try:
                disable_progress_bars()
                model, tokenizer = load(model_id)
            except Exception as exc:
                raise RuntimeError(
                    f"Could not load local Qwen model '{model_id}'. The first run downloads it "
                    f"to the Hugging Face cache and can be retried safely: {exc}"
                ) from exc

            self._runtime = (model, tokenizer, generate, make_sampler)
            self._model_id = model_id
            return self._runtime

    def generate(
        self,
        *,
        model_id: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
    ) -> str:
        model, tokenizer, generate, make_sampler = self._runtime_for(model_id)
        # The cached Qwen3 1.7B MLX tokenizer predates its
        # ``enable_thinking`` chat-template flag.  Qwen's native directive
        # still works and avoids spending most of a short companion reply on a
        # private reasoning trace.
        rendered_messages = [dict(item) for item in messages]
        if rendered_messages and rendered_messages[-1].get("role") == "user":
            rendered_messages[-1]["content"] = f"{rendered_messages[-1].get('content', '').rstrip()}\n/no_think"
        try:
            rendered = tokenizer.apply_chat_template(
                rendered_messages, add_generation_prompt=True, enable_thinking=False
            )
        except TypeError:
            rendered = tokenizer.apply_chat_template(rendered_messages, add_generation_prompt=True)
        except Exception as exc:
            raise RuntimeError(f"Could not format the local Qwen chat prompt: {exc}") from exc

        try:
            with self._generate_lock:
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
        return text


local_mlx_chat = LocalMLXChatProvider()
