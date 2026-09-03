"""Modal ASGI deploy wrapper for AI-Companion-FastAPI.

This optional entrypoint uses the same CUDA backend as Docker. Configure
`EMORA_BACKEND=cuda` and the native `CHAT_MODEL`, `VISION_MODEL`, and
`TTS_MODEL` settings in the deployment environment.
"""
from __future__ import annotations

import os

import modal

# Build an image using the cloud requirements file that keeps local MLX
# packages out of the cloud image.
image = modal.Image.debian_slim().pip_install_from_requirements("requirements-modal.txt")
app = modal.App("ai-companion-fastapi")


@app.function(image=image, gpu="L4", timeout=900, scaledown_window=300)
@modal.asgi_app()
def asgi_app():
    os.environ.setdefault("EMORA_BACKEND", "cuda")
    os.environ.setdefault("DEVICE", "cuda")
    from app.main import app as fastapi_app

    return fastapi_app
