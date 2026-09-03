import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import threading
from typing import Iterator

from app.config import settings
from app.tts_text import prepare_text_for_tts

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models" / "voices"
CACHE_DIR = BASE_DIR / "cache" / "audio"
VOICE_METADATA = MODELS_DIR / "voices.json"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

URL_PATTERN = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
CODE_BLOCK_PATTERN = re.compile(r"```[\s\S]*?```")
INLINE_CODE_PATTERN = re.compile(r"`[^`]*`")
MARKDOWN_LINK_PATTERN = re.compile(r"!?\[([^\]]*)\]\(([^)]*)\)")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
REPEATED_PUNCTUATION_PATTERN = re.compile(r"([.!?]){2,}")
REPEATED_SEPARATOR_PATTERN = re.compile(r"([,;:]){2,}")
MARKDOWN_LINE_PREFIX_PATTERN = re.compile(r"^\s{0,3}(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+|>\s*)", re.MULTILINE)
MARKDOWN_SYMBOL_PATTERN = re.compile(r"[*_~=#|<>^{}[\]\\]")
SPACING_PATTERN = re.compile(r"\s+")


class VoiceMeta:
    def __init__(
        self,
        id: str,
        name: str,
        engine: str,
        path: Path,
        female: bool = True,
        voice: Optional[str] = None,
        description: Optional[str] = None,
    ):
        self.id = id
        self.name = name
        self.engine = engine
        self.path = path
        self.female = female
        self.voice = voice or name
        self.description = description or ""

    def as_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "engine": self.engine,
            "path": str(self.path),
            "female": self.female,
            "voice": self.voice,
            "description": self.description,
        }


def sanitize_text_for_tts(text: str) -> str:
    cleaned = html.unescape(str(text or ""))
    cleaned = CODE_BLOCK_PATTERN.sub(" ", cleaned)
    cleaned = INLINE_CODE_PATTERN.sub(" ", cleaned)
    cleaned = MARKDOWN_LINK_PATTERN.sub(r"\1", cleaned)
    cleaned = URL_PATTERN.sub(" ", cleaned)
    cleaned = HTML_TAG_PATTERN.sub(" ", cleaned)
    cleaned = MARKDOWN_LINE_PREFIX_PATTERN.sub("", cleaned)
    cleaned = cleaned.replace("/", " ").replace("@", " at ")
    cleaned = "".join(" " if _is_emoji_or_symbol(character) else character for character in cleaned)
    cleaned = MARKDOWN_SYMBOL_PATTERN.sub(" ", cleaned)
    cleaned = REPEATED_PUNCTUATION_PATTERN.sub(lambda match: match.group(0)[0], cleaned)
    cleaned = REPEATED_SEPARATOR_PATTERN.sub(lambda match: match.group(0)[0], cleaned)
    cleaned = re.sub(r"\s+([,.!?;:])", r"\1", cleaned)
    cleaned = SPACING_PATTERN.sub(" ", cleaned)
    return cleaned.strip()


def _is_emoji_or_symbol(character: str) -> bool:
    if character in "\n\r\t":
        return False
    if character in "$%&+-":
        return False
    category = unicodedata.category(character)
    if category in {"So", "Sk"}:
        return True
    codepoint = ord(character)
    return (
        0x1F000 <= codepoint <= 0x1FAFF
        or 0x2600 <= codepoint <= 0x27BF
        or 0xFE00 <= codepoint <= 0xFE0F
        or 0x200D == codepoint
    )


