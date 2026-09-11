# Conversation behavior and personalization — September 11, 2026

## Findings and changes

- `app/services/companion_chat.py` explicitly replaced a model-generated coffee invitation with “What’s on your mind?”. Removed that replacement. Reworked the shared generation instructions around the latest message, optional purposeful questions, quiet memory use, AI-role boundaries and varied response rhythm. Selected character identity is now explicit while character preferences remain supported. Formatting cleanup preserves code indentation and paragraph breaks.
- The default `listen` mode in `app/routers/api_chat.py` required validation first. It now responds to the actual message and uses emotional support only when relevant. Think/deep modes no longer frame a question as the expected response structure.
- The active chat route used `build_user_context`, bypassing the older project-creator context. Added shared public project facts directly to the generation path and corrected the older helper. Team: Mahesh Reddy, Sanjay, Harish and Sindhu. Public project facts never inject Mahesh’s private profile into other accounts.
- `build_memory_context` ranked even completely unrelated facts. Retrieval now requires relevant words, a matching profile topic, or an explicit broad recall request. Existing ownership, consent gating, expiry and limit enforcement remain in place.
- Added a narrow guard for stock invitations appended after complete answers, including streamed speech. Contextual questions and quoted examples remain intact. This supplements prompt changes rather than substituting canned answers for conversation.
- The collapsed chat memory disclosure now says “Response context” instead of announcing a private-memory count. Inspection and deletion controls remain available.
- Saved five explicit, editable, account-owned memories to the user-confirmed account: education (dated September 2026), career, interests, toolkit and Emora priorities. Existing memories were preserved. This was a one-time database operation, not a startup seed; deletion will not silently recreate them. Memory opt-out continues to suppress retrieval.

## Verification

Full pytest suite: **216 passed, 4 skipped**. JavaScript syntax and `git diff --check` passed.

Live local Qwen3-4B-MLX-4bit evaluation covered ten sequential scenarios: casual, compliment, factual, Emora, team, personal career recall, emotional, technical, topic switch and closing. Run using the MLX-capable interpreter:

```
HF_HUB_OFFLINE=1 ../.venv/bin/python scripts/evaluate_conversation.py
```

The evaluation uses synthetic account context, with a supplied career memory for the recall turn, and performs real local generation without database writes or remote fallback. Its transcript is `tmp/conversation-behavior-eval.json`. Separately checked the confirmed account’s actual stored memory selection for education, career, interests and an unrelated compliment.

Latest observed examples:

- Compliment: “I’ll take the compliment.”
- Capital of Japan: “Tokyo.”
- Team: named all four supplied team members.
- Topic switching: answered why the sky is blue after the technical conversation.

Limits: stochastic small-model generation still sometimes gives generic emotional reassurance, invitation statements, or longer-than-needed project descriptions. The changes reduce the observed question loop but do not establish perfect conversational quality. Live microphone, avatar animation, production deployment and browser layout were not tested in this backend-focused pass. Avatar assets and motion code were not edited. The repository had extensive pre-existing changes; they were preserved.
