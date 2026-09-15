# Lane report — D-27: `artifact_timer` retires as a COMPLETION rule and becomes the ACCEPTANCE-PROMPT rule

**Ledger row:** `2026-09-15-d27-artifact-timer-acceptance-prompt`
**Migration:** none — and none was needed (see §2).
**Spec:** punchlist **D-27** (ruled **A**, 7 days); `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` §3
(state machine, rule 7), §5, §6, §7 **lane 3**.
**Predecessor:** `docs/lane-reports/2026-09-15-d24-d26-acceptance-columns.md` — its "Deliberately
left" §5 named exactly this gap, and its `R9` pinned it. This lane closes it; `R9` is **RE-PINNED**
to the post-D-27 invariant, never deleted.

---

## 1 · The ruling, as built

| Clause | Built as |
|---|---|
| `artifact_timer` leaves the completion rules | removed from `TIMER_DRIVEN_COMPLETION_RULES` (`shared/service-fundamentals.ts`) |
| the `auto_complete_pdf` actor retires | removed from `CompletionActor` and `DIARY_ACTOR`; `timerActorFor` loses its special case |
| the job's artifact arm targets `awaiting_acceptance`, then escalation | `server/services/artifact-acceptance-timer.service.ts`, driven as **pass 3** of `server/jobs/bookingAutoCompletion.ts` |
| escalation lands in the **existing** admin dispute queue | `awaiting_acceptance → disputed`, system reason `acceptance_window_elapsed`, read by `GET /api/admin/disputes` (`WHERE status='disputed'`) |
| the period is config, decision-maker's number | the **existing** `acceptanceWindowDays()` (default **7**), reused — no new constant |
| rows completed under the old timer are not rewritten | no backfill; the arm reads only `confirmed` / `awaiting_acceptance` |

`completeBooking` itself is **untouched**. This lane added **no caller and removed one** — the
opposite shape from the D-24 lane, and the reason the mint-caller table in that report carries a
dated correction rather than a new row.

## 2 · Why there is no migration

Every column this lane needed already exists. `service_bookings.delivered_at`, `deliverable_file`
and `accepted_at` landed with migration 303; `status` is `varchar(30)` with **no CHECK** in any
migration, so `awaiting_acceptance` and `disputed` are code-only values (the LD 44(e) posture); the
system reason rides the existing `booking_metadata` jsonb and the provenance the existing
`booking_details` jsonb; and the diary's `actor_type` / `event_type` are likewise app-enforced
varchars with no CHECK. Nothing new is declared, so `check-undeclared-tables` and
`preflight-prod-constraints` have nothing to gain.

## 3 · The two transitions

Both are `storage.updateServiceBookingStatus(id, <target>, reason, <named from-state list>)` —
`UPDATE … WHERE id = ? AND status IN (…)`, so **the transition is the guard** (§15/§18b). A double
run, two overlapping passes, or a pass racing the traveler's own accept produce exactly ONE flip and
ONE diary row; the loser sees `undefined` and does nothing. There is no check-then-update and no
compensating rollback anywhere in the arm.

| | from | to | reason | mints | diary |
|---|---|---|---|---|---|
| **ASK** | `confirmed` | `awaiting_acceptance` | `d27_acceptance_prompt` | **no** | `booking_acceptance_prompted`, actor `scheduler` |
| **ESCALATE** | `awaiting_acceptance` | `disputed` | `acceptance_window_elapsed` | **no** | `booking_acceptance_elapsed`, actor `scheduler` |

The from-state lists live in the ONE home (`server/utils/booking-from-states.ts`:
`ACCEPTANCE_PROMPT_FROM_STATUSES`, `ACCEPTANCE_ESCALATION_FROM_STATUSES`); the arm declares none of
its own, and `R16` pins that it contains no second `UPDATE … SET status = 'disputed'` beside the one
writer the traveler's rail uses.

**`revision_requested` is deliberately absent from the escalation list.** A booking waiting on the
SELLER is not a booking nobody answered — the traveler answered, and asked for a change. Whether an
ignored revision request escalates on its own clock is **not ruled and not invented**; the
traveler's own dispute rail already covers it (`DISPUTABLE_FROM_STATUSES` includes it).

**No earning is marked at either step, and that is not an omission.** The traveler's dispute rail
calls `setBookingEarningsDispute` to pull a *minted* earning back to `held`. Nothing has minted here
by construction — `awaiting_acceptance` descends from `confirmed`, and the only thing that mints on
this rail is `completeBooking` — so there is nothing to mark, and calling it would be a money action
with no subject.

## 4 · The delivery instant — ONE derivation, stated with its source

`resolveArtifactDeliveryInstant` (`server/services/booking-completion.service.ts`) is the single
answer to "when was this artifact delivered to THIS traveler", with two readers and no copy in the
job (§18 rule 1):

