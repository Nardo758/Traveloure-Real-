# Staleness pass — 564 Replit board tasks
Run 2026-09-22 against `Nardo758/Traveloure-Real-` @ `65076ea`. Read-only against the codebase; this file and its `.tsv` are the only additions.

**G1 (money, 73) and G9 (security, 45) are FULLY tier A** — every row in both groups carries `file:line` evidence. The remaining groups are unchanged from the first pass.
## Method and its limits
Three evidence tiers. **Every row states which tier it rests on — a tier-C row is routed, not adjudicated.**
- **A — verified (148):** opened the code; basis carries `file:line`.
- **B — probed (50):** targeted identifier grep over 2,232 source files. `built+tested` = feature area present AND matched by a file under `__tests__`/`e2e`/`.github`. `none` = no implementation under the probed identifiers (low confidence, not proof of absence).
- **C — routed (366):** not individually probed. Classified by governance rule only.

**What this pass cannot see** (no `node_modules`, no production DB, no browser in this container): anything needing `tsc` with dependencies, prod schema/ledger state, or rendered UI. Those are marked `NEEDS-RUNTIME`.

Generic keyword scoring was tried and **discarded**: `server/routes.ts` and `server/storage.ts` are large enough that 561/564 titles scored 'high' against them. Only targeted identifier probes discriminate here.

## Verdicts

| Verdict | Count | Meaning |
|---|---:|---|
| BUILD | 332 | Ordinary work, or no implementation found. |
| TEST-PROGRAM | 73 | Verification task, not product work. |
| CLOSE-DONE | 46 | Built and evidenced. Close. |
| OPEN-VALID | 29 |  |
| VERIFY-THEN-CLOSE | 24 | Area built AND test-covered; owner confirms then closes. |
| LIKELY-DONE | 12 |  |
| PARTIAL | 10 |  |
| VERIFY | 10 | Area built, no test coverage found. |
| CLOSE-CONFLICT | 6 | Would regress or targets a ruled-dead surface. Close with pointer. |
| RULE-FIRST | 6 | A decision, not a build. PUNCHLIST §1. |
| LANE-BRIEF | 3 | Program-sized; fold into an existing lane. |
| NEEDS-RUNTIME | 3 | Needs prod DB / deps to settle. |
| CLOSE-DUPLICATE | 2 | Same as another task. |
| OPEN-RESHAPE | 2 |  |
| NEEDS-RUNTIME(operator) | 1 |  |
| OPEN-VALID+RULE | 1 |  |
| UPGRADE->LIKELY-DONE | 1 |  |
| DOWNGRADE(board overstates) | 1 |  |
| CLOSE-OBSOLETE | 1 | Targets a retired rail. |
| UNVERIFIED-NARROW | 1 |  |

## Routing class (all 564, deterministic from title + governance rules)

| Class | Count |
|---|---:|
| BUILD | 338 |
| TEST-PROGRAM | 112 |
| LANE-BRIEF(money §8/§14/§18/§19) | 60 |
| LANE-BRIEF(security) | 44 |
| LANE-BRIEF(schema/publish-trap) | 10 |

`LANE-BRIEF(*)` = touches an artifact CLAUDE.md governs (§8 fee_bands, §14 server-derived amount/identity, §18 rates, §19 allowlist, publish-trap schema rules). **114 tasks. None of them can be executed as a standalone ticket** — each needs a lane brief per `docs/OPERATING_PROCEDURE.md`.

## Close now — no work required (55)
These are settled: built, superseded, duplicated, or aimed at a surface a Locked Decision retires.

