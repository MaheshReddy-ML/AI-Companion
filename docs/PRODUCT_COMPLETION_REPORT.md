# Emora product refinement — 8 September 2026

This pass follows the current todo.txt and builds on the existing implementation.
The brief is preserved. The work is an audit and refinement of the current product,
not a rewrite of the backend or avatar system.

## Design and navigation

- Mobile has four visible destinations: Home, Chat, Meet and More. The More sheet
  groups all secondary destinations by intent, with short descriptions, a current
  page indicator, a visible close control, keyboard focus containment, Escape,
  focus restoration and automatic dismissal when switching to desktop.
- The light overview now uses warm paper, forest ink, sage surfaces and restrained
  borders; the hero, composer and plan preview share that palette. Dark chat retains
  the existing night-room atmosphere. The landing page introduces Emora directly,
  makes starting a conversation explicit, and renders its existing artwork without
  a WebGL dependency or a loading screen. Content no longer waits for scroll reveals.
- Chat's view controls say Chat, Options and History. Help and navigation no longer
  ask a first-time user to understand VRM terminology. Profile uses neutral loading
  copy instead of displaying a real person's name before account data arrives.
- Light-theme repairs cover overview, sessions, insights, journal, goals, research,
  friends, community, profile, payment, help, trust, status, changelog and offline.
  These are scoped to ordinary product pages; the avatar/motion files are unchanged.
- Notifications now loads the private-search module it already rendered controls for.
- Restore fields have labels. Chat applies pressed state only to buttons, and the
  attachment label has actual accessible text. Reduced motion is respected by the
  navigation sheet. Native dialog semantics supplement the explicit focus loop.
- Temporary account verification failures preserve the saved sign-in and offer a
  Retry action. Only 401/403 authentication rejection clears the session. This does
  not authorize any API request or substitute cached identity for server verification.

## API and dependency report

| Integration | Decision | Reason and resulting behavior |
| --- | --- | --- |
| Google Fonts | Removed from runtime | Same Instrument Serif, Sora and JetBrains Mono fonts served locally as WOFF2, with OFL notices. All faces total 227,028 bytes; only requested faces load. |
| Landing Three.js import | Removed | Existing room image supplies the composition. Play and avatar rendering retain their dependencies. |
| Open-Meteo/geolocation | Removed | Decoration follows local time; no weather call, location lookup or weather cache read/write. The separately maintained room template's obsolete location control is removed by its shared atmosphere initializer. |
| FastAPI account/workspace/social APIs | Kept | Real identity, private data, authorization, search, memory, exports, notifications and social state remain server-owned. |
| MongoDB | Kept | Persistent application data; deployment may use local or configured remote Mongo. |
| Google sign-in | Kept, configuration-dependent | Existing optional sign-in path. The browser QA observed only Google sign-in traffic as external requests across the ordinary routes. Email login remains available. |
| SMTP | Kept, configuration-dependent | Recovery/OTP and opted-in delivery require mail transport. No live mail was sent by this pass. |
| Tavily, Brave, DuckDuckGo | Kept, feature-controlled | Current external sources cannot be supplied by local model inference. Existing backend switches and key handling retained. |
| Local model libraries / Hugging Face model download | Kept | Existing MLX/CPU/CUDA inference and initial model provisioning. No replacement of MLX or persistent memory. |
| Configured inference worker | Kept | Existing optional deployment architecture; not an unnecessary fake wrapper. |
| Redis / ClamAV | Kept, deployment-dependent | Existing rate-limit and upload scanning support. |
| Avatar Three.js/VRM CDN | Separate investigation | Pinned imports belong to the protected avatar compatibility surface. No changes here. |
| WhatsApp/X links | Kept | Explicit user-triggered outbound sharing; not automatic analytics. |
| Analytics, Axios, GraphQL SDK | None found in application scan | No unused SDK invented or added. |

No application dependencies were added. Font conversion and browser QA tools were
installed in temporary tooling directories. No .env values or user credentials were
changed. CSP no longer permits the removed font/weather origins. The service-worker
cache generation was advanced so an installed client can acquire changed assets.
The complete source-level call-site inventory is in PRODUCT_INVENTORY.md.

## Performance boundary

