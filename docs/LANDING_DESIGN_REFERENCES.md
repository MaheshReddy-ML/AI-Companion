# Emora landing design references — 11 September 2026

Seven live product sites were researched and visually inspected at desktop width. Screenshots are in `tmp/landing-references/`. The result applies their presentation principles to Emora's existing capabilities and Atelier palette; it does not copy their branding, testimonials, or product claims.

| Reference | Useful principle | Emora application |
| --- | --- | --- |
| [Linear](https://linear.app/) | Clear product hierarchy and detailed product scenes | A visible conversation before the first scroll and a concise capability strip |
| [Superlist](https://www.superlist.com/) | Confident typography, a decisive primary CTA, connected tasks and notes | Sans-serif headline, expressive Emora serif accent, conversation-to-action storytelling |
| [Reflect](https://reflect.app/) | A visual metaphor for connected context | Fine orbital lines around preferences, conversation, and a next step |
| [Craft](https://www.craft.do/) | Tactile composition and human writing | Layered journal paper and a warm illustrated room |
| [Sunsama](https://www.sunsama.com/) | Calm, concrete benefit language | Small steps and a manageable next action rather than inflated AI promises |
| [Raycast](https://www.raycast.com/) | A recognizable identity and strong action hierarchy | Existing generated Emora mark, focused CTA treatment and restrained motion |
| [Notion](https://www.notion.com/) | Product-led storytelling and varied visual sections | Alternating conversation, journal, controls and onboarding sections |

## Recognition, accurately scoped

[Reflect's Awwwards entry](https://www.awwwards.com/sites/reflect) records an Honorable Mention on May 11, 2023 and individual community scores. [Unseen Studio's award record](https://www.awwwards.com/unseenstudio/?library=true&previewmode=true) lists Superlist as Site of the Month in April 2021. These are recognition of those submissions, not ratings of their current revisions and not proof of conversion performance. No claim is made that these are the seven highest-rated sites. Craft also describes product awards on its official site; product awards are distinct from landing-page ratings. Pi was attempted but blocked by a browser challenge and was not used as a visually inspected reference.

## Implementation

Replaced the accumulated landing stylesheet and page composition. Preserved cream/terracotta and slate/peach theme tokens, registration/login routes, generated branding and the four functional journey tabs. Hero style controls change a clearly labeled local example. Entry/reveal motion and short voice-wave animation respect reduced motion; content stays visible without JavaScript. No customer counts, testimonials, conversion statistics or unsupported platform claims were added.

## Verification

- Full Python suite: **198 passed, 4 skipped**.
- Rendered Chrome QA: light/dark at 320, 390, 768, 1024 and 1440 px; no horizontal page overflow, no Axe violations, no page JavaScript errors.
- Verified conversation-style changes, four journey tabs, keyboard arrow navigation, FAQ expansion, mobile menu Escape and visible core content with JavaScript disabled.
- Visually inspected rendered desktop hero and full-page mobile/desktop screenshots in `tmp/arrival-qa/`.
- `git diff --check` passed.
- Existing aggregate asset-budget gate remains above its limits. The landing stylesheet was reduced from its previous size; shared legacy assets still require separate consolidation. No budget thresholds were changed.
