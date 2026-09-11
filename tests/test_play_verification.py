from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from app.main import app
from app.routers import play
from app.play_verification import QuestCompletion, validate_completion
from app.security import get_current_user

NOW = datetime(2026, 9, 11, 12, tzinfo=timezone.utc)

@pytest.mark.parametrize('quest_id,responses', [
    ('gratitude-hunt', ['Warm coffee']),
    ('gratitude-hunt', ['Warm coffee', 'warm coffee!', 'My friend listened']),
    ('gratitude-hunt', ['aaaaaa', 'A warm meal', 'A friend listened']),
    ('carrying-thought', [' ']),
    ('carrying-thought', ['x'*601]),
])
def test_invalid_participation_is_rejected(quest_id, responses):
    with pytest.raises(HTTPException) as error:
        validate_completion(quest_id, {'started_at': NOW}, QuestCompletion(responses=responses), NOW)
    assert error.value.status_code == 422

@pytest.mark.parametrize('quest_id,seconds', [('one-quiet-minute',60),('focus-sprint',600)])
def test_server_clock_controls_timed_missions(quest_id, seconds):
    payload=QuestCompletion(responses=['I noticed the room was quieter.'])
    with pytest.raises(HTTPException) as error:
        validate_completion(quest_id, {'started_at':NOW}, payload, NOW+timedelta(seconds=seconds-1))
    assert error.value.status_code == 409
    result=validate_completion(quest_id, {'started_at':NOW}, payload, NOW+timedelta(seconds=seconds))
    assert result['elapsed_seconds']==seconds
    assert 'responses' not in result


def test_completion_requires_server_start():
    with pytest.raises(HTTPException) as error:
        validate_completion('gratitude-hunt', {}, QuestCompletion(responses=['Warm coffee','A kind message','The bus arrived']), NOW)
    assert error.value.status_code == 409


@pytest.fixture
def mission_api(monkeypatch):
    user={'_id':ObjectId(),'email':'mission-unit@example.com'}
    document={'user_id':user['_id'],'date':NOW.date().isoformat(),'quests':[{'id':'gratitude-hunt','completed':False}]}
    events=[]
    class Quests:
        def find(self, query): return [deepcopy(document)] if query['user_id']==user['_id'] else []
        def find_one(self, query, **kwargs): return deepcopy(document) if query['user_id']==user['_id'] else None
        def find_one_and_update(self, query, update, **kwargs):
            item=document['quests'][0]
            assert query['quests']['$elemMatch']['started_at']=={'$exists':False}
            if item.get('completed') or item.get('started_at'): return None
            for key,value in update['$set'].items(): item[key.split('.')[-1]]=value
            return deepcopy(document)
        def update_one(self,query,update):
            item=document['quests'][0]
            assert query['quests']['$elemMatch']['started_at']==item['started_at']
            if item.get('completed'): return SimpleNamespace(matched_count=0)
            for key,value in update['$set'].items(): item[key.split('.')[-1]]=value
            return SimpleNamespace(matched_count=1)
    collection=Quests()
    monkeypatch.setattr(play,'utc_now',lambda:NOW)
    monkeypatch.setattr(play,'feature_collection',lambda name:SimpleNamespace(insert_one=lambda event:events.append(event)) if name=='play_events' else collection)
    app.dependency_overrides[get_current_user]=lambda:user
    try: yield TestClient(app),document,events
    finally: app.dependency_overrides.pop(get_current_user,None)


def test_api_cannot_bypass_required_work_and_completion_is_idempotent(mission_api):
    client,document,events=mission_api
    url='/api/play/quests/gratitude-hunt'
    evidence={'responses':['Warm coffee','A kind message','The bus arrived']}
    assert client.post(url+'/complete').status_code==422
    assert client.post(url+'/complete',json=evidence).status_code==409
    first=client.post(url+'/start').json()
    resumed=client.post(url+'/start').json()
    assert first['startedAt']==resumed['startedAt']
    assert len(events)==1
    assert client.post(url+'/complete',json={'responses':['Warm coffee']}).status_code==422
    assert document['quests'][0]['completed'] is False
    assert client.post(url+'/complete',json=evidence).status_code==200
    saved=document['quests'][0]
    assert saved['completed'] and saved['verification']['response_count']==3
    assert all(value not in str(saved) for value in evidence['responses'])
    event_count=len(events)
    assert client.post(url+'/complete',json=evidence).json()['events']==[]
    assert len(events)==event_count
    assert client.post(url+'/start').json()['state']=='COMPLETED'
