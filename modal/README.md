Modal deployment helper for AI-Companion-FastAPI

This folder contains helper materials to deploy the existing FastAPI app to Modal Cloud.

Goals
- Keep local MLX/macOS setup untouched (do not modify `requirements.txt` or existing virtualenvs).
- Provide a minimal, copy-paste friendly deploy template and a modal-specific requirements file.

Quick steps
1. Install Modal CLI and login: `pip install modal-client && modal login`.
2. Inspect `modal_deploy_template.py` and adjust the import path for your FastAPI `app` (likely `from app.main import app`).
3. Use `modal_requirements.txt` to build the image for Modal instead of modifying the repo `requirements.txt`.
4. Follow Modal docs to create a stub and deploy; the template provides guidance.

Notes
- This folder intentionally does not change existing project files, virtualenvs, or MLX-specific optimizations on macOS.
- If you want, I can create a GitHub Actions workflow to build and deploy to Modal automatically.
