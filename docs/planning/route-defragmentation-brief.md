# Route Defragmentation Cleanup (Post-Launch)

**Goal:** Finish the half-done extraction of `server/routes.ts` (20K LOC, 642 inline endpoints) into the `server/routes/*.routes.ts` modules that already mirror them but aren't mounted. Result: `routes.ts` shrinks to ~500 LOC (the mount/register orchestration); each domain owns its own module; new contributors can find what serves any URL by file name.

**Status:** **POST-LAUNCH cleanup**. Not blocking the first-market launch. Sized here so it doesn't get lost.

**Owner:** TBD (no specific FEE / CON / LB owner — this is platform hygiene).

**Target:** Claude Code, repo working tree. Multi-session.

---

## SITUATION (from the survey)

`server/routes.ts` defines **642 endpoints inline** and is the LIVE serving layer.

Six route modules exist as exact-path duplicates but are **not `app.use()`-mounted**:

| Module | Endpoints | Duplicated in routes.ts |
|---|---|---|
| `admin.routes.ts` | 102 | 92 |
| `content.routes.ts` | 243 | 237 |
| `experts.routes.ts` | 163 | 160 |
| `trips.routes.ts` | 85 | 82 |
| `bookings-domain.routes.ts` | 47 | 44 |
| `payments.routes.ts` | 13 | 13 |
| **Total** | **653** | **628** |

The remaining 11 modules ARE mounted and own their URLs exclusively (instagram, bookings, booking-actions, messages, my-itinerary, transport-hub, plancard, optimization, concierge, identity, webhooks).

**Concrete consequence already observed:** prior work (FEE-A payment-amount validator + payment-authorization gate at CON-A.P2) landed in `trips.routes.ts` (DEAD) instead of `routes.ts:6682` (LIVE), leaving an open billing leak. **Closed in `d886791` (LB-P3.5)** by porting the gate into the live handler — but the structural risk remains: any future fix made in an unmounted module is silently dead code.

`/api/booking-fee-config` is a smaller symptom: defined in three places (`routes.ts:18629`, `payments.routes.ts:571`, `admin.routes.ts:3971`). All three are reachable depending on registration order or are dead. Functional today, brittle tomorrow.

---

## DESIGN — ONE MODULE AT A TIME, FOLLOW THE PROVEN PATTERN

The 11 already-mounted modules show the safe pattern:
1. Module declares `const router = Router(); router.post(...)...; export default router;`.
2. `routes.ts` imports + `app.use(router)` once.
3. Inline declarations for those URLs are deleted from `routes.ts`.
4. **Verification:** one Playwright test per migrated endpoint (or per major endpoint group) confirms the URL still serves the same response shape.

Apply this pattern to each of the six unmounted modules, in dependency order (small modules first; the test suite catches drift early).

---

## PROPOSED PHASE BREAKDOWN

Each phase is one module's extraction. Sequenced smallest → largest so the testing pattern stabilizes before the big modules.

| Phase | Module | Endpoints | Risk |
|---|---|---|---|
| **P1** | `payments.routes.ts` | 13 | Low — small, isolated, mostly Stripe Connect flows |
| **P2** | `bookings-domain.routes.ts` | 47 | Medium — touches commerce |
| **P3** | `trips.routes.ts` | 85 | Medium — touches the same path our LB-P3.5 leak was on; tests should already cover the gate |
| **P4** | `experts.routes.ts` | 163 | High — large module, many EA + expert routes |
| **P5** | `admin.routes.ts` | 102 | High — admin-only but many surfaces |
| **P6** | `content.routes.ts` | 243 | Highest — largest module, most callers |

Each phase produces:
1. **Test sweep first.** Playwright tests covering the module's endpoints. Use the API-direct pattern (no UI walk) for speed. Tests assert response shape + status codes against the LIVE routes.ts handler BEFORE the swap, so post-swap they catch drift.
2. **Mount the module.** Single-line `app.use(moduleRoutes)` in `routes.ts` registration block.
3. **Verify identical behavior.** Run the test sweep — should pass identically.
4. **Delete the routes.ts inline duplicates.** Big diff. Tests catch any reachability drift.
5. **Re-run the test sweep.** Final confirmation. If green, commit.

