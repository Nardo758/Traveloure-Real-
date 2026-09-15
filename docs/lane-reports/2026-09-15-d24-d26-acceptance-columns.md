# Lane report — D-24 / D-25 / D-26 + D-40 (hybrid): acceptance columns and the accept/revision rails

**Ledger row:** `2026-09-15-d24-d26-acceptance-columns`
**Migration:** 303 — `server/migrations/303_booking_acceptance_and_revisions.sql`
**Brief:** `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part I §3–§7 and Part II §10
**Scope executed:** brief §7 **lane 1 (columns) and lane 2 (the rails)**, plus the D-26 re-delivery
rail lane 5 depends on. **Nothing of lanes 3 (the timer) or 4 (surfaces).**

---

## 1 · The rulings, as built

| Row | Ruling | Built as |
|---|---|---|
| **D-24** | option A — `accepted_at` yes; the deadline **DERIVED**, never stored | `service_bookings.accepted_at`; `acceptanceDeadline(deliveredAt, acceptanceWindowDays())` in `shared/acceptance-window.ts` |
| **D-25** | option A — a **child table**, count derived, **no `revision_status` mirror** | `booking_revision_requests` (FK CASCADE, `UNIQUE (booking_id, "position")`, parent index, `requested_at`/`note`/`resolved_at`) |
| **D-26** | option A — a **per-booking artifact pointer**, listing file as the honest fallback | `service_bookings.deliverable_file` **and `service_bookings.delivered_at`** — see §2 |
| **D-40** | option A; hybrid sub-question **YES** | `provider_services.declared_artifact_deliverable`; `acceptanceModeFor` returns `records_only` for it |

**The acceptance window's number is CONFIG, not a literal.** `acceptanceWindowDays()`
(`server/config/completion-windows.config.ts`) defaults to **7** — the decision-maker's D-27 period —
and is overridable by `BOOKING_ACCEPTANCE_WINDOW_DAYS`. It is its own accessor rather than a
delegation to `holdWindowDays('service_booking')`, and the file says why: the hold window measures
the traveler's chance to object *after money settles*, this one measures the time to *answer before
the booking leaves them*. The earnings hold has not started at that point, so delegating would tie
two windows that answer different questions. That is not the "parallel constant" the file header
forbids; it is a second question with its own number.

## 2 · The D-26 check the brief asked for, answered explicitly

**The row held NO per-booking delivery instant, and `delivered_at` was added in the same migration.**
Verified in `server/services/booking-completion.service.ts`: the `artifact_timer` undownloaded arm
computes delivery as `max(service_bookings.confirmed_at, provider_services.deliverable_uploaded_at)`
— the LISTING's clock, shared by every buyer of that listing — and refuses with
`no_delivery_timestamp` when either half is absent. D-24's derived deadline needs a **per-booking**
instant, and a **re-delivery must move it**, which a listing-level column cannot do without moving
every other buyer's window with it. `service_bookings.delivered_at` is that instant; the deliver rail
stamps it on first delivery and on every re-delivery, and nothing back-fills it from the listing's
clock (§13).

## 3 · The mint-caller table

`completeBooking` (`server/services/booking-completion.service.ts`) remains the **ONE** implementation
of `→ completed`, and `storage.updateServiceBookingStatus` remains the one writer that mints inside
its own transaction. This lane added **one caller**, not a path.

> **CORRECTION 2026-09-15 (D-27; ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`).** The
> first row below is **RETIRED**. `artifact_timer` left `TIMER_DRIVEN_COMPLETION_RULES`, so
> `timerActorFor` returns `null` for it and the `auto_complete_pdf` actor no longer exists —
> `completeBooking` is still untouched and now has **one fewer caller**, never a renamed one. The
> nightly job's artifact arm ASKS (`confirmed → awaiting_acceptance`) and ESCALATES
> (`awaiting_acceptance → disputed`, the existing admin dispute queue); neither completes and
> neither mints. **Rows already stamped `actor: "auto_complete_pdf"` are NOT rewritten** (LD 44(e)):
> that actor did complete those bookings. Everything else in this table stands.

| Actor | From-state | Who asks | Mints? |
|---|---|---|---|
| ~~`auto_complete_pdf`~~ | ~~`confirmed`~~ | **RETIRED by D-27** — see the correction above | — |
| `auto_complete_property` | `confirmed` | the nightly job | yes |
| `auto_complete_service_date` | `confirmed` | the nightly job | yes |
| `provider_session_end` | `confirmed` | the owner completion rail | yes |
| `provider_declared` | `confirmed` | the owner completion rail | yes |
| `provider_bundle_components` | `confirmed` | the owner completion rail | yes |
| **`traveler_accepted` (NEW)** | **`awaiting_acceptance`** | `POST /api/bookings/:id/accept-deliverable` | yes — through the same writer, in the same transaction |

`awaiting_acceptance` is deliberately **NOT** added to `COMPLETION_ALLOWED_FROM_STATUSES`: that list
is also the timer's candidate predicate (`findAutoCompleteCandidates`), and widening it would hand
the nightly job the very bookings D-6 forbids it to complete. The acceptance rail claims its own
`ACCEPTANCE_FROM_STATUSES` instead.

