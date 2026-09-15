# V-29 — ONE trip-write resolver: every plan rewrite gate reads `authorizeTripLogistics(requireWriteAccess)`

Lane: `task-v29-one-trip-write-resolver`. Branched off `origin/main` at `a6a80c28e`.
Ledger row: `2026-09-15-v29-one-trip-write-resolver`. Punchlist row: **V-29**, ruled **B** by the
decision-maker 2026-09-15.

## The ruling

LD 42 **D17** rules ONE "may this person rewrite the plan?" predicate. There were two, and they
disagreed about three principals:

- **A** — `getTripWriteRole` + `canMutateTrip` (`server/utils/trip-role.ts`). Owner resolved ONLY
  through a `trip_collaborators` row; no author branch; no admin branch. Every caller bolted
  `isTripAuthor` on beside it.
- **B** — `authorizeTripLogistics(tripId, userId, route, { requireWriteAccess: true })`
  (`server/utils/trip-logistics-auth.ts`). Owner via `verifyTripOwnership` (the `trips.user_id`
  column), the §12 WRITE-status advisor (`accepted`/`assigned`, never `pending`), the trip author,
  and an audit-logged admin.

**B wins.** Every write-gating caller of **A** moves onto **B** with the same `requireWriteAccess:
true` narrowing and a route label. **A**'s write arm (`getTripWriteRole`, `canMutateTrip`) is
DELETED — no caller remained (§18c). `getTripRole`, the READ resolver, is untouched and keeps its
read surfaces.

## Callers moved

| # | Rail | File | Was | Now |
|---|---|---|---|---|
| 1 | `PATCH /api/trips/:tripId/itinerary-items/:itemId` | `server/routes/trips.routes.ts` | A (`getTripWriteRole`+`canMutateTrip`+parallel `isTripAuthor`) | B, `requireWriteAccess: true` |
| 2 | `DELETE /api/trips/:tripId/itinerary-items/:itemId` | `server/routes/trips.routes.ts` | A | B |
| 3 | `POST /api/itinerary-items/:id/backup` | `server/routes/trips.routes.ts` | `getTripRole` (the READ resolver) + `canMutateTrip` | B |
| 4 | `POST /api/itinerary-comparisons` (tripId branch) | `server/routes.ts` | A | B |
| 5 | `POST /api/itinerary-comparisons/:id/generate` | `server/routes.ts` | A | B |
| 6 | `POST /api/trips/:tripId/itinerary/optimize-order` | `server/routes.ts` | A | B |
| 7 | `POST /api/itinerary-comparisons/:id/apply-to-trip` | `server/routes/plancard.routes.ts` | A | B |
| 8 | `PATCH /api/transport-legs/:legId/status` | `server/routes/plancard.routes.ts` | `getTripRole` + `canMutateTrip` | B |

Rows 3 and 8 were not in the re-sweep's list: they gate a WRITE through `canMutateTrip` over the
**READ** resolver, so they are callers of **A**'s mutate predicate by the same grep and they are
moved by the same ruling.

## Behaviour delta — stated by name

**On rails 1, 2, 4, 5, 6, 7 (the six that used `getTripWriteRole`):**

- **(a) An OWNER with no `trip_collaborators` row is no longer 403'd on their own plan.** **A** read
  ownership only from `trip_collaborators`; **B** reads `trips.user_id` through
  `verifyTripOwnership`. This did not bite on `main` only because a DATA invariant held (every mint
  site writes the owner row, and a boot seed backfills). It is now a predicate that reads the
  column, not an invariant every future mint site has to remember.
- **(b) The trip AUTHOR (the expert authoring build) and an AUDIT-LOGGED ADMIN gain write here.**
  **A** carried neither branch, so callers hand-rolled `isTripAuthor` and had no admin branch at
  all. **B** carries both, exactly as it already does on `POST /api/trips/:tripId/itinerary/reorder`,
  `PATCH /api/trips/:tripId/expert-traveler-note` and the D-19 proposal rails. The admin branch
  logs `admin-cross-trip-logistics` through the structured logger (the interim audit **B** already
  writes; there is no audit TABLE on `main` and this lane adds none).

**On rails 3 and 8 (the two that used the READ resolver `getTripRole`):** the same (a) and (b), PLUS
a NARROWING — a **`pending` advisor could previously set a backup plan and confirm/dismiss a
transport leg** through the read resolver. Under `requireWriteAccess: true` they cannot. That is §12
("a PENDING advisor may not write") applied where it was missing.

