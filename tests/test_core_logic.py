from collections import Counter
from dataclasses import replace
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.database import as_utc
from app.config import settings, validate_runtime_configuration, validate_runtime_security
from app.http_security import client_ip
from app.email_templates import build_otp_verification_email
from app.otp import hash_otp, verify_otp_hash
from app.avatar_catalog import choose_default_avatar_preset_id, get_avatar_preset, list_avatar_presets
from app.companion import account_profile_prompt_context, analyze_emotion, behavior_report, build_memory_context, dashboard_from_messages, extract_memory_candidates, vision_prompt_context
from app.companion_brain import build_companion_brain, extract_reply_and_brain
from app.models.schemas import ChatSendRequest, PostCreateRequest
from app.routers.api_auth import normalize_local_redirect_path
from app.routers.api_chat import _completed_turn_response, build_adaptive_context, create_chat_title
from app.routers.insights import _build_period_reflection, _build_premium_brief, _classify, get_insights
from app.routers.play import SpaceRequest, _remix_content
from app.routers.personal import ArrivalRequest
from app.routers import play as play_router
from app import preferences
from app.services.attachments import _is_valid_payload
from app.services.posts import moderate_content
from app.services.local_mlx_vision import parse_visual_report
from app.rate_limit import _client_identity
from app.audit import audit_event
from app.metrics import clear_metrics, metrics_snapshot, observe_request
from types import SimpleNamespace


def test_production_security_settings_reject_placeholder_secrets_and_unsafe_algorithms():
    validate_runtime_security(SimpleNamespace(environment="development", secret_key="change-me", jwt_algorithm="none"))

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_runtime_security(SimpleNamespace(environment="production", secret_key="change-me", jwt_algorithm="HS256"))

    strong_secret = "a-unique-production-secret-that-is-long-enough"
    with pytest.raises(RuntimeError, match="JWT_ALGORITHM"):
        validate_runtime_security(SimpleNamespace(environment="production", secret_key=strong_secret, jwt_algorithm="none"))

    validate_runtime_security(SimpleNamespace(environment="production", secret_key=strong_secret, jwt_algorithm="HS512"))


def test_runtime_configuration_rejects_invalid_ports_and_untrusted_proxy_networks():
    with pytest.raises(RuntimeError, match="PORT"):
        validate_runtime_configuration(replace(settings, port=0))

    with pytest.raises(RuntimeError, match="TRUSTED_PROXY_CIDRS"):
        validate_runtime_configuration(
            replace(settings, trust_proxy_headers=True, trusted_proxy_cidrs="not-a-network")
        )


def test_forwarded_client_ip_is_used_only_for_a_configured_trusted_proxy(monkeypatch):
    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.9"},
        client=SimpleNamespace(host="127.0.0.1"),
    )
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_ip(request) == "127.0.0.1"

    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "127.0.0.1/32")
    assert client_ip(request) == "203.0.113.9"

    request.client.host = "198.51.100.7"
    assert client_ip(request) == "198.51.100.7"


def test_create_chat_title_handles_blank_short_and_long_text():
    assert create_chat_title("") == "New conversation"
    assert create_chat_title("  hello   there  ") == "hello there"
    assert create_chat_title("a" * 53) == f"{'a' * 52}..."


def test_local_redirect_rejects_external_or_protocol_relative_urls():
    assert normalize_local_redirect_path("/dashboard") == "/dashboard"
    assert normalize_local_redirect_path("https://example.com/dashboard") is None
    assert normalize_local_redirect_path("//example.com/dashboard") is None
    assert normalize_local_redirect_path("dashboard") is None


def test_avatar_preset_selection_is_stable_and_known():
    presets = list_avatar_presets()
    preset_id = choose_default_avatar_preset_id("person@example.com")

    assert preset_id == choose_default_avatar_preset_id("person@example.com")
    assert get_avatar_preset(preset_id) in presets


def test_post_content_is_trimmed_and_empty_content_is_rejected():
    request = PostCreateRequest(content="  hello community  ")
    assert request.content == "hello community"

    try:
        PostCreateRequest(content="   ")
    except ValidationError:
        pass
    else:
        raise AssertionError("blank post content should fail validation")


