# Profile and Play redesign — 10 September 2026

Profile now uses seven focused settings categories instead of displaying every control in a long grid. The account header and portrait picker have been rebuilt; companion preferences, comfort settings, check-in scheduling, security, privacy, and account controls each have a dedicated view. Save feedback stays visible outside the selected category. The former data-flow navigation was removed. Native fragment links support direct entry and browser Back/Forward; controls remain available without section JavaScript.

Play now has four working views: today's activities, your room, remix studio, and keepsakes. Compact product typography, distinct activity cards, a bounded room preview, clearer selection states, and consistent controls replace the long sequence of promotional sections. Existing rituals, room scene, entitlement restrictions, memories, remix, and keepsake controllers remain connected. Memory saves and removals now report failures, preserve unsaved text, and restore the ability to retry.

Live verification exposed an existing Profile save failure: MongoDB rejected the preference update because both `$setOnInsert` and `$inc` targeted `version`. Removing the conflicting initialization restored saves. A regression test covers first and subsequent preference writes.

## Evidence

- Python suite: **183 passed, 4 skipped**.
- All 11 Profile/Play views: **66 view/theme/viewport combinations**, at 320, 390, and 1440 pixels; no failed page loads, horizontal page overflow, or uncaught JavaScript errors.
- **22 Axe checks** covering every view in both themes: zero violations. Visual review additionally found and fixed content clipping inside Profile's mobile layout.
- Shared landing, dashboard, Chat, and login styles: **16 responsive combinations and 8 Axe checks**, all clean after CSS optimization.
- Live account interactions: preference persistence, preset-avatar persistence, direct fragment navigation, and browser Back passed.
- Live Play interactions: ritual start/completion, dialog focus, memory save/removal, and free-plan room restrictions passed. A simulated 503 confirmed draft preservation and retry controls.
- JavaScript syntax checks and `git diff --check` passed. Temporary QA accounts were removed.

Results and screenshots: `tmp/profile-play-complete/`, `tmp/profile-play-shared/`, and `tmp/product-interactions/results.json`. Reproduce using `scripts/profile-play-qa.cjs` and `scripts/chat-play-product-qa.cjs` with Playwright dependencies at `/tmp/emora-design-qa/node_modules` and the local application on port 8000.

The CSS was compressed and redundant declarations consolidated without adding a framework: **789,618 / 790,000 bytes**. The existing aggregate JavaScript budget remains exceeded at **633,562 / 500,000 bytes** (630,851 before this pass). Avatar/motion assets and voice controllers were untouched. Live paid-provider generation, email delivery, physical-device behavior, and production deployment were not verified in this pass.
