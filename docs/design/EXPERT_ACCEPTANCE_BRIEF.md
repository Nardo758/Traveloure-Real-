# Expert acceptance — artifacts are accepted, not timed out

**Status:** DESIGN BRIEF. The ruling is made (decision-maker, 2026-09-15, punchlist **D-6**,
option A); the columns are **not**. No migration is written by this lane. Ledger row:
`2026-09-15-d6-acceptance-for-artifacts`.

**The ruling.** An **artifact** — a plan, a brief, edited media, anything delivered as a file or a
written deliverable — requires **traveler acceptance** before the booking completes and earnings are
minted. **A silent timeout NEVER completes in the seller's favour:** an unanswered window goes to a
stated *awaiting your acceptance* state and then, after a period the decision-maker will set, to
**admin review** — never to auto-completion. **Sessions and live support** stay seller-declared with
a dispute window; that is **D-7**, still open, and this brief leaves the seam for it. The revision
allowance is the listing's own `provider_services.revisions_included` — **read, never restated**.

**PART II (below) carries D-7**, ruled the same day: the seller declares completion for sessions,
physical-action and coordination work, the traveler gets a stated dispute window before earnings
release, and reimbursable expenses are ruled *not built*. Part I is unchanged by it.

---

## 1 · Facts on the ground today

**Completion is already one machine, and it already auto-completes artifacts.**
`server/services/booking-completion.service.ts` is the single writer of the `confirmed → completed`
flip (its header: *"this file is the ONLY place a `service_bookings` row is moved to `completed` by
the D8 rules"*). Which rule a booking falls under is resolved by `completionRuleFor` in
`shared/service-fundamentals.ts`, which returns one of six: `service_date_timer`, `checkout_date`,
`artifact_timer`, `session_end`, `provider_declared`, `bundle_components` — three
`TIMER_DRIVEN_COMPLETION_RULES` (a scheduler fires them, no human in the loop), three
`OWNER_DECLARED_COMPLETION_RULES`.

**`artifact_timer` is exactly the shape the ruling forbids.** For a `pdf` listing,
`resolveCompletionEligibility`'s `artifact_timer` arm completes the booking
`ARTIFACT_AUTO_COMPLETE_DAYS` after the **first download** (`deliverable_downloads`), or — with no
download at all — that same window after delivery, "delivered" being
`max(service_bookings.confirmed_at, provider_services.deliverable_uploaded_at)`.
`server/jobs/bookingAutoCompletion.ts` fires it nightly. **That is a silent timeout completing in
the seller's favour**, and D-6 amends it. The window is already config, not a literal
(`server/config/completion-windows.config.ts`, `BOOKING_AUTO_COMPLETE_DAYS_ARTIFACT`, default 7),
so the §8 posture the replacement needs already exists.

**Completion is the money event.** `storage.updateServiceBookingStatus` (`server/storage.ts`) takes
an `expectedFromStatuses` guard — the §15 atomic conditional, *"the transition itself is the
guard"* (§18b) — and **inside the same transaction** calls `mintCompletionEarningsForBooking` on
any flip to `completed`, minting a `platform_revenue`, a `provider_earnings` and an
`expert_earnings` row, each born `status:'held'` with
`availableAt = availableAtFor('service_booking')` (`server/config/earnings-hold.config.ts`,
default 7 days, env-overridable). Release is separate: `storage.releaseMaturedEarnings`
(`earnings-release-scheduler.service.ts`) flips `held → releasable` once `available_at` passes and
`dispute_state IS DISTINCT FROM 'open'`. **Completion mints; the hold window releases.**

**The owner rail cannot set `completed`, and that is deliberate.**
`OWNER_SETTABLE_BOOKING_STATUSES = ["confirmed","cancelled"]`, with
`OWNER_BOOKING_TRANSITIONS = { confirmed: ["pending"], cancelled: ["pending","confirmed",
"deposit_paid"] }` (`server/routes.ts`) — *"allowing the owner to set it would let them
self-credit"*. Its completion rail is the separate
`POST /api/{provider,expert}/bookings/:id/complete`, which refuses any rule not in
`OWNER_DECLARED_COMPLETION_RULES` and is evidence-gated. The traveler's rail is
`POST /api/bookings/:id/confirm-completion` (`server/routes/bookings.ts`) — it drives
`confirmed → completed` **and** early-releases, gated on a Stripe-verified `succeeded`
PaymentIntent. `POST /api/bookings/:id/dispute` sets `status='disputed'` and is refused once
`completed_at + holdWindowDays('service_booking')` has passed.

**Delivery, today, is a LISTING-level file — not a per-booking one.**
`provider_services.service_file` holds the artifact; `deliverable_uploaded_at` is stamped by
`storage.updateProviderService`'s strip-and-derive (§18 layer 2) when that value **changes**. The
upload rail is `POST /api/provider/services/:id/deliverable-file` (owner-gated, PDF magic-byte
checked, stored under an unguessable object-storage key). The buyer's read is
`GET /api/service-bookings/:id/deliverable`, gated on session = `traveler_id`, `status='confirmed'`,
`isArtifactDelivery(service)`, and a non-empty file; every success logs a `deliverable_downloads`
row. **This is load-bearing for revisions:** there is no per-booking artifact, so re-uploading a
revision today changes the file **every** buyer of that listing downloads.

**`revisions_included` is a promise with no machinery.** `shared/schema.ts:945`,
`integer("revisions_included").default(0)`; written by `ServiceForm.tsx`, rendered on the listing
card (`client/src/components/service-browser.tsx`), returned on the public detail payload (pinned by
`service-detail-traveler-representation.http.test.ts`). **No server code reads it** — nothing
consumes, decrements or enforces it on the service rail.

**The closest existing precedent is ready-made.** `ready_made_purchases.revision_status` /
`revision_request_note` / `revision_requested_at` (migration 252; `shared/schema.ts:10155-10157`):
`varchar(20)`, **app-enforced vocabulary, NO DB CHECK**, `NULL = available`, then `requested →
in_progress → delivered`; omitted from the insert schema (§19). The claim is one atomic conditional
(`POST /api/ready-made/purchases/:id/request-revision` — `UPDATE … WHERE id AND buyer_id AND
revision_status IS NULL`), which both takes the entitlement and grants the expert §12 write access.
That purchase's entitlement is **exactly one** revision (ledger
`2026-09-15-d2-one-revision-not-a-consultation`); here the allowance is the listing's own column.

