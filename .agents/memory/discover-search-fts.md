---
name: Discover search design
description: Layered search strategy decision for public discovery search
---
Public discovery search is layered by design: full-text search (name/title weighted above description) ranked by relevance first; a trigram-similarity fuzzy pass only when full-text matches nothing; a "did you mean" suggestion only when both miss. Applies to both services and packages.

**Why:** raw substring matching gave no typo tolerance and no relevance order; the layering keeps exact-match queries fast and fuzzy results out of good result sets.

**How to apply:** if the search document composition changes (which fields, which weights), update the matching expression index in the same commit or the index goes unused — the index expression must be byte-identical to the query expression.
