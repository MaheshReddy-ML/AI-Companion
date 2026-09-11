"""
Modal deployment template for AI-Companion-FastAPI

This is a copy-paste template and guidance for deploying the existing FastAPI `app`
to Modal Cloud. Do NOT run this locally as-is — inspect and adapt the import
path to match your project (for example `from app.main import app`).

Keep local MLX/macOS settings untouched: this template uses its own `modal_requirements.txt`.
"""
import os
import modal

# ---------------------------
# Edit these values for your project
# ---------------------------
STUB_NAME = "ai_companion_fastapi"
# Replace with the module path where your FastAPI `app` instance lives, e.g. `from app.main import app`
FASTAPI_APP_IMPORT = "app.main:app"

# Example image: builds from `modal/modal_requirements.txt` in repo root
image = modal.Image.debian_slim().pip_install_from_requirements(
    "modal/modal_requirements.txt"
)

stub = modal.Stub(STUB_NAME)

@stub.function(image=image, secret=modal.Secret.from_name("modal-secret-name"))
def starter():
    # Placeholder start function which can be used for background initialisation
    return "starter ready"

# NOTE: Modal's APIs evolve; consult Modal docs for `asgi_app` or `web_endpoint` wrappers.
# Example guidance (pseudo-code):
# @stub.asgi_app()
# def asgi_app():
#     from app.main import app
#     return app

if __name__ == "__main__":
    print("This file is a template — edit and follow Modal docs to deploy the FastAPI app.")
