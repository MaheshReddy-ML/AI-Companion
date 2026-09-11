"""Regressions for conversation assembly and selective personal context."""
from datetime import datetime, timedelta, timezone
import pytest
from app.companion import build_memory_context
from app.services.companion_chat import _build_messages, _clean_reply
from app.user_context import build_user_context


@pytest.mark.parametrize('message', [
    'Hey, taking a break.', "You're really cute.", 'What is the capital of Japan?',
    'What is Emora?', 'Who created this website?', 'What am I studying?',
    'The uncertainty bothers me more than the workload.', 'Explain the memory architecture.',
    'Anyway, why is the sky blue?', 'Thanks. Good night.',
])
def test_latest_turn_and_history_survive_prompt_assembly(message):
    history = [{'role': 'user', 'content': 'I am worried about exams.'},
               {'role': 'assistant', 'content': 'Which exam?'}]
    messages = _build_messages(history, message, None, 'rose', build_user_context({'name': 'Alex'}))
    assert messages[1:-1] == history
    assert messages[-1] == {'role': 'user', 'content': message}
    assert 'Selected character: Vivi' in messages[0]['content']
    assert 'Mahesh Reddy, Sanjay, Harish, and Sindhu' in messages[0]['content']
    assert '7th semester' not in messages[0]['content']


def test_cleanup_does_not_append_question_or_damage_technical_layout():
    assert _clean_reply('Okay, I’ll take that compliment.') == 'Okay, I’ll take that compliment.'
    assert 'mind?' not in _clean_reply('Want to grab a coffee or have a chat?')


def test_unrelated_memories_and_expired_facts_are_excluded():
    memories = [
        {'key': 'education', 'value': 'B.Tech, 7th semester', 'importance': 0.8},
        {'key': 'career', 'value': 'AI/ML engineering and research', 'importance': 0.8},
        {'key': 'deadline', 'value': 'research internship tomorrow', 'expires_at': datetime.now(timezone.utc)-timedelta(days=1)},
    ]
    assert build_memory_context(memories, "You're cute!") == []
    assert [m['key'] for m in build_memory_context(memories, 'What am I studying?')] == ['education']
    assert [m['key'] for m in build_memory_context(memories, "What am I trying to become?")] == ['career']
    assert len(build_memory_context(memories, 'What do you remember about me?')) == 2


def test_profile_is_not_inferred_from_display_name():
    for name in ['Mahesh Reddy', 'Alex']:
        context = build_user_context({'name': name})
        assert 'May 2027' not in context
        assert '7th semester' not in context


@pytest.mark.parametrize('tail', ["What’s on your mind?", "How can I help you today?", "Tell me more."])
def test_stock_tail_is_removed_in_text_and_stream(tail):
    assert _clean_reply('Tokyo is the capital of Japan. ' + tail) == 'Tokyo is the capital of Japan.'
    assert _clean_reply(tail, has_prior_sentence=True) == ''
    assert _clean_reply(tail) == tail  # A standalone question is not an appended default.


def test_contextual_questions_and_code_are_preserved():
    text = 'Research seems to fit your interests. What part of research attracts you?'
    assert _clean_reply(text) == text
    code = 'Try this:\n\n```python\nif ready:\n    run()\n```'
    assert _clean_reply(code) == code
    quoted = 'Avoid saying “What’s on your mind?” as a default.'
    assert _clean_reply(quoted) == quoted


@pytest.mark.parametrize('message', [
    'so, I wanna know who built this website ?',
    'Who created this website?', 'Who developed Emora?',
    'Who are the developers behind this app?', 'Who made you?',
])
def test_project_team_answers_use_supplied_names(message):
    from app.project_context import authoritative_project_reply
    assert authoritative_project_reply(message) == 'Emora is built by Mahesh Reddy, Sanjay, Harish, and Sindhu.'


@pytest.mark.parametrize('message', [
    'who is the lead developer for this ?',
    'Who is the team lead for Emora?',
    'Who is the technical lead behind this website?',
])
def test_lead_question_uses_confirmed_roles(message):
    from app.project_context import authoritative_project_reply
    reply = authoritative_project_reply(message)
    assert 'Mahesh Reddy' in reply
    assert 'technical direction' in reply
    assert 'lead developer and team lead' in reply
    from app.project_context import PROJECT_CONTEXT
    assert 'lead developer and team lead' in PROJECT_CONTEXT


@pytest.mark.parametrize('message', [
    'Who built Wikipedia?', 'Who is the lead developer for Linux?',
    'How was this website built?', 'Who built this website and how does memory work?',
    'I built this website.',
])
def test_project_identity_does_not_hijack_other_requests(message):
    from app.project_context import authoritative_project_reply
    assert authoritative_project_reply(message) is None
