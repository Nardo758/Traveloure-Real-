<!-- Provenance (header retrofit per rulings 26/31): audited@unknown — authored outside the repo, pre-dating several merges (Lane S #1028, console-sigma 1bd35149, Amadeus drop ruling 34) and never committed; creation SHA indeterminable. Committed 2026-08-05 on lane/journey-suite. Every state claim below is HYPOTHESIS until verified; the Phase 0 verification record is docs/testing/coverage-matrix.md + docs/planning/journey-suite-phase0-findings.md. -->

# Journey Test Suite — Brief

**Status:** Dispatch for Claude Code. Phase 0 read-only inventory first (§8), HARD STOP, then build in coverage waves (§7). One lane per branch. This suite is regression armor between lanes — per standing discipline, a green suite is necessary-not-sufficient and never substitutes for per-lane behavioral gates.
**Companion docs:** `SLIP_EXPERIENCE_DISPATCH.md` (surface disposition table = the row source) · `ROUTING_STATE_CONTRACT.md` (WRITES/READS/NEVER cells = assertion + negative source) · Trip-Gravity Audit findings (lifecycle spine = journey ordering).

---

## 0. The problem

The platform's correctness is currently proven per-lane: each merge gate demonstrates its own behavior, then the proof evaporates. Nothing continuously exercises the *seams* — traveler↔expert handoffs, provider→booking→payout chains, entry-point→checkout paths — where the audit found every serious defect (H1–H6, Q1, the advisor regression were ALL seam bugs, not feature bugs). There is no way to answer "did this merge break a flow three surfaces away?" except waiting for a user to hit it. And "test everything" has no definition: without an enumerable coverage target, the suite would grow opportunistically and lie by omission.

**Fix:** an enumerated coverage matrix (every surface × every user-visible action, every cell claimed by a test) executed at three tiers — journeys for seams, feature specs for breadth, contract negatives for the NEVER cells.

## 1. Method — the coverage matrix

Deliverable #1, before any test code: `docs/testing/coverage-matrix.md`.

- **Rows:** every surface in the disposition table (`SLIP_EXPERIENCE_DISPATCH.md` §4) PLUS supply-side surfaces it doesn't cover: provider onboarding, provider service authoring, provider back-office/bookings, attributed short links, expert ready-made authoring, expert request intake, admin approvals, reviews, auth/session flows.
- **Columns:** every user-visible action on that surface (enumerated in Phase 0 from routes + UI, not from memory).
- **Every cell claimed** by ≥1 test id (J-, F-, or N- prefixed) or explicitly marked `deferred:<lane>` (feature doesn't exist yet) or `n/a:<reason>`. Unclaimed cells fail the matrix lint (a trivial script counts them — same pattern as the mint-path tripwire).
- The matrix is maintained by the testing lane's agent in-repo; it is the single answer to "is X tested?"

## 2. Tier 1 — Journeys (14)

Multi-step, multi-role, DB-asserted Playwright runs. Each journey: fresh trip, named accounts from the `{market}-{specialty}@traveloure.test` set, Stripe TEST mode, dev DB only. Every step's assertion is a **database fact** (status value, log row, booking row, fee resolution) — UI presence alone never passes a step. Multi-role = multiple `browser.newContext()` sessions in one test.

Format below: abbreviated step → assert. The build expands each into a full step table; where an assertion cites the contract, the test comment cites the contract row.

**J1 — Golden path (traveler-led, dual-role)**
1. Traveler login → create trip via quick-start → trip row exists, `trackingNumber` non-NULL, collaborator row present (tripwire invariant re-proven in-journey)
2. Add Discover gem + template pick → items exist, `routing_status='in_planning'`, linkage ids present
3. Optimize → 3 variants generated; purchased/with-expert scope rules N/A here (none yet); apply variant B → items updated, `variant_applied` trip-level log row, losing unshared variants deleted, selected variant retained
4. Route kimono item → expert → status `with_expert`, log row actor=traveler, expert_request row carries REFERENCES only (no item copies in jsonb)
5. Expert context: opens workspace → reads live trip (not cart); adds note → `expert_note` persisted; adds an item → born `in_planning`; returns → `with_expert→in_planning`, log actor=expert
6. Traveler routes driver → checkout → status `ready_for_checkout`, cart projection row appears
7. Checkout with 4242 test card → booking row with tripId, item `purchased` + log row SAME transaction (assert log exists immediately), projection row gone, amount server-computed (assert equals fee_bands resolution, no client value)
8. Open Trip Card → purchased item renders with confirmation ref; expert note renders; all other statuses unchanged
9. Transition log renders v1…vN in order; version = row count

**J2 — AI entry.** Generate draft → trip + items `in_planning`, providerServiceId linkage survives (H5 guard) → continue to a J1-style checkout of one item.

**J3 — Ready-made purchase (dual-role).** Expert-authored listed RM → different traveler purchases → clone created: all items `in_planning` (born-purchased forbidden), `trackingNumber` minted, snapshot fields per clone posture → buyer routes + purchases one item normally.

**J4 — Guest migration (deferred:G2).** Guest builds via fallback → signup → migrated items land `in_planning`, session artifacts cleaned. Matrix cells marked deferred until G2.

**J5 — Money round-trip.** J1 steps 6–7 → refund via admin/provider path → booking refunded, item `purchased→in_planning` reversal SAME transaction, log actor=refund, Trip Card no longer shows it as booked, reconciliation health-check query returns zero rows.

**J6 — Optimizer contract.** Seed trip with one purchased, one with_expert, one in_checkout, two planning → optimize → purchased item day/time byte-identical across ALL variants; in_checkout item present in ALL variants (drop policy a); with_expert item in NO variant and named once in compare header; apply → zero `routing_status` values changed (before/after diff).

**J7 — Discovery deep-dive.** From Discover: gem→slip, gem→board, board→ready-made link-up-chain, city-grid add, curated-section add → each asserts destination table, status, and monetization-chain pointer (free content points one level up).

**J8 — Expert-built trip (traveler-led request, dual-role).** Traveler submits Get Expert Help on empty/near-empty trip → request carries references + correspondence jsonb only → expert builds full plan in workspace (items born `in_planning`) → delivers (workspaceStatus advance logged) → traveler views slip → routes all to checkout → purchases → commission resolves via fee_bands `expert_standard` (25/75 asserted from DB config, never a literal).

**J9 — Ready-made authoring lifecycle (expert + admin + traveler, tri-role).** Expert authors RM (authoring build: NULL-owner annotated, trackingNumber still minted per ruling 17) → submit → status draft→submitted→approved via admin context (born-approved forbidden — assert status history) → listed → J3 purchase by third context.

**J10 — Concierge coordination.** Traveler engages concierge → coordination fee captured (server-computed, idempotency key present) → `coordination_states.tripId` written at creation → GET-by-trip finds the engagement (lane-3 fix proven in-journey).

**J11 — Provider lifecycle (provider + admin + traveler, tri-role).** Provider onboards → creates service (draft→submitted→approved) → service bookable → appears in traveler planning → booked via J1-style checkout → provider back-office shows booking (booking-scoped; assert provider CANNOT read routing_status — contract NEVER row) → provider confirms completion → review gate opens → traveler reviews (booking-gated FK).

**J12 — Dual-rate attribution (money-critical).** Provider generates attributed short link → traveler A books through it → `service_bookings.acquisitionRef`→short_link chain intact, commission resolves to rails band via fee_bands → traveler B books same service platform-sourced → full band resolves → assert the two rates differ AND both came from fee_bands rows (grep-level: no literal in the diff of computed amounts).

**J13 — Share + collaborators.** Owner shares → share view renders via canonical producer (not ItineraryCard), pills visible + inert, no routing actions, no log footer → collaborator tiers per config → share reflects a post-share slip edit (live render, not snapshot).

**J14 — Messages + deep link.** Expert action fires `→with_expert`/note → notification row carries relatedType/relatedId + frozen title only → traveler opens link → lands on `/plans/:tripId` anchored to the item, rendered fresh → stranger context opens same URL → 403.

## 3. Tier 2 — Feature specs (breadth)

Per-surface Playwright specs claiming the cells journeys skip. Inventory (expand in Phase 0):
- **Routing actions ×status:** every legal transition from every status via UI; each writes its log row.
- **Discovery options:** filters, boards CRUD, save/unsave, every add-to-X control.
- **Checkout edge modes:** declined card, 3DS test card, double-submit (idempotency proven), concurrent confirm (atomic `WHERE status='pending_payment'` proven).
- **Admin branches:** approve/reject/resubmit for services, RMs, requests; fee-band edit propagates to next resolution.
- **Expert workspace breadth:** dual-mode authoring, suggest/approve flow, per-item notes CRUD-as-allowed.
- **Provider back-office breadth:** availability jsonb slot claim (claimed-at-pay), short-link generation, booking views.
- **Auth/session:** login/logout/expiry per role, role-routes-config smoke (extend the existing job to the 4 recovered pages).

## 4. Tier 3 — Contract negatives (~15, run with fast guards)

Directly from NEVER cells + standing invariants. Each is a small API-level test asserting rejection AND no side effects (no status change, no log row, no money):
N1 expert sets `ready_for_checkout` → rejected. N2 expert/optimizer/apply writes `routing_status` → rejected/absent. N3 variant omitting in-checkout item → rejected at generation (fail-closed: unmatched = rejected). N4 non-projection writer inserts `cart_items` → caught. N5 provider reads routing_status → absent from every provider payload. N6 trackingNumber as mutation identifier → rejected. N7 client-supplied amount/userId on money path → ignored, server value used. N8 stranger on `/plans/:tripId` → 403. N9 share view mutation attempt → rejected. N10 RM clone carrying author routing status → overridden to `in_planning`. N11 born-approved insert attempt → impossible via API. N12 `item_transition_log` UPDATE/DELETE via app → no path exists (route inventory assertion). N13 guest fallback reachable by authenticated user → never. N14 forwarded message link ≠ auth grant (dup of N8 via message path). N15 mutate via getTripRole path → none remain (route inventory assertion).

## 5. Mechanics

- **Accounts:** existing 45-account convention; journeys name their cast explicitly; never share a trip between tests; every journey creates its trip fresh.
- **Data:** seed script only (now tripwire-clean); no production data, no Neon prod — dev/helium exclusively, CI enforces via env allowlist.
- **Stripe:** TEST mode keys; 4242/decline/3DS cards; webhooks via Stripe CLI or test-mode events; assert idempotency keys present on charges.
- **Assertions:** every step asserts a DB fact via a thin read-only test-db helper; UI assertions supplement, never substitute (gate-integrity discipline — no swallowed assertions, no "renders" as pass).
- **CI tiering:** Tier 3 + matrix lint on every push (seconds). Tier 2 per-area on affected paths. Tier 1 `test:journeys` on merge-to-main + nightly (minutes; parallel contexts OK, tests independent and order-free).
- **Flake policy:** a flaky journey is quarantined with a named owner within one day — a red suite people ignore is worse than no suite.

## 6. Coverage matrix seeding rule

Every journey/spec/negative id above pre-claims its cells at matrix creation. The matrix lint fails if: any cell unclaimed and unmarked, any test id referenced but not present in the repo, any `deferred:` tag whose lane has since merged (forces the deferred test to be built when its feature lands).

## 7. Build order (tracks lane completion — do not build ahead of features)

```
Wave 1 (now):        matrix + lint · Tier 3 negatives that are testable today ·
                     J1-minus-expert-leg · J2 · J6 · J7 · J13-minus-lane-5-swap
Wave 2 (post phase 4 of SLIP dispatch): full J1 · J8 · J14 · routing-action specs
Wave 3 (post Lane S): log/version assertions activate across all journeys · J5
Wave 4 (post provider back-office P1): J11 · J12 · provider specs
Deferred:            J4 (G2) · losing-variant share treatment checks (follow-up lane)
```

## 8. Phase 0 (read-only, HARD STOP)

1. Enumerate matrix columns from actual routes + UI controls (file:line per action) — not from docs.
2. Inventory existing Playwright coverage; map every existing test to matrix cells; delete nothing.
3. Confirm Stripe test-mode wiring, webhook path in dev, and the env allowlist enforcement point.
4. Confirm test-db read helper approach compatible with CI parallelism.
5. Verify current seed + account set covers all roles J9/J11/J12 need (admin context especially); list gaps.
6. Return findings + the seeded matrix for approval before Wave 1 code.

## 9. What NOT to do

- Do NOT share fixtures or trips between tests; no test-order dependence.
- Do NOT assert UI-only; every step lands on a DB fact.
- Do NOT touch production, live Stripe keys, or Neon prod — ever.
- Do NOT write to app tables from test helpers except via the app's own APIs (the suite tests the API surface; direct writes hide broken paths). Read-only DB access for assertions only.
- Do NOT let the suite substitute for per-lane merge gates, and do not weaken a gate because "the journey covers it."
- Do NOT quarantine-and-forget: quarantined tests carry an owner and an issue.
- Do NOT build tests for features that don't exist (fabricated selectors against unbuilt UI); mark cells `deferred:<lane>` instead.
- Do NOT put fee literals in test expectations — assert against `fee_bands` reads, so a rate change doesn't break the suite and a literal never re-enters via tests.
- Do NOT mock money-path internals in journeys; Stripe test mode is the mock.

---

*One sentence: enumerate every surface × action into a linted matrix, prove the seams with fourteen multi-role journeys asserted against database facts, prove the boundaries with the contract's NEVER cells, and grow coverage in waves that track the lanes.*