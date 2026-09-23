# Dispatch — the 88 risk-bearing mutation routes with no authorization proof

**For the Replit workspace. Written 2026-09-23 against `main` @ `c82daef`.**
Coverage source of record: `generated/security/mutation-auth-coverage.json` (manifest sha
`1e817f10…`, evidence timestamped 2026-09-22T02:55Z, `passed: true`).

---

## 0. Two corrections before anything else

**(a) The branch-protection enforcer is ALIVE again, and earlier dispatches saying otherwise are
stale.** `enforce-branch-protection.yml` run **859** (2026-09-22 21:00Z) **succeeded**, after
PR #1043 fixed the contexts payload. Every prior dispatch in this series said it had 403'd on every
run since ~2026-08-30 and named `BRANCH_PROTECTION_PAT` as the highest-value operator step.
**That is no longer the ask** — do not create the PAT on the strength of those documents.

**(b) What that reveals is worse, and it is the reason this dispatch exists.** Now that the
declared set is actually applied, `.github/branch-protection.json` carries **13 required
contexts and `suite-mutation-auth` is not one of them.** So the entire authorization audit —
every probe below, and the 291 already passing — **is advisory. A PR can merge with it red.**
`money-endpoint-guard (CLAUDE.md §14)` is required; the authorization audit is not.

Making it required is a one-line repo change, not an operator step, so **it is not yours** — it is
tracked in the checkout. It is stated here because it changes what a green run means, and because
nobody should build 88 probes onto a gate that cannot fail a merge.

---

## 1. What is NOT being asked, and why

**Do not run the live audit to "test" these routes.** `suite-mutation-auth.yml:67` already sets
`MUTATION_AUTH_AUDIT_OK: '1'` and runs all six suites against a live server on every PR. A manual
run reproduces CI exactly and produces nothing new. `scripts/run-mutation-auth-live-audit.ts`
regenerates evidence, but the committed evidence is fresh and its manifest sha matches coverage.

**Never point a mutation probe at production.** These are POST/PATCH/PUT/DELETE rails including
`/api/bookings/refund` and `/api/coordination-states/:id/refund`. Everything here runs against a
local server and a disposable database. There is no production step in this dispatch at all.

**The work is writing fixtures and probes — which is code.** That is what is being split below.

---

## 2. Why these 88 are untested — the reason is uniform and it is the design

Coverage is **291/589**. The 298 remaining split into **88 risk-bearing** (admin 5, payments 17,
user-data 66) and **210 `other` at 0/210**, which is a category awaiting a ruling and is out of
scope here (see §6).

Every untested row carries one of exactly two machine-generated reasons:

| Reason | Rows |
|---|---|
| `Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed.` | 30 |
| `Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints.` | 34 |

There is **no cheap slice.** An unauthenticated 401 probe is not sufficient for any of them — these
rails are `isAuthenticated` plus an ownership check *inside the handler*, so no prefix backstop sees
them. Each needs a real resource owned by User A, probed as User B.

**So the unit of work is a FIXTURE, not a route.** One fixture unlocks a whole family. The pattern is
already proven: `expert-provider-mutation-auth.test.ts` builds a disposable owner + listing +
booking + quote and drives four real `RESOURCE_PROBES` off it.

---

## 3. Three rules that must not be weakened

These are CLAUDE.md's, not mine, and a PR that breaks one should be rejected on sight.

1. **A rail is PROBED, never EXCLUDED, where a fixture is buildable, and `EXCLUSIONS` ONLY SHRINKS.**
   An exclusion on a mutation rail is an allowlist, and the §14/§19 posture refuses to grow one.
   Every route below leaves `EXCLUSIONS` by gaining a probe — never by being re-worded.
2. **A 404 against a random UUID is not authorization evidence.** This is stated verbatim in
   `payment-mutation-auth.manifest.ts` and it is the single most likely way to produce a green run
   that proves nothing. A probe is only evidence when it mounts the real route with real A/B
   sessions against a real owned resource.