class VoiceManager:
    # The only character-to-voice registry.  Add a companion here, then send
    # its `character_id`; the API resolves the Kokoro fallback voice and the
    # Qwen CustomVoice speaker together, rather than trusting a browser voice.
    # Qwen3 CustomVoice offers Serena and Vivian as female presets, and Ryan
    # and Aiden as male presets.  The female presets also support English.
    CHARACTER_VOICE_PROFILES: Dict[str, Dict[str, str]] = {
        "yuna": {"voice_id": "af_heart", "gender": "female", "qwen_speaker": "Serena"},
        "rose": {"voice_id": "af_bella", "gender": "female", "qwen_speaker": "Vivian"},
        "robert": {"voice_id": "am_adam", "gender": "male", "qwen_speaker": "Aiden"},
        "haru": {"voice_id": "am_michael", "gender": "male", "qwen_speaker": "Ryan"},
    }
    CHARACTER_ALIASES = {"arin": "haru", "liora": "yuna"}
    KOKORO_VOICE_PROFILES: Dict[str, Dict[str, Any]] = {
        "af_heart": {
            "id": "af_heart",
            "name": "Female A",
            "engine": "kokoro",
            "gender": "female",
            "voice": "af_heart",
            "style": "warm-supportive",
            "speed": 0.96,
            "energy": 0.48,
            "warmth": 0.92,
            "pause_frequency": 0.34,
            "description": "Warm, intelligent, supportive companion voice",
        },
        "af_bella": {
            "id": "af_bella",
            "name": "Female B",
            "engine": "kokoro",
            "gender": "female",
            "voice": "af_bella",
            "style": "playful-curious",
            "speed": 1.08,
            "energy": 0.78,
            "warmth": 0.82,
            "pause_frequency": 0.2,
            "description": "Playful, energetic, curious companion voice",
        },
        "am_adam": {
            "id": "am_adam",
            "name": "Male A",
            "engine": "kokoro",
            "gender": "male",
            "voice": "am_adam",
            "style": "calm-confident",
            "speed": 0.92,
            "energy": 0.42,
            "warmth": 0.56,
            "pause_frequency": 0.3,
            "description": "Calm, professional, confident companion voice",
        },
        "am_michael": {
            "id": "am_michael",
            "name": "Male B",
            "engine": "kokoro",
            "gender": "male",
            "voice": "am_michael",
            "style": "relaxed-friendly",
            "speed": 1.0,
            "energy": 0.56,
            "warmth": 0.78,
            "pause_frequency": 0.26,
            "description": "Relaxed, friendly, lightly humorous companion voice",
        },
    }
    EMOTION_STYLES = {
        "calm": "calm, grounded, unhurried, and reassuring",
        "comforting": "soft, warm, comforting, and gentle",
        "empathetic": "deeply empathetic, attentive, and validating",
        "excited": "bright, energetic, and sincerely excited",
        "happy": "warmly happy, smiling, and natural",
        "sad": "soft, reflective, and quietly sad without sounding flat",
        "romantic": "tender, intimate, and affectionate while remaining natural",
        "professional": "clear, confident, polished, and approachable",
    }

    def __init__(self, models_dir: Optional[Path] = None, cache_dir: Optional[Path] = None):
        self.models_dir = Path(models_dir or MODELS_DIR)
        self.cache_dir = Path(cache_dir or CACHE_DIR)
        self._voices: Dict[str, VoiceMeta] = {}
        self._kokoro_pipelines: Dict[str, Any] = {}
        self._qwen_models: Dict[str, Any] = {}
        self._qwen_backend_kinds: Dict[str, str] = {}
        self._active_qwen_backend_kind = "mlx"
        self._load_lock = threading.RLock()
        self._qwen_generation_lock = threading.RLock()
        self._kokoro_generation_lock = threading.RLock()
        self._scan_models()

    def _load_metadata(self) -> List[Dict]:
        if not VOICE_METADATA.exists():
            return []

        try:
            with open(VOICE_METADATA, "r", encoding="utf-8") as metadata_file:
                data = json.load(metadata_file)
                if isinstance(data, list):
                    return data
        except Exception:
            return []

        return []

    def _scan_models(self):
        with self._load_lock:
            self._voices = {}
            for profile in self.KOKORO_VOICE_PROFILES.values():
                self._voices[profile["id"]] = VoiceMeta(
                    id=profile["id"],
                    name=profile["name"],
                    engine="kokoro",
                    path=self.models_dir,
                    female=profile["gender"] == "female",
                    voice=profile["voice"],
                    description=profile["description"],
                )
            metadata = self._load_metadata()
            if metadata:
                for entry in metadata:
                    if not entry.get("path"):
                        continue
                    path = Path(entry["path"])
                    if not path.exists():
                        continue
                    name = entry.get("name") or path.name
                    engine = entry.get("engine", "piper")
                    female = entry.get("gender", "female").lower() == "female"
                    voice_id = entry.get("name") or name
                    self._voices[voice_id] = VoiceMeta(
                        id=voice_id,
                        name=name,
                        engine=engine,
                        path=path,
                        female=female,
                        voice=entry.get("voice") or name,
                        description=entry.get("description"),
                    )
                if self._voices:
                    return

            if not self.models_dir.exists():
                return

            for child in self.models_dir.iterdir():
                if not child.is_dir():
                    continue
                name = child.name
                lname = name.lower()
                engine = "unknown"
                if "piper" in lname or "rhasspy" in lname or "onnx" in lname:
                    engine = "piper"
                elif "coqui" in lname or "tacotron" in lname or "tts" in lname:
                    engine = "coqui"
                elif "kokoro" in lname:
                    engine = "kokoro"
                elif "chatterbox" in lname:
                    engine = "chatterbox"
                female = any(segment in lname for segment in ["female", "her", "she", "woman"]) or "male" not in lname
                voice_id = name
                self._voices[voice_id] = VoiceMeta(
                    id=voice_id,
                    name=name,
                    engine=engine,
                    path=child,
                    female=female,
                )

    def list_voices(self) -> List[Dict]:
        self._scan_models()
        voices = []
        for voice in self._voices.values():
            serialized = voice.as_dict()
            if voice.engine == "kokoro" and self._should_use_qwen(voice):
                serialized["engine"] = "qwen3-mlx"
                serialized["fallbackEngine"] = "kokoro"
            voices.append(serialized)
        return voices

    def unload_models(self) -> None:
        """Drop lazy TTS caches so serverless workers can release memory."""
        with self._load_lock:
            self._qwen_models.clear()
            self._qwen_backend_kinds.clear()
            self._active_qwen_backend_kind = "mlx"
            self._kokoro_pipelines.clear()
        try:
            from app.inference.hardware import select_hardware_backend

            if select_hardware_backend(settings.emora_backend).backend == "cuda":
                import torch

                torch.cuda.empty_cache()
        except Exception:
            pass

    def find_voice(self, voice_id: str) -> Optional[VoiceMeta]:
        self._scan_models()
        if not voice_id:
            return None

        normalized = self._normalize_id(voice_id)
        if normalized in self._voices:
            return self._voices[normalized]

        for voice in self._voices.values():
            if self._normalize_id(voice.id) == normalized:
                return voice
            if self._normalize_id(voice.name) == normalized:
                return voice
            if self._normalize_id(voice.voice) == normalized:
                return voice

        return None

    def _normalize_id(self, value: Optional[str]) -> str:
        return str(value or "").strip().lower()

    def _character_voice_profile(self, companion_id: Optional[str]) -> Optional[Dict[str, str]]:
        character_id = self._normalize_id(companion_id)
        character_id = self.CHARACTER_ALIASES.get(character_id, character_id)
        profile = self.CHARACTER_VOICE_PROFILES.get(character_id)
        return dict(profile) if profile else None

    def get_voice_assignment(self, companion_id: Optional[str] = None, voice_id: Optional[str] = None) -> Dict[str, str]:
        """Resolve a stable voice assignment, preferring a registered character profile.

        A registered `companion_id` deliberately wins over a client-supplied
        `voice_id`. This prevents a stale browser bundle from making Yuna use a
        male voice while still allowing direct voice selection for new/unmapped
        characters during development.
        """
        character_profile = self._character_voice_profile(companion_id)
        if character_profile:
            return character_profile

        fallback_voice_id = self._normalize_id(voice_id) or "af_heart"
        fallback = dict(self.KOKORO_VOICE_PROFILES.get(fallback_voice_id, self.KOKORO_VOICE_PROFILES["af_heart"]))
        fallback["voice_id"] = fallback["id"]
        # A direct/unmapped request has no durable character identity. Keep it
        # functional, but do not let it silently replace a configured profile.
        fallback["qwen_speaker"] = "Serena" if fallback.get("gender") == "female" else "Aiden"
        return fallback

    def get_voice_for_companion(self, companion_id: Optional[str] = None, companion_gender: Optional[str] = None) -> Optional[VoiceMeta]:
        self._scan_models()
        assignment = self._character_voice_profile(companion_id)
        if assignment:
            voice = self.find_voice(assignment["voice_id"])
            if voice:
                return voice

        if companion_gender:
            desired = companion_gender.lower() == "female"
            matches = [v for v in self._voices.values() if v.female == desired and v.engine == "kokoro"]
            if matches:
                return matches[0]

        kokoro_voices = [v for v in self._voices.values() if v.engine == "kokoro"]
        if kokoro_voices:
            return kokoro_voices[0]

        return next(iter(self._voices.values()), None)

    def generate_audio(
        self,
        text: str,
        voice_id: Optional[str] = None,
        companion_id: Optional[str] = None,
        companion_gender: Optional[str] = None,
        speech: Optional[Dict[str, Any]] = None,
        brain: Optional[Dict[str, Any]] = None,
    ) -> Path:
        assignment = self.get_voice_assignment(companion_id, voice_id)
        speech_profile = self._build_speech_profile(voice_id, companion_id, speech, brain)
        speech_text = self._prepare_speech_text(text, speech_profile)
        if not speech_text:
            raise RuntimeError("No speakable text remains after TTS sanitization.")

        vm = self.find_voice(assignment["voice_id"])

        if not vm:
            vm = VoiceMeta(
                id=assignment["voice_id"],
                name=assignment["voice_id"],
                engine="kokoro",
                path=self.models_dir,
                female=assignment.get("gender") == "female",
                description="System speech fallback",
            )
        if vm.engine not in {"kokoro", "piper", "system", "qwen3-mlx"}:
            raise RuntimeError(f"Voice '{vm.id}' is not a supported speech voice.")

        cache_key = hashlib.sha1(
            f"tts-v4:{settings.tts_engine}:{vm.id}:{speech_profile['style']}:{speech_profile['speed']:.3f}:{speech_text}".encode("utf-8")
        ).hexdigest()
        out_path = self.cache_dir / f"{cache_key}.wav"
        if out_path.exists() and out_path.stat().st_size > 44:
            return out_path

        if self._should_use_qwen(vm):
            try:
                return self._generate_with_qwen(speech_text, vm, out_path, speech_profile)
            except RuntimeError as exc:
                # A missing MLX package/model never leaves the product silent:
                # the already-installed Kokoro implementation remains local.
                print(f"VoiceManager: Qwen3 MLX unavailable for '{vm.id}', using Kokoro fallback. {exc}")

        if vm.engine in {"kokoro", "qwen3-mlx"}:
            try:
                return self._generate_with_kokoro(speech_text, vm, out_path, speech_profile)
            except RuntimeError as exc:
                if not self._can_use_macos_say():
                    raise
                print(f"VoiceManager: Kokoro unavailable for '{vm.id}', using system WAV fallback. {exc}")

        if vm.engine == "piper":
            try:
                return self._generate_with_piper(speech_text, vm, out_path)
            except RuntimeError as exc:
                if not self._can_use_macos_say():
                    raise
                print(f"VoiceManager: Piper unavailable for '{vm.id}', using macOS speech fallback. {exc}")

        return self._generate_with_macos_say(speech_text, vm, out_path)

    def iter_pcm(
        self,
        text: str,
        voice_id: Optional[str] = None,
        companion_id: Optional[str] = None,
        companion_gender: Optional[str] = None,
        speech: Optional[Dict[str, Any]] = None,
        brain: Optional[Dict[str, Any]] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> Iterator[bytes]:
        """Yield signed 16-bit little-endian PCM as soon as each model chunk is ready."""
        cancel_event = cancel_event or threading.Event()
        assignment = self.get_voice_assignment(companion_id, voice_id)
        speech_profile = self._build_speech_profile(voice_id, companion_id, speech, brain)
        speech_text = self._prepare_speech_text(text, speech_profile)
        if not speech_text:
            raise RuntimeError("No speakable text remains after TTS sanitization.")
        vm = self.find_voice(assignment["voice_id"])
        vm = vm or VoiceMeta("system-fallback", "system-fallback", "kokoro", self.models_dir)

        try:
            if self._should_use_qwen(vm):
                for sentence in self._sentence_chunks(speech_text):
                    for audio in self._iter_qwen_audio(sentence, vm, speech_profile, cancel_event):
                        if cancel_event.is_set():
                            return
                        yield self._audio_to_pcm(audio)
                return
        except RuntimeError as exc:
            print(f"VoiceManager: Qwen3 streaming unavailable, using Kokoro fallback. {exc}")

        try:
            with self._kokoro_generation_lock:
                pipeline = self._kokoro_pipeline(vm.voice)
                generator = pipeline(speech_text, voice=vm.voice, speed=speech_profile["speed"], split_pattern=r"(?<=[.!?])\s+|\n+")
                for _, _, audio in generator:
                    if cancel_event.is_set():
                        return
                    yield self._audio_to_pcm(audio)
                return
        except Exception as exc:
            if not self._can_use_macos_say():
                raise RuntimeError(f"No streaming TTS runtime is available: {exc}") from exc

        # macOS fallback has no incremental API, but remains available for a
        # complete locally generated reply when optional neural dependencies fail.
        path = self.generate_audio(text, voice_id, companion_id, companion_gender, speech, brain)
        with wave.open(str(path), "rb") as wav_file:
            while not cancel_event.is_set():
                chunk = wav_file.readframes(4096)
                if not chunk:
                    return
                yield chunk

    def _prepare_speech_text(self, text: str, speech_profile: Dict[str, Any]) -> str:
        rendered = sanitize_text_for_tts(self._render_speech_markup(text, speech_profile))
        dictionary_path = Path(settings.tts_pronunciation_dictionary) if settings.tts_pronunciation_dictionary else None
        return prepare_text_for_tts(rendered, dictionary_path).text

    def _should_use_qwen(self, vm: VoiceMeta) -> bool:
        return settings.tts_engine.strip().lower() in {"auto", "qwen", "qwen3", "qwen3-mlx", "mlx"} and vm.engine not in {"piper", "system"}

    def _sentence_chunks(self, text: str, maximum_characters: int = 360) -> List[str]:
        """Bound synthesis units without splitting words or losing punctuation."""
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
        chunks: List[str] = []
        for sentence in sentences or [text]:
            while len(sentence) > maximum_characters:
                boundary = sentence.rfind(" ", 0, maximum_characters)
                boundary = boundary if boundary > maximum_characters // 2 else maximum_characters
                chunks.append(sentence[:boundary].strip())
                sentence = sentence[boundary:].strip()
            if sentence:
                chunks.append(sentence)
        return chunks

    def _build_speech_profile(
        self,
        voice_id: Optional[str],
        companion_id: Optional[str],
        speech: Optional[Dict[str, Any]],
        brain: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        assignment = self.get_voice_assignment(companion_id, voice_id)
        mapped_voice_id = assignment["voice_id"]
        base = dict(self.KOKORO_VOICE_PROFILES.get(mapped_voice_id, self.KOKORO_VOICE_PROFILES["af_heart"]))
        speech = speech if isinstance(speech, dict) else (brain or {}).get("speech") if isinstance(brain, dict) else {}
        emotion = (brain or {}).get("emotion", {}) if isinstance(brain, dict) else {}
        speed = float(speech.get("speed", base["speed"])) if isinstance(speech, dict) else base["speed"]
        energy = float(speech.get("vocalEnergy", base["energy"])) if isinstance(speech, dict) else base["energy"]
        arousal = float(emotion.get("arousal", energy)) if isinstance(emotion, dict) else energy
        requested_style = str(speech.get("style", "") if isinstance(speech, dict) else "").strip().lower()
        emotion_label = str(emotion.get("label", emotion.get("primary", "")) if isinstance(emotion, dict) else "").strip().lower()
        style_aliases = {"warm": "comforting", "supportive": "comforting", "joy": "happy", "joyful": "happy", "grief": "sad", "neutral": "professional"}
        style = style_aliases.get(requested_style or emotion_label, requested_style or emotion_label)
        base["style"] = style if style in self.EMOTION_STYLES else "calm"
        base["style_instruction"] = self.EMOTION_STYLES[base["style"]]
        base["qwen_speaker"] = assignment["qwen_speaker"]
        base["speed"] = max(0.76, min(1.24, speed + (arousal - 0.5) * 0.08))
        base["pause_frequency"] = max(0.08, min(0.72, float(speech.get("pauseFrequency", base["pause_frequency"])) if isinstance(speech, dict) else base["pause_frequency"]))
        base["pause_scale"] = max(0.65, min(1.5, float(speech.get("pauseScale", 1.0)) if isinstance(speech, dict) else 1.0))
        base["emphasis"] = speech.get("emphasis", []) if isinstance(speech, dict) and isinstance(speech.get("emphasis"), list) else []
        return base

    def _render_speech_markup(self, text: str, speech_profile: Dict[str, Any]) -> str:
        rendered = str(text or "")
        rendered = re.sub(r"<reflection\s*/>", "Mm. ", rendered, flags=re.IGNORECASE)
        rendered = re.sub(r"<pause\s+ms=\"?(\d+)\"?\s*/>", lambda m: " ... " if int(m.group(1)) >= 220 else " , ", rendered, flags=re.IGNORECASE)
        rendered = re.sub(r"</?emphasis>", "", rendered, flags=re.IGNORECASE)
        if speech_profile.get("pause_frequency", 0) > 0.42:
            rendered = re.sub(r"([.!?])\s+", r"\1 ... ", rendered)
        return rendered

    def _kokoro_lang_code(self, voice_id: str) -> str:
        return "b" if voice_id.startswith("bf_") or voice_id.startswith("bm_") else "a"

    def _kokoro_pipeline(self, voice_id: str):
        lang_code = self._kokoro_lang_code(voice_id)
        with self._load_lock:
            if lang_code in self._kokoro_pipelines:
                return self._kokoro_pipelines[lang_code]
            try:
                from kokoro import KPipeline
            except Exception as exc:
                raise RuntimeError("Kokoro is not installed. Install kokoro>=0.9.4 and soundfile.") from exc
            pipeline = KPipeline(lang_code=lang_code)
            self._kokoro_pipelines[lang_code] = pipeline
            return pipeline

    def _generate_with_kokoro(self, text: str, vm: VoiceMeta, out_path: Path, speech_profile: Dict[str, Any]) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            import numpy as np
            import soundfile as sf
        except Exception as exc:
            raise RuntimeError("Kokoro audio writing requires numpy and soundfile.") from exc

        with self._kokoro_generation_lock:
            if out_path.exists() and out_path.stat().st_size > 44:
                return out_path
            pipeline = self._kokoro_pipeline(vm.voice)
            audio_parts = []
            try:
                generator = pipeline(text, voice=vm.voice, speed=speech_profile["speed"], split_pattern=r"(?<=[.!?])\s+|\n+")
                for _, _, audio in generator:
                    audio_parts.append(audio)
            except Exception as exc:
                raise RuntimeError(f"Kokoro generation failed: {exc}") from exc

            if not audio_parts:
                raise RuntimeError("Kokoro generated no audio.")
            audio = np.concatenate(audio_parts)
            sf.write(str(out_path), audio, 24000)
            if not out_path.exists() or out_path.stat().st_size <= 44:
                raise RuntimeError("Kokoro generated an empty audio file.")
            return out_path

    def _qwen_model(self):
        # Resolve through the same centralized selector as chat and vision,
        # while retaining the existing MLX-Audio path byte-for-byte on Macs.
        from app.inference.hardware import select_hardware_backend

        backend = select_hardware_backend(settings.emora_backend).backend
        model_id = settings.tts_qwen_model if backend == "mlx" else settings.tts_transformers_model
        with self._load_lock:
            if model_id in self._qwen_models:
                self._active_qwen_backend_kind = self._qwen_backend_kinds.get(model_id, "mlx")
                return self._qwen_models[model_id]
            if backend == "mlx":
                try:
                    from mlx_audio.tts.utils import load_model
                except Exception as exc:
                    raise RuntimeError("MLX-Audio is not installed. Install the Apple Silicon requirements.") from exc
                try:
                    model = load_model(model_id)
                except Exception as exc:
                    raise RuntimeError(f"Could not load local Qwen3 model '{model_id}': {exc}") from exc
                self._qwen_backend_kinds[model_id] = "mlx"
            else:
                try:
                    import torch
                    from qwen_tts import Qwen3TTSModel
                except Exception as exc:
                    raise RuntimeError("CUDA/CPU Qwen3-TTS requires torch and qwen-tts from the matching requirements file.") from exc
                if backend == "cuda" and not torch.cuda.is_available():
                    raise RuntimeError("CUDA Qwen3-TTS was selected but CUDA is unavailable to PyTorch.")
                device = "cuda:0" if backend == "cuda" else "cpu"
                dtype = torch.bfloat16 if backend == "cuda" and torch.cuda.is_bf16_supported() else (
                    torch.float16 if backend == "cuda" else torch.float32
                )
                try:
                    model = Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype)
                except Exception as exc:
                    raise RuntimeError(f"Could not load {backend.upper()} Qwen3-TTS model '{model_id}': {exc}") from exc
                self._qwen_backend_kinds[model_id] = "torch"
            self._active_qwen_backend_kind = self._qwen_backend_kinds[model_id]
            self._qwen_models[model_id] = model
            return model

    def _validated_qwen_speaker(self, model: Any, requested_speaker: str) -> str:
        """Return the model's canonical configured speaker or fail loudly.

        Falling back to the model default here would hide a broken character
        assignment and make every companion sound alike.
        """
        try:
            supported = model.get_supported_speakers()
        except AttributeError:
            return requested_speaker
        except Exception as exc:
            raise RuntimeError(f"Could not inspect Qwen3 CustomVoice speakers: {exc}") from exc

        supported_names = [str(name) for name in (supported or [])]
        for speaker in supported_names:
            if speaker.casefold() == requested_speaker.casefold():
                return speaker
        raise RuntimeError(
            f"Configured Qwen3 speaker '{requested_speaker}' is unavailable. "
            f"Model supports: {', '.join(supported_names) or 'no reported speakers'}"
        )

    def _iter_qwen_audio(
        self,
        text: str,
        vm: VoiceMeta,
        speech_profile: Dict[str, Any],
        cancel_event: threading.Event,
    ) -> Iterator[Any]:
        try:
            import numpy as np
        except Exception as exc:
            raise RuntimeError("Qwen3 audio conversion requires numpy.") from exc
        with self._qwen_generation_lock:
            model = self._qwen_model()
            speaker = self._validated_qwen_speaker(model, speech_profile["qwen_speaker"])
            runtime_kind = self._active_qwen_backend_kind
            kwargs = {
                "text": text,
                "speaker": speaker,
                "language": "English",
                "instruct": speech_profile["style_instruction"],
            }
            if runtime_kind == "mlx":
                kwargs.update(stream=True, streaming_interval=settings.tts_streaming_interval)
            try:
                results = model.generate_custom_voice(**kwargs)
            except (AttributeError, TypeError) as exc:
                raise RuntimeError(f"Installed MLX-Audio does not expose Qwen3 CustomVoice streaming: {exc}") from exc
            emitted = False
            try:
                if runtime_kind == "torch":
                    waveforms, sample_rate = results
                    if int(sample_rate) != settings.tts_sample_rate:
                        raise RuntimeError(
                            f"Qwen3-TTS returned {sample_rate} Hz audio; configured TTS_SAMPLE_RATE is {settings.tts_sample_rate}."
                        )
                    results = [type("AudioResult", (), {"audio": waveform}) for waveform in waveforms]
                for result in results:
                    if cancel_event.is_set():
                        return
                    audio = np.asarray(result.audio, dtype=np.float32).reshape(-1)
                    if audio.size:
                        emitted = True
                        yield audio
            except Exception as exc:
                raise RuntimeError(f"Qwen3 generation failed: {exc}") from exc
            if not emitted and not cancel_event.is_set():
                raise RuntimeError("Qwen3 generated no audio.")

    def _generate_with_qwen(self, text: str, vm: VoiceMeta, out_path: Path, speech_profile: Dict[str, Any]) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            import numpy as np
            import soundfile as sf
        except Exception as exc:
            raise RuntimeError("Qwen3 audio writing requires numpy and soundfile.") from exc
        with self._qwen_generation_lock:
            if out_path.exists() and out_path.stat().st_size > 44:
                return out_path
            cancelled = threading.Event()
            parts = [
                audio
                for sentence in self._sentence_chunks(text)
                for audio in self._iter_qwen_audio(sentence, vm, speech_profile, cancelled)
            ]
            if not parts:
                raise RuntimeError("Qwen3 generated no audio.")
            sf.write(str(out_path), np.concatenate(parts), settings.tts_sample_rate)
            if not out_path.exists() or out_path.stat().st_size <= 44:
                raise RuntimeError("Qwen3 generated no audio.")
            return out_path

    def _audio_to_pcm(self, audio: Any) -> bytes:
        try:
            import numpy as np
            samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        except Exception as exc:
            raise RuntimeError("Audio chunk conversion requires numpy.") from exc
        return (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2", copy=False).tobytes()

    def _find_piper_model(self, vm: VoiceMeta) -> Optional[Path]:
        if vm.path.is_file() and vm.path.suffix == ".onnx":
            return vm.path

        if vm.path.is_dir():
            for candidate in vm.path.rglob("*.onnx"):
                return candidate

        return None

    def _generate_with_piper(self, text: str, vm: VoiceMeta, out_path: Path) -> Path:
        model_path = self._find_piper_model(vm)
        if model_path is None:
            raise RuntimeError(f"Piper model file not found for voice {vm.name}")

        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=str(out_path.parent))
        tmp_path = Path(tmp_file.name)
        tmp_file.close()

        try:
            generated_path = self._run_piper(text, model_path, tmp_path)
            if not generated_path.exists() or generated_path.stat().st_size <= 44:
                raise RuntimeError(f"Piper generated an empty audio file for voice {vm.name}")
            os.replace(generated_path, out_path)
            return out_path
        finally:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)

    def _can_use_macos_say(self) -> bool:
        return bool(shutil.which("say") and shutil.which("afconvert"))

    def _select_macos_voice(self, vm: VoiceMeta) -> str:
        preferred = ("Samantha", "Karen", "Moira", "Tessa") if vm.female else ("Daniel", "Alex", "Fred")
        try:
            result = subprocess.run(["say", "-v", "?"], capture_output=True, text=True, timeout=5)
            available = result.stdout
        except Exception:
            available = ""

        for voice in preferred:
            if re.search(rf"^{re.escape(voice)}\s+", available, re.MULTILINE):
                return voice

        return preferred[0]

    def _generate_with_macos_say(self, text: str, vm: VoiceMeta, out_path: Path) -> Path:
        if not self._can_use_macos_say():
            raise RuntimeError(
                "No working speech runtime is available. Install the Piper CLI, piper-tts, "
                "or run on macOS with say and afconvert."
            )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        voice = self._select_macos_voice(vm)
        tmp_aiff = tempfile.NamedTemporaryFile(delete=False, suffix=".aiff", dir=str(out_path.parent))
        tmp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=str(out_path.parent))
        tmp_aiff_path = Path(tmp_aiff.name)
        tmp_wav_path = Path(tmp_wav.name)
        tmp_aiff.close()
        tmp_wav.close()

        try:
            say_result = subprocess.run(
                ["say", "-v", voice, "-r", "178", "-o", str(tmp_aiff_path), text],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if say_result.returncode != 0 or not tmp_aiff_path.exists():
                raise RuntimeError(say_result.stderr.strip() or "macOS say failed to generate audio.")

            convert_result = subprocess.run(
                ["afconvert", "-f", "WAVE", "-d", "LEI16", str(tmp_aiff_path), str(tmp_wav_path)],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if convert_result.returncode != 0 or not tmp_wav_path.exists() or tmp_wav_path.stat().st_size <= 44:
                raise RuntimeError(convert_result.stderr.strip() or "afconvert failed to create WAV audio.")

            os.replace(tmp_wav_path, out_path)
            return out_path
        finally:
            tmp_aiff_path.unlink(missing_ok=True)
            tmp_wav_path.unlink(missing_ok=True)

    def _run_piper(self, text: str, model_path: Path, out_path: Path) -> Path:
        piper_binary = shutil.which("piper")
        if piper_binary:
            commands = (
                [piper_binary, "--model", str(model_path), "--output_file", str(out_path)],
                [piper_binary, "--model", str(model_path), "--output-file", str(out_path)],
            )
            errors = []
            for command in commands:
                result = subprocess.run(command, input=text, capture_output=True, text=True)
                if result.returncode == 0 and out_path.exists():
                    return out_path
                errors.append(result.stderr.strip() or result.stdout.strip())
            raise RuntimeError(f"Piper CLI failed: {' | '.join(filter(None, errors))}")

        try:
            from piper.voice import PiperVoice

            voice = PiperVoice.load(str(model_path))
            with wave.open(str(out_path), "wb") as wav_file:
                voice.synthesize_wav(text, wav_file)
            return out_path
        except Exception as exc:
            python_error = str(exc)

        raise RuntimeError(
            "No working Piper runtime is available. Install the Piper CLI or the piper-tts Python package. "
            f"Python runtime error: {python_error}"
        )


manager = VoiceManager()


def get_manager() -> VoiceManager:
    return manager


def cleanup_audio_cache(max_age_days: int) -> int:
    """Remove expired generated audio safely during application startup."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, max_age_days))
    removed = 0
    for candidate in CACHE_DIR.glob("*.wav"):
        try:
            if datetime.fromtimestamp(candidate.stat().st_mtime, timezone.utc) < cutoff:
                candidate.unlink(missing_ok=True)
                removed += 1
        except OSError:
            continue
    return removed
