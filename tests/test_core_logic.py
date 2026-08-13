from datetime import datetime, timezone

from pydantic import ValidationError

from app.database import as_utc
from app.email_templates import build_otp_verification_email
from app.otp import hash_otp, verify_otp_hash
from app.avatar_catalog import choose_default_avatar_preset_id, get_avatar_preset, list_avatar_presets
from app.companion import account_profile_prompt_context, analyze_emotion, behavior_report, build_memory_context, dashboard_from_messages, extract_memory_candidates, vision_prompt_context
from app.companion_brain import build_companion_brain, extract_reply_and_brain
from app.models.schemas import ChatSendRequest, PostCreateRequest
from app.routers.api_auth import normalize_local_redirect_path
from app.routers.api_chat import create_chat_title
from app.routers.insights import _classify
from app.services.attachments import _is_valid_payload
from app.services.posts import moderate_content
from app.services.local_mlx_vision import parse_visual_report


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
        ChatSendRequest(message="a" * 8_001)
    except ValidationError:
        pass
    else:
        raise AssertionError("oversized chat messages should fail validation")


def test_chat_request_has_an_explicit_camera_opt_in_contract():
    request = ChatSendRequest(message="hello", cameraOptIn=True, cameraFrame="data:image/jpeg;base64,AAAA")
    assert request.camera_opt_in is True
    assert request.camera_frame.startswith("data:image/")


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


def test_attachment_signatures_are_checked_before_storage():
    assert _is_valid_payload("application/pdf", b"%PDF-1.7 sample")
    assert not _is_valid_payload("application/pdf", b"not a pdf")
    assert _is_valid_payload("image/png", b"\x89PNG\r\n\x1a\ncontent")
