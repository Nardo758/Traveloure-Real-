---
name: Partner Demand R38 provenance
description: Approved cohort exclusion rule for synthetic Partner Demand data and its materialized-rollup consequence.
---

Treat an otherwise-R16-passing trip as synthetic only when it belongs to a cohort of at least ten
unowned, non-authoring trips sharing normalized destination, start date, end date, and creation day.
This is a provenance rule, not a rule that missing email or missing ownership alone implies synthetic
data.

**Why:** A provenance review found a burst-created group that passed the ordinary strict predicate but
was demonstrably fixture-like. Keeping its materialized cells would let a false public-floor clearing
survive even after source filtering.

**How to apply:** Keep the rule inside the one shared Partner Demand predicate so stay, slip, and
funnel computations agree. An authoritative recompute must replace invalidated materialized cells; it
cannot preserve them merely because the newly filtered source no longer emits their dates.