from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
from app.voice_manager import get_manager

router = APIRouter()
manager = get_manager()


class SpeakRequest(BaseModel):
    text: str
    companion_id: str | None = None
    voice_id: str | None = None
    stream: bool = False


@router.get("/list")
def list_voices():
    return JSONResponse(content={"voices": manager.list_voices()})


@router.post("/speak")
def speak(req: SpeakRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    try:
        path = manager.generate_audio(
            text,
            voice_id=req.voice_id,
            companion_id=req.companion_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Voice-Companion": req.companion_id or "",
    }

    if req.stream:
        def iterfile():
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(4096)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(iterfile(), media_type="audio/wav", headers=headers)

    return FileResponse(path, media_type="audio/wav", filename=path.name, headers=headers)