def test_chat_history_uses_independent_default_lists():
    first = ChatSendRequest(message="one")
    second = ChatSendRequest(message="two")

    first.history.append({"role": "user", "content": "saved"})

    assert second.history == []


def test_chat_request_rejects_oversized_message():
    try:
        ChatSendRequest(message="a" * 12_001)
    except ValidationError:
        pass
    else:
        raise AssertionError("oversized chat messages should fail validation")


def test_chat_request_has_an_explicit_camera_opt_in_contract():
    request = ChatSendRequest(message="hello", cameraOptIn=True, cameraFrame="data:image/jpeg;base64,AAAA")
    assert request.camera_opt_in is True
    assert request.camera_frame.startswith("data:image/")


def test_chat_request_has_a_stable_validated_client_turn_id():
    supplied = ChatSendRequest(message="hello", clientTurnId="turn-browser-123")
    generated = ChatSendRequest(message="hello")

    assert supplied.client_turn_id == "turn-browser-123"
    assert generated.client_turn_id.startswith("turn-")
    with pytest.raises(ValidationError):
        ChatSendRequest(message="hello", clientTurnId="contains spaces")


def test_completed_chat_turn_can_be_replayed_without_regeneration():
    timestamp = datetime(2026, 8, 25, tzinfo=timezone.utc)
    conversation = {
        "_id": "conversation-1",
        "title": "Hello",
        "version": 3,
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [
            {"id": "user-1", "role": "user", "content": "Hello", "client_turn_id": "turn-1", "state": "complete", "timestamp": timestamp},
            {"id": "assistant-1", "role": "assistant", "content": "Hi", "in_reply_to": "turn-1", "brain": {"schemaVersion": "companion-brain.v1"}, "generation_model": "test-model", "timestamp": timestamp},
        ],
    }

    response = _completed_turn_response(conversation, "turn-1")

    assert response["replayed"] is True
    assert response["model"] == "test-model"
    assert response["userMessage"]["clientTurnId"] == "turn-1"
    assert response["aiMessage"]["inReplyTo"] == "turn-1"


def test_companion_mode_is_allowlisted_and_serialized_from_client_alias():
    request = ChatSendRequest(message="hello", companionMode="reflect")
    assert request.companion_mode == "reflect"

    with pytest.raises(ValidationError):
        ChatSendRequest(message="hello", companionMode="ignore-all-instructions")

    assert ChatSendRequest(message="hello", companionMode="deep").companion_mode == "deep"


def test_account_preferences_have_defaults_and_persist_changes(monkeypatch):
    stored = {}

    class PreferenceCollection:
        def find_one(self, query):
            return stored.get(query["user_id"])

        def update_one(self, query, update, upsert=False):
            stored[query["user_id"]] = {**stored.get(query["user_id"], {}), **update["$setOnInsert"], **update["$set"]}

    monkeypatch.setattr(preferences, "feature_collection", lambda _: PreferenceCollection())
    user_id = "person-1"

    assert preferences.get_user_preferences(user_id)["visualInput"] is False
    updated = preferences.update_user_preferences(user_id, {"visualInput": True, "quietHours": True})
    assert updated["visualInput"] is True
    assert updated["quietHours"] is True
    assert updated["emotionalMemory"] is True
    assert preferences.get_user_preferences(user_id)["adaptiveContext"] is False


def test_adaptive_context_uses_only_supplied_factual_sources():
    context = build_adaptive_context(
        [{"title": "Finish the project"}, {"title": " "}],
        {"mood": "tired", "tiny_thing": "Open the notes"},
    )

    assert "Finish the project" in context
    assert "tired" in context
    assert "Open the notes" in context
    assert "journal" not in context.lower()
    assert build_adaptive_context([], None) == ""


def test_authenticated_rate_limits_are_isolated_from_shared_ip_addresses():
    first = SimpleNamespace(headers={"authorization": "Bearer account-one"}, client=SimpleNamespace(host="10.0.0.5"))
    second = SimpleNamespace(headers={"authorization": "Bearer account-two"}, client=SimpleNamespace(host="10.0.0.5"))

    assert _client_identity(first) != _client_identity(second)
    assert "account-one" not in _client_identity(first)


