---
name: Price-shown-vs-charged safety pattern
description: When wiring a new ledger/config price into a UI that already has a one-click charge path, add it additively rather than replacing the charge-driving value.
---

If a UI surface's displayed price already drives an immediate, no-further-confirmation charge
(e.g. a saved-card one-click "Pay $X" button), never swap that display value for a different
price source just to satisfy a "wire this ledger key to the UI" requirement — even if the task
text reads as a literal replacement.

**Why:** two independently-editable sources (a ledger row vs. whatever resolves the real charge)
will eventually drift, and when they do, the user sees one number and gets charged another —
silently, with no recourse, on a flow that has no confirmation step to catch it.

**How to apply:** add the new price as an **additive** element (a teaser/subtitle/secondary line)
sourced live from the new accessor, right next to the untouched real price/button, and fail soft
(return `null`/omit) if the new accessor errors — a resolver hiccup on a decorative teaser must
never be allowed to break the real charge flow's response. Document the deviation explicitly
(e.g. via `drift_reason` on task completion) rather than silently reinterpreting the requirement.

## Related: scoping a literal/value guard when extending its lists
When a grep-based "fee literal" or "hardcoded value" guard has fixed value lists (e.g.
`phase2-fee-gate.sh`'s `VALUE_RE`/`CENTS_RE`), test each new value against the guard before
committing it. Small round numbers (499, 4000, 2500, 25.00, 29.00, etc.) frequently collide with
unrelated pre-existing content — `max_tokens: 4000`, phone number digit runs, UI toast durations,
unrelated dollar amounts already in the codebase. When a candidate value collides, drop it from
the bare-value list and rely on the guard's context-anchored predicate (a number adjacent to a
fee-ish identifier on the same line) instead — that mechanism exists precisely to catch new
hardcoding without needing every value enumerated, and forcing a colliding value into the list
just turns the guard red for unrelated reasons.
