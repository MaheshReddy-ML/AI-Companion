from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any


AVATAR_PRESETS: list[dict[str, str]] = [
    {
        "id": "female-ava",
        "label": "Ava",
        "gender": "female",
        "url": "/static/images/avatars/presets/female-ava.png",
    },
    {
        "id": "female-mira",
        "label": "Mira",
        "gender": "female",
        "url": "/static/images/avatars/presets/female-mira.png",
    },
    {
        "id": "female-luna",
        "label": "Luna",
        "gender": "female",
        "url": "/static/images/avatars/presets/female-luna.png",
    },
    {
        "id": "female-noor",
        "label": "Noor",
        "gender": "female",
        "url": "/static/images/avatars/presets/female-noor.png",
    },
    {
        "id": "male-ario",
        "label": "Ario",
        "gender": "male",
        "url": "/static/images/avatars/presets/male-ario.png",
    },
    {
        "id": "male-kai",
        "label": "Kai",
        "gender": "male",
        "url": "/static/images/avatars/presets/male-kai.png",
    },
    {
        "id": "male-leo",
        "label": "Leo",
        "gender": "male",
        "url": "/static/images/avatars/presets/male-leo.png",
    },
    {
        "id": "male-omar",
        "label": "Omar",
        "gender": "male",
        "url": "/static/images/avatars/presets/male-omar.png",
    },
]

_PRESETS_BY_ID = {preset["id"]: preset for preset in AVATAR_PRESETS}


def list_avatar_presets() -> list[dict[str, str]]:
    return deepcopy(AVATAR_PRESETS)


def get_avatar_preset(preset_id: str | None) -> dict[str, str] | None:
    if not preset_id:
        return None
    return _PRESETS_BY_ID.get(preset_id)


def choose_default_avatar_preset_id(seed: str | None) -> str:
    normalized = (seed or "emora-default").strip().lower()
    digest = sha256(normalized.encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(AVATAR_PRESETS)
    return AVATAR_PRESETS[index]["id"]


def resolve_avatar_payload(document: dict[str, Any]) -> dict[str, Any]:
    avatar_source = document.get("avatar_source") or "preset"
    avatar_url = document.get("avatar_url")
    avatar_preset_id = document.get("avatar_preset_id") or choose_default_avatar_preset_id(
        document.get("email") or document.get("name") or str(document.get("_id", "emora-default"))
    )
    preset = get_avatar_preset(avatar_preset_id) or AVATAR_PRESETS[0]

    if avatar_source == "custom" and avatar_url:
        return {
            "avatarUrl": avatar_url,
            "avatarSource": "custom",
            "avatarPresetId": None,
            "avatarLabel": "Custom upload",
            "avatarGender": "custom",
        }

    return {
        "avatarUrl": preset["url"],
        "avatarSource": "preset",
        "avatarPresetId": preset["id"],
        "avatarLabel": preset["label"],
        "avatarGender": preset["gender"],
    }
