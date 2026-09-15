# Lane report — V-32 + V-33 (one lane)

**Ledger row:** `2026-09-15-v32-v33-leads-door-item-read-gate`
**Punchlist:** V-32 CLOSED, V-33 CLOSED (section 2's open rows are now V-22 and V-25(a))
**Base:** `origin/main` @ `fa23714d9`
**Schema/migration:** none. No column, no CHECK, no index, no backfill, no route added.

---

## 1. What was actually wrong, and where

### V-33 — the defect is in `GET /api/trips/:id`, not in the itinerary-item readers

The punchlist headline says "the itinerary-item read gate". The row's own evidence says otherwise, and
the evidence is right:

* the line reference it carries — `server/routes/trips.routes.ts:359-371` at `42e5213ef` — is the
  **trip GET** handler (`router.get(api.trips.get.path, …)`), confirmed by `git show`;
* the reproduced symptom is a `[IDOR ATTEMPT]` log line, and that string is emitted from **exactly one
  trip handler in the repository** (`server/routes/trips.routes.ts:366`). The itinerary-item readers
  return a bare 403 and log nothing.

Both `GET /api/trips/:tripId/itinerary-items` readers — the `trips.routes.ts` copy and the
`server/routes.ts` monolith copy — were **already** consulting `trip_expert_advisors` on `main`, via
`storage.isExpertAssignedToTrip` → `isTripAdvisor`. So the half of the brief that asked for those two
readers to be moved onto the read predicate **needed no change, and none was invented** (§13). They are
untouched by this lane.

What WAS broken:

```
const isExpert = userId != null && (trip as any).expertId === userId;   // can never be true
```

`trips.expert_id` is declared in `shared/schema.ts` and has **no writer anywhere under `server/`** —
verified by grepping every drizzle `.set({ expertId … })` and every raw `expert_id =` in the tree. The
only same-named writer is `storage.claimAffiliateBookingRequest`, which writes
`affiliate_booking_requests.expert_id` — a different table. So an expert assigned through the ONE author
of `trip_expert_advisors` (`upsertTripAdvisorRow`) read **403 `Access denied`** on the trip they had just
been assigned to, and was libelled in the server log as an intruder.

The second site the row names (`server/routes.ts`, the `POST /api/trips/:id/generate-itinerary`
authorization stopgap) is not a reader of items — it is a WRITE gate whose comment reasons about the same
dead column ("EA-managed and expertId-linked trips keep working"). It carried a third arm,
`isTripColumnExpert`, beside `authorizeTripLogistics`.

### V-32 — a comment standing over no handler

`server/routes/payments.routes.ts:2867` was
`// POST /api/leads/route  — score experts and auto-assign`, with `export default router;` on the next
non-blank line. The handler lived in `server/routes.ts` until the June 2026 route-defragmentation commit
`a8d7a8bf2`, which carried the comment across and left the body behind.

---

## 2. What landed

| # | Change | File |
|---|---|---|
| 1 | The trip GET's expert arm asks `isTripAdvisor` (canonical §12 READ predicate), imported not re-derived; evaluated only when no cheaper arm granted | `server/routes/trips.routes.ts` |
| 2 | `canSeePrivateExpertNotes` loses its dead `isExpert` term (behaviour-preserving: EA-only before and after) and states why the advisor arm does NOT widen §21 | `server/routes/trips.routes.ts` |
| 3 | The generate-itinerary stopgap loses `isTripColumnExpert` (§18c — narrows nothing) | `server/routes.ts` |
| 4 | `trips.expertId` annotated **WRITTEN BY NOTHING**, kept not dropped, with the "needs a writer and a ruling first" instruction | `shared/schema.ts` |
| 5 | The `/api/leads/route` comment replaced by a retirement note saying why it is not restored and "do not re-add" | `server/routes/payments.routes.ts` |
| 6 | Seam 1 rewritten onto the live rail `POST /api/expert-requests` | `playwright/tests/seam-cross-console.spec.ts` |
| 7 | New DB suite, 11 proofs, wired as its own Postgres job | `server/__tests__/leads-door-and-trip-read-gate.db.test.ts`, `.github/workflows/build.yml` |

### Why the lead door is RETIRED and not restored

A door whose job is "score experts and auto-assign" would be a **second author of the advisor row**:

* Locked Decision 42 **D7** rules ONE advisor-add rail (`POST /api/trips/:tripId/advisors` →
  `upsertTripAdvisorRow`);
* Locked Decision 32 routes a LEAD through `POST /api/expert-requests`, which creates the
  `expert_requests` row synchronously and then calls `leadRoutingService.routeLead` itself, stamping the
  assignment and calling `ensureTripAdvisorRow` — the same one author, the same scoring service;
* `scripts/check-advisor-row-author.cjs` (ledger `2026-09-04-advisor-row-one-author`) would refuse a new
  insert in `payments.routes.ts` regardless.

`server/services/lead-routing.service.ts` is untouched and stays live. What was missing was the HTTP
door, not the logic — proof **L1b** pins that it still has real importers, so nobody mistakes this
retirement for a §18c deletion of the service.

### Why the spec step was rewritten, not deleted

Seam 1 is the only step in `seam-cross-console.spec.ts` that exercises the lead → routing-queue →
assigned-trips → workspace chain. Deleting it would have dropped the scenario silently. It now POSTs
`/api/expert-requests` with `{ tripId, destination, requestType, notes }` and reads `requestId`; the
downstream admin-confirm / assigned-trips / workspace steps are unchanged, and a comment on the step
records that the scoring the rail kicks off is fire-and-forget, which is why check B still drives the
admin confirm explicitly.

**The suite remains an ORPHAN.** Nothing was armed here; the 233-row orphan count is unchanged.

### Why §21 was deliberately not widened

`trips.expert_notes` is the Workstation's PRIVATE build note. It already has its own reader,
`GET /api/trips/:tripId/expert-notes`, hardened Aug 29 2026 to the §12 **WRITE** allow-list (a `pending`
advisor is refused there). Letting a READ-status advisor inherit the note through the trip GET's `...trip`
spread would re-open exactly the leak that hardening closed. Since the predicate's `isExpert` term was the
dead column, the managing EA was already its only possible principal — so `canSeePrivateExpertNotes =
isManagingEa` is a **behaviour-preserving** simplification, not a narrowing, and proof **R1** asserts both
directions (`expertNotes` null for a pending and an accepted advisor; `expertTravelerNote` delivered).

---

## 3. Proofs

`server/__tests__/leads-door-and-trip-read-gate.db.test.ts`, 11 proofs, wired into `build.yml` as the
job `leads-door-and-trip-read-gate`. The gate is inline in the handler, so the behavioural proofs mount
the **real** `trips.routes.ts` router in a bare express app with a chosen session identity and make real
requests — a proof that called `isTripAdvisor` directly would pass against an unfixed handler for the
wrong reason. Every proof captures `console.warn` for the request, because half the defect was a wrong
log line.

| Proof | Claim |
|---|---|
| A0 | fixture: the trip carries NO `expert_id`; three advisor rows at `pending` / `accepted` / `rejected` |
| A1 | a **PENDING** advisor reads **200**, and **no `[IDOR ATTEMPT]` line is emitted** |
| A2 | an **ACCEPTED** advisor reads **200**, no IDOR line |
| A3 | an unrelated user reads **403**, and the IDOR warning **does** fire (naming them) — the log is narrowed, not silenced |
| A4 | a **REJECTED** advisor reads **403** — the §12 allow-list is unweakened |
| A5 | the owner still reads 200; a fully-anonymous caller with no token is **401**, not 403 |
| R1 | an advisor's 200 carries `expertTravelerNote` and `expertNotes: null` (§21 not widened) |
| S1 | the gate calls and imports `isTripAdvisor`; no `trip…​.expertId ===` grant survives under `server/` |
| S2 | `shared/schema.ts` carries the WRITTEN-BY-NOTHING annotation on the column |
| L1 | `/api/leads/route` is registered nowhere under `server/` **and** no route-header comment for it exists |
| L1b | `lead-routing.service.ts` still exists and still has live importers |

**Discrimination, measured, not asserted.** With the old `trip.expertId === userId` arm patched back in:
**7 pass, 4 fail** (A1, A2, R1, S1). With the old `// POST /api/leads/route …` comment appended back:
**L1 fails**. Both were run and then reverted.

Baseline file: nothing removed — this is a new suite, not a suite promoted off
`scripts/test-orphan-baseline.txt`.

---

## 4. Negative space (§18d) — green means green-within-stated-bounds

* **A1–A5/R1 are about a READ gate.** They assert nothing about item-mutation gates, which take the
  WRITE allow-list (`accepted`/`assigned`, never `pending`) and are pinned by
  `one-trip-write-resolver.db.test.ts`.
* **S1's repo-wide scan is keyed on a receiver literally named `trip`.** Source text is all it can see,
  and three other tables legitimately compare their own `expertId` to a caller id
  (`booking-agent-claim.service.ts`, `statements.routes.ts`, and a seed's lead check — all on
  `affiliate_booking_requests` / expert-neighborhood rows). A receiver-blind pattern indicts them; the
  first draft of S1 did exactly that and was narrowed. The cost of the narrowing is stated: a grant built
  on `trips.expert_id` through a differently-named local would slip past, which is why **S2** pins the
  column annotation as the other half of the proof.
* **L1 reads source.** It fails on both shapes of V-32 (a restored registration and a route-header
  comment), but it cannot tell whether a future handler is reachable.
* **Nothing here claims the column was dropped.** It is kept — that is a schema change nobody ratified,
  and it is live data on disk.

---

## 5. Found and NOT fixed (recorded, not acted on)

* **`trip-plan.service.ts::resolveDeliveredBy`** still falls back to `trips.expertId` when no advisor
  row resolves. It is an explicit last-resort fallback that can never resolve, so it changes no answer —
  but it is dead, and deleting a fallback is a different ruling than fixing a gate. Annotated at the
  column; not touched here.
* **The punchlist's own localisation of V-33 was wrong** (itinerary-item readers vs the trip GET). The
  row is struck with the correction stated in it rather than quietly re-scoped, because a closed row that
  misnames its own defect is how the next reader "fixes" the wrong file.
* **`seam-cross-console.spec.ts` is still an orphan**, along with the other three suites V-31 named.
  Arming needs a `spec-green` Actions run URL, which this lane has no more access to than the last one.

---

## 6. Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | 129 (== baseline) |
| `npm run build` | OK |
| `node scripts/check-decision-guards.cjs` | OK, 0 deferred warnings |
| `node scripts/check-money-endpoints.cjs --self-test` + run | OK |
| `bash scripts/phase2-fee-gate.sh` | OK |
| `node scripts/check-test-files-wired.cjs --self-test` + run | OK, `test-orphan-ratchet: OK` |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK |
| `node scripts/check-undeclared-tables.cjs` | OK (schema.ts touched — comment only) |
| chain-integrity | OK |
| migrations from EMPTY on local Postgres | 301/301 applied |
| new suite | 11/11 |
| `grep -c replit.local package-lock.json` | 0 |

---

## 7. Proposed CLAUDE.md sentences (NOT applied — this lane never edits CLAUDE.md)

Append to Locked Decision 12, after the existing advisor-status sentence:

> **A READ GATE THAT NAMES A COLUMN NOTHING WRITES IS NOT A GRANT (ledger
> `2026-09-15-v32-v33-leads-door-item-read-gate`).** `trips.expert_id` is declared and has NO writer
> anywhere under `server/`; the trip's assigned expert lives in `trip_expert_advisors`, whose ONE author
> is `upsertTripAdvisorRow`. `GET /api/trips/:id` granted its expert arm on that dead column, so a
> legitimately assigned advisor was refused 403 **and logged as an `[IDOR ATTEMPT]`** — a §13 falsehood in
> the log as well as a refused read. The arm now asks the CANONICAL §12 READ predicate `isTripAdvisor`
> (imported, never re-derived — §18 rule 1), `pending` passes as this entry already rules for the trip
> GET, and the generate-itinerary stopgap's copy of the same dead arm is deleted (§18c). The column is
> KEPT and annotated in `shared/schema.ts` as written-by-nothing: do not build a new grant, fallback or
> display on it without first giving it a writer and ratifying that writer.

Append to Locked Decision 42 **D7**:

> **THE `POST /api/leads/route` DOOR IS RETIRED, NOT RESTORED (same ledger row).** It had been a comment
> over no handler since the June 2026 route defragmentation. A "score experts and auto-assign" door would
> be a second author of the advisor row, which this clause forbids and
> `scripts/check-advisor-row-author.cjs` refuses; `POST /api/expert-requests` (Locked Decision 32) already
> runs the same `lead-routing.service.ts` and calls the one author. The scoring service stays live — what
> was retired is the door, not the logic — and `server/routes/payments.routes.ts` carries the note saying
> so. Do not re-add the route.
