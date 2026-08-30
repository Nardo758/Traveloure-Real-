---
name: Bento card-shell ownership
description: Prevent redundant Bento card wrappers from clipping compact content.
---

For a Bento item that needs grid column or row span geometry, the grid item owns the
card’s visual shell (radius, border, background, shadow, and clipping). The card
inside it owns its content layout plus click and keyboard interaction semantics.

**Why:** A second visual shell inside the grid wrapper created competing clipping
boundaries that could cut off compact badges and action pills. The requested behavior
is visually unchanged while removing that redundant boundary.

**How to apply:** When adding or changing a spanning compact Bento card, keep the grid
wrapper for grid geometry. Do not recreate an inner rounded/overflow visual shell;
assert badges and action controls remain contained at desktop, tablet, and phone
widths.