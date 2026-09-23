# Dispatch — family B, provider authoring (22 routes)

**For the Replit workspace. Written 2026-09-23 against `main` @ `747df33`.**
Follows `DISPATCH_MUTATION_AUTH_88.md`, whose rules all still apply and are not restated here.

---

## Where the number stands

Family A is merged (#1046) and the payments slice is merged (#1045). They compose exactly:

| | overall | payments | user-data |
|---|---|---|---|
| before | 291/589 | 14/31 | 134/200 |
| after family A | 299/589 | 14/31 | 142/200 |
| after payments | **304/589** | **19/31** | 142/200 |

Family B is the largest remaining block: **22 routes, and it takes user-data from 142 toward 164.**

**Quote the generated number, never a projection.** If it lands lower, the difference is the finding.

---

## One thing changed underneath you, and it is in your favour

`server/__tests__/mutation-auth/booking-resource-fixture.ts` now exists: the **one** builder for a
disposable owner + listing + booking + quote, with **three principals** — `traveler`, `owner`, and
`stranger` (party to nothing). `expert-provider-mutation-auth.test.ts` imports it; it no longer
carries its own copies of `liveAuditRefusalReason`, `createLoginFixture`, `diagnosticBody` or
`fixtureRowStatus`.

**Use it. Do not write a second login path or a second safety predicate.** Your ready-made fixture
was correctly left in its own suite — that is a *different resource* (`ready_made_trips` + `trips`),
which is not drift. Family B is a third resource again (provider child rows), so the same judgement
applies: **share the principals and the helpers, build your own rows.**

---

## The 22 routes, and the order to take them

Build **one provider owner** and hang every child row off it. A second owner concept is the
derivation-drift class §18 rule 1 names.

### B1 — services (5). Start here.
```
POST   /api/provider/services                            routes.ts:3771
PATCH  /api/provider/services/:id                        routes.ts:4103
POST   /api/provider/services/:id/deliverable-file       routes.ts:6403
PUT    /api/provider/services/:id/translations/:locale    routes.ts:3677
PATCH  /api/provider/settings                            provider.routes.ts:124
```

### B2 — bundles, properties, rooms (9)
```
POST   /api/provider/bundles                             provider.routes.ts:249
PATCH  /api/provider/bundles/:id                         provider.routes.ts:343
DELETE /api/provider/bundles/:id                         provider.routes.ts:442
POST   /api/provider/properties                          provider.routes.ts:558
PATCH  /api/provider/properties/:id                      provider.routes.ts:694
DELETE /api/provider/properties/:id                      provider.routes.ts:737
POST   /api/provider/properties/:id/rooms                provider.routes.ts:759
PATCH  /api/provider/rooms/:id                           provider.routes.ts:825
DELETE /api/provider/rooms/:id                           provider.routes.ts:872
```

### B3 — availability, blackouts, booking requests, booking status (8)
```
POST   /api/provider/availability                        routes.ts:10141
PATCH  /api/provider/availability/:id                    routes.ts:10169
DELETE /api/provider/availability/:id                    routes.ts:10193
POST   /api/provider/blackout-dates                      experts.routes.ts:464
DELETE /api/provider/blackout-dates/:id                  experts.routes.ts:491
PUT    /api/provider/booking-requests/:requestId/respond experts.routes.ts:546
POST   /api/provider/bookings/:id/complete               routes.ts:7512
PATCH  /api/provider/bookings/:id/status                 routes.ts:7346
```

**One increment per PR**, each removing its own exclusions and appending its own ledger row.
**`EXCLUSIONS` only shrinks** — every route above leaves it by gaining a probe, never by being
re-worded.

---

## Two routes carry standing invariants. ASSERT THEM, don't just check the status.

These are the reason B3 is worth doing carefully rather than quickly.

**`PATCH /api/provider/bookings/:id/status` is §18b's ORIGINAL instance.** It once checked the
*target* status and never the *current* one, so a provider's Accept promoted an **unpaid claim** to
`confirmed` — after which both recovery layers matched zero rows and the claimed
`vendor_availability_slots.booked_count` was destroyed with no code path in the repo to return it.
It must carry a from-state allow-list **and** the §15 atomic conditional, and it must **never** move
a booking out of `payment_pending` + unstamped.

So probe it against a **`payment_pending`, `stripe_payment_intent_id IS NULL`** booking and assert
the transition is refused **and the slot count is unchanged**. Note the money layers held in the
original incident and only the *inventory* layer failed — **a probe that watches only `status` is
not sufficient.**

**`PATCH /api/provider/services/:id` is §18/ruling 42's instance.** `revenueShareRate` was
mass-assignable here through a `.partial()` denylist schema, read at the real Stripe charge as "the
final override", and range-clamped only — so `1.00` meant a 100% provider share and a `0.00`
platform fee. Assert the field is **stripped**, by sending it as the owner and reading the row back.

**If a probe shows either defect live, report it — do not fix it in the probe PR.** A probe PR that
also changes behaviour cannot be reviewed as evidence.

---

## Everything else is unchanged from the first dispatch

Three arms per rail (anonymous → **401**; wrong principal → the handler's **own** recorded status,
with the row proven unchanged; owner → past the gate). **A 404 against a random UUID is not
authorization evidence.** Assert each rail's own refusal rather than a uniform one you would prefer.
Do not run the live audit as a deliverable — CI already does it on every PR. **Never probe
production.**

**Not yours:** families C (expert console), E (trip), F (misc); the remaining 12 payments rails; and
the 210 `other` routes, which need a ruling rather than probes.

**§20 applies.** Nothing here adds a column, so any publish-time SQL prompt is decline-and-stop, and
"copy development database to production" is never accepted under any wording.
