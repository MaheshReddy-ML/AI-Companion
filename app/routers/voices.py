from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
from app.voice_manager import get_manager
from app.rate_limit import rate_limit
from app.security import require_entitlement
from app.access import has_entitlement, usage_limits_for_user
from app.config import settings
from app.tts_queue import generate_audio, reserve_tts_capacity, stream_pcm

router = APIRouter()
manager = get_manager()


class SpeakRequest(BaseModel):
    text: str
    companion_id: str | None = None
    character_id: str | None = None
    voice_id: str | None = None
    stream: bool = False
    brain: dict | None = None
    speech: dict | None = None


@router.get("/list")
def list_voices(_: dict = Depends(require_entitlement("voice"))):
    return JSONResponse(content={"voices": manager.list_voices()})


@router.get("/status")
def voice_status(current_user: dict = Depends(require_entitlement("voice"))):
    """Expose the local runtime contract without loading a multi-GB model."""
    return {
        "engine": settings.tts_engine,
        "sampleRate": settings.tts_sample_rate,
        "streaming": True,
        "streamMediaType": f"audio/L16;rate={settings.tts_sample_rate};channels=1",
        "queueMaxPending": settings.tts_queue_max_pending,
        "workers": settings.tts_worker_count,
        "accountConcurrentRequests": usage_limits_for_user(current_user)["ttsConcurrentRequests"],
    }


@router.post("/speak", dependencies=[Depends(rate_limit(20, 300, "voice-speak"))])
async def speak(req: SpeakRequest, request: Request, current_user: dict = Depends(require_entitlement("voice"))):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    access_limits = usage_limits_for_user(current_user)
    if len(text) > access_limits["ttsCharacters"]:
        raise HTTPException(status_code=403, detail=f"Your current plan supports speech up to {access_limits['ttsCharacters']:,} characters per request.")

    companion_id = req.character_id or req.companion_id
    assignment = manager.get_voice_assignment(companion_id=companion_id, voice_id=req.voice_id)
    headers = {
        "Cache-Control": "private, no-store",
        "X-Voice-Companion": companion_id or "",
        "X-TTS-Voice-Id": assignment["voice_id"],
        "X-Qwen-Speaker": assignment["qwen_speaker"],
        "X-TTS-Engine": settings.tts_engine,
    }

    if req.stream:
        try:
            reserved_slots = await reserve_tts_capacity(
                requester_id=str(current_user["_id"]),
                requester_limit=access_limits["ttsConcurrentRequests"],
                priority=has_entitlement(current_user, "priority_generation"),
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        async def stream_response():
            try:
                async for chunk in stream_pcm(
                    text=text,
                    voice_id=assignment["voice_id"],
                    companion_id=companion_id,
                    speech=req.speech,
                    brain=req.brain,
                    requester_id=str(current_user["_id"]),
                    requester_limit=access_limits["ttsConcurrentRequests"],
                    priority=has_entitlement(current_user, "priority_generation"),
                    reserved_slots=reserved_slots,
                ):
                    if await request.is_disconnected():
                        break
                    yield chunk
            except RuntimeError as exc:
                # Once an HTTP stream has started a status code cannot change,
                # so this is intentionally logged by the ASGI server and the
                # browser handles an empty/error stream as an unavailable voice.
                raise exc
        headers["X-TTS-Protocol"] = "pcm-s16le"
        return StreamingResponse(
            stream_response(),
            media_type=f"audio/L16;rate={settings.tts_sample_rate};channels=1",
            headers=headers,
        )

    try:
        path = await generate_audio(
            text=text,
            voice_id=assignment["voice_id"],
            companion_id=companion_id,
            speech=req.speech,
            brain=req.brain,
            requester_id=str(current_user["_id"]),
            requester_limit=access_limits["ttsConcurrentRequests"],
            priority=has_entitlement(current_user, "priority_generation"),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return FileResponse(path, media_type="audio/wav", filename=path.name, headers=headers)