- **`per_booking`** — `service_bookings.delivered_at`, preferred whenever set. It is the only one
  that is about this traveler, and the only one a re-delivery moves.
- **`listing_clock`** — ruling 63's two arms, kept verbatim: the first `deliverable_downloads` row
  for this booking (arm `downloaded`, tried first because it covers listings whose
  `deliverable_uploaded_at` predates the column), else
  `max(confirmed_at, provider_services.deliverable_uploaded_at)` (arm `undownloaded`).
- **`null`** — neither source answers. **§13: the booking is not put on a clock.** It is skipped with
  `no_delivery_timestamp` and never anchored on `confirmed_at` alone, on the listing's upload instant
  alone, or on "now".

`shared/acceptance-window.ts`'s `acceptanceDeadline` was **extended to take that sourced instant**
rather than forked into a second deadline helper; the bare `Date | string` form is unchanged for
every existing caller, and an instant carrying an unknown source is refused rather than silently
measured.

**D-26 holds unweakened: a `listing_clock` instant is NEVER written back to `delivered_at`.**
Stamping a derivation would turn "we inferred this" into "the seller delivered on this date", and
would move every other buyer's window the moment the listing's file changed. `R12` pins it.

## 5 · The deliver rail now opens the window from `confirmed`

`ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES` gains `confirmed` — which the D-24 lane withheld
deliberately "until D-27", because until the timer retired, moving a booking off `confirmed` would
have stranded it where nothing could complete it. So a provider's **first** per-booking delivery now
makes the same `confirmed → awaiting_acceptance` transition the scheduler makes from the listing
clock, and stamps `delivered_at` — because that one **is** the seller's own act, not a derivation.
The D-40 `records_only` hybrid arm is untouched and still moves no status (`R19`).

## 6 · The payment gate moved to the ASK — a finding this lane closes

The old timer verified the PaymentIntent before completing, because completion mints. The prompt
mints nothing — **but it opens the acceptance rail, and acceptance mints**, and `acceptDeliverable`
carries no payment check of its own. An unpaid `confirmed` booking (reachable through the
owner-accept rail, §18b) prompted into `awaiting_acceptance` would therefore have handed the
traveler a button that mints a phantom held earning.

So the gate stays on the **ASK** — the same injectable verifier, the same
`bookingMetadata.autoCompleteUnpaidRecheckAt` stamp and the same head-of-line-block exclusion the
completion pass uses — and the **ESCALATION carries none**: it moves money nowhere, and a booking
nobody answered must reach a human whether or not Stripe is reachable tonight. `R18` pins both
halves, including that the escalation arm never consults the verifier at all.

## 7 · What did NOT move

- **`findAutoCompleteCandidates` / `COMPLETION_ALLOWED_FROM_STATUSES` did not gain
  `awaiting_acceptance`** (the D-24 invariant). The arm has its own candidate query, because that
  list is also `completeBooking`'s guard and widening it would hand the nightly job the very
  bookings D-6 forbids it to complete.
- **No money.** No fee band, rate, amount, idempotency key, hold window or payout was read, written
  or changed. `mintCompletionEarningsForBooking` and `holdWindowDays('service_booking')` are
  untouched, and the hold window still runs from `completed_at`.
- **No backfill** (LD 44(e)). Rows stamped `actor: "auto_complete_pdf"` in `bookingDetails.completion`
  keep that record — that actor did complete those bookings, and editing it would invent a different
  history.
- **`resolveCompletionEligibility`'s `artifact_timer` case was not deleted.** The rule is still the
  true answer to "which rule governs this booking", so the case stays and now answers `false` with
  the stated reason `artifact_takes_acceptance` (§13 — an eligibility nothing may act on is worse
  than a refusal, because every reader takes it as a pending completion).

## 8 · Honesty (§13), where it is load-bearing

- **The system reason has its OWN field.** `booking_metadata.systemDisputeReason` holds
  `acceptance_window_elapsed`; `disputeReason` holds a **traveler's own words**. Merging them would
  attribute a claim to someone who never made one, and a surface reading only one field would render
  an escalation either as a dispute somebody raised or as a dispute with no reason at all.
  `GET /api/admin/disputes` now carries both as separate fields. **Reader-side exposure only — this
  lane ships no UI.**
- **The diary actor is `scheduler`, not `auto_complete`.** `auto_complete` means "a clock completed
  this booking" — precisely the thing D-27 retires — and a diary row claiming it for a transition
  that completed nothing would make the retirement unauditable.
- **Every skip carries a machine-readable reason and is counted**, and the job's one-line-per-pass log
  reports `prompted` / `escalated` / `artifactSkipped` separately from `completed`. A run that asked
  fifty travelers and completed nothing is a healthy run, and a reader must be able to see that.