The pre-pass all-JavaScript gate already failed: 628,958 / 500,000 raw bytes.
The protected avatar/voice work and local vendor code are included by that gate.
This pass reduces the total; it does not make that inherited gate pass, remove
working voice code, or raise the limit. Final numbers are recorded below.
CSS remains within its existing 750 KB limit. No Lighthouse score or mobile frame
rate is claimed. The landing no longer requests Three.js and fonts no longer
require an external origin. WOFF2 conversion reduced the font bundle from 581,652
to 227,028 bytes.

## Second product audit

The landing answers what Emora is and offers one primary starting action. Mobile
navigation exposes the three primary activities and one visibly named menu. Other
features have descriptive destinations, rather than requiring horizontal discovery.
The forest/paper typography and surfaces now extend to light secondary pages;
contrast checks and screenshot review informed the corrections. Existing dark room
artwork supplies the immersive visual moment without an additional effect layer.

Visual review is a design assessment, not proof that every person will find the
product exceptional. A first-time nontechnical user study, physical iOS/Android,
Safari, assistive-technology announcements, real microphone/camera/model output,
real Google authorization, SMTP delivery, paid checkout and multi-account social
interactions are not certified by these browser checks. Checkout remains a preview.

## Reproduce

Start `venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log`.
Run `NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/product-completion-qa.cjs`.
The harness uses real disposable registration/sign-in, asserts each final route,
waits for its data requests, checks six widths in two themes, audits accessibility
at 390px and exercises navigation/keyboard/search/options and simulated 503 session recovery. `EMORA_QA_QUICK=1`
limits the layout sweep to 390px. Accounts are deleted in a finally block.

Run the existing auth script for the account-entry layout matrix, and
`venv/bin/python -m pytest -q`, `venv/bin/python scripts/check_ui_budgets.py`,
and `git diff --check`. Evidence is under tmp/launch-qa and tmp/launch-auth-qa.

## Recorded verification

- Python: **182 passed, 4 skipped**. JavaScript syntax and `git diff --check` pass.
- Full loaded-page sweep: 19 routes × 6 widths × 2 themes = **228 layouts**.
  It identified one overview overflow at 320px. After the fix, the overview was
  rechecked at all six widths in both themes: **12/12 passed**. The remaining
  routes had no overflow in the full sweep. The rerun at 320/390 also checked
  the ordinary page set after the session-recovery fix.
- Axe WCAG A/AA checks at 390px: **zero reported violations on 19 routes in both
  themes** in the final all-page accessibility run. Overview remains clear in its
  final separate run. This covers rendered empty/default states, not every
  possible populated dataset or hidden modal.
- Navigation, current-page indicator, Tab containment, Escape, restored focus,
  desktop resize dismissal, Journal navigation, Notifications search, landing
  arrow-key tabs, chat options and simulated 503/retry with preserved sign-in pass.
- Account-entry suite: 54 layout cases without overflow/errors; Login/Register
  Axe checks pass in light and dark. A real disposable UI sign-in was used by
  the completion harness. Disposable accounts, including the account from the
  interrupted initial harness, were removed through the account API.
- **55 protected avatar/motion/Play files checked; zero changed.**
- CSS **740,950 / 750,000**; system CSS **39,588 / 40,000**; system JS
  **22,634 / 30,000**. The inherited all-JS gate still fails at
  **626,457 / 500,000**, down 2,501 bytes from the pre-pass total. Vendor JS alone
  accounts for 119,950 bytes. No budget was raised to conceal the failure.

Evidence: [all-page accessibility / narrow layout run](../tmp/launch-qa/results.json),
[final overview and interaction run](../tmp/launch-dashboard-qa/results.json),
[authentication matrix](../tmp/launch-auth-qa/auth-results.json),
[protected files](../tmp/launch-qa/protected-results.json).

Reviewed screenshots: [light desktop overview](../tmp/launch-dashboard-qa/dashboard-light-1440.png),
[light phone overview](../tmp/launch-dashboard-qa/dashboard-light-390.png),
[phone navigation](../tmp/launch-dashboard-qa/navigation-320.png),
[landing](../tmp/launch-qa/home-light-390.png),
[dark conversation](../tmp/launch-qa/chat-dark-1440.png).