Each phase commits as `refactor(route-defrag.Pn): extract {module}`.

---

## DECIDED DEFAULTS

- **D1 No behavioral changes.** This is a pure structural refactor. If a module has a subtle bug, port the bug — fix it in a separate commit so the diff stays auditable.
- **D2 Tests come first.** Before deleting any routes.ts line, the corresponding endpoint must be Playwright-covered. Tests written against routes.ts behavior; they then validate routes/X.routes.ts identical behavior.
- **D3 One module per phase.** No batching. Easier review, smaller blast radius if a phase needs revert.
- **D4 Keep the in-code constants.** `routes.ts` will still hold many helpers, type definitions, and the registration block. Don't try to delete the file; just shrink it to its orchestration responsibility.
- **D5 Mount path consistency.** Each module's `router.post("/api/foo/...")` already includes the full path. Mount with bare `app.use(router)` (no path prefix). Matches the existing pattern for `myItineraryRoutes`, `plancardRoutes`, etc.
- **D6 Existing call sites for service-layer code stay put.** This refactor affects only routes — not services. `pricing.service.ts`, `commission.ts`, etc. are untouched.

---

## GLOBAL "WHAT NOT TO DO"

- **Do not change route handler logic.** Pure copy-mount-verify-delete. Any improvement (validation, error handling) lives in a follow-up commit.
- **Do not skip the test sweep.** This is the safety net that lets us delete 628 lines of duplicate code without praying.
- **Do not migrate multiple modules in one commit.** Single module per phase.
- **Do not "fix" the in-module bug while you're there.** Bugs ride along until called out separately. Same diff = same review.
- **Do not consolidate the duplicate definitions of `/api/booking-fee-config`** in this refactor; that's its own small fix (the canonical lives in `payments.routes.ts` per the LB-P2 brief). Handle it as P1's first deletion target.

---

## HARD PREREQS

1. **First market launched and stable.** This is a 2-3 week refactor with real revert risk per phase. Don't do it under launch pressure.
2. **Existing Playwright suite green.** `playwright/tests/optimization-payment-gate.spec.ts` + `concierge-phase-a.spec.ts` + `lb-p1-password-reset.spec.ts` must all pass cleanly so we know the baseline works before we extend.
3. **Feature freeze on the affected module for the duration of its phase.** No concurrent changes; the diff is too big to merge-conflict gracefully.

---

## ESTIMATED EFFORT

- P1 (payments): ~half-day
- P2 (bookings-domain): ~day
- P3 (trips): ~day
- P4 (experts): ~2 days
- P5 (admin): ~1.5 days
- P6 (content): ~2-3 days

**Total: ~7-9 days of focused work.** Acceptable as post-launch hygiene; sized so it can interleave with feature work in the 4-6 weeks after first-market launch.

---

## SUCCESS METRICS

After completion:
- `routes.ts` LOC drops from 20,289 to ≤ 800 (orchestration + a few uncategorized helpers).
- Every URL path is defined in exactly one file.
- `grep -c "app.use(" server/routes.ts` returns ~18 (the mount list).
- All Playwright tests green.
- No behavioral regressions in production for 7 days post-merge.

---

## KNOWN RISK CALLOUTS

- **Hidden import cycles.** Some `routes/*.routes.ts` modules import from each other; routes.ts inlines may rely on different orderings. Resolve by extracting shared helpers to `server/lib/` before mounting.
- **Middleware ordering.** routes.ts may apply per-route middleware via the inline definition; the module form needs to apply the same middleware on the router. Verify per endpoint.
- **Test coverage of the long tail.** 243 content.routes.ts endpoints can't all get Playwright tests in a P6 phase — prioritize the ones with non-trivial state changes; smoke-test the rest via response-shape comparison only.
- **`payments.routes.ts` carries the `expertId` threading (EXP-OVR.P2)** + a copy of the FEE-A payment-amount validator. When migrating P1, verify routes.ts:6391 etc. have the equivalent logic so deletion is safe.

---

## OUT OF SCOPE

- New endpoints (would be added to the module in its post-extraction form).
- Service-layer refactors (`server/services/*`).
- Schema changes.
- Behavioral fixes — those ride separate briefs.
- The mounted-already 11 modules (instagram, bookings, etc.) — they're done.
