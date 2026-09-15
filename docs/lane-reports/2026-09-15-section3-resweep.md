# Lane report — punchlist section 3 re-sweep (2026-09-15)

**Lane:** `task-punchlist-section3-resweep` — verify-and-file. Docs only: no code, schema, migration,
route or test was changed.
**As-of:** `origin/main` = `5d5f7ccc3292a967de26f02292ef30197051151d`. Every claim below was opened
on that tree; line numbers are as of that sha.
**Reads:** `docs/OPERATING_PROCEDURE.md` (build-lane role), `docs/PUNCHLIST.md` §0–§5,
CLAUDE.md §8, §13, §14, §15, §17, §18d, §19, LD 42 D17, LD 43(b).

---

## A · Re-verification of every OPEN section 3 row

Open on entry: **R-4, R-7, R-10, R-11**. (R-1, R-2, R-3, R-5, R-6, R-8, R-9 were already struck.)

### R-4 — STILL STANDS. Citations repaired; one clause now STALE.

The row's shape is unchanged: a ready-made clone is minted on a placeholder window, no fact
distinguishes a placeholder from a chosen one, and **no client rail re-dates an existing trip row**.

| Claim | Verdict at `5d5f7ccc3` |
|---|---|
| placeholder window | STANDS — `server/services/ready-made-purchase.service.ts:219-221` (`new Date()` + `durationDays-1`, comment "the buyer re-dates it in their own planner") and `:258-259` (`startDate`/`endDate`), `:260` `status:"draft"` |
| the occasion PATCH carries no dates | STANDS, citation repaired — `tripOccasionBody` is `server/routes/trips.routes.ts:3215-3231` (was cited `:3163-3179`): `eventType`/`adults`/`kids`/`budgetApproverName`/`budgetApproverEmail`/`accessibilityNote`, pick-based, no dates |
| the modal writes dates only to the context jsonb | STANDS — `client/src/components/trip/plan-modal.tsx:881-891` |
| `PATCH /api/trips/:id` would accept dates but has no client | STANDS, citations repaired — handler `server/routes.ts:1423`, input `insertTripSchema.partial()` (`shared/routes.ts:78-88`); `useUpdateTrip` is `client/src/hooks/use-trips.ts:98` and has **zero call sites** across `client/`, `e2e/`, `playwright/` |
| `resolveBuyAction` is date-blind | STANDS — `server/services/buy-action-payload.ts:188` ("Published = at least one slot dated today or later. Deliberately NOT 'has a FREE slot'"), applied at `:225` |
| the only date-scoped read is one month-per-service | STANDS — `server/routes/content.routes.ts:2671` |
| **the plancard activity DTO carries no `providerServiceId`** | **STALE — now FIXED.** `server/services/trip-plan.service.ts:866-871` emits `providerServiceId` (and `affiliateProductId`), present-only-when-set, read-only pass-through, added by today's D-4 lane (`2026-09-15-d4-item-kind-contract`). An item row CAN now name its service. |

**Verdict:** keep as the build-lane pointer it became today under D-1 = B. It is not promoted to a
V-row because a decision already re-scoped it; the section 4 lane list now pairs it with **D-22**.

### R-7 — STILL STANDS. Code half re-verified, production half still unopenable.

`provider_services.service_type` carries a second, category-shaped vocabulary beside the declared six.

- `server/storage.ts:2092` — `ilike(providerServices.serviceType, '%' + filters.category + '%')`, owner-scoped (was cited `:2016`).
- `server/services/content-matching.service.ts:339` and `:344` — `inArray(providerServices.serviceType, rule.serviceTypes)`; the rule table at `:48-94` enumerates only the declared six.
- The six: `shared/schema.ts:886` `serviceTypeEnum` (was cited `:768`). The column: `:1042`,
  `varchar("service_type", { length: 50 }).default("planning")`, **no DB CHECK** — so a
  category-shaped value is accepted by the database and read as a category by one reader and as a
  type by the other.