def test_privacy_safe_metrics_use_only_normalized_operational_labels():
    clear_metrics()
    observe_request("GET", "/api/chat/conversations/{conversation_id}", 200, 12.5)
    observe_request("GET", "/api/chat/conversations/{conversation_id}", 200, 7.5)

    snapshot = metrics_snapshot()

    assert snapshot["http"] == [{"method": "GET", "route": "/api/chat/conversations/{conversation_id}", "status": 200, "count": 2, "averageMs": 10.0, "maxMs": 12.5}]
    assert "prompt" in snapshot["privacy"].lower()


def test_audit_events_hash_email_addresses(caplog):
    with caplog.at_level("INFO", logger="app.audit"):
        audit_event("auth.test", email="private@example.com", user_id="user-1")

    assert "private@example.com" not in caplog.text
    assert "sha256:" in caplog.text
    assert '"user_id": "user-1"' in caplog.text


def test_extract_reply_and_brain_accepts_plain_text_and_json():
    plain_reply, plain_brain = extract_reply_and_brain("hello")
    assert plain_reply == "hello"
    assert plain_brain == {}

    reply, brain = extract_reply_and_brain('{"reply":"Hi","brain":{"attentionState":"curious"}}')
    assert reply == "Hi"
    assert brain["attentionState"] == "curious"


def test_companion_brain_keeps_model_metadata_within_safe_animation_ranges():
    brain = build_companion_brain(
        reply="That is wonderful news! You earned this.",
        raw_brain={"behavior": {"gestureIntensity": 99, "headTilt": -99}},
        message="I finally passed my exam!",
        history=[],
        character_name="Yuna",
    )

    assert brain["schemaVersion"] == "companion-brain.v1"
    assert brain["behavior"]["gestureIntensity"] == 1.0
    assert brain["behavior"]["headTilt"] == -1.0
    assert brain["behavior"]["gesture"] == "celebration"
    assert brain["emotion"]["primary"] in {"happy", "excited"}
    assert 0 <= brain["emotion"]["arousal"] <= 1
    assert brain["behavior"]["attentionState"] in {"idle", "listening", "thinking", "responding", "curious", "reflecting", "excited"}


def test_companion_brain_uses_only_allowlisted_gesture_intents():
    brain = build_companion_brain(
        reply="I can help you work through it.",
        raw_brain={"behavior": {"gesture": "arbitrary_function_call"}},
        message="I don't understand this.",
        history=[],
        character_name="Yuna",
    )

    assert brain["behavior"]["gesture"] == "confusion"


def test_companion_brain_behavior_scenarios_are_contextual():
    cases = [
        ("I finally passed my exam!", "That is wonderful news!", {"celebration"}),
        ("I don't understand this.", "Let us work through it step by step.", {"confusion"}),
        ("Explain backpropagation.", "Backpropagation adjusts a model after an error.", {"explanation"}),
        ("Hey, what's up?", "Hey! I am here.", {"greeting"}),
        ("Good night, see you tomorrow.", "Good night.", {"goodbye"}),
    ]
    for message, reply, expected_gestures in cases:
        brain = build_companion_brain(reply=reply, raw_brain=None, message=message, history=[], character_name="Yuna")
        assert brain["behavior"]["gesture"] in expected_gestures
        assert 0 <= brain["behavior"]["eyeContact"] <= 1
        assert 0 <= brain["speech"]["speed"] <= 1.24


def test_companion_brain_composes_a_safe_sentence_timeline_and_user_reaction():
    brain = build_companion_brain(
        reply="That is wonderful news! You worked hard for it. Remember to celebrate your progress.",
        raw_brain=None,
        message="I finally passed my exam!",
        history=[],
        character_name="Yuna",
    )

    behavior = brain["behavior"]
    assert behavior["posture"] == "energetic"
    assert behavior["userReaction"]
    assert len(behavior["timeline"]) >= 2
    assert [item["atMs"] for item in behavior["timeline"]] == sorted(item["atMs"] for item in behavior["timeline"])
    assert all(item["gesture"] in {"acknowledgment", "celebration", "concern", "confusion", "emphasis", "explanation", "greeting", "goodbye", "happiness", "listening", "open_palm", "pointing", "shrug", "thinking", "thumbs_down", "thumbs_up", "waiting"} for item in behavior["timeline"])


