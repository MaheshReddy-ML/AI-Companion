"""Pronunciation-first text preparation for the local TTS engines.

The neural models receive natural language rather than opaque identifiers.  This
module expands the forms that are routinely pronounced badly by a general TTS
model and keeps an editable, project-local pronunciation dictionary.
"""
from __future__ import annotations

import calendar
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DICTIONARY_PATH = BASE_DIR / "models" / "voices" / "pronunciations.json"

ABBREVIATIONS = {
    "Dr.": "Doctor",
    "Mr.": "Mister",
    "Mrs.": "Missus",
    "Ms.": "Miss",
    "Prof.": "Professor",
    "e.g.": "for example",
    "i.e.": "that is",
    "etc.": "et cetera",
    "vs.": "versus",
    "approx.": "approximately",
    "dept.": "department",
    "min.": "minutes",
    "sec.": "seconds",
}

TECHNICAL_WORDS = {
    "AI": "A I",
    "API": "A P I",
    "GPT": "G P T",
    "LLM": "large language model",
    "RAG": "R A G",
    "MLX": "M L X",
    "MPS": "M P S",
    "GPU": "G P U",
    "CPU": "C P U",
    "RAM": "R A M",
    "macOS": "mac O S",
    "FastAPI": "Fast A P I",
    "PyTorch": "pie torch",
    "NumPy": "num pie",
    "Kokoro": "koh koh roh",
    "Qwen": "chwen",
    "Qwen3": "chwen three",
}

MONTHS = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}


@dataclass(frozen=True)
class PreparedSpeech:
    """The engine-ready spoken text and diagnostic G2P substitutions used."""

    text: str
    g2p_substitutions: tuple[tuple[str, str], ...]


class PronunciationPreprocessor:
    """Expand writing into speech and apply a user-editable pronunciation lexicon.

    The custom dictionary supports either ``{"term": "spoken form"}`` or
    ``{"term": {"spoken": "...", "phonemes": "..."}}``.  Phonemes are
    kept as a diagnostic/audit value: Qwen3-TTS consumes natural-language text,
    while Kokoro's own Misaki G2P consumes the normalized graphemes.
    """

    def __init__(self, dictionary_path: Path | None = None):
        self.dictionary_path = Path(dictionary_path or DEFAULT_DICTIONARY_PATH)

    def prepare(self, text: str) -> PreparedSpeech:
        value = " ".join(str(text or "").split())
        if not value:
            return PreparedSpeech("", ())
        value = self._expand_abbreviations(value)
        value = self._expand_dates(value)
        value = self._expand_currencies(value)
        value = self._expand_numbers(value)
        value, substitutions = self._apply_dictionary(value)
        value = self._expand_acronyms(value)
        value = re.sub(r"\s+([,.;:!?])", r"\1", value)
        value = re.sub(r"\s+", " ", value).strip()
        return PreparedSpeech(value, tuple(substitutions))

    def _expand_abbreviations(self, text: str) -> str:
        for source, spoken in ABBREVIATIONS.items():
            text = re.sub(re.escape(source), spoken, text, flags=re.IGNORECASE)
        return text

    def _expand_dates(self, text: str) -> str:
        def iso_date(match: re.Match[str]) -> str:
            try:
                parsed = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            except ValueError:
                return match.group(0)
            return f"{calendar.month_name[parsed.month]} {self._ordinal(parsed.day)}, {self._integer_words(parsed.year)}"

        text = re.sub(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", iso_date, text)

        def written_date(match: re.Match[str]) -> str:
            month = MONTHS.get(match.group(1).lower())
            if not month:
                return match.group(0)
            return f"{calendar.month_name[month]} {self._ordinal(int(match.group(2)))}, {self._integer_words(int(match.group(3)))}"

        return re.sub(r"\b(" + "|".join(calendar.month_name[1:]) + r")\s+(\d{1,2}),\s*(\d{4})\b", written_date, text, flags=re.IGNORECASE)

    def _expand_currencies(self, text: str) -> str:
        symbols = {"$": ("dollar", "cent"), "€": ("euro", "cent"), "£": ("pound", "pence"), "₹": ("rupee", "paise")}

        def currency(match: re.Match[str]) -> str:
            major_name, minor_name = symbols[match.group(1)]
            major = match.group(2).replace(",", "")
            decimals = match.group(3) or ""
            spoken = f"{self._integer_words(int(major))} {major_name}{'' if int(major) == 1 else 's'}"
            if decimals:
                minor = int((decimals + "00")[:2])
                if minor:
                    spoken += f" and {self._integer_words(minor)} {minor_name}{'' if minor == 1 else 's'}"
            return spoken

        return re.sub(r"([$€£₹])(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?", currency, text)

    def _expand_numbers(self, text: str) -> str:
        def number(match: re.Match[str]) -> str:
            raw = match.group(0)
            if "." in raw:
                whole, fraction = raw.split(".", 1)
                return f"{self._integer_words(int(whole))} point {' '.join(self._integer_words(int(digit)) for digit in fraction)}"
            return self._integer_words(int(raw))

        return re.sub(r"(?<![\w-])\d+(?:\.\d+)?(?![\w-])", number, text)

    def _apply_dictionary(self, text: str) -> tuple[str, list[tuple[str, str]]]:
        entries = dict(TECHNICAL_WORDS)
        phonemes: dict[str, str] = {}
        try:
            raw: Any = json.loads(self.dictionary_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for term, definition in raw.items():
                    if isinstance(definition, str):
                        entries[term] = definition
                    elif isinstance(definition, dict) and isinstance(definition.get("spoken"), str):
                        entries[term] = definition["spoken"]
                        if isinstance(definition.get("phonemes"), str):
                            phonemes[term] = definition["phonemes"]
        except (OSError, ValueError, TypeError):
            pass

        substitutions: list[tuple[str, str]] = []
        for source in sorted(entries, key=len, reverse=True):
            spoken = entries[source]
            pattern = re.compile(rf"(?<!\w){re.escape(source)}(?!\w)", re.IGNORECASE)
            if pattern.search(text):
                substitutions.append((source, phonemes.get(source, spoken)))
                text = pattern.sub(spoken, text)
        return text, substitutions

    def _expand_acronyms(self, text: str) -> str:
        # Grapheme-to-phoneme preprocessing for unknown acronyms: each grapheme
        # becomes its spoken letter name rather than an unreliable invented word.
        return re.sub(r"\b(?:[A-Z]{2,}[0-9]*)\b", lambda match: " ".join(match.group(0)), text)

    def _ordinal(self, value: int) -> str:
        suffix = "th" if 10 <= value % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
        return self._integer_words(value) + suffix

    def _integer_words(self, value: int) -> str:
        if value < 0:
            return "minus " + self._integer_words(-value)
        small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
        tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
        if value < 20:
            return small[value]
        if value < 100:
            return tens[value // 10] + ("-" + small[value % 10] if value % 10 else "")
        if value < 1_000:
            return small[value // 100] + " hundred" + (" " + self._integer_words(value % 100) if value % 100 else "")
        for divisor, name in ((1_000_000_000, "billion"), (1_000_000, "million"), (1_000, "thousand")):
            if value >= divisor:
                return self._integer_words(value // divisor) + f" {name}" + (" " + self._integer_words(value % divisor) if value % divisor else "")
        return str(value)


def prepare_text_for_tts(text: str, dictionary_path: Path | None = None) -> PreparedSpeech:
    return PronunciationPreprocessor(dictionary_path).prepare(text)
