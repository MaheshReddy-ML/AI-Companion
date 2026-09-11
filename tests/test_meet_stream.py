import asyncio
from types import SimpleNamespace

import pytest

from app.models.schemas import ChatSendRequest
from app.routers import api_chat
from app.services.meet_stream import MeetStream, PublicSentences, current_meet_stream
from app.services import companion_chat


def test_private_and_structured_chunks_never_reach_sentences():
    parser = PublicSentences()
    output = []
    for char in '<think>private reasoning. Never speak this.</think>Hello there. How can I help?':
        output += parser.feed(char)
    output += parser.feed('', final=True)
    assert ' '.join(output) == 'Hello there. How can I help?'
    for raw in ['{"reply":"hello","brain":{}}', '```json\n{"reply":"hi"}', 'analysis: Private thought.']:
        parser = PublicSentences()
        assert not sum((parser.feed(char) for char in raw), [])
        assert not parser.feed('', final=True)


def test_sentence_arrives_while_generation_is_still_pending(monkeypatch):
    async def scenario():
        release = asyncio.Event()
        async def send(payload, user):
            stream = current_meet_stream.get()
            await stream.emit('sentence', text='Here is the first sentence.')
            await release.wait()
            return {'aiMessage': {'content': 'Here is the first sentence. And the second.'}}
        monkeypatch.setattr(api_chat, 'send_message', send)
        response = await api_chat.stream_message(ChatSendRequest(message='hello'), {'_id':'test'})
        body = response.body_iterator
        first = await asyncio.wait_for(anext(body), 1)
        assert 'sentence' in first and not release.is_set()
        release.set()
        assert 'complete' in await asyncio.wait_for(anext(body), 1)
        with pytest.raises(StopAsyncIteration):
            await anext(body)
    asyncio.run(scenario())


def test_disconnected_stream_cancels_the_owned_turn(monkeypatch):
    cancelled=[]
    async def send(payload, user):
        await current_meet_stream.get().emit('sentence', text='Hello from this turn.')
        await asyncio.Event().wait()
    monkeypatch.setattr(api_chat,'send_message',send)
    monkeypatch.setattr(api_chat,'cancel_chat_turn',lambda turn,user: cancelled.append(turn))
    async def scenario():
        response=await api_chat.stream_message(ChatSendRequest(message='hello',clientTurnId='turn-disconnect'),{'_id':'test'})
        await anext(response.body_iterator)
        await response.body_iterator.aclose()
    asyncio.run(scenario())
    assert cancelled == ['turn-disconnect']


def test_service_uses_stream_without_bypassing_final_reply_cleaning(monkeypatch):
    class Provider:
        def stream(self, **kwargs):
            yield '<think>secret'
            yield '</think>Leaves contain chlorophyll. '
            yield 'It absorbs light.'
    monkeypatch.setattr(companion_chat,'local_mlx_chat',Provider())
    monkeypatch.setattr(companion_chat,'should_enable_thinking',lambda _:False)
    async def scenario():
        stream=MeetStream();token=current_meet_stream.set(stream)
        try:
            result=await companion_chat.get_companion_reply('Why are leaves green?')
            items=[]
            while not stream.events.empty(): items.append(stream.events.get_nowait())
            assert [item['text'] for item in items] == ['Leaves contain chlorophyll.','It absorbs light.']
            assert 'secret' not in result[0]
        finally: current_meet_stream.reset(token)
    asyncio.run(scenario())


def test_mlx_stream_close_releases_generator_and_allows_next_turn(monkeypatch):
    import sys
    from app.services.local_mlx_chat import LocalMLXChatProvider
    closed=[]
    def stream_generate(*args, **kwargs):
        try:
            yield SimpleNamespace(text='First')
            yield SimpleNamespace(text=' second')
        finally:
            closed.append(True)
    monkeypatch.setitem(sys.modules,'mlx_lm',SimpleNamespace(stream_generate=stream_generate))
    provider=LocalMLXChatProvider()
    tokenizer=SimpleNamespace(apply_chat_template=lambda *a,**kw:'rendered')
    monkeypatch.setattr(provider,'_runtime_for',lambda _: (object(),tokenizer,None,lambda **kw:None))
    kwargs=dict(model_id='fixture',messages=[{'role':'user','content':'hello'}],max_tokens=4,temperature=.1,enable_thinking=False)
    first=provider.stream(**kwargs)
    assert next(first)=='First'
    first.close()
    assert closed == [True]
    assert list(provider.stream(**kwargs)) == ['First',' second']
    assert closed == [True,True]


def test_generic_appended_question_is_not_spoken_or_persisted(monkeypatch):
    class Provider:
        def stream(self, **kwargs):
            yield 'I’ll take the compliment. '
            yield 'What’s on your mind?'
    monkeypatch.setattr(companion_chat, 'local_mlx_chat', Provider())
    monkeypatch.setattr(companion_chat, 'should_enable_thinking', lambda _: False)
    async def scenario():
        stream = MeetStream()
        token = current_meet_stream.set(stream)
        try:
            reply, _, _ = await companion_chat.get_companion_reply("You're cute.")
            items = []
            while not stream.events.empty():
                items.append(stream.events.get_nowait()['text'])
            assert items == ['I’ll take the compliment.']
            assert reply == 'I’ll take the compliment.'
        finally:
            current_meet_stream.reset(token)
    asyncio.run(scenario())
