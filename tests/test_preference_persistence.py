from types import SimpleNamespace

from app import preferences


def test_preference_update_has_no_conflicting_mongo_operators(monkeypatch):
    class Collection:
        document = None

        def find_one(self, query):
            return self.document

        def update_one(self, query, update, upsert):
            # MongoDB rejects a field appearing in both $inc and $setOnInsert,
            # even when updating an existing document.
            fields = [key for operation in update.values() for key in operation]
            assert len(fields) == len(set(fields))
            inserted = self.document is None
            self.document = self.document or dict(update.get('$setOnInsert', {}))
            self.document.update(update['$set'])
            self.document['version'] = self.document.get('version', 0) + update['$inc']['version']
            return SimpleNamespace(matched_count=0 if inserted else 1, upserted_id='new' if inserted else None)

    collection = Collection()
    monkeypatch.setattr(preferences, 'feature_collection', lambda name: collection)
    saved = preferences.update_user_preferences('test-user', {'emotionalMemory': False}, expected_version=1)
    assert saved['emotionalMemory'] is False
    assert preferences.get_preference_version('test-user') == 1
    saved = preferences.update_user_preferences('test-user', {'emotionalMemory': True}, expected_version=1)
    assert saved['emotionalMemory'] is True
    assert preferences.get_preference_version('test-user') == 2
