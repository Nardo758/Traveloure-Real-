# Vertical slice — Trips in Kyoto (design briefs)

> Source: handoff pack, 2026-09-27 (decision-maker). Rulings here are final.

## C. Vertical slice — Trips in Kyoto (design briefs)

Target, written at the top of every doc: ten real Kyoto travelers using the Trips slice in November 2026. The product map (`docs/planning/trip-slip-product-map.md`) is the TARGET architecture; build order is superseded by Track A below. HARD STOP after each part; design only.

Order: Parts 1, 4, 5 together (5 first if serial); then 2, 3, 6.

### Part 1 — Golden path: `docs/planning/golden-path-trips-kyoto.md`
One traveler, 5 days in Kyoto, no hotel booked, two or three in mind. In order: entry and how the occasion is set; the anchor question ("Where are you staying?") and adding 2–3 hotels; plan-fit per hotel and how it reads on a phone; the free first draft built outward from the open hotel set; gaps and suggestions filling the days; the paid run (one version per hotel, badges, adopt whole or part); choosing the hotel, finalize, checkout with the fee visible, one booking, one cancellation; what they see a month later (run history, Trip Card). Every step names its module (§C) and level (§K); mark anything that doesn't exist. Appendix: the Playwright test outline; it is the slice's acceptance test.

### Part 4 — Instrumentation
Slip funnel events: plan created (occasion source), anchor set opened, option added (source), plan-fit shown, option chosen, free draft run, gap shown/filled, suggestion shown/added, run purchased, version adopted (whole/part), finalized, booking created, booking cancelled. Each: properties and the table/log it writes to; reuse the impression log where it fits. No dashboards.

### Part 5 — Kyoto supply reality check (report only)
From the database: listings by category; how many have coordinates, `location_precision`, price, cancellation terms, availability; expert count and status; affiliate inventory reachable for Kyoto. Note that production `service_bookings` has zero rows.

### Part 2 — M and N (product map addendum), serving Part 1
**M. Anchor-centric plan building, one mechanism for every group.** Primary anchor per group (§B2: Moments → reservation, Celebrations → venue, Trips → hotel, Hosted events → venue, Group travel → shared lodging; plain plan → none until set) and an optional secondary; multi-stop → one primary per stop. The empty slip's first question is the anchor question, worded per group; a single custom venue anchors automatically (R147). The anchor is an option set (S1) of its category; plan-fit per option = day-weighted, mode-aware travel burden across located items (matrix when it exists, "est." straight-line until then) plus neighbourhood coverage; secondary anchors score against the primary; plan-fit leads the compare view. The free first draft builds outward from the chosen anchor or open anchor set; with neither it asks. Amend F2/R128: with an open anchor set, each of the three versions anchors on one option; objective badges only where the metric wins; with no open set, versions go by objective. One table: group → primary → secondary → anchor question → what plan-fit measures → what a version rebuilds; flag any group where it doesn't hold. Recommend whether the launch-city travel-time matrix moves ahead of compare-options; give the cost.
**N. Optimizer run records.** Each paid run is an immutable record tied to its payment: input snapshot (plan state, open sets + options, preferences, constraints, weight-profile version, model version), outputs (versions, metrics, per-set picks), outcomes (adopted whole/part, chosen options, subsequent bookings). Re-runs append; nothing overwrites; apply-to-trip, Reopen and refinalize never delete a run. "Your optimized plans" history on the slip (owner/delegate; assigned expert read-only; never reused across travelers); in the PDF export. Learning uses structured outcomes only; prompt text never stored (hash only); propose retention. Report what `itinerary_variants`/metrics/items already cover.
Open question with default: the 24h free re-run covers a rebuild around a newly added hotel (default yes).

### Part 3 — Re-sequence the rollout
Replace §G with Track A (the slice: minimum steps that make Part 1 true end to end, including the launch-city travel-time matrix, supply prerequisites from Part 5, fee preview, Trip Pass waiver, Part 4 events; each step a hard stop with a Part 1 test section as acceptance and the visual-design artifact it needs) and Track B (the other four groups, each gated on its own golden path, written when its turn comes). State what in current §G moves, merges, or waits. Ratification per Track A step.

### Part 6 — Validation kit
A clickable mock of the Trips slip (Design artifact if listed, else self-contained HTML), phone width: anchor question, hotel compare with plan-fit, one day of the plan. Plus a one-page 30-minute session script. The decision-maker runs it with five travelers and two Kyoto experts before Track A builds compare-options.

Standing rules: a PR is Ready only after its own branch CI is fully green; bring main in before merge (R171); code cites ledger slugs, not R-numbers.

