from pydantic import ValidationError

from app.otp import hash_otp, verify_otp_hash
from app.avatar_catalog import choose_default_avatar_preset_id, get_avatar_preset, list_avatar_presets
from app.companion import analyze_emotion, behavior_report, build_memory_context, dashboard_from_messages, extract_memory_candidates, vision_prompt_context
from app.companion_brain import extract_reply_and_brain
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


def test_behavior_report_is_reflective_and_keeps_camera_observations_coarse():
    report = behavior_report(analyze_emotion("I feel stressed"), {
        "visible": True, "expression": "tense", "engagement": "engaged", "confidence": 0.7,
    })
    assert report["textSignal"] == "nervous"
    assert report["cameraCheckIn"]["expression"] == "tense"
    assert "not a diagnosis" in report["reflection"]
    assert "momentary visual cue" in vision_prompt_context({"visible": True, "expression": "tense", "engagement": "engaged", "confidence": 0.7})


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