**Cannot verify:** the "61 demo rows hold `florist`/`av-equipment`" count is a production fact, and
the reader inventory is still not exhaustive. **Verdict:** stays an R-row (the half that would
promote it needs the production database). Owner remains lane OC-A2.

### R-10 — PROMOTED to **V-31**; R-row struck with a pointer.

`playwright/utils/auth.ts:6-27` `loginAs` fills `/login`, clicks submit and waits only for the URL to
stop containing `/login`. It never checks a cookie and never reads `GET /api/auth/user`, so it cannot
fail. Lane R-8 reproduced the consequence (zero cookies, 401). The sweep widened it: **four** suites
import the helper (`seam-cross-console.spec.ts` 16 calls, `phase-3-traveler-flows.spec.ts` 5,
`phase-4-7-advanced-flows.spec.ts` 7, `stripe-init-deferral.spec.ts` 1) and a **second helper of the
same name with a different contract** exists at `playwright/tests/personas/journey-traveler.spec.ts:47,76`
(request-scoped, returns an actor) — the §18 rule 1 shape underneath the symptom.

### R-11 — CONFIRMED and PROMOTED to **V-30**; R-row struck with a pointer.

R-11 reported a false-positive class. It is not a class: **it is one line**, and it is much larger
than the row guessed.

`.github/workflows/publish-gate-and-fundamentals-gate.yml:272` is a failure-summary `echo` whose text
contains `` `Run solo: npx tsx --test server/__tests__/<file>` ``. The guard extracts every `run:`
block, splits on whitespace (`scripts/check-test-files-wired.cjs:87-93`), sees `tsx --test`, and takes
**every following word** as a selector. The sentence's later words include the bare word **`server`**,
and `selectorMatches` at `:126` treats a non-glob selector as a directory prefix. So every test under
`server/` is reported reachable.

Measured by re-running `inventory()` with that single line removed:

```
with the echo line   : 477/507 reachable, 30 orphans   <- what CI prints today
without the echo line: 274/507 reachable, 233 orphans
                       203 suites reachable through nothing but that echo
```

Among the 203: `availability-model.db.test.ts`, `s11-stay-booking.db.test.ts`,
`balance-payer-atomicity.db.test.ts`, `deposit-checkout.db.test.ts`, `mutation-auth/*`. The job the
echo lives in runs exactly five named suites (`:200-233`).

`git log -S` dates the line to **2026-09-07** (`2457c7404`), i.e. **before** ledger
`2026-09-14-test-files-wired-orphans` reported 88 → 30 — so both of that row's counts were computed
against the poisoned predicate and neither is the true orphan set.

R-11's amendment half also stands verbatim: `TEST_ROOTS` at `:34` is `server`/`shared`/`client`/`playwright`,
so no `e2e/` spec is counted at all, and the script's **CANNOT DETECT** block at `:16-22` names
neither limit (§18d unmet on both).

### D-1 follow-ups re-checked

D-1 was answered today (option B, `2026-09-15-d1-ready-made-editable-template`) and its row names
exactly two follow-ups: **"The re-date rail is R-4's lane; the placeholder-dates marker is D-22."**
Both are open and both are re-verified above / unchanged. Section 5's only "follow-up" mention is the
orphan-spec bullet, which is R-11/R-12/R-13's subject and is handled here. No third D-1 follow-up
exists in the register.

---

## B · New sweeps handed over by today's lanes

### B1 (from V-21) — fee-rate literals in prose, and retired credits/wallet promises

Swept: `client/src/pages/privacy.tsx`, `faq.tsx`, `pricing.tsx`, `earn.tsx`, `terms.tsx`;
`server/services/email.service.ts`, `email-outbox.service.ts`, `guest-invite-email.ts`,
`occasion-templates.ts`; `client/src/locales/**`; `server/migrations/*.sql`; `server/seeds/*.ts`.