def test_companion_only_extracts_clear_long_term_or_temporary_memories():
    candidates = extract_memory_candidates("I love astronomy. My exam is next week.")

    assert any(item["category"] == "preference" for item in candidates)
    assert any(item["category"] == "reminder" and item["temporary"] for item in candidates)
    assert extract_memory_candidates("It was a normal day.") == []


def test_companion_emotion_and_dashboard_are_conversation_driven():
    analysis = analyze_emotion("I feel stressed and anxious about my exam")
    assert analysis["primary"] == "nervous"

    dashboard = dashboard_from_messages(
        [{"role": "user", "content": "I feel stressed and anxious about my exam", "analysis": analysis}],
        memory_count=3,
    )
    assert dashboard["stress"] >= 80
    assert dashboard["memoryCount"] == 3


def test_companion_recognizes_depressed_and_low_confidence_language():
    assert analyze_emotion("I am very much depressed after my marks")["primary"] == "sad"
    assert analyze_emotion("I am feeling low in confidence")["primary"] == "sad"


def test_behavior_report_is_reflective_and_keeps_camera_observations_coarse():
    report = behavior_report(analyze_emotion("I feel stressed"), {
        "visible": True, "expression": "tense", "engagement": "engaged", "confidence": 0.7,
    })
    assert report["textSignal"] == "nervous"
    assert report["cameraCheckIn"]["expression"] == "tense"
    assert "not a diagnosis" in report["reflection"]
    assert "momentary visual cue" in vision_prompt_context({"visible": True, "expression": "tense", "engagement": "engaged", "confidence": 0.7})


def test_account_profile_context_is_data_and_does_not_invent_memory():
    context = account_profile_prompt_context({"name": "Mahesh"})
    assert '"display_name": "Mahesh"' in context
    assert "do not claim memories" in context
    assert "created by Mahesh" in context
    assert "Parul University" in context


def test_visual_report_parser_limits_results_to_safe_momentary_categories():
    report = parse_visual_report('{"visible":true,"expression":"angry","engagement":"focused","confidence":3,"summary":"x","supportCue":"y"}')
    assert report["expression"] == "unclear"
    assert report["engagement"] == "uncertain"
    assert report["confidence"] == 1.0


def test_memory_retrieval_prioritizes_relevant_facts():
    memories = [
        {"category": "preference", "key": "preference", "value": "love astronomy", "importance": 0.7},
        {"category": "preference", "key": "preference", "value": "likes pasta", "importance": 0.9},
    ]

    result = build_memory_context(memories, "Tell me something about astronomy")
    assert result[0]["value"] == "love astronomy"


def test_otp_hash_does_not_store_plain_code_and_verifies():
    stored = hash_otp("123456")

    assert "123456" not in stored
    assert verify_otp_hash("123456", stored)
    assert not verify_otp_hash("654321", stored)


def test_otp_email_template_renders_the_dynamic_code_in_html_and_plain_text():
    html, plain_text = build_otp_verification_email("123456")

    assert "123456" in html
    assert "123456" in plain_text
    assert "AI Companion" in html
    assert 'alt="Emora"' in html
    assert "10 minutes" in plain_text


def test_as_utc_treats_naive_database_timestamps_as_utc():
    stored_by_pymongo = datetime(2026, 8, 12, 10, 30)

    assert as_utc(stored_by_pymongo) == datetime(2026, 8, 12, 10, 30, tzinfo=timezone.utc)


def test_post_moderation_marks_blocked_content_for_review():
    status, reasons = moderate_content("Please doxx this person")

    assert status == "needs_review"
    assert reasons == ["doxx"]

    visible_status, visible_reasons = moderate_content("Today was hard, but I got through it.")
    assert visible_status == "visible"
    assert visible_reasons == []


def test_insights_classifier_returns_a_safe_estimate():
    assert _classify("I feel anxious and overwhelmed")[0] == "anxious"
    assert _classify("There is no clear mood signal here")[0] == "neutral"


