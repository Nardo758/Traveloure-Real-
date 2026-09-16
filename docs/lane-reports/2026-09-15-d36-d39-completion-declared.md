# Lane report — D-36 / D-37 / D-38 / D-39: the seller declares, the traveler has a window, "completed" is said at its close

**Ledger row:** `2026-09-15-d36-d39-completion-declared`
**Migration:** `304_booking_completion_declared.sql` — ONE column, `service_bookings.completion_declared_at`
(additive nullable, NO DEFAULT, NO CHECK, declared in `shared/schema.ts`, NO backfill). Claimed **304**;
the parallel D-28..D-31 lane takes the next number after it.
**Spec:** punchlist **D-36 / D-37 / D-38 / D-39** (all ruled **A**, 2026-09-15);
`docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part II §8–§15 (state machine §11, window §12, columns §13,
honesty §14, findings §15); CLAUDE.md §14/§15/§18b, LD 44(e).
**Predecessors:** `2026-09-15-d24-d26-acceptance-columns` (migration 303) and
`2026-09-15-d27-artifact-timer-acceptance-prompt`; their invariants (`DISPUTABLE_FROM_STATUSES`
shape, `COMPLETION_ALLOWED_FROM_STATUSES = ['confirmed']`, the acceptance lists) are kept true and
re-asserted in W6.

---

## 1 · The ruling, as built

```
confirmed ──(seller declares / service-date timer fires)──> completion_declared     ← MINTS NOTHING
                                       │   window OPEN = declaredCompletionWindowDays() (= holdWindowDays)
        ┌──────────────────────────────┼──────────────────────────────┐
        │ traveler confirms            │ window elapses, undisputed   │ traveler disputes
        ▼                              ▼                              ▼
     completed                      completed                      disputed  (the SAME row + queue)
   (mints, anchored to the        (mints, anchored to the        nothing mints; timer matches 0 rows
    declaration; releases now)     declaration → releasable)      reject → completed · uphold → refunded