**Published fee-rate literals: NONE found — nothing filed.** `terms.tsx` is clean after V-21. The
only percent ranges left in client prose are tipping guidance (`budget-intelligence.tsx:417-423`), an
analytics benchmark (`FunnelChart.tsx:128`) and image-compression notes (`lib/unsplash.ts`) — none is
a platform fee rate. As instructed, Stripe's `2.9% + $0.30` pass-through (`terms.tsx:253`) and the
cancellation refund percentages (`:328-329`, `:333`, `:343`) were **not** filed.
`server/migrations/036_transport_commerce_fee_config.sql:7` mentions `4-12%` in a SQL **comment**
describing a seeded `fee_config` row — config-land under §8, not published prose; not filed.
Recorded but not filed: `terms.tsx:226` "pending commissions below $50 are forfeited" is an
influencer-program threshold **amount**, not a rate, and is outside the brief's predicate.

**Retired credits: ONE surface, filed as V-27.** `client/src/pages/privacy.tsx:78` and `:138` still
say the platform collects "Platform credit balances and usage" and uses data to "Manage platform
credits and process payments". The system is retired (LD 43(b)); all four endpoints answer 410 at
`server/routes/payments.routes.ts:253,257,261,267`. `client/src/App.tsx:247` makes the Privacy Policy
a consent gate exactly like the Terms. No other client surface mentions credits.

### B2 (from D-18) — the reconciliation admin page

**Filed as V-28.** The job emits **sixteen** kinds; `KIND_LABELS`
(`client/src/pages/admin/reconciliation.tsx:94-105`) names **ten**. Missing seven:
`rm_pi_succeeded_no_purchase` (`stripeReconciliation.ts:1123`), `rm_amount_mismatch` (`:1158`),
`rm_purchase_paid_not_cloned` (`:1201`), `rm_purchase_pi_not_succeeded` (`:1235`),
`rm_delivery_not_announced` (`:1344`), `rm_refund_not_reversed` (`:1393`),
`trip_booking_without_item` (`:879`). Render is `{KIND_LABELS[e.kind] ?? e.kind}` at `:872` with the
raw kind already beneath at `:874`.

**Filed as D-42.** `reconciliation_runs` has no column for the ready-made rail. `checkedReadyMadePurchases`
and `readyMadeAnnounceHandOffs` are computed (`stripeReconciliation.ts:246`, `:254`, set at `:467-468`)
and reach only the `run-now` response and the clean-pass log (`:510`, `:513`); the lane's own docblock
at `:238-254` records the omission as a named follow-up. Every other rail has a column
(`shared/schema.ts:8291-8295`). It needs a migration plus two admin SELECT edits, so it is a decision
row, not a defect row.

### B3 (from V-26) — the two orphan suites

**Filed as R-12 (`availability-model.db.test.ts`) and R-13 (`s11-stay-booking.db.test.ts`).**

Verified: neither is named by any workflow or npm script (`grep` returns zero in
`.github/workflows` and `package.json`). **They are NOT in the 30-orphan list that
`node scripts/check-test-files-wired.cjs` prints** — and that is V-30, not a defence: re-running the
inventory with the poisoning line removed puts both straight back on the orphan list. Both also need
a live app (`POST /api/auth/register` at `JOURNEY_BASE_URL`) plus a disposable database, and both
insert a `provider_services` fixture directly (`availability-model:103-105`; `s11-stay-booking:126-128`).

**Not re-run here:** the "RED against a bare migrated DB (fixture INSERT fails before any assertion)"
claim is the V-26 lane's and is recorded as reported — this lane stood up no server and no database.
Statically, both NOT NULL no-default columns of `provider_services` (`user_id`, `service_name`) are
supplied, so the likeliest failure is the `user_id` FK / the missing registered actor rather than a
column omission; that is an inference, not a verification.

Both rows carry repair-or-delete options with a recommendation and say **do not allowlist**, per
ledger `2026-09-14-test-files-wired-orphans`.

### B4 (from D-19) — two trip-write resolvers

**Filed as V-29.** Verified in full:

- **A** — `getTripWriteRole` (`server/utils/trip-role.ts:69-86`) + `canMutateTrip` (`:93-95`).
  Owner **only** via a `trip_collaborators` row; the advisor via `isTripAdvisorWithWriteAccess`; **no**
  author branch and **no** admin branch.
