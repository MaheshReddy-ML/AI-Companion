from copy import deepcopy
from types import SimpleNamespace
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError
import pytest

from app.companion_identity import MeetingUpdate, companion_name, personalization_context
from app.routers import api_auth, product_operations as product
from app.database import serialize_user
from app.user_context import build_user_context


class Users:
    def __init__(self):
        self.items = []

    def find_one(self, query):
        for item in self.items:
            if all(item.get(key) == value for key, value in query.items()):
                return deepcopy(item)
        return None

    def insert_one(self, doc):
        doc = deepcopy(doc)
        doc['_id'] = ObjectId()
        self.items.append(doc)
        return SimpleNamespace(inserted_id=doc['_id'])

    def update_one(self, query, update, **kwargs):
        for item in self.items:
            if item['_id'] != query.get('_id'):
                continue
            expected = query.get('companion_profile.version')
            current = item.get('companion_profile', {}).get('version')
            if expected is not None and (current is not None if isinstance(expected, dict) else current != expected):
                continue
            for key, value in update['$set'].items():
                if key.startswith('companion_profile.'):
                    item.setdefault('companion_profile', {})[key.split('.', 1)[1]] = value
                else:
                    item[key] = value
            return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)


def test_new_google_identity_requires_meeting_but_existing_account_is_not_reenrolled(monkeypatch):
    monkeypatch.setattr(api_auth, 'create_access_token', lambda *args: 'test-token')
    users = Users()
    monkeypatch.setattr(api_auth, 'users_collection', lambda: users)
    new = api_auth.upsert_google_user({'email':'new@example.com','name':'Account Name','sub':'google-one','picture':'https://example.com/photo.png'})
    assert serialize_user(new)['onboardingRequired'] is True
    assert api_auth.build_auth_payload(new)['nextPath'] == '/onboarding'
    existing = {'name':'Existing','email':'old@example.com','auth_provider':'local'}
    users.insert_one(existing)
    returning = api_auth.upsert_google_user({'email':'old@example.com','name':'Google Name','sub':'google-two'})
    assert returning['name'] == 'Existing'
    assert serialize_user(returning)['onboardingRequired'] is False


def test_meeting_saves_separate_identity_resumes_and_completes(monkeypatch):
    import app.database as database
    monkeypatch.setattr(api_auth, 'create_access_token', lambda *args: 'test-token')
    users = Users()
    uid = users.insert_one({'name':'Mahesh Reddy','email':'test@example.com','onboarding_required':True}).inserted_id
    monkeypatch.setattr(database, 'users_collection', lambda: users)
    monkeypatch.setattr(product, 'feature_collection', lambda name: SimpleNamespace(update_one=lambda *a, **k: None))
    monkeypatch.setattr(product, 'get_user_preferences', lambda uid: {})
    result = product.save_meeting(MeetingUpdate(preferredName='Mahi',supportStyle='listen',conversationStyles=['thoughtful'],personality=['calm','curious'],focusAreas=['learning'],step=4,expectedVersion=0), users.find_one({'_id':uid}))
    assert result['profile']['step'] == 4 and result['required'] is True
    saved = users.find_one({'_id':uid})
    assert saved['name'] == 'Mahesh Reddy'
    assert companion_name(saved) == 'Mahi'
    assert serialize_user(saved)['preferredName'] == 'Mahi'
    context = build_user_context(saved)
    assert 'Mahi' in context and 'listen and acknowledge before suggesting solutions' in context
    assert 'learning' in personalization_context(saved)
    with pytest.raises(HTTPException) as stale:
        product.save_meeting(MeetingUpdate(preferredName='Stale',expectedVersion=0), saved)
    assert stale.value.status_code == 409
    result = product.save_meeting(MeetingUpdate(complete=True,step=7,expectedVersion=1),saved)
    assert result['profile']['completed'] is True and result['required'] is False
    assert api_auth.build_auth_payload(users.find_one({'_id':uid}))['nextPath'] == '/dashboard'


def test_meeting_rejects_empty_names_unknown_choices_and_excess_selection():
    for changes in ({'preferredName':'   '},{'conversationStyles':['unknown']},{'personality':['calm','curious','gentle','playful']},{'timezone':'Not/A/Timezone'}):
        with pytest.raises(ValidationError):
            MeetingUpdate(expectedVersion=0,**changes)


def test_support_style_sets_a_real_default_conversation_mode():
    from app.companion_identity import default_companion_mode
    assert default_companion_mode({'companion_profile':{'supportStyle':'solve'}}) == 'plan'
    assert default_companion_mode({'companion_profile':{'supportStyle':'listen'}}) == 'listen'
    assert default_companion_mode({'companion_profile':{'supportStyle':'space'}}) == 'quiet'


def test_google_credential_and_callback_routes_choose_meeting_for_new_users(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    users = Users()
    monkeypatch.setattr(api_auth, 'users_collection', lambda: users)
    monkeypatch.setattr(api_auth, 'create_access_token', lambda *args: 'test-token')
    monkeypatch.setattr(api_auth, 'audit_event', lambda *args, **kwargs: None)
    claims = {'email':'google-flow@example.com','name':'Google Account','sub':'verified-google-id'}
    monkeypatch.setattr(api_auth, 'verify_google_id_token_value', lambda token: claims)

    async def exchange(code):
        return claims
    monkeypatch.setattr(api_auth, 'exchange_authorization_code', exchange)
    client = TestClient(app)
    response = client.post('/api/auth/google', json={'token':'provider-verified-fixture'})
    assert response.status_code == 200
    assert response.json()['nextPath'] == '/onboarding'
    callback = client.get('/api/auth/google/callback?code=test-code', follow_redirects=False)
    assert callback.status_code in (302, 307)
    assert callback.headers['location'].startswith('/onboarding?')
    user = users.find_one({'email':claims['email']})
    users.update_one({'_id':user['_id']}, {'$set':{'companion_profile.completed':True,'onboarding_required':False}})
    returning = client.post('/api/auth/google', json={'token':'provider-verified-fixture'})
    assert returning.json()['nextPath'] == '/dashboard'


def test_local_registration_login_resumes_meeting_and_completed_user_skips(monkeypatch):
    from app.models.schemas.auth import RegisterRequest, LoginRequest
    users = Users()
    monkeypatch.setattr(api_auth, 'users_collection', lambda: users)
    monkeypatch.setattr(api_auth, 'create_access_token', lambda *args: 'test-token')
    monkeypatch.setattr(api_auth, 'audit_event', lambda *args, **kwargs: None)
    registration = api_auth.register_user(RegisterRequest(name='Account Name', email='local-meeting@example.com', password='Meeting-Test-963!'))
    assert registration['user']['onboardingRequired'] is True
    assert registration['nextPath'] == '/onboarding'
    credentials = LoginRequest(email='local-meeting@example.com', password='Meeting-Test-963!')
    assert api_auth.login_user(credentials)['nextPath'] == '/onboarding'
    user = users.find_one({'email': credentials.email})
    users.update_one({'_id': user['_id']}, {'$set': {'companion_profile.step': 4}})
    assert api_auth.login_user(credentials)['nextPath'] == '/onboarding'
    users.update_one({'_id': user['_id']}, {'$set': {'companion_profile.completed': True, 'onboarding_required': False}})
    assert api_auth.login_user(credentials)['nextPath'] == '/dashboard'
