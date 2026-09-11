# Product presentation and compact sidebar

September 11, 2026

The landing page keeps the shared Atelier colors: cream and terracotta in light mode, slate and peach in dark mode. Its product presentation now includes an interactive conversation illustration, conversation/memory/progress features, first-meeting walkthrough, use cases, free-plan entry, trust controls, and FAQs. It uses existing signup, plans, and product routes. It does not add fabricated traction, testimonials, partnerships, or payment claims.

Motion includes a gentle product-window perspective change, response transitions, section reveals, and a decorative waveform. Reduced-motion preferences disable motion. Sections remain visible without JavaScript; keyboard focus reveals offscreen content, and FAQ disclosures use native keyboard behavior.

The collapsed desktop sidebar has an explicit 80px grid column, centered 48px icon targets, a compact profile control, scrollable navigation, and hover/focus labels rendered outside the clipped rail. Help controls receive the same label handling as links. Stored collapse preference survives refresh and mobile/desktop resizing. Expanded navigation remains available. Chat keeps its separate history-panel behavior.

Validation:
- 189 backend tests passed, 4 skipped.
- Landing: 10 viewport/theme combinations, zero Axe violations, horizontal overflow, or page errors; interactive styles, product tabs, and mobile navigation checked.
- Sidebar: 16 expanded/collapsed route/theme views across Dashboard, Journal, Goals, and Profile; zero sidebar Axe violations or page errors. Icon centers and rail bounds checked programmatically.
- Persistence, short-screen scrolling, focus tooltips, Escape, responsive resizing, FAQ pointer/keyboard, reveal transitions, runtime reduced-motion changes, and no-JS content visibility passed.
- Temporary QA account deleted successfully.
- Changed JavaScript syntax and git whitespace checks passed.
- CSS is within the 790000-byte budget after removing unused previous landing selectors from atelier.css. The existing total JavaScript budget remains exceeded; its limit is unchanged.

Evidence: tmp/arrival-qa/ and tmp/sidebar-refined-qa/. Prior working-tree files are preserved in tmp/business-before/.

Preview: http://127.0.0.1:8001/
