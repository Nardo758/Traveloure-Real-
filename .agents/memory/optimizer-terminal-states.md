---
name: Optimizer terminal states
description: The status contract for completed itinerary optimization runs and partial post-generation failures.
---

Once an optimizer has persisted one or more AI proposals, a later optional-enrichment or finalization failure must not classify the run as a generation failure. Keep the proposals usable and expose a distinct warning completion state; reserve `failed` for runs that produced no AI proposals.

**Why:** A completed optimization can have all of its usable variants persisted before a best-effort database or enrichment operation fails. Treating that late error as `failed` hides plans that travelers can still review and apply.

**How to apply:** Any new post-generation operation must preserve this distinction, and review/auto-apply surfaces must treat warning completion as generated while explaining the degraded detail.