def test_premium_insights_brief_is_derived_from_saved_timeline():
    timeline = [
        {"date": "2026-08-17", "messages": 2, "checkIns": 0, "tone": 42},
        {"date": "2026-08-18", "messages": 0, "checkIns": 0, "tone": None},
        {"date": "2026-08-19", "messages": 1, "checkIns": 1, "tone": 66},
        {"date": "2026-08-20", "messages": 3, "checkIns": 0, "tone": 74},
    ]

    brief = _build_premium_brief(
        timeline,
        Counter({"reflective": 4, "calm": 2}),
        {"mostDiscussedTopics": ["work", "rest"]},
    )

    assert brief["dominantMood"] == "reflective"
    assert brief["activeDays"] == 3
    assert brief["consistencyPercent"] == 75
    assert brief["toneDirection"] == "Tone moved upward"
    assert brief["topTopics"] == ["work", "rest"]


def test_pro_period_reflection_uses_only_supplied_real_records():
    reflection = _build_period_reflection(
        days=30,
        messages=[{"content": "I keep thinking about my project", "timestamp": datetime.now(timezone.utc)}],
        moods=Counter({"reflective": 2}),
        goals=[{"title": "Finish the prototype"}],
        journals=[{"title": "A private note"}],
        memory_count=3,
    )

    assert reflection["title"] == "Your last 30 days with Emora"
    assert reflection["returnedTo"] == "reflective"
    assert reflection["progress"] == ["Finish the prototype"]
    assert reflection["journalCount"] == 1
    assert "project" in reflection["revisit"]


def test_long_insight_ranges_require_the_matching_server_entitlement():
    with pytest.raises(Exception) as exc_info:
        get_insights(days=90, current_user={"email": "free@example.com"})
    assert getattr(exc_info.value, "status_code", None) == 403

    plus_user = {"email": "plus@example.com", "subscription": {"plan": "plus", "status": "active"}}
    with pytest.raises(Exception) as exc_info:
        get_insights(days=365, current_user=plus_user)
    assert getattr(exc_info.value, "status_code", None) == 403


def test_play_world_options_are_allowlisted_and_advanced_remixes_change_the_output():
    space = SpaceRequest(background="observatory", ambience="fireplace", accessory="telescope")
    assert space.background == "observatory"

    with pytest.raises(ValidationError):
        SpaceRequest(background="javascript:alert(1)")

    source = "I keep delaying my project because the project feels too large."
    pattern = _remix_content(source, "pattern")
    letter = _remix_content(source, "letter")
    focus = _remix_content(source, "focus_session")
    goal = _remix_content(source, "gentle_goal")

    assert "Threads that repeat" in pattern
    assert "What I could not quite say" in letter
    assert "25-MINUTE FOCUS SESSION" in focus
    assert "One tiny thing" in goal
    assert len({pattern, letter, focus, goal}) == 4


def test_gentle_goal_remix_persists_a_real_owned_goal(monkeypatch):
    stored = {}

    class Goals:
        def insert_one(self, document):
            stored.update(document)
            return SimpleNamespace(inserted_id="goal-1")

    monkeypatch.setattr(play_router, "feature_collection", lambda _: Goals())
    response = play_router.remix(
        play_router.RemixRequest(text="Finish the premium experience. Then verify it.", format="gentle_goal"),
        {"_id": "person-1"},
    )

    assert response["createdGoal"]["id"] == "goal-1"
    assert stored["user_id"] == "person-1"
    assert stored["completed"] is False


def test_arrival_check_in_accepts_the_browser_tiny_thing_contract():
    arrival = ArrivalRequest.model_validate({"mood": "calm", "tinyThing": "Drink a glass of water"})

    assert arrival.tiny_thing == "Drink a glass of water"
    with pytest.raises(ValidationError):
        ArrivalRequest.model_validate({"mood": "diagnosed"})


def test_attachment_signatures_are_checked_before_storage():
    assert _is_valid_payload("application/pdf", b"%PDF-1.7 sample")
    assert not _is_valid_payload("application/pdf", b"not a pdf")
    assert _is_valid_payload("image/png", b"\x89PNG\r\n\x1a\ncontent")
