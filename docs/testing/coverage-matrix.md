# Coverage Matrix — surface × action

**Status:** HARD-STOP **APPROVED 2026-08-05 @ ea0bbc05** (decision-maker mdixon5030, in conversation: "Approved — build Wave 1" <!-- wave-name-ok: verbatim quotation of the approval -->). Recorded retroactively on 2026-08-05: the approval was given and the build proceeded (PR #421 `d45fcd0f`), but it never crossed into the repo — this line closes that gap. **This is a record of the approval that happened; it is NOT a new approval request and nothing was re-run to obtain it.**
**What was approved (the scrutiny set):** the Journey Wave 1 scope of brief §7 — *matrix + lint · Tier-3 negatives that are testable today · J1-minus-expert-leg · J2 · J6 · J7 · J13-minus-lane-5-swap* — reviewed against the Phase 0 findings set (`docs/planning/journey-suite-phase0-findings.md`) and this seeded matrix (brief §8 item 6: "Return findings + the seeded matrix for approval before Journey Wave 1 code"). Journey Waves 2–4 were **not** approved by this HARD STOP; each takes its own.
**Post-approval build state:** Journey Wave 1 code has LANDED. Cells claimed by a Journey Wave 1 test id are live claims; cells carrying `deferred:` are still pre-claims per brief §6.
**Sources:** rows from `docs/briefs/SLIP_EXPERIENCE_DISPATCH.md` §4 disposition + brief §1 supply-side additions; columns enumerated from actual routes/UI (file:line, Phase 0 item 1); NEVER cells from `docs/briefs/ROUTING_STATE_CONTRACT.md`.
**Cell legend:** `J*` journey step · `F*` feature spec · `N*` contract negative · `EX:*` existing test absorbed (cited) · `deferred:<lane>` feature unbuilt · `n/a:<reason>`.
**Lint rule (brief §6):** every cell claimed or marked; referenced test ids must exist in-repo once Journey Wave 1 lands; `deferred:` tags expire when their lane merges. Landing the lint expires the standing ledger warning `[matrix-lint deferred:journey-suite-wave-1]` (rulings 21/27).
**Naming (ruling 37, guarded by `scripts/check-coverage-matrix.cjs` rule 5):** waves in this document are **Journey Wave N**, never a bare unqualified "Wave N" — the unqualified name collides with the QA Punch List's own Wave 1–5 series (`docs/planning/QA_PUNCH_LIST.md`, Aug 1, PRs #363/#364/#365), and the journey-suite squash `d45fcd0f` (PR #421) additionally carried the Amadeus decommission (ruling 34) under that same unqualified name — so "is Wave 1 done?" had no answer. <!-- wave-name-ok: names the collision the rule prevents -->

Wave key (brief §7): W1 = Journey Wave 1, build now · W2 = post SLIP phase 4 · W3 = post Lane S activation wiring (Lane S itself MERGED #1028 — log assertions ACTIVE in W1 journeys) · W4 = post provider back-office P1.

## 1. Slip / plan view (`/trip/:id` → `client/src/pages/trip-details.tsx`; slip specs A/B pending SLIP phase 4)
| Action (file:line) | Claim |
|---|---|
| View slip: items, status pills, counts (trip-details.tsx render) | J1.8 (W1: Trip-Card render assertions); Spec-A pill/strip render → deferred:slip-phase-4 |
| Optimize / generate (trip-details.tsx:600 → POST /api/trips/:id/generate-itinerary) | J1.3, J6 |
| Route item → expert (trip-details.tsx:1363 → POST /api/expert-booking-requests) | J1.4 (W1: DB-facts; expert-leg UI deferred:slip-phase-4) |
| Route item → checkout (add to cart, trip-details.tsx:1180 → POST /api/cart/items) | J1.6 |
| Edit item (trip-details.tsx:1098 → PATCH /api/trips/:tripId/itinerary-items/:itemId) | F-slip-1 → deferred:post-wave-1 |
| Approve/reject expert suggestion (trip-details.tsx:1087) | deferred:slip-phase-4 |
| Share (trip-details.tsx:588) | J13 |
| Get Expert Help on empty trip | J8 → deferred:slip-phase-4 |
| Transition log footer (v1…vN order) | J1.9 (Lane S MERGED — active W1) |
| Routing actions hidden on logistics/purchased rows | F-slip-2 + N2 (contract: logistics NEVER) → deferred:post-wave-1 |
| Stranger opens /plans/:tripId | N8 |

## 2. Optimizer / compare (Spec C)
| Action | Claim |
|---|---|
| Generate 3 variants | J1.3, J6 |
| Purchased anchor byte-identical in ALL variants | J6 |
| in_checkout present in ALL variants (drop policy a, ruling 4) | J6; generation-time rejection step deferred:lane-6 |
| with_expert in NO variant, named once in compare header | J6 |
| Apply variant: items updated, losing unshared variants deleted, `variant_applied` trip-level log row (ruling 16) | J1.3, J6 |
| Apply writes zero routing_status values | J6 + N2 |
| Variant omitting in-checkout item rejected at generation (fail-closed, ruling 15) | N3 → deferred:lane-6 |
| Optimizer/apply writes routing_status | N2 |

## 3. Cart (`/cart` → `client/src/pages/cart.tsx`)
| Action | Claim |
|---|---|
| View cart (projection rows) | J1.6; EX: e2e-cart-redirect suite (docs/audits/trip-context-scope.md) |
| Remove item (cart.tsx:1793/1823) | F-cart-1 → deferred:post-wave-1 |
| Checkout CTA (cart.tsx:2565 → POST /api/checkout) | J1.7 |
| Add-to-existing-trip path | F-cart-2 → deferred:post-wave-1 (project task #805 overlap noted) |
| Non-projection writer inserts cart_items | N4 |

## 4. Checkout + payment (`payments.routes.ts:274`, `StripeCheckout.tsx:90`)
| Action | Claim |
|---|---|
| Pay 4242 → booking row, item purchased + log SAME transaction, projection gone, server-computed amount = fee_bands resolution | J1.7, J2 |
| Declined card | F-pay-1 → deferred:post-wave-1 |
| 3DS test card (3 handling points: client branch, /booking/confirmation redirect-back, webhook) | F-pay-2 → deferred:post-wave-1 |
| Double-submit idempotency | F-pay-3 → deferred:post-wave-1; EX: server/__tests__/booking-confirm-payment-idempotency.test.ts |
| Concurrent confirm (atomic WHERE status='pending_payment') | F-pay-4 → deferred:post-wave-1 |
| Client-supplied amount/userId ignored | N7 |
| Refund path (admin/provider) → purchased→in_planning reversal same-tx, reconciliation query zero rows | J5 → deferred:wave-3-activation |

## 5. Discover (`/discover`, `/discover/location/:city` — discover.tsx)
| Action | Claim |
|---|---|
| Gem → slip (discover.tsx:445) | J7 |
| Gem → board; boards CRUD; save/unsave | J7 + F-disc-1 → deferred:post-wave-1 |
| Board → ready-made link-up chain (monetization pointer one level up) | J7 |
| City-grid add · curated-section add | J7 |
| Filters (discover.tsx:1144/1257/1281) | F-disc-2 → deferred:post-wave-1 |
| Expert handoff CTA (discover.tsx:1085) | F-disc-3 → deferred:slip-phase-4 |
| Amadeus-fed POI/safety rows | n/a:ruling-34 (surfaces render empty; cleanup = project tasks #1040/#1041) |

## 6. AI entry (`/concierge`)
| Action | Claim |
|---|---|
| Generate draft → trip + items in_planning, providerServiceId linkage (H5 guard) | J2 |
| Continue → checkout of one item | J2 |
| Coordination fee (server-computed, idempotency key; coordination_states.tripId at creation; GET-by-trip) | J10 → deferred:slip-phase-4 (lane-3 fix proven in-journey) |

## 7. Expert workspace
| Action | Claim |
|---|---|
| Open request → reads live trip (not cart) | J1.5 → deferred:slip-phase-4; EX: console-sigma-workspace-machine.http.test.ts (status machine) |
| Add note → expert_note persisted; renders on Trip Card | J1.5/J1.8 → deferred:slip-phase-4 |
| Add item → born in_planning | J1.5 → deferred:slip-phase-4 |
| Return → with_expert→in_planning, log actor=expert | J1.5 → deferred:slip-phase-4 |
| Deliver full plan (workspaceStatus advance logged) → traveler purchase → fee_bands expert_standard resolution | J8 → deferred:slip-phase-4; pre-claim per console-sigma audit §11 D6(b) |
| Non-assigned actor forcing delivered mints no R7 credit | console-sigma §11 pre-claim (Tier 3 negative: forced-delivered mints no R7 credit) → deferred:slip-phase-4 |
| Expert sets ready_for_checkout | N1 |
| Suggest/approve flow breadth | F-exp-1 → deferred:slip-phase-4 |

## 8. Ready-made authoring / listing / purchase
| Action | Claim |
|---|---|
| Author RM (NULL-owner annotated, trackingNumber minted, ruling 17) | J9 → deferred:post-wave-1 (EX: check-trip-mint-owner-access tripwire) |
| Submit → draft→submitted→approved via admin (born-approved forbidden — status history asserted, ruling 35) | J9 + N11 → deferred:post-wave-1 |
| Purchase → clone born in_planning, no author routing status carried | J3 + N10 → deferred:post-wave-1 |
| Purchase template endpoint (server/routes.ts:3492) | J3 → deferred:post-wave-1 |

## 9. Provider surfaces (W4: post back-office P1)
| Action | Claim |
|---|---|
| Onboard → service draft→submitted→approved → bookable | J11 → deferred:provider-backoffice-p1 |
| Back-office bookings view; provider CANNOT read routing_status (contract NEVER row) | J11 + N5 → deferred:provider-backoffice-p1 |
| Short-link generation (my-offerings-table.tsx:342) → attributed booking → rails band; platform-sourced → full band; rates differ, both from fee_bands | J12 → deferred:provider-backoffice-p1 |
| Availability jsonb slot claim (claimed-at-pay) | F-prov-1 → deferred:provider-backoffice-p1 |
| Confirm completion → review gate opens → booking-gated FK review | J11 → deferred:provider-backoffice-p1 |

## 10. Admin panel
| Action | Claim |
|---|---|
| Approve/reject/resubmit services, RMs (admin.routes.ts:764/863), applications (:1436) | J9/J11 + F-adm-1 → deferred:post-wave-1 |
| Fee-band edit propagates to next resolution (fee-bands.tsx) | F-adm-2 → deferred:post-wave-1; EX: booking-fee-bootstrap-and-split-fallback.db.test.ts S2 |

## 11. Share + collaborators (`/trips/shared/:token`)
| Action | Claim |
|---|---|
| Share view renders via canonical producer, pills visible + inert, no routing actions, no log footer | J13 (verify lane-5 renderer status on main first; shared-trip.tsx currently renders ItineraryCard — tag accordingly) |
| Live render reflects post-share edit | J13 |
| Collaborator tiers per config | J13 |
| Share-view mutation attempt | N9 |
| trackingNumber as mutation identifier | N6 |

## 12. Messages / notifications (`inbox.tsx`)
| Action | Claim |
|---|---|
| Notification row: relatedType/relatedId + frozen title only | J14 → deferred:slip-phase-4 |
| Deep link → /plans/:tripId anchored, fresh render | J14 → deferred:slip-phase-4 |
| Stranger on same URL → 403 | N14 (dup of N8 via message path) |
| Mark read / delete (inbox.tsx:208/275) | F-msg-1 → deferred:post-wave-1 |

## 13. Auth / session
| Action | Claim |
|---|---|
| Login/logout/expiry per role (SignInModal.tsx:212, user-menu.tsx:207) | F-auth-1; EX: e2e/specs/login-ui.spec.ts (GREEN), auth-routes-gate CI |
| Role-routes-config smoke incl. 4 recovered pages | F-auth-2 → deferred:post-wave-1 (extend existing job) |
| Guest fallback reachable by authenticated user | N13 |
| Guest build → signup migration | J4 → deferred:G2 |

## 14. Cross-cutting negatives without a surface row
| Invariant | Claim |
|---|---|
| item_transition_log UPDATE/DELETE via app — no route exists (inventory assertion) | N12 |
| Mutation via getTripRole path — none remain (inventory assertion) | N15 |

## Existing-coverage absorption (Phase 0 item 2 — nothing deleted)
| Existing suite | Disposition |
|---|---|
| e2e/specs/journey-1.spec.ts, journey-4-5, journey-5-admin, journey-6, journey-7 (Model B, RED per docs/audits/e2e-model-b-triage.md — drift + stale deploy) | Superseded row-by-row as J-claims land; keep running non-blocking until each replacement is green, then retire per triage doc |
| e2e/specs/smoke.spec.ts, login-ui.spec.ts (GREEN) | Absorbed: F-auth-1. Both are AUTH-DEPENDENT and now run against STAGING only (`E2E_STAGING_BASE_URL`) — production purges the seeded accounts, see docs/STAGING.md |
| e2e/specs/public-smoke.spec.ts (NEW — unauthenticated) | Production smoke: public routes render + /health, /api/version, /api/ready answer. No login; run by e2e-deploy-smoke.yml |
| scripts/journeys/*.mjs (expert-loop, plan-lifecycle, store-lifecycle, traveler-comms, adversarial-money-access, partner-gate, workstation-build) | Kept as-is; journey-lib.mjs (connectDb/dbOne/dbAll) is the Tier-1 read-only DB helper |
| server/__tests__/console-sigma-*.test.ts | Kept; workspace status-machine + Kyoto bench claims cited in §7 |
| server/__tests__/booking-confirm-payment-idempotency.test.ts, coordination-ledger-gap-review.test.ts | Absorbed: F-pay-3, J10 support |

## Deferred-tag register

Every `deferred:<lane>` tag used in a claim cell above must be registered here with a status **and a named expiry owner**. `open` = the lane has not merged; the tagged cells are legitimate pre-claims exempt from test-id existence. `merged` = the lane has landed; the matrix lint then FAILS on every cell still carrying that tag, forcing the deferred test to be built (rulings 21/27). An unknown tag in a cell (absent from this register) also FAILS. Wave-only markers ((W2)/→ W2/(W3)/(W4)/slip phase 4) were normalized into these explicit tags; `deferred:journey-suite-wave-1` is a LEDGER tag (ruling 21), NOT a matrix tag, and is intentionally absent here.

**Expiry owner is mandatory (added 2026-08-05).** Ruling 21 makes a `deferred:` tag an *expiry* marker: it must name a lane that can actually merge and flip it to `merged`. A tag naming a point in time rather than a lane can never expire, so its cells sit unclaimed while wearing a legitimate-looking tag. Every row below therefore ends with `owner:` naming who flips it and on what event.

| deferred tag | status | lane / notes | expiry owner + trigger |
|---|---|---|---|
| deferred:slip-phase-4 | open | SLIP dispatch phase 4 (surfaces A/B + Get Expert Help remediation); Journey Wave 2 build | owner: SLIP dispatch lane — flips `merged` when SLIP phase 4 merges |
| deferred:wave-3-activation | open | post Lane S activation wiring — J5 money round-trip; Journey Wave 3 build | owner: journey-suite lane, Journey Wave 3 dispatch — flips `merged` when the Lane S activation wiring lands |
| deferred:provider-backoffice-p1 | open | provider back-office P1 — provider surfaces §9; Journey Wave 4 build | owner: provider back-office lane — flips `merged` when back-office P1 merges |
| deferred:lane-6 | open | optimizer residue (generation-time in-checkout rejection, ruling 4/15) | owner: Lane 6 (optimizer residue) — flips `merged` when Lane 6 merges |
| deferred:G2 | open | guest→signup migration lane (ruling 5) — J4 | owner: G2 guest-migration lane — flips `merged` when G2 merges |
| deferred:post-wave-1 | open | Tier-2 breadth specs + later-wave journeys (F-adm/F-auth-2/F-cart/F-disc/F-msg/F-pay/F-slip; J3/J9/J11 admin+RM cells). **PROVENANCE (audited 2026-08-05 @ ea0bbc05): NEW TAG, not a rename.** It has no predecessor anywhere in git — `docs/testing/coverage-matrix.md` has exactly one commit (`d45fcd0f`, PR #421) and the tag is present in that first version, while the brief, the Phase 0 findings and DECISIONS.md never mention it. It was minted mid-build to park cells that brief §3 (Tier 2) and §7 (Journey Waves 2–4) already scope, so the SCOPE is inside the approved set — but the TAG was not among the four presented at the HARD STOP (slip-phase-4, lane-6, G2, journey-suite-wave-1), and as a time-name rather than a lane-name it had no way to expire. Now owned. | owner: journey-suite lane, **Journey Wave 2 dispatch** — that dispatch MUST either build each tagged cell's F-/J- spec or re-tag it to the specific lane that owes it; the tag flips `merged` when Journey Wave 2 merges, which then FAILS the lint on every cell still carrying it (ruling 21) |