## 9 · Tests

Extended the existing `server/__tests__/acceptance-rails.db.test.ts` (already wired into the
`acceptance-rails` Postgres job in `build.yml`), **R1–R10 → R1–R19, 20/20**:

| Proof | What it pins |
|---|---|
| **R9 (RE-PINNED)** | `artifact_timer` has LEFT the completion rules; `completionRuleFor` still returns it; `COMPLETION_ALLOWED_FROM_STATUSES` is still `["confirmed"]`; the job drives the arm; the three from-state lists have their new shapes |
| **R11** | a delivered `confirmed` artifact is prompted, source `per_booking`, deadline recorded, **0 minted** |
| **R12** | the `listing_clock` arm prompts too — and **`delivered_at` stays NULL** (D-26) |
| **R13** | **the whole nightly job NEVER completes an artifact**, however old — the negative that fails on the pre-D-27 head |
| **R14 / R14b** | an elapsed window escalates to `disputed` with `acceptance_window_elapsed`, mints nothing, fabricates no `disputeReason`; an open window does not |
| **R15** | no instant from either source ⇒ skipped `no_delivery_timestamp`, never put on a clock, nothing invented |
| **R16** | `auto_complete_pdf` is gone (not renamed); `timerActorFor("artifact_timer") === null`; the arm reuses the ONE dispute writer and declares no list of its own; the admin reader carries both reason fields |
| **R17 (§15)** | two RACED passes ⇒ exactly one prompt and exactly one escalation; a third pass does nothing |
| **R18** | the payment gate on the ASK (unpaid and no-PI both refused, both counted) and its deliberate ABSENCE on the escalation |
| **R19** | the deliver rail's newly-opened `confirmed` entry; a `records_only` hybrid still moves no status |

`server/__tests__/booking-completion-machinery.db.test.ts` — a **recorded orphan**
(`scripts/test-orphan-baseline.txt`; its `before()` requires a dev server on `:5000`, so it cannot
run in this sandbox) — had its five pdf proofs **re-pinned, not deleted**: `D8-P1`, `D8-N1`, `D8-P2`,
`D8-N2` and `D8-P3` now assert the prompt and the absence of a mint where they asserted a completion.
`server/__tests__/deposit-checkout.db.test.ts` D5 moved off the retired actor onto
`auto_complete_property`; its assertion is about the FROM-state and is actor-agnostic.

**Negative space, stated so green means green-within-stated-bounds (§18d):** these prove the
scheduler arm and the deliver rail. They prove **no surface** (brief §7 lane 4 ships nothing here),
they say nothing about the unruled refund on a rejected artifact, the escalation's target is asserted
as `status='disputed'` plus the system reason (the admin reader's SELECT is pinned statically, no
HTTP is driven), and the payment gate is proven by injecting a verifier rather than by reaching
Stripe.

## 10 · Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | **129** = `TSC_BASELINE` |
| `npm run build` | pass |
| All **303** migrations from EMPTY on a local Postgres | 303 applied, 0 skipped |
| `server/migrations/__tests__/chain-integrity.test.ts` | 2/2 |
| `scripts/check-duplicate-migration-prefixes.cjs` | OK (308 on disk, 303 registry) |
| `scripts/check-undeclared-tables.cjs` | no undeclared tables |
| `scripts/check-decision-guards.cjs` | OK, 0 deferred |
| `scripts/check-money-endpoints.cjs --self-test` + scan | 37 fixtures OK; 392 files, no violation |
| `bash scripts/phase2-fee-gate.sh` | PASSED |
| `scripts/check-test-files-wired.cjs --self-test` + scan | 12/12; `test-orphan-ratchet: OK` |
| `server/__tests__/acceptance-rails.db.test.ts` | **20/20** (R1–R19) |
| `shared/__tests__/acceptance-window.test.ts` | 5/5 |
| `server/__tests__/from-state-guards.db.test.ts` | 14/14 |
| `server/__tests__/booking-auto-complete.db.test.ts` | 9/9 |
| `server/__tests__/booking-birth-provenance.db.test.ts` | 12/12 |
| `server/__tests__/deposit-checkout.db.test.ts` | 10/10 |
| `grep -c replit.local package-lock.json` | 0 |

## 11 · What remains

- **Brief §7 lane 4 — every surface.** The traveler's `awaiting_acceptance` state on My bookings and
  the slip's bookings section (LD 42 **D9**), the seller's re-delivery affordance, and the admin
  queue's rendering of `system_dispute_reason` as "window elapsed, no one answered". This lane
  exposes the field and draws nothing.
- **The refund on a rejected artifact** — still **UNRULED** (brief §5), and invented nowhere.
- **Whether an ignored revision request escalates on its own clock** — deliberately not invented.
