from __future__ import annotations

from bson import ObjectId

from app.database import utc_now
from app.models.schemas import PostCreateRequest, PostUpdateRequest
from app.services import posts as post_service


class FakeDeleteResult:
    def __init__(self, deleted_count: int):
        self.deleted_count = deleted_count


class FakeInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class FakePostsCollection:
    def __init__(self):
        self.documents = []

    def insert_one(self, document):
        document = document.copy()
        inserted_id = ObjectId()
        document["_id"] = inserted_id
        self.documents.append(document)
        return FakeInsertResult(inserted_id)

    def count_documents(self, query):
        return len([document for document in self.documents if self._matches(document, query)])

    def find(self, query):
        return FakeCursor([document for document in self.documents if self._matches(document, query)])

    def find_one_and_update(self, query, update, return_document=None):
        for document in self.documents:
            if self._matches(document, query):
                for key, value in update.get("$set", {}).items():
                    document[key] = value
                for key, value in update.get("$inc", {}).items():
                    document[key] = document.get(key, 0) + value
                for key, value in update.get("$addToSet", {}).items():
                    values = document.setdefault(key, [])
                    if value not in values:
                        values.append(value)
                return document
        return None

    def delete_one(self, query):
        before = len(self.documents)
        self.documents = [document for document in self.documents if not self._matches(document, query)]
        return FakeDeleteResult(before - len(self.documents))

    def _matches(self, document, query):
        for key, value in query.items():
            if key == "$or":
                if not any(self._matches(document, item) for item in value):
                    return False
                continue
            if isinstance(value, dict) and "$ne" in value:
                if document.get(key) == value["$ne"] or value["$ne"] in document.get(key, []):
                    return False
                continue
            if document.get(key) != value:
                return False
        return True


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, direction):
        self.documents.sort(key=lambda document: document.get(key), reverse=direction < 0)
        return self

    def skip(self, count):
        self.documents = self.documents[count:]
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    def __iter__(self):
        return iter(self.documents)


class FakeUsersCollection:
    def update_one(self, query, update):
        return None


def test_post_owner_can_create_update_delete_with_mocked_collections(monkeypatch):
    posts = FakePostsCollection()
    monkeypatch.setattr(post_service, "posts_collection", lambda: posts)
    monkeypatch.setattr(post_service, "users_collection", lambda: FakeUsersCollection())

    user = {"_id": ObjectId(), "anonymous_id": "60414bfb-cb8f-4ef8-8866-c646b3dc1998"}
    created = post_service.create_post(PostCreateRequest(content="first post"), user)

    assert created["owned_by_current_user"] is True
    assert post_service.list_posts(user)["total"] == 1

    updated = post_service.update_post(created["_id"], PostUpdateRequest(content="edited post"), user)
    assert updated["content"] == "edited post"

    post_service.delete_post(created["_id"], user)
    assert post_service.list_posts(user)["total"] == 0


def test_user_can_relate_to_a_post_only_once(monkeypatch):
    posts = FakePostsCollection()
    monkeypatch.setattr(post_service, "posts_collection", lambda: posts)
    monkeypatch.setattr(post_service, "users_collection", lambda: FakeUsersCollection())

    owner = {"_id": ObjectId(), "anonymous_id": "60414bfb-cb8f-4ef8-8866-c646b3dc1998"}
    reader = {"_id": ObjectId(), "anonymous_id": "0ec96a99-ca8a-4f0a-ae2c-24b6311d6f10"}
    created = post_service.create_post(PostCreateRequest(content="A post"), owner)

    liked = post_service.like_post(created["_id"], reader)
    assert liked["likes"] == 1
    assert liked["liked_by_current_user"] is True

    try:
        post_service.like_post(created["_id"], reader)
    except LookupError:
        pass
    else:
        raise AssertionError("a user should not be able to relate to the same post twice")


def test_feed_shows_visible_posts_from_other_users_and_legacy_posts(monkeypatch):
    posts = FakePostsCollection()
    monkeypatch.setattr(post_service, "posts_collection", lambda: posts)
    monkeypatch.setattr(post_service, "users_collection", lambda: FakeUsersCollection())

    owner = {"_id": ObjectId(), "anonymous_id": "60414bfb-cb8f-4ef8-8866-c646b3dc1998"}
    reader = {"_id": ObjectId(), "anonymous_id": "0ec96a99-ca8a-4f0a-ae2c-24b6311d6f10"}
    post_service.create_post(PostCreateRequest(content="A current shared post"), owner)
    posts.documents.append(
        {
            "_id": ObjectId(),
            "content": "A legacy shared post",
            "anonymous_id": "cf386383-2e07-435b-b286-34651c63a33e",
            "created_at": utc_now(),
            "updated_at": None,
            "likes": 0,
            "liked_by": [],
        }
    )
    posts.documents.append(
        {
            "_id": ObjectId(),
            "content": "A post awaiting review",
            "anonymous_id": "797d0e98-3f83-4236-b423-524506786923",
            "created_at": utc_now(),
            "updated_at": None,
            "likes": 0,
            "liked_by": [],
            "moderation_status": "needs_review",
        }
    )

    feed = post_service.list_posts(reader)

    assert feed["total"] == 2
    assert {post["content"] for post in feed["posts"]} == {
        "A current shared post",
        "A legacy shared post",
    }
    assert all(post["owned_by_current_user"] is False for post in feed["posts"])
    assert all(post["moderation_status"] == "visible" for post in feed["posts"])
