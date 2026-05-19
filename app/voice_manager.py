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
from pathlib import Path
from typing import Dict, List, Optional
import threading

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
    COMPANION_VOICE_MAP = {
        "yuna": "lessac-female",
        "rose": "lessac-female",
        "robert": "ryan-male",
        "haru": "ryan-male",
        # Backward-compatible aliases for saved local browser state.
        "arin": "ryan-male",
        "liora": "lessac-female",
    }

    def __init__(self, models_dir: Optional[Path] = None, cache_dir: Optional[Path] = None):
        self.models_dir = Path(models_dir or MODELS_DIR)
        self.cache_dir = Path(cache_dir or CACHE_DIR)
        self._voices: Dict[str, VoiceMeta] = {}
        self._load_lock = threading.Lock()
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
        return [voice.as_dict() for voice in self._voices.values()]

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

    def get_voice_for_companion(self, companion_id: Optional[str] = None, companion_gender: Optional[str] = None) -> Optional[VoiceMeta]:
        self._scan_models()
        if companion_id:
            mapped = self.COMPANION_VOICE_MAP.get(self._normalize_id(companion_id))
            if mapped:
                voice = self.find_voice(mapped)
                if voice:
                    return voice

        if companion_gender:
            desired = companion_gender.lower() == "female"
            matches = [v for v in self._voices.values() if v.female == desired and v.engine == "piper"]
            if matches:
                return matches[0]

        piper_voices = [v for v in self._voices.values() if v.engine == "piper"]
        if piper_voices:
            return piper_voices[0]

        return next(iter(self._voices.values()), None)

    def generate_audio(
        self,
        text: str,
        voice_id: Optional[str] = None,
        companion_id: Optional[str] = None,
        companion_gender: Optional[str] = None,
    ) -> Path:
        speech_text = sanitize_text_for_tts(text)
        if not speech_text:
            raise RuntimeError("No speakable text remains after TTS sanitization.")

        if voice_id:
            vm = self.find_voice(voice_id)
        else:
            vm = self.get_voice_for_companion(companion_id, companion_gender)

        if not vm:
            raise RuntimeError("No local Piper voice models are available. Download voices before using /speak.")
        if vm.engine != "piper":
            raise RuntimeError(f"Voice '{vm.id}' is not a Piper voice.")

        cache_key = hashlib.sha1(f"{vm.id}:{speech_text}".encode("utf-8")).hexdigest()
        out_path = self.cache_dir / f"{cache_key}.wav"
        if out_path.exists() and out_path.stat().st_size > 44:
            return out_path

        return self._generate_with_piper(speech_text, vm, out_path)

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
