# Lane 5b decision brief — re-pointing the optimizer from the cart to the Trip

**Date:** Jul 31, 2026 · **Status:** AWAITING DECISION-MAKER CALLS — no re-point code until both are made.
**Ground truth:** the Lane 5 Phase-0 audit (read-only, against `main` @ `8f75167`). Its three live DEFECTS
(unenforced pay-gate, apply-to-trip's destructive wipe, the never-written variant `providerServiceId`)
are being fixed separately in Lane 5a — they are bugs against documented intent, not design questions.
This brief covers only the two genuine design calls the re-point itself needs.

## What the re-point is

Today the optimizer's baseline read is the CART (`cart_items ⋈ provider_services`), preserved
byte-identical through Phase 1b (the W2 constraint). The Trip-as-Artifact model says the optimizer
should read the TRIP's own `itinerary_items`. The audit confirmed the fee engine is **already fully
trip-based** (fee resolves from `trips.eventType` + ownership, never from the cart), so the re-point
does not touch any fee input. It also found the trip read is strictly *richer*: real `dayNumber`,
real `durationMinutes`, real `providerServiceId`, and free-text items' title/location/cost as
first-class columns — all things the cart read fabricates (rotated time slots, hardcoded 120-minute
durations) or silently drops (external items squeezed into jsonb that the optimizer never reads).

## Decision 1 — which routing states may the optimizer read?

The routing contract's post-re-point row currently says READS on **all four** states — but the audit
reads that as a placeholder, and taking it literally would let the optimizer treat `purchased` and
`with_expert` items as re-plannable, contradicting every write gate in the system (checkout/refund
are the sole owners of `purchased`; an expert-held item shouldn't be reshuffled under the expert).

**Recommended: `in_planning` + `ready_for_checkout` only.** That is exactly what the cart projection
exposes today (so it's also the least-change option), it respects the expert's held set, and a
purchased item is a locked commitment, not a candidate for AI replacement. If ratified, the contract
doc's optimizer row gets finalized to match (and its stale "lane 6" label corrected to Lane 5).

## Decision 2 — the guest-transition gap

Guests have carts but no trips (guest trips are explicitly deferred to G2). A user who builds a cart
signed-out, signs up, and immediately hits Optimize would find an empty trip under a trip-only read
even though their (now-owned) cart is full. Options:

- **A (recommended): retain a deliberate cart fallback** — when the trip has zero readable items and
  the user's cart is non-empty, the optimizer reads the cart exactly as today, labeled in code as the
  guest-transition path. Smallest change, no new machinery, honest about why it exists; retires
  naturally when G2 lands guest trips.
- **B: materialize the cart into `itinerary_items` on first optimize** — makes the Trip canonical
  immediately, but invents a write path (cart→trip conversion at optimize time) that duplicates the
  existing convert-to-itinerary endpoint and reaches into G2's explicitly-deferred territory.
- **C: require conversion first** (error: "convert your cart to a trip to optimize") — honest but adds
  a step to a paying user's flow.

## What follows ratification

Lane 5b implements: swap the baseline read to `itinerary_items` (with the audit's field-mapping table
— including the `serviceType` vs `itemType` vocabulary difference, which feeds marquee/commodity
classification and must be mapped, not renamed), apply Decision 1's read-set, apply Decision 2's
fallback, retire the W2 behavior-identical merge gate, and finalize the contract row. Opus lane,
Fable-reviewed. The audit's full field mapping and receipts live in the Lane 5 Phase-0 report
(referenced from the master brief).
