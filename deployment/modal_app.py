"""Modal ASGI deploy wrapper for AI-Companion-FastAPI.

This file is a deployment entrypoint for Modal. It intentionally does not
modify the existing app code. Configure `INFERENCE_PROVIDER=modal` in Modal
secrets or environment and set `CHAT_MODAL_MODEL` / `VISION_MODAL_MODEL` as
needed.
"""
from __future__ import annotations

import modal

# Build an image using the cloud requirements file that keeps local MLX
# packages out of the cloud image.
image = modal.Image.debian_slim().pip_install_from_requirements("requirements-modal.txt")

stub = modal.Stub("ai_companion_fastapi_modal")


@stub.asgi_app(image=image)
def asgi_app():
    # import the FastAPI app and return it
    from app.main import app as fastapi_app

    return fastapi_app


if __name__ == "__main__":
    print("This module is for Modal deployment. Use `modal deploy` or `modal run` as documented.")