3. **Each probed rail asserts all three arms:** anonymous ⇒ **401**; the resource's own non-owner ⇒
   **404** (Locked Decision 40's one sentence for "no such thing" and "not yours"), **with the row
   proven unchanged**; owner ⇒ past the ownership gate. The third arm is what stops a probe passing
   because the route is simply broken.

The structural gate in that suite already refuses a rail in two sets, a `RESOURCE_PROBES` key that is
not high-risk, a prefix-probed rail carrying a fixture, and a `RESOURCE_PROBES` key with no probe.
Expect it to fail you; it is doing its job.

---

## 4. Yours — families A, B and C (44 routes, 3 fixtures)

Chosen because none of them is a money rail, and none touches the booking/payment fixture being
lifted in the checkout. **Land one family per PR**, smallest first, each appending its own ledger
row. After each, regenerate coverage and quote the new number.

### A. Ready-made authoring — 8 routes, 1 fixture *(start here)*

Fixture: a disposable **author** user, one `ready_made_trips` row they own, one build.
The ordinary audit user is the non-owner.

```
POST   /api/expert/ready-made                          ready-made.routes.ts:71
PATCH  /api/expert/ready-made/:id                      ready-made.routes.ts:575
POST   /api/expert/ready-made/:id/build-review         ready-made.routes.ts:782
POST   /api/expert/ready-made/:id/submit               ready-made.routes.ts:687
POST   /api/expert/ready-made/:id/withdraw             ready-made.routes.ts:748
DELETE /api/expert/ready-made/build/:id                ready-made.routes.ts:321
PATCH  /api/expert/ready-made/build/:tripId            ready-made.routes.ts:285
POST   /api/expert/ready-made/from-trip/:tripId        ready-made.routes.ts:160
```

Smallest family, one owner concept, and all eight are already named in `EXCLUSIONS` with
"a real author fixture is required" — so the exclusion list shrinks by eight in one PR. **If any
part of this dispatch is wrong, this is where it surfaces cheapest.** Do not start B or C until A
is merged green.

### B. Provider authoring — 22 routes, 1 fixture family

Fixture: a disposable **provider** owner with a listing, plus the child rows each rail needs
(bundle, property, room, availability slot, blackout date, booking request). Build them from the
one owner; a second owner concept is the drift class §18 rule 1 names.

```
POST   /api/provider/availability                       routes.ts:10141
PATCH  /api/provider/availability/:id                   routes.ts:10169
DELETE /api/provider/availability/:id                   routes.ts:10193
POST   /api/provider/blackout-dates                     experts.routes.ts:464
DELETE /api/provider/blackout-dates/:id                 experts.routes.ts:491
PUT    /api/provider/booking-requests/:requestId/respond experts.routes.ts:546
POST   /api/provider/bookings/:id/complete              routes.ts:7512
PATCH  /api/provider/bookings/:id/status                routes.ts:7346
POST   /api/provider/bundles                            provider.routes.ts:249
PATCH  /api/provider/bundles/:id                        provider.routes.ts:343
DELETE /api/provider/bundles/:id                        provider.routes.ts:442
POST   /api/provider/properties                         provider.routes.ts:558
PATCH  /api/provider/properties/:id                     provider.routes.ts:694
DELETE /api/provider/properties/:id                     provider.routes.ts:737
POST   /api/provider/properties/:id/rooms               provider.routes.ts:759
PATCH  /api/provider/rooms/:id                          provider.routes.ts:825
DELETE /api/provider/rooms/:id                          provider.routes.ts:872
POST   /api/provider/services                           routes.ts:3771
PATCH  /api/provider/services/:id                       routes.ts:4103
POST   /api/provider/services/:id/deliverable-file      routes.ts:6403
PUT    /api/provider/services/:id/translations/:locale  routes.ts:3677
PATCH  /api/provider/settings                           provider.routes.ts:124
```

**Two carry a standing invariant — assert it in the probe, do not just check the status.**
`PATCH /api/provider/bookings/:id/status` is §18b's original instance: it must carry a from-state
allow-list AND the atomic conditional, and it must **never** move a booking out of
`payment_pending`+unstamped. `PATCH /api/provider/services/:id` is §18/ruling 42's instance: it must
not admit `revenueShareRate`. If a probe shows either, that is a live defect — **report it, do not
fix it in the probe PR.**

### C. Expert console — 14 routes, 1 fixture family

Fixture: a disposable **expert** with an assignment, an AI task, a trip vendor and a review.

```
POST   /api/expert/ai-tasks/delegate                          routes.ts:11520
POST   /api/expert/ai-tasks/:taskId/approve                   routes.ts:11619
POST   /api/expert/ai-tasks/:taskId/regenerate                routes.ts:11682
POST   /api/expert/ai-tasks/:taskId/reject                    routes.ts:11652
POST   /api/expert/assignments/:assignmentId/accept           booking-actions.ts:1293
PATCH  /api/expert/assignments/:assignmentId/workspace-status booking-actions.ts:1311
POST   /api/expert/bookings/:id/complete                      routes.ts:7513
PATCH  /api/expert/bookings/:id/status                        routes.ts:7342
POST   /api/expert/reviews/:id/respond                        routes.ts:7965
PATCH  /api/expert/role                                       expert-console.routes.ts:74
PATCH  /api/expert/services/:id/status                        routes.ts:6046
POST   /api/expert/trips/:tripId/vendors                      experts.routes.ts:351
PUT    /api/expert/vendors/:vendorId                          experts.routes.ts:390
DELETE /api/expert/vendors/:vendorId                          experts.routes.ts:428
```

`PATCH /api/expert/role` is the one to read hardest: a self-service role change is a privilege
boundary, and §19's posture says the field set must be an allowlist.

**Expected effect of A+B+C: coverage 291/589 → 335/589; user-data 134/200 → 178/200.**
Quote the generated number, never a projected one — if it lands lower, the difference is the finding.

---

## 5. Not yours

| | |
|---|---|
| **The 17 `payments` routes** | Checkout lane. They need the booking/payment A/B fixture lifted out of `expert-provider-mutation-auth.test.ts` into a shared module, and they are the highest-severity slice (`refund`, `dispute`, `pay-balance`, two coordination refunds). Do not start a second fixture for them. |
| **The 5 `admin` routes** | Not a fixture problem at all. `neighborhood-claims.routes.ts` is simply missing from `EFFECTIVE_ROUTE_SOURCES` in `admin-mutation-inventory.ts`, so those five were never inventoried. One-line fix, in the checkout. |
| **Family E (trip, 11) and F (misc, 11)** | Held until A–C prove the fixture pattern scales. |
| **Making `suite-mutation-auth` a required context** | Repo file change, in the checkout. |

---

## 6. The 210 `other` routes need a ruling, not a probe

`other` stands at **0/210** and testing them closes nothing. Either they are legitimately
unauthenticated by design — in which case each is excluded **with a stated reason** — or they are
not, and they do not belong in `other`. That is a decision, and it is the decision-maker's.
**Do not write probes against this category.**

---

## 7. Standing read-only items, unchanged from the previous dispatch

Still outstanding, still production `SELECT`s, still **report the rows and delete nothing**:
#1725 (duplicate `local_expert_forms` per user), #298 (`destination_events` duplicate census, both
arms), R-7 (`provider_services.service_type` value set). The §7 `form_status` census is **no longer
needed** — PR #1044 resolved it by substituting `approval_status`, and the column has no writer.

Stage 2 Stripe webhook subscriptions remain open and remain a separate operator decision.

**§20 applies throughout.** Nothing in this dispatch adds a column, so **any** publish-time SQL
prompt it raises is decline-and-stop, and "copy development database to production" is never
accepted under any wording.
