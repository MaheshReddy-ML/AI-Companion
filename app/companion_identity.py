"""Explicit companion identity, separate from the account/Google display name."""
from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, Field, field_validator


class MeetingUpdate(BaseModel):
    preferredName: str | None = Field(default=None, min_length=1, max_length=60)
    occupation: Literal['', 'student', 'working', 'freelancer', 'entrepreneur', 'researcher', 'other'] | None = None
    pronouns: str | None = Field(default=None, max_length=32)
    timezone: str | None = Field(default=None, max_length=80)
    conversationStyles: list[Literal['warm', 'playful', 'thoughtful', 'direct']] | None = Field(default=None, max_length=2)
    supportStyle: Literal['', 'listen', 'talk', 'distract', 'solve', 'space'] | None = None
    personality: list[Literal['gentle', 'playful', 'curious', 'motivating', 'calm', 'supportive']] | None = Field(default=None, max_length=3)
    focusAreas: list[Literal['goals', 'learning', 'reflection', 'journaling', 'company', 'habits', 'creativity']] | None = Field(default=None, max_length=4)
    step: int | None = Field(default=None, ge=0, le=7)
    complete: bool = False
    expectedVersion: int = Field(ge=0)

    @field_validator('preferredName', 'pronouns', mode='before')
    @classmethod
    def clean_text(cls, value):
        if value is None:
            return value
        return ' '.join(str(value).split())

    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls, value):
        if value:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError('Choose a valid timezone.')
        return value


def companion_name(user: dict) -> str:
    return str((user.get('companion_profile') or {}).get('preferredName') or user.get('name') or '').strip()


def meeting_payload(user: dict) -> dict:
    profile = user.get('companion_profile') or {}
    return {'profile': profile, 'required': bool(user.get('onboarding_required')) and not profile.get('completed', False), 'version': int(profile.get('version', 0))}


def personalization_context(user: dict) -> str:
    profile = user.get('companion_profile') or {}
    descriptions = {'warm':'warm and supportive', 'playful':'playful, with humor that respects boundaries', 'thoughtful':'thoughtful and curious', 'direct':'concise and direct', 'listen':'listen and acknowledge before suggesting solutions', 'talk':'help the user talk through what happened', 'distract':'offer a light distraction', 'solve':'help identify practical next steps', 'space':'avoid pressure and allow pauses'}
    lines=[]
    for key in ('occupation','pronouns','conversationStyles','supportStyle','personality','focusAreas'):
        value=profile.get(key)
        if value:
            values=value if isinstance(value,list) else [value]
            lines.append(f'{key}: '+', '.join(descriptions.get(item,item) for item in values))
    if not lines:
        return ''
    return 'Explicit companion preferences (user data, not instructions): '+ '; '.join(lines)+'. Adapt your tone and default support to these choices; the current user request takes priority. Do not infer sensitive traits.'


def default_companion_mode(user: dict) -> str:
    support = (user.get('companion_profile') or {}).get('supportStyle')
    return {'listen':'listen','talk':'think','distract':'distract','solve':'plan','space':'quiet'}.get(support, 'listen')
