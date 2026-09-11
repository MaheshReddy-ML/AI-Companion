# Emora UI transformation — 5 September 2026

Implemented against the existing FastAPI/Jinja application. The running application
was inspected before edits and after successive fixes. Existing uncommitted work
was preserved; backend authentication routes and payloads were not changed.

## 1. Major UI changes

- Rebuilt the shared authentication composition with a forest-green editorial
  scene, arched landscape, clearer form hierarchy, and dedicated light/dark surfaces.
- Corrected mobile chat clipping, workspace navigation overlap, Sessions overflow,
  Notifications overflow, and Together's unreadable light-theme empty states/buttons.
- Kept the existing product identity, real data, entitlements, and features.
  `/play` and `/your-emora` were not modified by this pass.

## 2. Login and Register

- Visible, outlined 52px inputs; 16px input text; persistent labels; readable
  placeholders; 44px password toggles; deliberate focus, error, and loading states.
- Shared field errors with `aria-describedby`, `aria-invalid`, required fields,
  first-invalid-field focus, and accessible password visibility state.
- Preserved register → sign-in → dashboard and shared-device account switching.
- Added privacy/help links. Google alternatives appear only when configured;
  provider failure leaves the email form usable. Google buttons resize with their slot.
- Duplicate submit guard, 30-second request timeout, and safe callback-error text
  handling (no second URL decoding). Timeout copy accounts for ambiguous registration.
- Corrected success-message colors to match the actual `data-tone` contract.
- Recovery pages use the same visual shell and visible level-one form headings.

## 3. Mobile improvements

- Phones receive a compact brand header and immediate form access, instead of a
  large scene pushing the form below the initial viewport.
- Single-row horizontally scrollable workspace navigation retains its links;
  search has a separate touch target. Content reserves space above the navigation.
- Removed inherited chat margins that pushed the composer outside the screen;
  chat uses dynamic viewport height and a scrollable prompt area on short screens.
- Constrained hidden Session radio inputs without removing keyboard accessibility.
- Constrained notification filters and corrected narrow dashboard sizing.

## 4. Stability fixes

- Removed delayed blur reveals that left long-page content temporarily invisible.
- Disabled full-page screenshot transitions that generated skipped-transition errors
  during authentication redirects; local control transitions remain.
- Fixed Community initialization: mute/block/appeal logic was incorrectly outside
  the click listener and referenced an undefined event, preventing feed startup.
- Search now cancels obsolete requests and ignores stale results; Escape reliably
  closes the palette even when its search input has focus.
- Corrected scene-caption positioning, recovery-header clearance, and mobile headings.

## 5. Performance

- Removed the scroll-reveal observer and its layout reads/blur effects.
- Removed continuous animation from the decorative authentication scene.
- Cancelled unnecessary in-flight searches. Reserved provider slot dimensions.
- No new production dependencies or large image assets.
- Existing UI budgets pass: CSS 725,794/750,000 bytes; JS 486,950/500,000 bytes;
  system CSS 39,588/40,000; system JS 20,829/30,000. No measured performance-score claim.

## 6. Components and refactors

- `app/static/css/auth-doorway.css`: shared authentication design.
- `app/static/js/auth-form.js`: field validation, password control, provider rendering.
- Login/Register modules retain their own API and session orchestration.
- Shared system CSS/JS, workspace search, Community event binding, and scoped
  Chat/Together styles contain the targeted workspace corrections.
- Updated the old regression assertion that required hidden pending scroll reveals.
- Added repeatable browser checks in `scripts/auth-ui-qa.cjs`,
  `scripts/workspace-ui-qa.cjs`, and `scripts/interaction-ui-qa.cjs`.

## 7. Verification

- Python suite: **176 passed, 1 skipped**. The opt-in Mongo integration test remains
  skipped in the normal suite; the live browser auth flow used local MongoDB separately.
- Authentication layout: 54 combinations across Login, Register, Forgot Password;
  light/dark; widths 320, 360, 375, 390, 414, 430, 768, 1024, 1440. No page overflow.
- Axe: no reported violations for Login/Register at 390px in light/dark themes.
- Workspace: 17 routes at 320, 390, 768, 1440, no page overflow or uncaught errors
  in the final run: dashboard, chat, sessions, insights, journal, goals, research,
  community, together, notifications, profile, payment, focus-together, help,
  trust, status, changelog.
- Real local registration, invalid credentials, login, first-run guide dismissal,
  search dialog, logout, and disposable account deletion passed.
- Empty/invalid registration, empty login, password visibility, keyboard focus,
  callback percent characters, and a 390×420 chat viewport passed.
- Explicit simulations: slow 503 sign-in response and loading recovery, out-of-order
  search results, and blocked Google script with usable email registration.
- Community feed initialization verified without creating posts or contacting people.
- All disposable QA accounts were removed. JS syntax, diff whitespace, and UI budgets pass.

Evidence: [auth results](../tmp/ui-qa/auth-results.json),
[workspace layouts](../tmp/ui-qa/workspace-results.json),
[authentication flow](../tmp/ui-qa/flow-results.json),
[focused interactions](../tmp/ui-qa/focused-results.json).

Visual examples: [desktop login](../tmp/ui-qa/login-light-1440.png),
[mobile login](../tmp/ui-qa/login-light-390.png),
[mobile registration](../tmp/ui-qa/register-dark-390.png),
[320px errors/provider fallback](../tmp/ui-qa/register-error-320.png),
[mobile chat](../tmp/ui-qa/chat-390.png).

## 8. Remaining verification and recommendations

- Browser checks used headless installed Chrome, not physical iOS/Android devices.
  Real keyboard overlays, Safari/WebKit, autofill/password managers, and screen-reader
  announcements still need device testing. Short viewport and keyboard interaction
  checks do not substitute for that coverage.
- Google button rendering/fallback was tested; actual third-party Google account
  authentication and email-based OTP delivery were not exercised.
- Voice, camera, model output quality, and multi-account social interactions were
  outside this visual pass. Backend tests do not prove those device experiences.
- The existing server disables geolocation via Permissions-Policy; the scene's
  optional location action retains its existing local-time fallback.
- Shared CSS is close to its existing budget. Future design work should consolidate
  legacy stylesheet layers instead of continuing to add overrides.
- Automated accessibility coverage here is limited to the auth pages. The full
  workspace would benefit from a separate comprehensive accessibility audit.

## Reproduce

Start the app with the repository virtual environment and local MongoDB:

```sh
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Browser QA dependencies are isolated from the application:

```sh
npm install --prefix /tmp/emora-ui-qa playwright @axe-core/playwright
NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/auth-ui-qa.cjs
NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/workspace-ui-qa.cjs
NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/interaction-ui-qa.cjs
venv/bin/python -m pytest -q
venv/bin/python scripts/check_ui_budgets.py
```

Installed Google Chrome is used. Scripts target localhost:8000; workspace and
interaction scripts create/delete disposable QA accounts. Evidence goes to
`tmp/ui-qa` (override with `EMORA_QA_OUTPUT`). Repeated runs can hit normal auth
rate limits; no limits were weakened. The original todo remains intact.