**Unchanged on every rail:** §12 itself (`requireWriteAccess: true` keeps the advisor branch at
`accepted`/`assigned` and NEVER `pending`); the status codes; the response body shapes (`{ message }`
in `routes.ts`/`trips.routes.ts`, `{ error }` in `plancard.routes.ts`); the plan-approval mode-flip
409; the D4 `expert_note` owner strip. **B itself was not widened.**

**One refusal MESSAGE is now unreachable:** the `"friend"` variants ("Friends can only suggest
changes…", "Friends cannot remove activities", "Friends cannot set backup plans", "Friends cannot
confirm or dismiss transport legs"). **B** never reads `trip_collaborators`, and no writer in the
repository mints a `friend` row — every one of the five writers writes `role: 'owner'`
(`storage.createTrip`, `content-query.service.ts`, `booking.service.ts` ×2,
`ready-made-purchase.service.ts`, the boot seed). A friend is not an expressible principal (L20
Part C already records this). The refusal STATUS is unchanged; only the sentence a principal nobody
can mint would have read is gone.

## The role NAME, where it was still needed

`PATCH`/`DELETE` keyed two downstream rules on `tripRole === "expert"`: the plan-approval mode-flip
(409 `plan_approved_suggest_instead`) and D4's `expert_note` strip. Neither is the
"may this person rewrite the plan?" question — the gate above has already answered that — so they
now read the CANONICAL advisor predicate directly (`storage.isExpertAssignedToTripForWrite` →
`isTripAdvisorWithWriteAccess`, the very predicate **B**'s own advisor branch calls), in the
`owned ? false : …` shape the optimize-order and reorder handlers already use. That is one more
caller of one predicate, not a second resolver.

## `server/utils/trip-role.ts`

`getTripWriteRole` and `canMutateTrip` are DELETED (§18c — no caller remained). `getTripRole` and
`TripRole` stay: they are the READ resolver and still serve the plancard read, the trip GET/PDF
gates and the affiliate-booking trip-access check.

**The `trip_collaborators` owner-row data invariant STAYS, and its notes are NOT removed**
(`server/storage.ts` ~1512-1523, `server/services/booking.service.ts`, `ready-made-purchase.service.ts`,
`server/seeds/trip-ownership.seed.ts`). It does not exist solely to keep **A** working: `getTripRole`
— which is untouched — still resolves the owner only from that row, so every read surface on it
still depends on the invariant. The notes were re-worded only where they named the deleted
`canMutateTrip`.

## Guard

`W6` in the new suite is the static pin: no file under `server/` outside its own module may name
`getTripWriteRole` or `canMutateTrip`, and neither symbol may be re-declared in
`server/utils/trip-role.ts`. It derives from the FILE SET (comments stripped), never a call-site
count, per OPERATING_PROCEDURE §3.

## Tests

`server/__tests__/one-trip-write-resolver.db.test.ts`, wired to its own CI job
(`one-trip-write-resolver`) on the `ready-made-clone-fields` template.

| id | proof |
|---|---|
| W1 | an owner with NO `trip_collaborators` row passes every moved gate, and really PATCHes and DELETEs their own item |
| W2 | a `pending` advisor is refused on every moved gate; an `accepted` advisor passes |
| W3 | a stranger is refused, 403, response shape unchanged |
| W4 | the trip AUTHOR passes (delta (b)) |
| W5 | an ADMIN passes and the interim audit line is emitted |
| W6 | static: ONE predicate — zero references to A anywhere under `server/`, and every moved gate calls B with `requireWriteAccess: true` |

## Repaired pins

`server/__tests__/optimizer-run-predicate.test.ts` (R1/R2/R3) and
`server/__tests__/expert-work-protected.test.ts` (E5) pinned **A** at the run gates and at the D4
strip. Both are REPAIRED to assert the invariant under **B**, never deleted (OPERATING_PROCEDURE §3).
The two unwired suites that imported **A** (`itinerary-item-rail-unification.db.test.ts`,
`expert-note-separation.db.test.ts`) are re-pointed so they still compile and still assert what they
assert.

## Proposed CLAUDE.md sentence (LD 42 D17 — NOT applied by this lane)

> **D17 IS NOW ONE PREDICATE IN FACT (ledger `2026-09-15-v29-one-trip-write-resolver`, punchlist
> V-29 = option B).** The ONE "may this person rewrite the plan?" test is
> `authorizeTripLogistics(tripId, userId, route, { requireWriteAccess: true })`; the collaborator-only
> `getTripWriteRole`/`canMutateTrip` resolver is DELETED (§18c), and `getTripRole` survives as the
> READ resolver only. Stated delta, because it is a behaviour change on eight rails and not a
> refactor: an OWNER with no `trip_collaborators` row is no longer refused on their own plan
> (ownership is read from `trips.user_id`), and the trip AUTHOR and an AUDIT-LOGGED ADMIN gain write
> on the item PATCH/DELETE, the backup-plan and transport-leg writes and the four optimizer run
> gates — exactly the principals B already granted on reorder, expert-traveler-note and the proposal
> rails. §12 is unweakened: `pending` never writes, and the two rails that gated a write through the
> READ resolver stop granting it.

## Validation

| check | result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json \| grep -c "error TS"` | **129** (ceiling `TSC_BASELINE: '129'` on main — equal, not over) |
| `npm run build` | green (`dist/index.cjs`, build-info written) |
| `node scripts/check-decision-guards.cjs` | exit 0 — `decision-guards lint OK (0 deferred warning(s))` |
| `node scripts/check-money-endpoints.cjs --self-test` | exit 0 — `self-test OK (37 predicate fixtures)` |
| `node scripts/check-money-endpoints.cjs` | exit 0 |
| `bash scripts/phase2-fee-gate.sh` | exit 0 |
| `node scripts/check-test-files-wired.cjs --self-test` | exit 0 — `self-test OK (7/7 fixtures)` |
| `node scripts/check-test-files-wired.cjs` | `278/511 reachable; 233 orphan(s)` — the true 233-orphan baseline is UNCHANGED (base at this sha: `277/510`), and the new suite is reachable |
| `node scripts/check-planning-entry.cjs` / `check-advisor-row-author.cjs` / `check-trip-route-shadows.cjs` / `check-unmounted-routers.cjs` | exit 0 each |
| `grep -c replit.local package-lock.json` | **0** |
| `one-trip-write-resolver.db.test.ts` (local Postgres, all 300 migrations from empty) | **10/10** |
| `optimizer-run-predicate.test.ts` (repaired) | 14/14 |
| `expert-work-protected.test.ts` (repaired) | 23/23 |
| `item-delete-booked-guard.test.ts` | 12/12 |
| `itinerary-item-rail-unification.db.test.ts` (re-pointed) | 10/10 |
| `expert-note-separation.db.test.ts` (re-pointed) | 6/6 |
| `authored-item-price-contract.db.test.ts` | 5/5 |
| `transport-payment-intent.db.test.ts` | 7/7 |
| 13 further pure suites reading the three modified route sources | 0 failures |

**Pre-existing failures, verified identical on the base sha with the lane stashed, so not this
lane's:** `offering-activation-gate` (1), `refund-retry-convergence` (6), `mutation-auth.http`
(needs a live server), `adopt-stop.db` (3/3). `item-event-link.db` goes from 3 failures on base to
**1** — the survivor is the plancard READ gate 403'ing an owner whose trip was minted by a raw
insert, which is `getTripRole`'s collaborator-only owner resolution and is the limit recorded
below, not a regression.

## Not done / stated limits

- **B's admin branch is audit-LOGGED, not audit-ROWED.** There is no audit table on `main`; W5
  proves the admin passes and pins the logger call at the source. The dedicated audit-log lane is
  still filed.
- **The `friend` principal is not re-homed.** This lane deletes no `trip_collaborators` code and
  mints no friend row; it only records that the branch is unreachable.
- **`getTripRole` (READ) keeps the collaborator-only owner resolution.** Bringing the read resolver
  onto `trips.user_id` is a different question with a different blast radius (every read surface)
  and is not this ruling. It is not theoretical either: the unwired `item-event-link.db.test.ts`
  mints its fixture with a raw `db.insert(trips)` and its plancard READ is refused **403** for the
  plan's own owner, on `main` and still here. That is the read-side twin of delta (a), left open
  deliberately and recorded rather than quietly widened.
- **The unwired suites stay unwired.** `itinerary-item-rail-unification.db.test.ts` and
  `expert-note-separation.db.test.ts` were re-pointed so they compile and still assert what they
  assert; wiring them is V-30's follow-on orphan-classification lane, not this one.
