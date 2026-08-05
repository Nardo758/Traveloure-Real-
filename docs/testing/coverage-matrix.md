# Coverage Matrix — surface × action

**Status:** SEEDED (Phase 0, journey-suite Wave 1) — awaiting HARD-STOP approval. No test code exists yet for unclaimed-by-existing-suite cells; claims below are pre-claims per brief §6.
**Sources:** rows from `docs/briefs/SLIP_EXPERIENCE_DISPATCH.md` §4 disposition + brief §1 supply-side additions; columns enumerated from actual routes/UI (file:line, Phase 0 item 1); NEVER cells from `docs/briefs/ROUTING_STATE_CONTRACT.md`.
**Cell legend:** `J*` journey step · `F*` feature spec · `N*` contract negative · `EX:*` existing test absorbed (cited) · `deferred:<lane>` feature unbuilt · `n/a:<reason>`.
**Lint rule (brief §6):** every cell claimed or marked; referenced test ids must exist in-repo once Wave 1 lands; `deferred:` tags expire when their lane merges. Landing the lint expires the standing ledger warning `[matrix-lint deferred:journey-suite-wave-1]` (rulings 21/27).

Wave key (brief §7): W1 = build now · W2 = post SLIP phase 4 · W3 = post Lane S activation wiring (Lane S itself MERGED #1028 — log assertions ACTIVE in W1 journeys) · W4 = post provider back-office P1.

## 1. Slip / plan view (`/trip/:id` → `client/src/pages/trip-details.tsx`; slip specs A/B pending SLIP phase 4)
| Action (file:line) | Claim |
|---|---|
| View slip: items, status pills, counts (trip-details.tsx render) | J1.8 (W1: Trip-Card render assertions); Spec-A pill/strip render → deferred:slip-phase-4 |
| Optimize / generate (trip-details.tsx:600 → POST /api/trips/:id/generate-itinerary) | J1.3, J6 |
| Route item → expert (trip-details.tsx:1363 → POST /api/expert-booking-requests) | J1.4 (W1: DB-facts; expert-leg UI deferred:slip-phase-4) |
| Route item → checkout (add to cart, trip-details.tsx:1180 → POST /api/cart/items) | J1.6 |
| Edit item (trip-details.tsx:1098 → PATCH /api/trips/:tripId/itinerary-items/:itemId) | F-slip-1 |
| Approve/reject expert suggestion (trip-details.tsx:1087) | deferred:slip-phase-4 |
| Share (trip-details.tsx:588) | J13 |
| Get Expert Help on empty trip | J8 → deferred:slip-phase-4 (W2) |
| Transition log footer (v1…vN order) | J1.9 (Lane S MERGED — active W1) |
| Routing actions hidden on logistics/purchased rows | N-row: contract logistics NEVER → F-slip-2 + N2 |
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
| Remove item (cart.tsx:1793/1823) | F-cart-1 |
| Checkout CTA (cart.tsx:2565 → POST /api/checkout) | J1.7 |
| Add-to-existing-trip path | F-cart-2 (project task #805 overlap noted) |
| Non-projection writer inserts cart_items | N4 |

## 4. Checkout + payment (`payments.routes.ts:274`, `StripeCheckout.tsx:90`)
| Action | Claim |
|---|---|
| Pay 4242 → booking row, item purchased + log SAME transaction, projection gone, server-computed amount = fee_bands resolution | J1.7, J2 |
| Declined card | F-pay-1 |
| 3DS test card (3 handling points: client branch, /booking/confirmation redirect-back, webhook) | F-pay-2 |
| Double-submit idempotency | F-pay-3; EX: server/__tests__/booking-confirm-payment-idempotency.test.ts |
| Concurrent confirm (atomic WHERE status='pending_payment') | F-pay-4 |
| Client-supplied amount/userId ignored | N7 |
| Refund path (admin/provider) → purchased→in_planning reversal same-tx, reconciliation query zero rows | J5 (W3) |

## 5. Discover (`/discover`, `/discover/location/:city` — discover.tsx)
| Action | Claim |
|---|---|
| Gem → slip (discover.tsx:445) | J7 |
| Gem → board; boards CRUD; save/unsave | J7 + F-disc-1 |
| Board → ready-made link-up chain (monetization pointer one level up) | J7 |
| City-grid add · curated-section add | J7 |
| Filters (discover.tsx:1144/1257/1281) | F-disc-2 |
| Expert handoff CTA (discover.tsx:1085) | F-disc-3 → W2 |
| Amadeus-fed POI/safety rows | n/a:ruling-34 (surfaces render empty; cleanup = project tasks #1040/#1041) |

## 6. AI entry (`/concierge`)
| Action | Claim |
|---|---|
| Generate draft → trip + items in_planning, providerServiceId linkage (H5 guard) | J2 |
| Continue → checkout of one item | J2 |
| Coordination fee (server-computed, idempotency key; coordination_states.tripId at creation; GET-by-trip) | J10 (W2+; lane-3 fix proven in-journey) |

## 7. Expert workspace
| Action | Claim |
|---|---|
| Open request → reads live trip (not cart) | J1.5 → W2 (deferred:slip-phase-4); EX: console-sigma-workspace-machine.http.test.ts (status machine) |
| Add note → expert_note persisted; renders on Trip Card | J1.5/J1.8 → W2 |
| Add item → born in_planning | J1.5 → W2 |
| Return → with_expert→in_planning, log actor=expert | J1.5 → W2 |
| Deliver full plan (workspaceStatus advance logged) → traveler purchase → fee_bands expert_standard resolution | J8 → W2; pre-claim per console-sigma audit §11 D6(b) |
| Non-assigned actor forcing delivered mints no R7 credit | N-sigma (Tier 3) — pre-claim per console-sigma audit §11 |
| Expert sets ready_for_checkout | N1 |
| Suggest/approve flow breadth | F-exp-1 → W2 |

## 8. Ready-made authoring / listing / purchase
| Action | Claim |
|---|---|
| Author RM (NULL-owner annotated, trackingNumber minted, ruling 17) | J9 (W-post-W1; EX: check-trip-mint-owner-access tripwire) |
| Submit → draft→submitted→approved via admin (born-approved forbidden — status history asserted, ruling 35) | J9 + N11 |
| Purchase → clone born in_planning, no author routing status carried | J3 + N10 |
| Purchase template endpoint (server/routes.ts:3492) | J3 |

## 9. Provider surfaces (W4: post back-office P1)
| Action | Claim |
|---|---|
| Onboard → service draft→submitted→approved → bookable | J11 (W4) |
| Back-office bookings view; provider CANNOT read routing_status (contract NEVER row) | J11 + N5 |
| Short-link generation (my-offerings-table.tsx:342) → attributed booking → rails band; platform-sourced → full band; rates differ, both from fee_bands | J12 (W4) |
| Availability jsonb slot claim (claimed-at-pay) | F-prov-1 (W4) |
| Confirm completion → review gate opens → booking-gated FK review | J11 (W4) |

## 10. Admin panel
| Action | Claim |
|---|---|
| Approve/reject/resubmit services, RMs (admin.routes.ts:764/863), applications (:1436) | J9/J11 + F-adm-1 |
| Fee-band edit propagates to next resolution (fee-bands.tsx) | F-adm-2; EX: booking-fee-bootstrap-and-split-fallback.db.test.ts S2 |

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
| Notification row: relatedType/relatedId + frozen title only | J14 (W2) |
| Deep link → /plans/:tripId anchored, fresh render | J14 (W2) |
| Stranger on same URL → 403 | N14 (dup of N8 via message path) |
| Mark read / delete (inbox.tsx:208/275) | F-msg-1 |

## 13. Auth / session
| Action | Claim |
|---|---|
| Login/logout/expiry per role (SignInModal.tsx:212, user-menu.tsx:207) | F-auth-1; EX: e2e/specs/login-ui.spec.ts (GREEN), auth-routes-gate CI |
| Role-routes-config smoke incl. 4 recovered pages | F-auth-2 (extend existing job) |
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
| e2e/specs/smoke.spec.ts, login-ui.spec.ts (GREEN) | Absorbed: F-auth-1 |
| scripts/journeys/*.mjs (expert-loop, plan-lifecycle, store-lifecycle, traveler-comms, adversarial-money-access, partner-gate, workstation-build) | Kept as-is; journey-lib.mjs (connectDb/dbOne/dbAll) is the Tier-1 read-only DB helper |
| server/__tests__/console-sigma-*.test.ts | Kept; workspace status-machine + Kyoto bench claims cited in §7 |
| server/__tests__/booking-confirm-payment-idempotency.test.ts, coordination-ledger-gap-review.test.ts | Absorbed: F-pay-3, J10 support |
