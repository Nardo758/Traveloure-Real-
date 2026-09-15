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