**Dispute rows that already exist:** `service_bookings.status='disputed'` plus the reason merged
into `booking_metadata`; `expert_earnings.dispute_state` / `provider_earnings.dispute_state`
(`'open'` blocks release); `GET /api/admin/disputes` with
`POST /api/admin/disputes/:bookingId/{uphold,reject}` (`server/routes/admin.routes.ts`). **An admin
review surface exists to extend; a second one must not be built.**

**`service_bookings.status` is `varchar(30)` with NO DB CHECK** (`shared/schema.ts:1426`; verified
across the migration set — `deposit_paid` was added the same way). New status values are a **code
change, not a publish trap** — the LD 44(e) posture.

---

## 2 · Which offerings are artifacts

The vocabulary is CLAUDE.md §3's canonical seven. Mapped through `completionRuleFor` and
`impactClassFor` (`shared/impact-class.ts`):

| Delivery method | Rule today | Shape | Lane |
|---|---|---|---|
| `pdf` | `artifact_timer` | **artifact** | **D-6 — acceptance** |
| `voice_notes` | `provider_declared` | **artifact** (async, no slot — ruling 69 disposition 8 moved it here for exactly that reason) | **D-6 — acceptance** |
| `async_messaging` | `provider_declared` | **artifact** | **D-6 — acceptance** |
| `call`, `video` | `session_end` | session (`video` is a *live* call in this platform's vocabulary — `SESSION_END_METHODS`) | **D-7** |
| `in_person` | `service_date_timer` | on-ground | **D-7** |
| `hybrid` | `service_date_timer` | **mixed — recommended, not decided** | see below |

Orthogonally, `productShape` outranks delivery method in `completionRuleFor`: `bundle` and
`property`/`property_room` keep `bundle_components` / `checkout_date` and are **out of scope** for
both lanes.

**`hybrid` — recommended, not decided.** A hybrid listing is place-anchored *and* produces
something. Treating the whole booking as an artifact would hold a provider's money for a session
they actually ran; treating it as a session would let a plan be paid for unaccepted. **Recommend:
`hybrid` stays with the session lane (D-7), and an artifact obligation on a hybrid listing is a
separate deliverable the listing must declare** — so D-6 does not touch it. Ruling it the other way
is cheap later and expensive to undo, because it moves money timing on live listings. **The
decision-maker rules it, not this brief.**

**One honest limit:** `voice_notes` and `async_messaging` are artifact-shaped by classification but
have **no delivery rail** — `ARTIFACT_DELIVERY_METHODS` is `{"pdf"}` (D3's deliberate scope), so
`/deliverable` refuses them and there is nothing to accept. They stay `provider_declared` until
their delivery rails land, rather than an acceptance button over an empty column (§13).

---

## 3 · The state machine

```
confirmed ──(artifact delivered)──> awaiting_acceptance
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │ traveler accepts             │ traveler requests revision   │ window elapses
        ▼                              ▼                              ▼
     accepted ──> completed        revision_requested             admin_review
   (mint held earnings)            (seller re-delivers)      (a human decides; never
        │                               │                     completion by default)
        ▼                               └──> awaiting_acceptance
  hold window ──> releasable
```

**Rules that are not negotiable in the build.**

1. **Every transition is an atomic conditional (§15)** through the existing
   `expectedFromStatuses` guard on `storage.updateServiceBookingStatus`, or the ready-made
   `UPDATE … WHERE … IS NULL` shape for the revision claim. A check-then-update is the bug, not
   the guard. A double-click, a retried request and a scheduler racing a traveler produce **one**
   flip, **one** earning set, **one** diary row.
2. **The actor comes from the session (§14), never `req.body`.** Only the booking's `traveler_id`
   may accept or request a revision; only `provider_id` may re-deliver; only an admin resolves
   review. The booking comes from the path; the allowance comes from the listing row.
3. **Completion still mints, and acceptance is what causes completion.** No second minting path.
   `completeBooking` stays the one implementation; acceptance becomes a new **caller** with its
   own actor tag (§18 rule 1).
4. **`awaiting_acceptance` and `revision_requested` are new `service_bookings.status` values** —
   app-enforced, no CHECK, no backfill. A booking that was completed under the old timer **was**
   completed; rewriting it would invent a fact (LD 44(e) posture).
5. **The escalation period is CONFIG, never a literal** — the
   `completion-windows.config.ts` posture, env-overridable, and the decision-maker sets the
   default.
6. **The revision allowance is read from `provider_services.revisions_included` on every
   decision.** No copy onto the booking row, no client-supplied count (§19). A request beyond the
   allowance is refused with the number stated; it does **not** silently become a dispute.
7. **Nothing else moves state.** The auto-completion job stops flipping artifacts to `completed`
   and instead moves `confirmed → awaiting_acceptance` and `awaiting_acceptance → admin_review`;
   it decides nothing it cannot evidence, and skips with a stated reason (§13).

---

## 4 · Columns proposed — decision rows, not a migration

Filed in `docs/PUNCHLIST.md` §1 as **D-24 … D-27**. All proposals are additive, nullable, **NO
DEFAULT and NO DB CHECK** (publish-trap posture — migrations 181/195/273/275/277/279/281/282/284),
**declared in `shared/schema.ts`** (deploy-push durability rule), **no backfill**, and written only
through a pick-based allowlist or a targeted server-side UPDATE (§19).

- **D-24 — `service_bookings.accepted_at`, and is the window stored or derived?**
  *Recommend:* `accepted_at` (timestamp, NULL = never accepted, and the row is omitted from every
  surface rather than rendered as "not accepted yet" where the booking is not an artifact).
  **Derive the deadline; do not store `acceptance_window_ends_at`.** A stored end date is a second
  authority that disagrees with the config the moment the config moves, and it would have to be
  re-stamped on every re-delivery. Derive it from the delivery instant + the config value, the way
  `eligibleAt` is already derived in `resolveCompletionEligibility`.
- **D-25 — revision accounting: a `revisions_used` integer, or a child table?**
  *Recommend:* a **child table** (`booking_revision_requests`) on the `service_route_points` /
  `dmo_extracted_places` pattern — FK → `service_bookings` ON DELETE CASCADE,
  `UNIQUE (booking_id, "position")`, `requested_at`, `note`, `resolved_at`. A counter answers *how
  many* and nothing else: it cannot carry the traveler's words, which are the evidence admin review
  needs, and it cannot say when a revision was asked for or when it was answered. The count is then
  **derived** from the rows and never stored beside them (§18 rule 1). *Sub-question in the same
  row:* whether a `revision_status` varchar mirrors ready-made's `NULL → requested → in_progress →
  delivered`. *Recommend:* **no** — ready-made needs it because its entitlement is exactly one and
  lives on the purchase row; here the allowance is N and the child rows already say the same thing
  more precisely.
- **D-26 — is there a PER-BOOKING deliverable?** Today the artifact is `provider_services.
  service_file`, shared by every buyer of the listing, so a revision for one traveler rewrites the
  file the others download. *Recommend:* **yes** — a per-booking artifact pointer, additive and
  nullable, with the listing file as the honest fallback when it is NULL. **Without this, the
  revision half of the ruling cannot be built truthfully**, and that is why it is a decision row
  rather than a build note.
- **D-27 — does `artifact_timer` retire, what is the escalation period, and who reviews?**
  *Recommend:* `artifact_timer` **stops being a completion rule** and becomes an
  acceptance-prompt rule; it leaves `TIMER_DRIVEN_COMPLETION_RULES`, the
  `auto_complete_pdf` actor is retired, and the job's artifact arm targets `awaiting_acceptance`
  instead. Escalation lands in the **existing** admin dispute queue
  (`GET /api/admin/disputes`) with its own reason, not a second queue. The period is a config
  value; the decision-maker sets the number.

---

## 5 · Money posture

**What changes:** for artifacts only, the event that mints the held earning moves from *the timer
fired* to *the traveler accepted*. **What does not change:** nothing about amounts, fees, rates,
splits or payouts. No fee band is read differently, `mintCompletionEarningsForBooking` and
`holdWindowDays('service_booking')` are untouched, and the hold window still runs from
`completed_at` — so an accepted artifact keeps its full dispute window before release
(`releaseMaturedEarnings`). An artifact that goes to admin review mints only when a human says
so.

**Deposits and balances (§15d).** A deposit-then-balance artifact booking has **two charges and one
completion**. Acceptance gates the **release of the earnings for both legs** — because there is one
mint, at completion, over `total_amount`/`provider_earnings` on the row — and it gates **no charge
at all**. The balance is still paid through `POST /api/bookings/:id/pay-balance` by the owner or a
`payer`-role participant under `canPayBalance`, still with the server-derived amount, the
balance-payer claim and the actor from the session. **An unaccepted artifact does not block the
balance charge, and acceptance is never a payment gate.**

**Explicitly NOT decided here: the refund on a rejected artifact.** Admin review can end in
completion or in a refund, and what a refund of a partially-delivered artifact is worth — full,
partial, or nothing — is a policy question this brief does not answer. It is adjacent to **D-9**
(one bundle component failing) and to the still-unruled SD-2 cancel-a-confirmed-booking refund gap
named in `OWNER_BOOKING_TRANSITIONS`. Until it is ruled, admin review resolves through the
**existing** refund rails and invents none.

---

## 6 · Honesty rules (§13)

- **"Accepted" is never inferred from silence.** No surface says accepted, approved, signed off or
  completed on the strength of a window elapsing. The state is named for what it is: *awaiting your
  acceptance*, then *with our team for review*.
- **The traveler's read at each state:** `confirmed` — "your expert is working on this", with no
  promised date the platform does not hold; `awaiting_acceptance` — the artifact, accept, revise
  **with the remaining number taken from the listing**, and when the window closes;
  `revision_requested` — what they asked and that the seller has it; `admin_review` — that nobody
  answered, that no money moved, and that a person is looking; `completed` — accepted, with the
  date.
- **A revision request is never rendered as a dispute.** Different word, different surface,
  different consequence: a revision is an entitlement the listing sold, a dispute is a claim that
  something went wrong. Conflating them would put an ordinary edit request into the disputes queue
  and mark the seller's earning `dispute_state='open'`.
- **A listing with `revisions_included` NULL or 0 shows no revision affordance at all** — never
  "0 revisions remaining" beside a button that refuses.
- **A booking whose delivery instant the server does not hold is not put on an acceptance clock** —
  skipped with the reason, the way `no_delivery_timestamp` already is. Nothing is zero-filled: an
  artifact never uploaded is "not delivered yet", not "delivered, 0 downloads".

---

## 7 · Build sequence, and the negative space

**Schema first, and only after D-24 – D-27 are ruled.**

1. **Lane 1 — columns.** The ruled subset of D-24 – D-27, one migration, declared in
   `shared/schema.ts`, registered in `server/migrations/migration-files.ts`. No behaviour.
2. **Lane 2 — the accept and revision rails**, traveler-gated, atomic conditionals, allowance read
   from the listing. `completeBooking` gains acceptance as a caller; no second completion path.
3. **Lane 3 — the timer's amendment.** `artifact_timer` leaves the completion rules; the job moves
   artifacts to `awaiting_acceptance` and escalates to `admin_review`; the `auto_complete_pdf`
   actor retires. **This is the lane that makes the ruling true**, and it must not ship before
   lane 2 or an artifact would have nowhere to go.
4. **Lane 4 — surfaces.** The traveler states on My bookings and the slip's bookings section
   (LD 42 **D9** — owner and `payer`-role audience, gated by the same predicate the route runs);
   the seller's re-delivery affordance; the admin queue's new reason.
5. **Lane 5 — re-delivery**, only if D-26 rules a per-booking artifact.

**Negative space — what this brief does not decide, and nobody may take as decided.**

- **Sessions, live support and coordination work (D-7)** — who declares completion and the dispute
  window's shape. The seam is: `OWNER_DECLARED_COMPLETION_RULES` and `session_end` are **untouched**
  by every lane above, so D-7 can rule them without unpicking anything here.
- **`hybrid`** — recommended to D-7, not ruled.
- **The refund on a rejected artifact** (§5).
- **Reimbursable expenses** — D-7's other half.
- **`voice_notes` / `async_messaging` acceptance**, which is blocked on their delivery rails.
- **Any change to an amount, a rate, a fee band, a payout or the hold window.** None is proposed and
  none may be introduced as a side effect.

**RULED SINCE, IN PART II BELOW (2026-09-15, punchlist D-7 — ledger `2026-09-15-d7-completion-split`):**
the first three bullets of this list. Sessions, live support and coordination work are ruled in
Part II §11; `hybrid` is ruled to D-7 in §10; reimbursable expenses are ruled **option B — not
built, and no surface may promise one** in §16. This section's remaining bullets stand unchanged,
and every lane Part I sequences still leaves `OWNER_DECLARED_COMPLETION_RULES` and `session_end`
untouched.

---

# Part II — Sessions, coordination and expenses (D-7)

**Status:** DESIGN BRIEF, second half. The ruling is made (decision-maker, 2026-09-15, punchlist
**D-7**, the SPLIT); the columns are **not**. No migration, no rail and no status-machine code is
written by this lane. Ledger row: `2026-09-15-d7-completion-split`.

This part answers the first three bullets of §7's negative space — sessions and live support,
`hybrid`, and reimbursable expenses — and leaves §1–§7 untouched. Part I's seam holds exactly as it
was drawn: `OWNER_DECLARED_COMPLETION_RULES` and `session_end` are unchanged by every D-6 lane, so
what follows can be built without unpicking anything there.

**The ruling, in the decision-maker's terms.**
**Completion (option A)** — for physical-action and coordination work the **SELLER declares**
completion, the traveler has a **stated dispute window** before earnings release, an **undisputed
window completes the booking and releases earnings**, and a **dispute goes to the existing admin
review queue**. The period is **config, never a literal** (§8 posture). Every transition is an
**atomic conditional** (§15/§18b) and the **actor comes from the session** (§14).
**Expenses (option B for now)** — **no reimbursable-expense machinery exists and no surface may
promise one.** The target shape is recorded below as the future brief's spec, unbuilt.

---

## 8 · Facts on the ground today — sessions

**A session booking already completes by seller declaration, and the rail already exists.**
`completionRuleFor` (`shared/service-fundamentals.ts`) puts `call` and `video` on `session_end`
(`SESSION_END_METHODS`) and `async_messaging` + `voice_notes` on `provider_declared`
(`PROVIDER_DECLARED_METHODS`); both are members of `OWNER_DECLARED_COMPLETION_RULES`. The rail is
`POST /api/{provider,expert}/bookings/:id/complete` (`server/routes.ts`, the shared
`handleOwnerBookingComplete`): ownership-gated on `booking.providerId === session user` with an
undifferentiated 404, body an explicit §19 allowlist of exactly one field (`componentServiceId`,
bundles only), and it refuses any rule not in `OWNER_DECLARED_COMPLETION_RULES` with a stated
reason.

**`session_end` is evidence-gated; `provider_declared` is not, by design.** The `session_end` arm
of `resolveCompletionEligibility` reads the BOOKED SLOT (`vendor_availability_slots.date` +
`endTime`) and refuses `no_booked_slot`, `slot_has_no_end_time` or `session_not_ended` rather than
inferring an end from a `scheduledDate` string whose timezone the server does not hold (§13). The
`provider_declared` arm returns `eligible: true` with `evidence: { declared: true }` — the
declaration **is** the condition, which is precisely why its dispute window is load-bearing.

**The owner status rail still cannot write `completed`, and that has not changed.**
`OWNER_SETTABLE_BOOKING_STATUSES = ["confirmed", "cancelled"]` with
`OWNER_BOOKING_TRANSITIONS = { confirmed: ["pending"], cancelled: ["pending", "confirmed",
"deposit_paid"] }` — *"allowing the owner to set it would let them self-credit"*. The completion
rail answers that objection in three named ways rather than waiving it (the comment above
`handleOwnerBookingComplete`), the third being the one this ruling is about: *"completion is not
payout. The flip mints a HELD earning whose clearance window IS the traveler's dispute window."*

**Where the money actually moves.** `completeBooking` (`server/services/booking-completion.service.ts`)
is the ONLY place a `service_bookings` row is moved to `completed` by the D8 rules. It flips through
`storage.updateServiceBookingStatus(id, 'completed', reason, COMPLETION_ALLOWED_FROM_STATUSES)` —
`['confirmed']`, the §15 atomic conditional — and **inside that same transaction**
`mintCompletionEarningsForBooking` writes a `platform_revenue` row plus a `provider_earnings` and an
`expert_earnings` row, each born `status:'held'` with `availableAt = availableAtFor('service_booking')`.
Release is separate: `storage.releaseMaturedEarnings` flips `held → releasable` once `available_at`
passes **and** `dispute_state IS DISTINCT FROM 'open'`. A lost race changes nothing — no
compensating rollback exists and none is needed.

**So the dispute window already exists, and it is already config.** It is
`holdWindowDays('service_booking')` (`server/config/earnings-hold.config.ts`, default 7,
`EARNINGS_HOLD_DAYS`-overridable). It is the earning's `availableAt`, it is the cutoff
`POST /api/bookings/:id/dispute` enforces, and `completion-windows.config.ts` states in its own
header that there is **deliberately no second dispute window** and *"do not add a parallel
constant"* — which is why `serviceDateCompletionDays()` delegates to it rather than defining a
number.

**THE GAP THIS RULING CLOSES, AND IT IS A WORD, NOT A WIRE.** Everything above is the ruled shape
with one exception: **the booking reads `completed` the instant the seller declares.** The money is
correctly held for the whole window, but the traveler's My-bookings row, the slip's bookings section
(LD 42 **D9**) and the seller's console all say *completed* about work the traveler has not yet had
a chance to dispute. That is the §13 lie — *"completed" never before the window closes* — and it is
the whole of what Part II changes on the session rail. **No money timing moves** (see §12).

**The traveler's own rails, unchanged in substance.**
`POST /api/bookings/:id/confirm-completion` (`server/routes/bookings.ts`) drives `confirmed →
completed` **and** early-releases, gated on a `confirmable_at` anchor (slot day ended, or 24h past
acceptance for a slotless booking) and a Stripe-verified `succeeded` PaymentIntent. It is the
traveler saying *this happened*, which self-credits nobody and is the strongest evidence on the
platform — it must keep short-circuiting the window.
`POST /api/bookings/:id/dispute` writes `booking_metadata.disputeReason`, calls
`storage.setBookingEarningsDispute(id, true)` and flips the booking to `disputed`; it is refused
once `completed_at + holdWindowDays('service_booking')` has passed (`dispute_window_closed`).

**The admin review queue that already exists.** `GET /api/admin/disputes`
(`server/routes/admin.routes.ts`) selects `service_bookings WHERE status = 'disputed'` and surfaces
`booking_metadata->>'disputeReason'`; `POST /api/admin/disputes/:bookingId/reject` clears the
earnings dispute and flips the booking to `completed`; `POST /api/admin/disputes/:bookingId/uphold`
reverses the ledger, refunds the traveler at 100 % of the traveler fee and reverts the plan items.
**There is no disputes TABLE** — a dispute is the booking's own status plus that jsonb key plus
`{provider,expert}_earnings.dispute_state`. An admin review surface exists to extend; a second one
must not be built.

**Status values are a code change, not a publish trap.** `service_bookings.status` is
`varchar(30)` with **no DB CHECK** (`shared/schema.ts:1425`; no `service_bookings_status_check`
exists in any migration) — the LD 44(e) posture Part I already relies on.

---

## 9 · Facts on the ground today — coordination engagements

A done-for-you engagement is a `coordination_states` row, and it is a **different machine from a
booking**. Read it before assuming the ruling lands the same way on both.

- **Status.** `coordination_states.status` is `varchar(30)` default `intake`, **no DB CHECK**
  (verified across the migration set). The advance path is `PATCH /api/coordination-states/:id/status`
  (`server/routes.ts`), open to the traveler **or** the `assigned_expert_id` coordinator, with a
  `FORWARD_ORDER` of `intake → expert_matching → vendor_discovery → itinerary_generation →
  optimization → booking_coordination → confirmed → in_progress → completed`.
  `storage.updateCoordinationStatus` appends a `state_history` entry and stamps `completed_at` when
  the status is `completed`.
- **The fee is captured UP FRONT and is PLATFORM REVENUE, not an earning.**
  `fee_payment_status` (`unpaid|pending|paid|refunded`) carries a real **DB CHECK** (migrations 125
  and 127) — unlike `status`, so a new value *there* **is** a publish trap. `POST
  /api/coordination-states/:id/pay` takes the §15 atomic claim, `/pay/confirm` verifies the
  PaymentIntent server-side (§14 — the PI comes from the row, never the body), flips
  `pending → paid` atomically and records a `platform_revenue` row with `sourceType:
  "coordination_fee"`. Refund is admin-only (`POST /api/coordination-states/:id/refund`).
- **THEREFORE: on the coordination rail there is nothing to release.** No `expert_earnings` or
  `provider_earnings` row is ever minted for a coordination engagement, and `completed` on a
  `coordination_state` triggers no money at all. The ruling's *"an undisputed window completes the
  booking and releases earnings"* has a real second half on `service_bookings` and **no second half
  here** — saying otherwise would describe a payout the platform does not make (§13). What the
  window can honestly gate on this rail is the **admin refund**, which is the only money that moves
  after the fee is captured.

---

## 10 · `hybrid` — RULED TO D-7, and why

Part I recommended `hybrid` to this lane and left the call to the decision-maker; the 2026-09-15
ruling delegates it here. **`hybrid` is D-7's, with the session/physical-action shape.**

`completionRuleFor` sends `hybrid` through `PLACE_ANCHORED_METHODS` to `service_date_timer` today —
a timer rule whose owner arm opens only for a booking the platform holds no service date for
(`ownerDeclarableFallback`). Three reasons it belongs here rather than with D-6:

1. **What the traveler receives is a thing that happened at a place.** A hybrid listing is
   place-anchored by D2's own classification (`PLACE_ANCHORED_METHODS = {in_person, hybrid}`), and a
   session that was actually run is not withheld from the seller because a file has not been clicked.
2. **Treating the whole booking as an artifact holds money for work that was delivered.** D-6's
   acceptance gate moves the MINT to the traveler's click; applying it to a hybrid booking would put
   a provider's fee for a day they worked behind an acceptance of a document.
3. **The alternative already exists and is cheaper.** An artifact obligation on a hybrid listing is
   a **separate declared deliverable** — and the honest way to give it D-6's acceptance is to let
   the listing say so, not to reclassify the whole booking. That is filed below as **D-32**, not
   assumed here.

`in_person` keeps its `service_date_timer` normal path — it is a timer, and Part I's ruling about
timers is specifically that **a timer must not COMPLETE in the seller's favour**, which is exactly
what §11's declared state fixes for it too: the timer's job becomes *open the traveler's window*,
not *end it*.

---

## 11 · The state machine

```
confirmed ──(seller declares: session ended / scope delivered / day worked)──> completion_declared
                                       │   (dispute window OPEN, period = config)
        ┌──────────────────────────────┼──────────────────────────────┐
        │ traveler confirms            │ window elapses, undisputed   │ traveler disputes
        ▼                              ▼                              ▼
     completed  ─── early release ──> completed                    disputed
   (mint; release now)             (mint; release at window)   (the EXISTING admin queue;
                                                                nothing mints, nothing releases)
                                                                        │
                                                        ┌───────────────┴───────────────┐
                                                        │ reject ──> completed          │ uphold ──> refunded
```

**Rules that are not negotiable in the build.**

1. **Every transition is an atomic conditional (§15/§18b)** through
   `storage.updateServiceBookingStatus`'s `expectedFromStatuses`. The declaration claims
   `['confirmed']`; the window's close claims `['completion_declared']`; the dispute claims
   `['completion_declared','confirmed','completed']` (it may still arrive post-completion, inside
   the hold window, exactly as today). A pre-check is the error message, never the guard — a
   check-then-update is the TOCTOU bug §15 names. **Two of today's writers have no from-state guard
   at all; see §15 F1/F2.**
2. **The actor comes from the session (§14), never `req.body`.** Only the booking's `providerId`
   declares; only its `traveler_id` disputes or confirms; only an admin resolves. The booking comes
   from the path; every amount and rate from the server-side record.
3. **`completeBooking` stays the ONE completion implementation.** The window's close becomes a new
   CALLER with its own actor tag (`auto_complete_declared_window`), exactly as Part I makes
   acceptance one (§18 rule 1). There is no second mint path, and the job keeps its shape: it
   DETECTS, `completeBooking` decides.
4. **The declaration is recorded as EVIDENCE, on the rails that already record it.** The declaration
   writes `bookingDetails.completion`-shaped provenance — rule, actor, timestamp, the server-derived
   evidence the decision rested on — and an `item_transition_log` diary row when the booking carries
   a trip. No runs table, the build-charter §2 posture the completion job already states.
5. **`completion_declared` is a new `service_bookings.status` value** — app-enforced, no CHECK, **no
   backfill**. A booking that was completed under today's immediate flip **was** completed; rewriting
   it would invent a fact (LD 44(e)).
6. **The payment gate does not move.** An `unpaid` `confirmed` booking must never mint, so the
   Stripe-verified `succeeded` PaymentIntent check stays where the auto-completion job already puts
   it — at the flip that MINTS, which is now the window's close, not the declaration.
7. **A dispute is not a refund, and a declaration is not a completion.** Each is its own fact with
   its own word; see §14.

---

## 12 · The window, and where its number lives

**THE DISPUTE WINDOW IS NOT A NEW CONSTANT.** It is `holdWindowDays('service_booking')` —
the number that is *already* the earning's `availableAt` and *already* the
`POST /api/bookings/:id/dispute` cutoff. `completion-windows.config.ts` is the **config home** (the
one Part I chose, and the one whose header forbids a parallel constant), and the accessor is
`declaredCompletionWindowDays()` beside `serviceDateCompletionDays()` — **a delegation, not a
definition**, so the intent is readable where the rule is read and the number cannot drift from the
window it is supposed to track. Env-overridable through the existing `EARNINGS_HOLD_DAYS` family; no
literal anywhere (§8 posture).

**WHERE THE MINT SITS IS THE ONE MONEY QUESTION, AND IT IS A DECISION ROW (D-29).** The recommended
answer, spelled out because getting it wrong is a silent payout delay: **mint at the window's close,
with the held earning's `availableAt` anchored to the DECLARATION instant**, using `availableAtFor`'s
existing `from` parameter. That keeps ONE mint trigger (`completed`, unchanged), ONE dispute window
(the config's own rule), and today's payout timing to within a single scheduler pass. Minting at the
close with the default `now` anchor would serve the window **twice** — 7 days declared plus 7 days
held — and quietly double every seller's wait; that is a money-timing change this ruling did not
authorize.

**Nothing else about money moves.** No fee band is read differently, `mintCompletionEarningsForBooking`
and `holdWindowDays` are untouched, no amount becomes client-sourced, and no idempotency key changes.
Deposits and balances behave exactly as Part I §5 states: the balance is still paid through
`POST /api/bookings/:id/pay-balance` under `canPayBalance` (§15d), a declared-but-unelapsed booking
does not block the balance charge, and **the dispute window is never a payment gate**.

---

## 13 · Columns proposed — decision rows, not a migration

Filed in `docs/PUNCHLIST.md` §1 as **D-28 … D-32**, continuing Part I's D-24 … D-27. All proposals
are additive, nullable, **NO DEFAULT and NO DB CHECK** (publish-trap posture — migrations
181/195/273/275/277/279/281/282/284), **declared in `shared/schema.ts`** (deploy-push durability
rule), **no backfill**, and written only through a pick-based allowlist or a targeted server-side
UPDATE (§19).

- **D-28 — `service_bookings.completion_declared_at`, and is the deadline stored or derived?**
  *Recommend:* the column (timestamp; NULL = never declared, and the row is OMITTED from every
  surface rather than rendered as "not declared" on a booking whose rule is a timer), plus
  `completion_declared` as a `status` value (no migration needed — `varchar(30)`, no CHECK).
  **Derive the deadline; do not store it** — the same answer D-24 gives one table over, for the same
  reason: a stored end date is a second authority that disagrees with the config the moment the
  config moves.
- **D-29 — where does the earnings MINT sit relative to the declared window?** The money row. Three
  shapes, one recommendation (§12): mint at the close with `availableAt` anchored to the
  declaration. The alternatives — minting at the declaration (a second status that triggers
  `mintCompletionEarningsForBooking`) and minting at the close with a fresh anchor (a doubled hold)
  — are named there so neither is chosen by accident.
- **D-30 — is a pre-completion dispute the SAME row as today's post-completion one?**
  *Recommend:* **yes — reuse it.** `status='disputed'` + `booking_metadata.disputeReason` + the
  existing `GET /api/admin/disputes`, whose predicate is literally `WHERE sb.status = 'disputed'`.
  **Do not add an `admin_review` status that queue cannot see, and do not create a disputes table.**
  If the queue must tell the two apart, that is derived from `completion_declared_at` and the
  absence of `completed_at`, never a second status (§18 rule 1). **§13 sub-point that must not be
  lost:** under D-29's recommendation there is no earning yet when a declared-window dispute
  arrives, so `setBookingEarningsDispute` flags **zero rows** — and zero must never be read as
  *cleared*. The block is the status itself: the booking never reaches `completed`, so nothing
  mints.
- **D-31 — coordination: who declares, what does the window gate, and is a coordinator ever paid an
  earning?** *Recommend:* the **assigned coordinator** declares (`assigned_expert_id`), the traveler
  gets the same config window, and — because **no coordinator earning exists** (§9) — the window
  gates the **admin refund**, not a release. `coordination_states.status` takes the new value with
  no migration (no CHECK); `fee_payment_status` must **not** grow one (it HAS a CHECK, so a new value
  there is a publish trap). **Whether a coordinator is ever paid an earning out of the captured
  coordination fee is a separate, unruled money question** — owner = the memberships/engagement
  lane — and must not be invented as a side effect of a completion state.
- **D-32 — build the expense object?** See §16. One row, not five: the shape is ruled (option B —
  not yet), so what is open is only *when*, and the columns a future object would need are listed
  there so the next lane starts from a shape rather than a blank page. **Same row carries the
  hybrid-artifact sub-question** §10 raised: may a `hybrid` listing DECLARE an artifact deliverable
  that takes D-6 acceptance on its own, while the booking keeps D-7 completion?

---

## 14 · Honesty rules (§13)

- **"Completed" is never said before the window closes.** Not on My bookings, not on the slip's
  bookings section, not in the seller's console, not in an email. The declared state is named for
  what it is: *your expert says this is done — tell us if it isn't by <date>*.
- **A declaration is not a completion, and a dispute is not a refund.** Three different facts, three
  different words, three different consequences. A dispute is a QUESTION; a refund is an admin's
  ANSWER to it, and only `uphold` moves money.
- **A window the server cannot date does not start.** A booking with no declaration instant is not
  put on a clock; it is skipped with its reason, the way `no_delivery_timestamp` and
  `no_service_date` already are. Nothing is zero-filled.
- **A session the server cannot evidence is refused, not guessed.** `session_end` keeps its
  `no_booked_slot` / `slot_has_no_end_time` / `session_not_ended` refusals verbatim: a provider may
  not declare a session complete before the slot they published says it ended.
- **The traveler is told what the window costs them.** The remaining days come from the config
  value the server applies, read from the server's own answer — never restated on the client
  (§18 rule 1).
- **On a coordination engagement, nothing claims a payout.** The surface says the engagement is
  complete and, where true, that the fee window for a refund has closed. It never says earnings were
  released, because none exist (§9).

---

## 15 · Findings recorded, not fixed by this lane

This lane writes no rails, so each of these is stated for a lane with a server remit. None is
caused by this ruling; all three are load-bearing for building it.

- **F1 — `POST /api/bookings/:id/dispute` flips with no from-state guard.** It calls
  `storage.updateServiceBookingStatus(bookingId, 'disputed', reason)` with **no
  `expectedFromStatuses`**, so the transition is not the guard (§15/§18b). A dispute racing a
  completion, a refund or a cancel can overwrite a terminal state. The `completed_at` cutoff above
  it is a read-then-write.
- **F2 — `POST /api/admin/disputes/:bookingId/reject` flips to `completed` with no from-state
  guard — and that flip MINTS.** `storage.updateServiceBookingStatus(bookingId, "completed")` takes
  no expected-from list, so rejecting a dispute on a row that has since been `refunded` or
  `cancelled` mints held earnings against it. This is the §18b class exactly (the SD-1 shape one
  rail over) and it is the single riskiest write named in Part II.
- **F3 — `PATCH /api/coordination-states/:id/status` lets the TRAVELER set any status, in any
  direction.** The `FORWARD_ORDER` check is applied only on the `isCoordinator && !isTraveler` arm;
  the traveler arm has no ordering check at all, so a traveler may set `completed` themselves, or
  walk an engagement backwards. `storage.updateCoordinationStatus` is an unconditional
  `UPDATE … WHERE id = ?`. Under this ruling the **coordinator** declares, so the traveler arm needs
  a rule before the declared state means anything there.

---

## 16 · Expenses — option B for now, and the spec that is NOT built

**THE RULING. There is no reimbursable-expense machinery on this platform, and NO SURFACE MAY
PROMISE ONE.** Verified in this lane: there is no expense table, no expense column on any earner or
booking row, no quote, no approval, no evidence store and no refund route for a cost a seller
incurs on a traveler's behalf. The client surface makes no such promise today — the sweep is
recorded in the ledger row and pinned by
`client/src/lib/__tests__/no-expense-reimbursement.test.ts`, whose whole job is that the first
sentence to make one fails CI.

**What is REAL and stays, because it is a different fact.** `transactionTypeEnum`'s `"expense"` and
the `trip_transactions` cost-split family are the **traveler's own group budget** — money the
travellers spend on themselves, split between themselves. The EA console's "Expense Report" is the
**executive's own** spend. A payment receipt is the record of a charge that happened. None of these
is the platform paying anybody back, and none was touched.

**THE TARGET SHAPE, recorded verbatim as the future brief's spec.** When an expense object is
ruled, it must be this and not something reconciled afterwards:

> quoted and approved by the traveler BEFORE incurred or not reimbursable, ever; charged through
> platform rails (§14/§15); evidence attached to the approved quote; refund by the same route;
> never reconciled after the fact from receipts.

**Why that shape and no other.** *Approved before incurred* is what makes the traveler's consent a
fact the server holds rather than a conversation nobody can adjudicate — the same reason
`booking_details.travelerCharge` is a §19d hazard: a money fact that arrives after the decision is
a money fact nobody agreed to. *Charged through platform rails* keeps §14 (amount from the
server-side record, actor from the session) and §15 (an idempotent claim, an atomic conditional)
binding on it; an off-platform settlement between traveler and seller is a second money path with
its own refund story and its own insolvency question, and this platform does not have one.
*Evidence attached to the approved quote* is what makes an admin review answerable. *Refund by the
same route* means a reversed expense uses the rails §17's drift job can already see.

**The columns such an object would need — a starting shape, not a proposal to build.** A child table
on the `service_route_points` / `dmo_extracted_places` pattern (FK → `service_bookings` ON DELETE
CASCADE, `UNIQUE (booking_id, "position")`), carrying: `description` (what the cost is for),
`quoted_amount_cents` (**server-derived at approval, never client-settable — §14/§19**),
`quoted_at`, `approved_at` (NULL = **not approved ⇒ not reimbursable**, the whole ruling in one
column), `approved_by_user_id` (the session user at approval, never `req.body`),
`payment_intent_id` (the platform charge, written only by the promotion path — §19a),
`evidence_url`, `refunded_at`. Every one additive-nullable with no DB CHECK; the vocabulary
app-enforced. **This list exists so the next lane argues with a shape instead of inventing one, and
it is filed as ONE decision row (D-32), not as five.**

**NEGATIVE SPACE, and it is the load-bearing half.** Until D-32 is ruled and built: no surface
says *reimbursable*, *expenses covered*, *out-of-pocket*, *per diem*, *submit your receipts* or any
cousin of them; no seller is told to spend and claim; no traveler is told a cost will be added
later. A seller who must spend money to deliver **prices it into the listing** — the rail that
already exists, whose amount is server-derived at checkout and whose refund story is already
written. That is not a workaround; it is the honest answer while there is no expense object, and
saying it out loud is what stops one being improvised on a surface.

---

## 17 · Build sequence, and the negative space

**Schema first, and only after D-28 – D-31 are ruled.** (D-32 blocks nothing here — it is the
expense lane's own gate.)

1. **Lane 1 — columns.** The ruled subset of D-28 – D-31, one migration, declared in
   `shared/schema.ts`, registered in `server/migrations/migration-files.ts`. No behaviour.
2. **Lane 2 — the declared state.** The owner completion rail stops calling `completeBooking` and
   claims `confirmed → completion_declared` instead, recording the same evidence; the window's close
   becomes a new CALLER of `completeBooking` in the existing auto-completion job, with the payment
   gate at the flip that mints. **This is the lane that makes the ruling true**, and it must not
   ship before lane 1 or the declared state has nowhere to be recorded.
3. **Lane 3 — the dispute edges.** The traveler's dispute rail gains the declared from-state, F1 and
   F2's missing `expectedFromStatuses` are repaired, and the admin queue learns to tell a
   declared-window dispute from a post-completion one **by derivation, not a second status**.
4. **Lane 4 — surfaces.** The traveler's declared state on My bookings and the slip's bookings
   section (LD 42 **D9** — owner and `payer`-role audience, gated by the same predicate the route
   runs); the seller's declare affordance and what it says; the countdown, read from the server's
   own remaining-days answer.
5. **Lane 5 — coordination.** D-31's ruled shape on `coordination_states`, plus F3's traveler-arm
   rule. Deliberately last: it moves no money and depends on the vocabulary lanes 2–4 settle.

**Negative space — what Part II does not decide, and nobody may take as decided.**

- **The refund on an upheld session/coordination dispute.** Part I left the artifact case open (§5)
  and Part II leaves this one open for the same reason: what a partially-delivered session is worth
  is policy, not machinery. Admin review resolves through the **existing** refund rails and invents
  none. Adjacent: the still-unruled **SD-2** cancel-a-confirmed-booking refund gap named in
  `OWNER_BOOKING_TRANSITIONS`.
- **Whether a coordinator is ever paid an earning** out of the captured coordination fee (D-31).
- **The expense object** (D-32), and with it the `hybrid`-declares-an-artifact sub-question.
- **`voice_notes` / `async_messaging`** keep `provider_declared` and gain the declared window like
  every other owner-declared rule — but Part I's honest limit still holds for their DELIVERY:
  `ARTIFACT_DELIVERY_METHODS` is `{"pdf"}`, so neither has a delivery rail, and nothing here builds
  one.
- **Any change to an amount, a rate, a fee band, a payout or the hold window's VALUE.** None is
  proposed and none may be introduced as a side effect. §12's anchor question is about WHEN the
  existing window is served, never how long it is.
