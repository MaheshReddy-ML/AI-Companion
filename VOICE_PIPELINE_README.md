AI Companion — Voice Pipeline

Setup
1. Activate your virtualenv.

   ```bash
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. (Optional) Download recommended free/open-source models from Hugging Face:

   ```bash
   python scripts/voice_downloader.py --download
   ```

   The script will place model snapshots under `models/voices/`.

3. Start the app:

   ```bash
   uvicorn app.main:app --reload
   ```

4. Runtime notes
- The backend uses `VoiceManager` to map companions to downloaded Piper models.
- Companion voice mapping is: `Yuna` and `rose` -> `lessac-female`; `robert` and `haru` -> `ryan-male`.
- `/api/voices/speak` returns `audio/wav`; the frontend plays the returned blob with the HTML Audio API.
- Browser speech synthesis is not used. If no Piper runtime is available, `/api/voices/speak` returns an error instead of falling back to robotic TTS.
- Install either the `piper-tts` Python package from `requirements.txt` or a compatible `piper` CLI.

5. Usage
- List available voices: `GET /api/voices/list`
- Generate audio: `POST /api/voices/speak` with JSON `{ "text": "...", "companion_id": "Yuna", "voice_id": null, "stream": false }`
- Demo UI: open `/static/voice_demo.html`

Notes & Next Steps
- `app/voice_manager.py` supports cached WAV generation and non-streaming or chunked streaming responses.
- The frontend has lip-sync hooks driven by playback state; true phoneme or timestamp streaming can be added later without returning to browser TTS.
- Models and caches are ignored by git via `.gitignore`.
