# Emora product UI redesign

Completed locally on 10 September 2026 in AI-Companion-FastAPI.

The landing page now explains the actual product: a personal AI companion with text and voice conversations, journaling, goals, and focus tools. It includes a workspace preview, feature paths, privacy controls, and clear free-account calls to action. The preview conversation is explicitly illustrative. Typography, the Emora wordmark, warm paper light mode, blue-black dark mode, and restrained terracotta accents carry through authentication and the application.

## What changed

- Landing, sign-in, registration, recovery, shared navigation, and workspace presentation now use the same identity. Dashboard shortcuts replace decorative artwork; route headings and empty states explain what users can do.
- Chat has a conversation-first layout, history-first sidebar, collapsible workspace directory, consolidated conversation actions, separate options, and a responsive composer. Mobile history isolates background controls, contains keyboard focus, and closes with Escape. Composer growth preserves the latest-message position without disturbing users reading older messages.
- Play is an activity workspace: daily rituals come first, with a bounded live room preview, private memories, room customization, remix, and keepsakes. Plan restrictions remain enforced. Ritual completion has keyboard containment and return focus.
- All 26 page routes received the shared theme and responsive treatment. The strongest structural changes are landing, authentication, Chat, Play, and the dashboard; other workspace pages retain their functional content and controllers with revised presentation.
- Backend API and authentication contracts were preserved. The Meet Emora template only received accessibility attributes in this pass; its avatar, motion, and voice controllers were not changed. Comparing the existing 55-file protection manifest found 52 unchanged entries; the three intentional differences are Play's template/controller and Meet's template attributes.

## Verification

| Check | Result |
| --- | --- |
| Python suite | 182 passed, 4 skipped |
| Rendered pages | 26 routes × 2 themes × 4 widths = 208 combinations; no horizontal overflow, failed page responses, or uncaught JavaScript errors |
| Accessibility | 52 route/theme Axe checks at 390px; zero violations after targeted fixes and rechecks |
| Authentication and workspace interactions | Sign-in, validation, stale search response handling, mobile navigation, options, session-service recovery, and keyboard controls checked |
| Chat transcript | Long-message fixtures, preserved reading position, jump to latest, and growing composer passed |
| Play live interactions | Ritual start/completion and personal memory save/removal passed; free-plan customization remained locked |
| Chat live interactions | New session, options, actions-menu Escape, mobile history isolation and Escape passed |
| Meet browser fixtures | Avatar canvas rendered; simulated speech/audio and TTS failure recovery passed; no overflow or uncaught errors |
| Source checks | Edited JavaScript syntax checks and git diff --check passed |

The full viewport sweep used widths 320, 390, 768, and 1440. Affected pages were rechecked after fixes; `tmp/product-design-final/verified-results.json` combines the original sweep with those newer results. Source evidence remains in `tmp/product-design-final`, `tmp/product-accessibility-final`, and `tmp/product-play-final`. Personal interaction evidence is in `tmp/product-interactions/results.json`; chat scrolling is in `tmp/meet-qa/chat-report.json`. QA accounts were deleted after use.

Reproduce the broad audit with:

```sh
NODE_PATH=/tmp/emora-design-qa/node_modules node scripts/product-design-qa.cjs
NODE_PATH=/tmp/emora-design-qa/node_modules node scripts/chat-play-product-qa.cjs
venv/bin/python -m pytest -q
```

The browser scripts require Playwright, @axe-core/playwright, Chrome, and the application running on port 8000. Dependencies for this local run are isolated under `/tmp/emora-design-qa`.

## Remaining verification boundaries

Real microphone/device behavior, live Google authentication, email delivery, payment providers, and production deployment were not exercised. Browser voice tests use fixtures and do not establish real-device voice quality. Automated accessibility results do not replace assistive-technology user testing.

The aggregate JavaScript size gate remains over its existing 500,000-byte budget (about 631 KB; the pre-redesign baseline was already 626,457 bytes). The gate was not raised. CSS is within its 790,000-byte budget at 787,487 bytes. Legacy/vendor JavaScript consolidation remains separate work; it should preserve the protected avatar and voice implementation.

Changes remain in the local working tree with the pre-existing project changes preserved. No deployment, public post, or message to another person was made.
