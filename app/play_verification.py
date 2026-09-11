"""Server-owned completion requirements; validates participation, not real-world truth."""
from datetime import timedelta
import re
from fastapi import HTTPException
from pydantic import BaseModel, Field
from app.database import as_utc

PROMPTS = {
    'one-quiet-minute': ['After your quiet minute, what did you notice?'],
    'carrying-thought': ['What is one thought you would like to set down?'],
    'gratitude-hunt': ['One thing that made today easier', 'A second, different support', 'A third, different support'],
    'focus-sprint': ['What small part did you work on during these ten minutes?'],
    'build-challenge': ['What did you make or change? Describe the visible step.'],
    'gentle-reach-out': ['What kind of connection would feel helpful? No names needed.'],
    'playful-detail': ['What color, sound, shape, or small surprise did you notice?'],
    'deeper-pattern': ['What pattern have you noticed repeating?'],
    'shape-the-next-step': ['What is one small next step you could choose?'],
}
TIMED_SECONDS = {'one-quiet-minute': 60, 'focus-sprint': 600}

class QuestCompletion(BaseModel):
    responses: list[str] = Field(min_length=1, max_length=3)


def requirements(quest_id: str, stored: dict | None = None) -> dict:
    started = (stored or {}).get('started_at')
    seconds = TIMED_SECONDS.get(quest_id, 0)
    return {'prompts': PROMPTS[quest_id], 'minimumSeconds': seconds,
            'eligibleAt': (as_utc(started) + timedelta(seconds=seconds)).isoformat() if started else None}


def validate_completion(quest_id: str, stored: dict, payload: QuestCompletion, now) -> dict:
    if not stored.get('started_at'):
        raise HTTPException(409, 'Begin this mission before completing it.')
    elapsed = max(0, int((as_utc(now) - as_utc(stored['started_at'])).total_seconds()))
    minimum = TIMED_SECONDS.get(quest_id, 0)
    if elapsed < minimum:
        raise HTTPException(409, f'Take the remaining {minimum - elapsed} seconds, then share what you noticed.')
    if len(payload.responses) != len(PROMPTS[quest_id]):
        raise HTTPException(422, f'Add {len(PROMPTS[quest_id])} separate responses for this mission.')
    normalized = []
    for response in payload.responses:
        text = ' '.join(response.split())
        letters = ''.join(c.casefold() for c in text if c.isalnum())
        if len(text) > 600 or len(letters) < 6 or len(set(letters)) < 4:
            raise HTTPException(422, 'Add a short, specific response to each prompt (6–600 characters).')
        normalized.append(re.sub(r'[^\w]', '', text.casefold()))
    if len(set(normalized)) != len(normalized):
        raise HTTPException(422, 'Name three different supports, rather than repeating the same one.')
    # Do not store private reflection text or send it to an inference provider.
    return {'version': 1, 'method': 'guided_response', 'response_count': len(normalized), 'elapsed_seconds': elapsed}
