# Emora arrival and first meeting — September 11, 2026

Email registration omitted `onboarding_required`, so the shared login routing sent new local users to the dashboard. Registration now persists the same flag used by Google signup. The existing meeting stores preferred name independently of account identity, resumes saved steps, writes real taught memories, and feeds preferences into companion context and the default support mode. Completed accounts continue to skip onboarding. No existing accounts were migrated.

The public landing now uses a paper-and-forest palette, doorway motif, Emora note, interactive conversation-style examples, shaped feature sections, and a matching closing invitation. Both themes, responsive navigation, keyboard focus, and reduced-motion behavior are supported. Preview choices are local examples, not stored personalization. The obsolete, unreferenced cinematic landing CSS was replaced in `home-flagship.css`; its previous working-tree content is backed up in `tmp/arrival-before/`.

Validation:
- Backend suite: 189 passed, 4 skipped.
- Real local register/login automatically reaches onboarding; all eight steps exercised with a temporary account, then account deleted.
- Meeting: 32 desktop/mobile light/dark views with zero Axe violations, overflow, or page errors; refresh, separate names, preferences, memory deduplication, completion, profile editing, and actual chat mode checked.
- Landing: 10 width/theme combinations (320, 390, 768, 1024, 1440), zero Axe violations, overflow, or page errors; conversation buttons, product tabs, and mobile menu Escape exercised.
- Python compilation, dependency consistency, JavaScript syntax, and whitespace checked.
- CSS budget passes at 780672/790000. Total JS remains over its pre-existing limit at 652832/500000; limit unchanged.

Google credential and OAuth callback tests use verified-provider fixtures; no live Google login or voice/device acceptance is claimed. Existing email accounts without the flag are not forcibly enrolled. The new local preview is running at http://127.0.0.1:8001; other server processes need a restart to pick up the Python registration change.

Evidence: `tmp/arrival-qa/results.json`, `tmp/first-meeting-qa/results.json`, and screenshots in those directories. Reproduce with `NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/arrival-ui-qa.cjs` and `EMORA_QA_BASE=http://127.0.0.1:8001 NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/first-meeting-qa.cjs`.