```

| Clause | Built as |
|---|---|
| **D-36** column | `completion_declared_at`, stamped ONCE inside the guarded `confirmed → completion_declared` UPDATE (`storage.updateServiceBookingStatus`, `COALESCE(existing, NOW())`) |
| **D-36** deadline DERIVED | `declaredCompletionDeadline(declaredAt, windowDays)` in `shared/declared-completion-window.ts` (pure); `windowDays` from `declaredCompletionWindowDays()` — a DELEGATION to `holdWindowDays('service_booking')`, no parallel constant |
| **D-36** status | `completion_declared`, code-only (`varchar(30)`, no CHECK — LD 44(e)); NULL instant ⇒ OMITTED by every reader |
| **D-37** mint | at the window's close — `completeBooking({actor:'window_elapsed'})`, from-state `DECLARED_WINDOW_CLOSE_FROM_STATUSES`, behind the SAME payment gate; `available_at = availableAtFor('service_booking', completionDeclaredAt)` — NULL anchor ⇒ today's `now` |
| **D-37** owner rail | `POST /api/{provider,expert}/bookings/:id/complete` → `declareBookingCompletion`: same eligibility, same evidence, same no-date arm; response `{declared:true, completed:false, disputeBy, windowDays}` |
| **D-37** timer | `service_date_timer` fires at the SAME instant as before and now DECLARES (`timerOpensDeclaredWindow`); `checkout_date` and `bundle_components` unchanged |
| **D-38** dispute | `completion_declared` joins `DISPUTABLE_FROM_STATUSES`; same `disputed` status, same `booking_metadata.disputeReason`, same `GET /api/admin/disputes`; cutoff anchor = `disputeWindowAnchor` (declaration, else `completed_at`); queue carries DERIVED `dispute_stage` |
| **D-39** coordination | coordinator declares via the existing PATCH (`coordinatorMayAdvance`, `completed` refused); traveler arm allow-list `{disputed: ['completion_declared']}` (F3 answered); instant from `state_history` (`coordinationDeclaredAt`); pass 1c closes; refund gated by `coordinationRefundWindowGate`; **no coordinator earning is ever minted** |
| §18c housekeeping | dead `trips.expertId` fallback in `resolveDeliveredBy` DELETED; schema annotation updated |

## 2 · The one money question (D-37), and why no instant moved

`mintCompletionEarningsForBooking` reads `booking.completionDeclaredAt` into `availableAtFor`'s
existing `from` parameter. For a declared booking the traveler's window and the earning's hold are
therefore ONE span measured from ONE instant — served once. Consequences, each proven:

- **Owner-declared rules** (`session_end`, `provider_declared`): before, declare-and-mint at T with
  `available_at = T + N`; now, declare at T (no mint), complete + mint at T + N with
  `available_at = T + N`. Same release instant, to within a scheduler pass (W3).
- **`service_date_timer`**: before, complete at `date+1+N` with release at `date+1+2N`; now, DECLARE at
  `date+1+N`, complete at `date+1+2N` with `available_at = date+1+2N`. Same release instant; the
  traveler's cutoff (`disputeWindowAnchor` + N) is the same instant too (W7). Opening the window at
  the day boundary would have moved release earlier by N days — a timing change the ruling did not
  authorize, so it was not taken; it is a one-line change (`timerOpensDeclaredWindow` + the
  `service_date_timer` arm's `eligibleAt`) if the decision-maker wants it.
- **Undeclared completions** (traveler confirm out of `confirmed`, artifact acceptance, property,
  admin reject on an undeclared row): NULL anchor ⇒ `now + N`, byte-for-byte today's behaviour (W3b).
- **The dispute cutoff moved WITH the anchor**: `POST /api/bookings/:id/dispute` bounds a declared
  booking by `completion_declared_at + N`, so the traveler is never told they may still dispute a
  booking whose money has already released.

Nothing else about money moved: no fee band, no rate, no amount, no idempotency key, no hold VALUE.

## 3 · The from-state lists (ONE home, `server/utils/booking-from-states.ts`)

| List | Value | Consumer |
|---|---|---|
| `COMPLETION_DECLARABLE_FROM_STATUSES` | `['confirmed']` | `declareBookingCompletion` |
| `DECLARED_WINDOW_CLOSE_FROM_STATUSES` | `['completion_declared']` | `completeBooking` (`window_elapsed`) + `findDeclaredWindowCandidates` |
| `TRAVELER_CONFIRMABLE_FROM_STATUSES` | `['confirmed','completion_declared']` | `POST /api/bookings/:id/confirm-completion` |
| `DISPUTABLE_FROM_STATUSES` | + `completion_declared` | `POST /api/bookings/:id/dispute` |
| `COMPLETION_ALLOWED_FROM_STATUSES` | `['confirmed']` — **UNCHANGED** | pass-1 predicate + default `completeBooking` guard |

Coordination's lists live in `server/utils/coordination-from-states.ts` (`COORDINATION_FORWARD_ORDER`,
`COORDINATION_WINDOW_CLOSE_FROM_STATUSES`, `TRAVELER_COORDINATION_TRANSITIONS`). The inline
`FORWARD_ORDER` left `server/routes.ts`; F6b is re-pinned to "exactly one list, in its home".

## 4 · Proofs

`server/__tests__/declared-completion.db.test.ts` (wired into the `acceptance-rails` job, 16/16):

| | proves |
|---|---|
| W1 | declare flips one row, stamps the instant, writes `completionDeclaration`, mints NOTHING, `disputeBy` = instant + window, no stored deadline |
| W2 | concurrent double declare = ONE flip; a third attempt is `wrong_status` and never re-stamps |
| W3 | window close completes ONCE, mints ONCE, `available_at` = declaration + hold (in the past ⇒ releasable), second pass is a no-op |
| W3b | undeclared completion keeps the `now` anchor |
| W4 / W4b / W4c | open window skipped with `window_open` + `eligibleAt`; undated declared row refused (`no_declaration_timestamp`); unpaid declared window never completes (payment gate at the mint) |
| W5 | dispute in the window: `setBookingEarningsDispute` flags 0, status blocks the timer AND the direct flip; admin reject then mints once |
| W6 | `disputed` / `awaiting_acceptance` / `confirmed` rows wearing a declaration instant are never candidates and never complete; list shapes pinned |
| W7 | in-person past its date is DECLARED by the timer (no mint), not re-declared, closes N days later with the close recording WHICH declaration it answered |
| W8 | traveler confirm consumes `completion_declared`, mints anchored to the declaration, early release still clears |
| W9 / W9b / W9c | coordinator may declare, not complete; traveler may only object; refund gate `no_window`/`open`/`disputed`/`closed`; the pass closes once, skips open/disputed/undated, appends one history entry, mints NOTHING |
| W10 / W10b | §19 strip at schema + both storage writers; D-37 anchor pinned; owner rail declares and calls `completeBooking` nowhere; one ordering list; one payment gate with two callers |

`shared/__tests__/declared-completion-window.test.ts` (same job, 6/6): P1 derived deadline; P2 §13
nulls; P3 elapsed; P4 one dispute anchor; P5 derived stage; P6 coordination instant from history.

**Re-pinned, never deleted:** `from-state-guards.db.test.ts` F6b (14/14 green);
`booking-completion-machinery.db.test.ts` D8-P5/P6/P7/P9/P10/P11/N13 — that suite needs a running
server (`JOURNEY_BASE_URL`) and is not wired into a DB job, so it was **edited to the new truth but
not executed here**; stated, not claimed.

## 5 · Deliberately left, named

- **Lane 4 surfaces** (brief §17): My bookings / slip bookings section / seller declare affordance /
  countdown. Touched only where a raw token would otherwise have rendered: `purchase-status.ts`
  ("Booked · your expert says this is done") and the expert console's coordination stage strip.
  `GET /api/bookings/:id` carries a `completionDeclaration {declaredAt, disputeBy, windowDays}`
  read-out for the owner while the window is open — omitted otherwise.
- **Bundles under D-7** — `recordBundleComponentCompletion` still completes directly; D-32..D-35 owns it.
- **`deposit_paid`** is NOT declarable — a half-paid booking's completion is unruled.
- **An admin "reject" on a disputed coordination engagement** — no admin arm exists on the status
  PATCH and none was added; the refund route is the one resolution. A disputed engagement is visible
  where every engagement already is (`GET /api/admin/concierge-requests`).
- **Whether a coordinator is ever paid an earning** out of the captured fee — UNRULED (memberships /
  engagement lane), stated in `coordination-from-states.ts`, `coordination-completion.service.ts`
  and the refund route.
- `workspace.tsx`'s `COORD_STATUS_ORDER` is a DISPLAY mirror of the server list, annotated as such.

## 6 · Validation

| Check | Result |
|---|---|
| tsc `error TS` count | 129 (baseline) |
| `npm run build` | green |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + run | OK / exit 0 |
| `phase2-fee-gate.sh` | exit 0 |
| `check-test-files-wired.cjs --self-test` + run | 12/12; `test-orphan-ratchet: OK` |
| `check-duplicate-migration-prefixes.cjs` | OK (304 registry entries) |
| `check-undeclared-tables.cjs` | OK |
| chain-integrity | 2/2 |
| migrations from EMPTY (local Postgres 55470) | 303 applied, then 304 applied alone on the second run |
| new suites | 16/16 DB, 6/6 pure |
| neighbours | from-state-guards 14/14, acceptance-rails 20/20, acceptance-window 5/5, trip-card-status + booking-visibility 39/39 |
| `grep -c replit.local package-lock.json` | 0 |

## 7 · Proposed CLAUDE.md sentence (not applied — PROPOSED)

> **47. THE SELLER DECLARES; THE TRAVELER HAS A WINDOW; "COMPLETED" IS SAID AT ITS CLOSE (decision-maker
> ratified Sep 15, 2026 — ledger `2026-09-15-d36-d39-completion-declared`; migration 304).** For the
> owner-declared rules and the place-anchored timer, completion is TWO guarded flips with the traveler's
> dispute window between them: `confirmed → completion_declared` (the seller, or `service_date_timer`,
> stamps `service_bookings.completion_declared_at` and MINTS NOTHING) and `completion_declared →
> completed` (the nightly job, actor `window_elapsed`, the ONE `completeBooking`, payment gate at that
> flip). The window is `declaredCompletionWindowDays()` — a DELEGATION to `holdWindowDays('service_booking')`,
> never a parallel constant — and its deadline is DERIVED (`shared/declared-completion-window.ts`), never
> stored. **D-37:** the held earning's `available_at` is anchored to the DECLARATION, so the window is served
> once and no payout instant moved; a NULL anchor keeps `now`. **D-38:** a dispute inside the window is the
> SAME `disputed` row and queue (no `admin_review`, no disputes table); the queue tells stages apart by
> derivation; zero flagged earnings is never read as cleared — the status is the block. **D-39:** on
> `coordination_states` the ASSIGNED COORDINATOR declares, `completed` is the window's word, the traveler's
> one move is `completion_declared → disputed`, and the window gates the admin REFUND only — **no coordinator
> earning is ever minted**, and whether one should be stays unruled. Bundles and property still complete
> directly. "Completed" is never rendered before the window closes.
