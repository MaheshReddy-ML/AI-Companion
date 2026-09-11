# Normal workspace component contract

This contract applies to the shared Jinja/vanilla-JavaScript workspace. `/play` and `/your-emora` are intentionally immersive and must remain body-class/route scoped.

| Primitive | Required states | Accessibility contract |
|---|---|---|
| Button | default, hover, focus, busy, disabled, success, error | Native button, visible focus, minimum 44px preferred target, busy state announced once |
| Field | empty, focused, valid, invalid, disabled, read-only | Visible label, programmatic description/error, no placeholder-only label |
| Dialog | closed, opening, open, closing | Native dialog where supported, labelled title, close control, restored focus, Escape unless destructive confirmation |
| Status/toast | info, success, warning, error | `role=status` for normal updates; alert only for urgent blocking errors; never color alone |
| Card | empty, loading, ready, locked, degraded, error | Heading hierarchy, real data or explicit empty state, lock explains plan and downgrade consequence |
| Tabs/menu | idle, focused, selected, disabled | Keyboard arrow model where applicable, correct roles/states, no hover-only action |
| Confirmation | reversible, destructive, consequential | Name exact action/target, explain impact, require explicit confirmation, never use companion pressure |

Use existing design tokens and shared components before adding route-specific CSS. Every dynamic panel must distinguish Loading, Empty, Ready, Offline, Unauthorized, Rate-limited, and Failed where those states are possible. Shared changes require regression checks proving they do not appear in locked immersive routes.
