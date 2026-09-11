# Product completion audit — 8 September 2026

## A. Product map
See PRODUCT_INVENTORY.md for every template, heading, dialog, module, router
signature and application network call site. The product consists of public
introduction/help/trust/status/changelog, five account-entry screens, overview,
text conversation/history/options/memory/collections, voice room, guided sessions,
Play, journal, goals, insights, research shelf, friends/circles, community,
notifications, timed focus rooms, profile/privacy/security/accessibility, plan
preview, offline and development-only state lab. APIs remain authoritative for
account state, entitlements, memory and social privacy.

## B–D. UX, mobile and navigation findings
- High: nine equal mobile destinations require sideways discovery; journal,
  friends and settings compete with tertiary features or are absent. Replace
  with Home, Chat, Meet, More and grouped, descriptive links in a native dialog.
- High: notifications renders search but omits its script. Include the module.
- Medium: landing uses technical prose and an imported WebGL dependency before
  its navigation initializes. A network failure can strand the menu. Use its
  existing still room artwork and independent navigation.
- Medium: account placeholders include a real name before data arrives. Use
  neutral loading text. Preserve real user hydration.
- Medium: Google-hosted fonts create an unnecessary third-party request on every
  page. Bundle the same licensed font families locally.
- Medium: location-based decorative weather is incompatible with the server's
  geolocation policy. Replace with local clock-based atmosphere; no location or
  remote weather request is needed.
- Verification risk: previous layout script races registration navigation while
  reading its response. Use explicit API setup with a disposable account in a
  new completion harness; exercise UI navigation, focus, search, tabs and themes.

## E–F. Visual audit and direction
Preserve the authored night-room image, forest green, warm paper, ink, brass
accents, Sora text and Instrument Serif headings. These already establish a
recognizable world. Improve hierarchy rather than adding another theme layer.
Use four evenly sized mobile actions, a warm-paper/forest navigation sheet,
section labels and short descriptions. Native dialog focus and restrained
transitions support clarity. No changes to avatar rendering or motion.
The shared CSS layering remains large; avoid a wholesale rewrite of working
styles. The existing JavaScript size gate fails before this pass (628,958 versus
500,000 bytes); report this independently from these changes.

## G. External dependencies
REMOVE: Google Fonts runtime requests (self-host with licenses); landing Three.js
import (existing static room artwork); decorative Open-Meteo calls and geolocation
(storage/time remain local). KEEP: same-origin APIs and Mongo persistence; optional
Google sign-in and SMTP recovery; optional Tavily/Brave/DuckDuckGo research because
current web evidence cannot be generated locally; configured inference worker
because deployment topology is user-owned; model downloads required for local
inference; Redis/ClamAV deployment support. INVESTIGATE separately: pinned avatar
Three/VRM CDN modules, which are under the motion compatibility boundary. Sharing
links are user-triggered outbound navigation, not automatic tracking. No analytics
SDK was found in application source. No provider keys or functional config removed.

## H. Information architecture
Home → start or resume; Chat → text; Meet → voice room; More → Reflect (journal,
goals, insights), Spend time (guided sessions, focus, Play), Connect (friends,
community, updates), Your space (research, settings, plans, help). Search remains
available as a distinct action. All existing routes remain reachable.

## I. Implementation and second audit
1. Fix shared navigation and search wiring; retain IDs and account contracts.
2. Localize fonts, remove nonessential landing rendering and weather integration.
3. Replace confusing copy and placeholders; preserve factual capability limits.
4. Inspect desktop/mobile screenshots, run all-page overflow and accessibility
checks, exercise navigation/dialog keyboard behavior and run Python regressions.
5. Record actual results, performance limits and protected-file hashes separately.