- **B** — `authorizeTripLogistics(..., { requireWriteAccess: true })`
  (`server/utils/trip-logistics-auth.ts:35-71`). Owner via `verifyTripOwnership` at `:44`, advisor at
  `:51-54`, author at `:58`, audit-logged admin at `:62-68`.

Callers of **A**: `PATCH /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts:2969`, gate
`:2976-2981`), its DELETE twin (gate `:3084-3087`), and the three optimizer gates
(`server/routes.ts:8989-8991`, `:9349-9351`, `:12132-12134`). Each bolts on `isTripAuthor` itself.
Callers of **B**: `POST /api/trips/:tripId/itinerary/reorder` (`server/routes.ts:12095`),
`PATCH /api/trips/:tripId/expert-traveler-note` (`trips.routes.ts:3144`), and the D-19 proposal rails
(`:3361`, `:3399`) — whose comment at `:3335-3341` calls `requireWriteAccess` "exactly the §12
narrowing D17 asks for".

The owner disagreement is real: under **A** an owner with no collaborator row resolves `null` and is
403'd from their own plan. It does not bite today only because a **data** invariant holds —
`storage.createTrip:1518-1523` writes the row, the raw-SQL and clone mints remember it
(`booking.service.ts:133`, `:1216`; `ready-made-purchase.service.ts:264`), and
`server/seeds/trip-ownership.seed.ts` backfills at boot (`server/index.ts:479-481`).

Fix shape (D17's own): ONE resolver, the other a caller or deleted. **B** is the one that reads
ownership from the row, so moving **A**'s call sites onto it is the cheap direction — but that
**grants admin and author where A refused them**, on five rails, which must be stated in the lane's
ledger row rather than slipped in.

### B5 — `deriveClaimedSlotUnits` uniformity

**Recorded as a stated limit on the closed V-26 row; NOT filed as a defect.**
`server/services/checkout-claim.service.ts:687-693` returns ONE number per booking and every release
path applies it uniformly across `deriveClaimedSlotIds`' slot set. Correct for every rail on `main`
(a cart line claims N units of one slot; a stay pins `quantity` to 1 and claims one slot per night
stamping `1`). It is a property of the current rails, not of the data model — `booking_details` could
hold a per-slot map and nothing refuses one — so a rail that ever claims mixed counts must change the
decider, not work around it.

---

## C · Housekeeping

- **Section 0** gained item 5: the state as of 2026-09-15 at the as-of sha — section 1 fully ruled
  (D-1..D-41 answered or owned), section 2 closed apart from V-22 and V-25(a) struck open with owners
  plus V-27..V-31, section 3 down to four open rows, and the remaining build lanes named.
- **Section 4** gained a dated lane list: D-20/D-21 → D-22 + R-4 → D-24..D-26 + D-40 (one hybrid) →
  D-27 → D-28..D-31 → D-32..D-35 → D-36..D-39, plus the HELD offering-key drop (PR #907, blocked on a
  human running the production preview, not on a lane). D-42 is noted as unscheduled, and V-30's
  follow-on (redo the orphan classification against the true 233-suite set) is named as a lane that
  should be on the list and is not.
- Nothing was renumbered. Frozen ids are untouched; R-10 and R-11 stay struck as pointers.

## Validation

- `node scripts/check-decision-guards.cjs` → exit 0, `decision-guards lint OK (0 deferred warning(s))`.
- `grep -c replit.local package-lock.json` → 0.
- Every new punchlist table row (D-42, V-27..V-31) carries exactly 4 unescaped pipes; the new
  `docs/DECISIONS.md` row carries 6, matching that table's five columns. The seven pre-existing
  punchlist rows with other pipe counts were not touched.

## What this lane could not verify

1. R-7's production half (61 demo rows holding `florist`/`av-equipment`) — needs the production database.
2. The RED-against-a-bare-DB behaviour of the two orphan suites (R-12/R-13) — no server and no
   database were stood up; recorded as reported by the V-26 lane.
3. Whether the 203 suites unmasked by V-30 pass when actually run — that is the re-classification
   lane V-30 names.