**D-40's arm mints nothing.** On a `hybrid` listing with a declared artifact, acceptance is
`records_only`: it stamps `accepted_at` through its own atomic conditional, moves **no status**,
completes **nothing** and mints **nothing**. The booking keeps `service_date_timer`.

## 4 · The rails

| Rail | Gate (§14) | Guard (§15/§18b) | Body (§19) |
|---|---|---|---|
| `POST /api/bookings/:id/accept-deliverable` | session = `traveler_id` | `completeBooking` over `ACCEPTANCE_FROM_STATUSES`, or the `records_only` conditional | none read at all |
| `POST /api/bookings/:id/request-revision` | session = `traveler_id` | one transaction, `FOR UPDATE` on the parent, conditional flip `awaiting_acceptance → revision_requested`, `UNIQUE (booking_id, position)` as the last guard | pick-based `.strict()` `bookingRevisionNoteSchema` — exactly `note` |
| `POST /api/bookings/:id/deliver-artifact` | session = `provider_id` | conditional write over `ARTIFACT_DELIVERY_FROM_STATUSES`; conditional re-open over `ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES` | `fileValue` only, a value the existing upload rail produced |

An unresolvable address is **one 404** on every rail — "no such booking" and "not yours" are the same
sentence, so none can be used to probe which bookings exist.

**The allowance is read LIVE from `provider_services.revisions_included` on every decision** and is
never copied onto the booking (§18 rule 1, §19). A request beyond it is refused with the **number
stated**, and it never becomes a dispute.

**Disputability:** `awaiting_acceptance` and `revision_requested` **join** `DISPUTABLE_FROM_STATUSES`.
They descend from `confirmed`, so the money is in escrow and nothing has minted — the exact predicate
that list already states — and a traveler who believes the artifact is not what was sold, or whose
revision request is ignored, must have a remedy that is neither "accept" nor "revise".
`payment_pending` stays absent. A revision request is still **never** a dispute: different rail,
different word, different consequence.

## 5 · What was deliberately left

- ~~**D-27 — the escalation timer.**~~ **CLOSED 2026-09-15** by ledger
  `2026-09-15-d27-artifact-timer-acceptance-prompt` — the paragraph below records what this lane
  left, and is kept verbatim as the record of the sequenced gap it named. `artifact_timer`,
  `TIMER_DRIVEN_COMPLETION_RULES` and
  `server/jobs/bookingAutoCompletion.ts` were **untouched here**. **The sequenced gap, stated plainly: an
  artifact booking still auto-completes under the old timer, and nothing in production yet moves
  `confirmed → awaiting_acceptance`.** The deliver rail's re-open list is `revision_requested`
  ALONE, deliberately — adding `confirmed` here would take every artifact booking off the only
  completion path that exists today and strand it until D-27 ships. Test `R9` pins that this lane did
  not close D-27 by accident.
- **Lane 4 — every surface.** No traveler, seller or admin UI; no copy.
- **The refund on a rejected artifact** (brief §5) — still **unruled**, and invented nowhere.
- **Expenses** — still **not built** (D-40 option B, unchanged). No expense surface, column or copy
  was added; `client/src/lib/__tests__/no-expense-reimbursement.test.ts` is green.
- **No money moved.** No fee band, rate, amount, idempotency key or hold window was read, written or
  changed. Acceptance gates **no charge**; deposits and balances are untouched (§15d).

## 6 · Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | **129** = `TSC_BASELINE` |
| `npm run build` | pass |
| All **303** migrations from EMPTY on a local Postgres | 303 applied, 0 skipped |
| `server/migrations/__tests__/chain-integrity.test.ts` | 2/2 |
| `scripts/check-duplicate-migration-prefixes.cjs` | OK (308 on disk, 303 registry) |
| `scripts/check-undeclared-tables.cjs` | 302/302 declared — no unexpected DROPs |
| `scripts/check-decision-guards.cjs` | OK, 0 deferred |
| `scripts/check-money-endpoints.cjs --self-test` + scan | 37 fixtures OK; 391 files, no violation |
| `scripts/check-privileged-field-completeness.cjs` | OK |
| `bash scripts/phase2-fee-gate.sh` | PASSED |
| `scripts/check-test-files-wired.cjs --self-test` + scan | 12/12; `test-orphan-ratchet: OK` |
| `server/__tests__/acceptance-rails.db.test.ts` (**new**) | **10/10** (R1–R10) |
| `shared/__tests__/acceptance-window.test.ts` (**new**) | **5/5** (A1–A5) |
| `server/__tests__/from-state-guards.db.test.ts` | 14/14 |
| `server/__tests__/booking-birth-provenance.db.test.ts` | 12/12 |
| `server/__tests__/booking-auto-complete.db.test.ts` | 9/9 |
| `client/src/lib/__tests__/no-expense-reimbursement.test.ts` | 4/4 |
| `grep -c replit.local package-lock.json` | 0 |

`server/__tests__/booking-completion-machinery.db.test.ts` is a **recorded orphan**
(`scripts/test-orphan-baseline.txt` line 67) whose `before()` requires a dev server on
`http://127.0.0.1:5000`; it cannot run in this sandbox and is unchanged by this lane.

**No `preflight-prod-constraints.cjs` manifest entry is needed:** migration 303 adds and changes **no
CHECK**, so the publish-time drizzle push has nothing to fail on.