| # | Grp | Title | Basis |
|---|---|---|---|
| 153 | G1 | Schedule automatic nightly reconciliation so admins don't have to trig | Registered daily bucket: internal.routes.ts:177 {job:"stripe-reconciliation",bucket:"daily"}; posted by scripts/ci/post-internal-jobs.sh:306; external cron jobs-cron.yml:65. In-process timer also at server/index.ts:797. |
| 216 | G1 | Update default commission rate in the database for existing services | §18/MI-1 deliberately REMOVED the stamped per-service rate; charge path resolves from fee_bands. Writing a default re-opens the closed override. |
| 217 | G1 | Prevent bad commission rates from being saved in the first place | revenueShareRate .omit() shared/schema.ts:2918 + storage strip storage.ts:2515 (§18 MI-1, two layers) |
| 320 | G1 | Protect tip payouts from silent rate drift by routing them through the | Tips route through the central resolver: commission.ts:276 `if (opts.category === "tip") return TIP_HANDLING_BAND` + fee-band-requirements.ts:93. |
| 321 | G1 | Add an admin screen to view and edit all commission rates in one place | client/src/pages/admin/fee-bands.tsx — generic band editor (band_key/rate_type/max_amount, PATCH /api/admin/fee-bands) |
| 351 | G1 | Show optimization fee pricing on the Pricing page so users know the co | pricing.tsx:54 + :205 render optimizerRunDisplay.priceCents on the Pricing page. |
| 579 | G1 | Make the Booking Concierge fee amount configurable from the admin pane | fee_bands row expert_concierge_booking + cap (LD 51), editable via admin/fee-bands.tsx |
| 584 | G1 | Make sure the price shown in the cart always matches what gets charged | FP-4 mechanism: cart.tsx:1009 + :1077 snapshot the real server-derived breakdown, which is what makes preview and charge the same number. |
| 585 | G1 | Remove duplicate provider-role fee logic to keep pricing consistent | direct-charge-rate.service.ts:6-12 states it is the single authority on EVERY provider charge path, "not just the attributed one" - the duplicate provider-role path was removed. |
| 846 | G1 | Prevent provider earnings from being counted twice if a booking confir | server/__tests__/booking-confirm-payment-idempotency.test.ts cites #846; CI-wired (suite-server-tests.yml); not in orphan baseline |
| 874 | G1 | Prevent a refunded coordination fee from re-entering pending via the w | server/__tests__/coordination-fee-refund-guard.test.ts cites #874; CI-wired |
| 875 | G1 | Confirm the coordination fee refund flow fully resets credits so they  | server/__tests__/coordination-refund-credit-release.test.ts cites #875; CI-wired |
| 876 | G1 | Confirm the refund flow can't leave Stripe and the database out of syn | server/__tests__/refund-retry-convergence.test.ts cites #876; CI-wired |
| 877 | G1 | Let admins mark a ledger gap as reviewed so the warning doesn't stay r | server/__tests__/coordination-ledger-gap-review.test.ts cites #877 + migration 169 + admin/concierge-requests.tsx:169; CI-wired |
| 1182 | G1 | Make sure active Stripe status also stops payout reminders, not just c | BOARD IS STALE: the predicate already covers it - stripe-connect-reminder.service.ts:119 `stripe_account_status not in ('complete','active')`. Reminders already stop for 'active'. |
| 1269 | G1 | Confirm provider earnings summary shows real figures end-to-end on the | provider/earnings.tsx:63 `available: number; // releasable - payable now` and :392 reads "the existing (already-live) summary endpoint - neither invents numbers" (§13-clean). |
| 1344 | G1 | Confirm booking counts on provider catalog cards stay accurate when a  | storage.ts:3539-3546 decrements bookingsCount on the FIRST transition to cancelled/refunded only, guarded on priorStatus - idempotent by construction. |
| 1582 | G1 | Prevent template-purchase commission from being double-recorded on a p | template_purchases is the RETIRED expert_templates lane (historical rows only, ledger 2026-09-03-expert-templates-consumer-sunset). Work on a dead rail. |
| 844 | G3 | Make sure the itinerary-comparison flow cannot silently fail again if  | scripts/check-unmounted-routers.cjs — LD 9 names it the arbiter of dark-route claims |
| 872 | G3 | Prevent itinerary booking from silently failing when no activities wer | LD 42 D14 RETIRES /quick-start. Still live client/src/App.tsx:604 (1124-line page). Real work is DELETION. |
| 873 | G3 | Make sure the quick-start itinerary flow completes checkout end-to-end | LD 42 D14 RETIRES /quick-start — see #872. |
| 755 | G4 | Let EAs manage important dates directly from the dashboard | cited in ledger DECISIONS.md:496 |
| 1557 | G4 | Confirm mid-flow redirect guard without a draft ID | Identical title to #1558. |
| 1558 | G4 | Confirm mid-flow redirect guard without a draft ID (duplicate of 1557) | Identical title to #1557. |
| 1190 | G8 | Bound the Fever cache size | server/services/fever.service.ts:725 cites #1190 |
| 354 | G9 | Preserve guest carts during sign-in | Code cites it: trip-selection.ts:28 "the desync class fixed by #354 and re-found by #972". Fixed; the regression is tracked as #972, which is NOT on this board. |
| 378 | G9 | Replace the expired Stripe live key in development | A live key in dev IS the defect; runtime-health.service.ts:264 asserts sk_test_ in non-prod. Reshape to 'use a test key'. |
| 484 | G9 | Rate-limit forgot-password requests | cited in ledger + provider-console-gate.yml |
| 487 | G9 | Apply collaborator role checks to all write endpoints | V-29 DELETED getTripWriteRole/canMutateTrip; one resolver authorizeTripLogistics(requireWriteAccess) answers. Pinned by one-trip-write-resolver.db.test.ts:366. |
| 1178 | G9 | Catch missing auth guards on payment routes | scripts/check-money-endpoints.cjs exists AND is a required context ("money-endpoint-guard (CLAUDE.md §14)"). |
| 1271 | G9 | Enforce the shared auth-helper convention | Shared helper server/utils/auth.ts getUserId; convention enforced by the required context "claims-only-lookup-guard (session-user extraction)". |
| 1316 | G9 | Clean stored provider-service HTML | Sanitized at the write rail: routes.ts:3783 `sanitizeStringFields(insertProviderServiceSchema.parse(...))`, plus :3691 for content. Historical rows are #1400, still open. |
| 1317 | G9 | Prevent double-escaped trip text | text-sanitizer.ts:19 documents why bare angle brackets are deliberately NOT entity-encoded (React escapes at render) - that IS the double-escape prevention. |
| 1388 | G9 | Block non-EAs from EA pages and APIs | server/middleware/ea-rbac.ts isEA — applies to every /api/ea/* route |
| 1391 | G9 | Enforce suspension through Facebook login | facebookAuth.ts:143 refuses a suspended account at the strategy. |
| 1399 | G9 | Sanitize provider applications | admin.routes.ts:6 imports sanitizeText + sanitizeStringFields for the application rails. |
| 1461 | G9 | Enforce user blocking through WebSockets | websocket.ts:198 - block enforcement via createChat's sentinel when a block row exists. |
| 1468 | G9 | Confirm ADMIN_EMAIL bootstrap | server/index.ts:904 bootstraps the admin account from ADMIN_EMAIL. |
| 1471 | G9 | Preserve role changes when audit insertion fails | role-transition.ts:21 - the audit write runs INSIDE the role/audit transaction so no caller can bypass it. |
| 1472 | G9 | Verify role-change audit records | server/__tests__/role-audit-atomicity.db.test.ts (A1 asserts oldRole/newRole), accessAuditLogs action="role_change". |
| 1474 | G9 | Audit application approval and rejection role changes | role-transition.ts:8 covers the approval/rejection handlers explicitly. |
| 1475 | G9 | Prevent silent audit loss during database pressure | Same lane: role-audit-atomicity.db.test.ts is real-DB with failure injection. |
| 303 | G10 | Clear the 174-error TypeScript baseline | Stale number + obsolete framing: build.yml:238 holds TSC_BASELINE 129, ratcheting 199->129 down-only. 174 never appears in that history. |
| 1397 | G10 | Detect partial non-unique index drift before publishing | scripts/preflight-prod-unique-indexes.cjs |
| 1398 | G10 | Find schema declarations missing migration-added columns | scripts/check-undeclared-tables.cjs + preview-ai-cost-tracking-shape.cjs |
| 567 | G11 | Catch migration-chain gaps | migration-files.ts is canonical for runtime AND the chain-integrity test (CLAUDE.md) |
| 776 | G11 | Block merges with broken app routes | 'app-routes-smoke' already a required context in .github/branch-protection.json |
| 777 | G11 | Block broken auth-gated routes | 'auth-routes-smoke' already a required context in .github/branch-protection.json |
| 789 | G11 | Require the bundle-build check | 'build (vite + esbuild bundle)' already a required context |
| 800 | G11 | Detect workflows that fail to initialize Postgres | .github/workflows/ci-db-setup-lint.yml |
| 871 | G11 | Detect server tests that silently don't run | scripts/check-test-files-wired.cjs (§18d) + 'test-file-reachability' required context |
| 1764 | G11 | Stop publishing when the approved revision changes | scripts/publish-preflight.cjs |
| 435 | G12 | Standardize city-name capitalization | cited in ledger DECISIONS.md:725 |
| 528 | G13 | Extend double-confirmation protection to service bookings | server/utils/booking-from-states.ts + expectedFromStatuses atomic conditional (§18b); ledger DECISIONS.md:339 |
| 1562 | G13 | Prevent duplicate bookings under concurrency | unique service_bookings_idempotency_key_idx shared/schema.ts:1803 + §15 claim-then-call |

## Rule first — not buildable as written (12)

| # | Grp | Title | Basis |
|---|---|---|---|
| 495 | G1 | FEE-2 Phase 3: Per-market insurance rate overrides | Per-market insurance RATE is a fee decision (§8 no rate literals). PUNCHLIST §1 row before build. |
| 861 | G1 | Prevent non-early-adopter providers from getting the beta rate when th | CONFIRMED and inverted from the board's framing: isEarlyAdopterProvider (commission.ts:521) returns TRUE - the beta rate - when the setting is MISSING (:522) or the date invalid (:524). Exiting beta by removing the setting silently puts everyone back on the beta rate. Which way this fallback should fail is a money decision (§8/§18), not a ticket. |
| 1348 | G1 | Prevent stale booking counts when the server restarts mid-cancellation | PREMISE CONTRADICTED IN CODE: storage.ts:3535-3538 keeps the decrement deliberately OUTSIDE the transaction, stating it is "a display counter, not a money or inventory invariant, so it does not need the same all-or-nothing guarantee". The task asks for the guarantee the code declined. Moving it inside the tx is a decision, not a fix. |
| 1666 | G1 | Define repeat-booking attribution before applying any storefront fee b | Self-declared definition task ('define ... before applying'). PUNCHLIST §1. |
| 1686 | G1 | Restore provider fee bands before provider checkout is enabled | Gating precondition on provider checkout — money/sequencing decision. |
| 1177 | G9 | Audit auth gates across privileged route files | Overlaps the mutation-auth program (#1679) + docs/security/tier2-development-audit-2026-08-20.md. Fold in, don't run a second audit. |
| 1677 | G9 | Prevent cross-user payment-record changes | Same program as #1678/#1679 — one lane, not three tickets. |
| 1678 | G9 | Prevent cross-account traveler, expert, and provider changes | Same program as #1677/#1679. |
| 1679 | G9 | Require authorization proof on every remaining mutation route | Not a task: a program over 588 mutation endpoints. generated/security/mutation-auth-coverage.md stale (2026-08-26, hash mismatch, reads 0/588); check:mutation-auth-coverage wired into NO workflow. Regenerate before sizing. |
| 632 | G10 | Stamp removed migration 075 in production | 075 already deleted and removed from migration-files.ts (registry L116-121). Prod stamping is an operator action. |
| 1258 | G10 | Verify undeclared tables against production | Guard exists (check-undeclared-tables.cjs); 'verify against production' needs the prod DB. |
| 525 | G11 | Verify migrations on a fresh production database | Requires a fresh production-shaped DB. |

## Verify then close — area built and test-covered (24)
Probe found the feature area present AND covered by a test/CI file. Highest-yield batch: one owner pass should close most of these.

| # | Grp | Title | Basis |
|---|---|---|---|
| 229 | G3 | Fully migrate itinerary and shared-view pages to use the unified PlanC | Feature area present and test/gate-covered (178 files, 47 test/CI). |
| 352 | G3 | Show In plan state on browse catalog cards across the whole site | Feature area present and test/gate-covered (33 files, 9 test/CI). |
| 367 | G3 | Let users click the AI Optimized banner to jump straight to the optimi | Feature area present and test/gate-covered (4 files, 1 test/CI). |
| 485 | G3 | Build a UI for inviting friends and experts to collaborate on a trip | Feature area present and test/gate-covered (32 files, 11 test/CI). |
| 486 | G3 | Let friends suggest activity changes instead of being silently blocked | Feature area present and test/gate-covered (23 files, 5 test/CI). |
| 1670 | G3 | Show travelers their full trip plan count, not just items ready for ch | Feature area present and test/gate-covered (73 files, 24 test/CI). |
| 1671 | G3 | Make provider-service Book now flows route through the trip plan, not  | Feature area present and test/gate-covered (16 files, 3 test/CI). |
| 301 | G10 | Fix legacy route-helper and service TypeScript errors | Feature area present and test/gate-covered (4 files, 1 test/CI). |
| 843 | G10 | Remove duplicate inline route implementations | Feature area present and test/gate-covered (16 files, 3 test/CI). |
| 286 | G11 | Add cache regression tests | Feature area present and test/gate-covered (13 files, 10 test/CI). |
| 322 | G11 | Add commission-rate regression tests | Feature area present and test/gate-covered (2 files, 2 test/CI). |
| 490 | G11 | Add automated route coverage | Feature area present and test/gate-covered (13 files, 9 test/CI). |
| 712 | G11 | Catch stale navigation and footer links | Feature area present and test/gate-covered (10 files, 7 test/CI). |
| 715 | G11 | Check navbar links | Feature area present and test/gate-covered (6 files, 4 test/CI). |
| 743 | G11 | Share build cache across CI workflows | Feature area present and test/gate-covered (21 files, 21 test/CI). |
| 750 | G11 | Seed EA gifts and events for CI | Feature area present and test/gate-covered (3 files, 2 test/CI). |
| 804 | G11 | Catch broken cart redirects | Feature area present and test/gate-covered (5 files, 3 test/CI). |
| 807 | G11 | Catch broken React navigation calls | Feature area present and test/gate-covered (84 files, 6 test/CI). |
| 808 | G11 | Catch broken Wouter location calls | Feature area present and test/gate-covered (183 files, 8 test/CI). |
| 827 | G11 | Catch /discover mobile regressions | Feature area present and test/gate-covered (1 files, 1 test/CI). |
| 1248 | G11 | Keep hydration test resets out of production | Feature area present and test/gate-covered (6 files, 1 test/CI). |
| 215 | G13 | Add schedule checks beyond dinner gaps | Feature area present and test/gate-covered (4 files, 1 test/CI). |
| 1179 | G13 | Batch stale and stuck booking admin lists | Feature area present and test/gate-covered (10 files, 3 test/CI). |
| 1430 | G13 | Block duplicate Decline dialogs | Feature area present and test/gate-covered (3 files, 1 test/CI). |

## Verify — area built, no test coverage found (10)

| # | Grp | Title | Basis |
|---|---|---|---|
| 291 | G3 | Fully unify the expert shared-view into PlanCard so the expert edit mo | Feature area present, no test/gate coverage found (1 files). |
| 356 | G3 | Let users pick which day of their trip to schedule each saved item | Feature area present, no test/gate coverage found (3 files). |
| 373 | G3 | Show a Re-optimize nudge banner inside the itinerary tab when optimiza | Feature area present, no test/gate coverage found (1 files). |
| 379 | G3 | Keep the optimization comparison fresh after the optimizer finishes | Feature area present, no test/gate coverage found (6 files). |
| 289 | G10 | Index service demand signals | Feature area present, no test/gate coverage found (6 files). |
| 290 | G10 | Fix the unified-result-card syntax error | Feature area present, no test/gate coverage found (3 files). |
| 762 | G11 | Test broken shared itinerary links | Feature area present, no test/gate coverage found (1 files). |
| 1416 | G11 | Run WebKit smoke tests in CI | Feature area present, no test/gate coverage found (2 files). |
| 667 | G13 | Prevent services disappearing during category changes | Feature area present, no test/gate coverage found (1 files). |
| 1563 | G13 | Make content-registration failure non-fatal | Feature area present, no test/gate coverage found (1 files). |

## No implementation found under probed identifiers (16)
Low confidence (absence of a name is not absence of a feature), but these are the strongest genuinely-open candidates.

| # | Grp | Title | Basis |
|---|---|---|---|
| 357 | G3 | Let users convert discover saves into a trip directly from the Discove | No implementation found under probed identifiers. |
| 382 | G3 | Show upsell suggestions as a persistent sidebar panel on the compariso | No implementation found under probed identifiers. |
| 678 | G11 | Cover /earn error banners in smoke tests | No implementation found under probed identifiers. |
| 714 | G11 | Check static-page links | No implementation found under probed identifiers. |
| 742 | G11 | Keep EA route smoke lists synchronized | No implementation found under probed identifiers. |
| 788 | G11 | Parallelize auth-route checks | No implementation found under probed identifiers. |
| 791 | G11 | Share setup cache across gate workflows | No implementation found under probed identifiers. |
| 806 | G11 | Catch broken navbar navigation | No implementation found under probed identifiers. |
| 824 | G11 | Catch broken fee-config redirects | No implementation found under probed identifiers. |
| 825 | G11 | Verify parameterized redirects | No implementation found under probed identifiers. |
| 1292 | G11 | Seed a paid confirmed booking for completion tests | No implementation found under probed identifiers. |
| 1405 | G11 | Detect iOS keyboard-covered checkout fields | No implementation found under probed identifiers. |
| 1526 | G11 | Catch broken listing submission | No implementation found under probed identifiers. |
| 1238 | G13 | Verify skip-modal rebooking | No implementation found under probed identifiers. |
| 1273 | G13 | Rebalance workload when experts stop accepting handoffs | No implementation found under probed identifiers. |
| 1429 | G13 | Hide Accept after booking acceptance | No implementation found under probed identifiers. |

## Findings from the G1/G9 tier-A promotion

The six worth acting on regardless of board hygiene:

| # | Finding |
|---|---|
| #1255 | §13 violation: `booking-com-commissions.service.ts` returns `0` on non-OK status (`:76`), fetch error (`:92`) and missing field (`:82`,`:88`). "Unknown" rendered as "zero commission". |
| #861 | `isEarlyAdopterProvider` (`commission.ts:521`) returns the BETA rate when the setting is missing (`:522`) or invalid (`:524`) — exiting beta by removing the setting silently reverts every provider. Needs a ruling on which way it fails. |
| #1347 | `totalRevenue` has only increment writes (`storage.ts:3737`, `affiliate.service.ts:396`), no decrement — while `bookingsCount` DOES decrement (`storage.ts:3544`). A refunded booking leaves revenue permanently inflated. |
| #350 → #857 | `handlePaymentFailed` keys on `bookingIds` (`stripe-payment.service.ts:926`); an optimizer PI carries `type="optimization_fee"`+`userId` and no `bookingIds` (`optimization.routes.ts:554`), so its failures are unhandled — which is why #857's credits can strand. |
| #1431/#1432 | `requireOwnership` (`ownershipGuard.ts:18`) has ZERO live call sites; its only mention is a comment at `trips.routes.ts:371` saying it cannot be used. §18c delete-or-adopt. |
| #504 | EA access to another person's client data writes no audit row (`ea-rbac.ts`, `ea.routes.ts`). |

**Three board rows were corrected rather than actioned:** #1581 overstates a double-pay that two layers already prevent; #1348 asks for a guarantee `storage.ts:3535-3538` explicitly declines in a comment; #1182 is already satisfied (`not in ('complete','active')`). #354 is fixed and its regression is tracked as **#972 — which is not on this board**.
