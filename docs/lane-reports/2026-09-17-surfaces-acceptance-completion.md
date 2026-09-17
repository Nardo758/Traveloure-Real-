# Lane report — 2026-09-17-surfaces-acceptance-completion

**Rulings:** CLAUDE.md Locked Decision 46 (acceptance, revisions, per-booking deliverable, the D-27
ask/escalate timer, and the 2026-09-17 artifact-refund paragraph) and Locked Decision 47 (the seller
declares, the traveler has a window, "completed" is said at its close). Console grammar per LD 45 (7).

**Shape:** client surfaces + READ exposure on three existing list rails. **No schema, no migration,
no new endpoint, no new WRITE rail, no amount, no fee, no rate.** Every action button calls a rail
that already existed.

---

## 1 · The gap this closed

LD 46's rails (`accept-deliverable`, `request-revision`, `deliver-artifact`), D-27's ask/escalate
timer and LD 47's declare-and-window flip had all landed, with tests, and **not one of them had a
control or a read-out anywhere in `client/`**. A traveler could not accept the artifact they had
bought; a seller could not declare a booking done; an escalated row appeared as a bare "disputed"
badge with no explanation; and the admin queue had no button for the artifact refund ruled on
2026-09-17. That state is indistinguishable, from a green server suite, from a surface that renders
the *wrong* thing — which is why this lane pins both the derivations and the DOM.

## 2 · Rails called (all pre-existing)

| Surface | Rail |
|---|---|
| My Bookings — Accept | `POST /api/bookings/:id/accept-deliverable` |
| My Bookings — Request a revision | `POST /api/bookings/:id/request-revision` (`.strict()`, one optional `note`) |
| My Bookings — Something's wrong (declared window) | `POST /api/bookings/:id/dispute` |
| Provider / Expert inbox — Mark as done | `POST /api/provider\|expert/bookings/:id/complete` |
| Admin disputes — Refund rejected artifact | `POST /api/admin/disputes/:bookingId/refund-rejected-artifact` |

## 3 · Read exposure added (no new endpoints)

* **`shared/declared-completion-window.ts` — `describeCompletionDeclaration(row, windowDays)`.** The
  `declared && !completed ⇒ {declaredAt, disputeBy, windowDays}` composition was spelled inline in
  `GET /api/bookings/:id`; four readers now need it, and a second copy is the drift §18 rule 1 names.
  `null` for never-declared **and** for already-completed, so no surface counts down a closed window.
* **`GET /api/my-bookings`** — each row gains `acceptance` (`describeAcceptance`) and
  `completionDeclaration`. Owner-scoped by construction (`travelerId: userId`, §14). Both keys are
  OMITTED when the derivation answers `null`.
* **`GET /api/provider/bookings`, `GET /api/expert/bookings`** — each row gains
  `completionDeclaration`, so the seller console never adds days to a date itself.
* **`describeAcceptance`** — gains `revisions: [{position, note, requestedAt, resolvedAt}]`, present
  only when there is at least one row, and now derives the D-25 count from the LENGTH of that one
  read so the list and the count cannot disagree.

**Projection note:** nothing new is published to a non-owner. The acceptance read-out rides only the
traveler-scoped list and the owner tier of the single-booking GET; the seller lists gain only the
declaration read-out (three dates the seller themself produced), and `sanitizeBookingForExpert`'s
payment-identity strips are untouched.

## 4 · Five from-state lists moved to `@shared`, re-exported by their old homes

| List | New home | Old home (now re-exports) |
|---|---|---|
| `ACCEPTANCE_FROM_STATUSES` | `shared/acceptance-window.ts` | `server/utils/booking-from-states.ts` |
| `REVISION_REQUESTABLE_FROM_STATUSES` | `shared/acceptance-window.ts` | same |
| `ARTIFACT_RECORD_ONLY_STATUSES` | `shared/acceptance-window.ts` | same |
| `DISPUTABLE_FROM_STATUSES` | `shared/declared-completion-window.ts` | same |
| `COMPLETION_ALLOWED_FROM_STATUSES` | `shared/declared-completion-window.ts` | `server/services/booking-completion.service.ts` |

A surface may not copy a rail's from-state list — the day a status joins one, one surface starts
offering a button the rail refuses. Precedent: `BOOKING_CANCELLABLE_FROM_STATUSES`
(`shared/booking-cancellation.ts`), which My Bookings already reads. Every server caller is
byte-identical; each list still has exactly one definition.

## 5 · One module per surface, one shared status mapping

* `client/src/lib/booking-lifecycle.ts` — the views (`travelerAcceptanceView`,
  `travelerDeclarationView`, `sellerCompletionView`), `LIFECYCLE_COPY` (every sentence), the
  escalation predicate and `daysRemaining`. Pure.
* It **delegates** the status→label map to `client/src/lib/purchase-status.ts`, which the slip and
  the Trip Card already read — extended here with `awaiting_acceptance` and `revision_requested`,
  both phrased as claims about *whose turn it is*, never as completion. The traveler and seller
  surfaces therefore share one table rather than opening a second.
* `client/src/components/bookings/BookingAcceptancePanel.tsx` (traveler) and
  `SellerCompletionPanel.tsx` (seller) fetch nothing and decide nothing; they draw the view.

## 6 · §13 — what is deliberately not drawn

* no `acceptance` key ⇒ **the panel is absent from the DOM**, not an empty card, and never "no
  artifact" / "not accepted";
* `deliveryTimestampMissing` ⇒ the booking says it is **on no acceptance clock** and shows **no date
  at all** — never one anchored on `confirmed_at` or on now;
* no stated allowance ⇒ **no revision affordance**, never "0 left" beside a button that refuses;
* a revision with a null note renders its dates and **no empty quotation**;
* an **escalated** row says it is with our team and that **no refund has been issued** — the refund
  is the admin's outcome, said only with an id in hand;
* a **declared** booking never uses the word "completed" before its window closes; the seller's
  toast reports the window, not a completion;
* the admin toast names `stripeRefundId` when the server returns one and reports `alreadyRefunded`
  with **no id** when it does not.

## 7 · What could not be rendered honestly, and why

**The slip's D9 bookings section and the Trip Card's Purchases drawer got the two new STATUS LABELS
and nothing else.** They read the plancard payload's `TripPlanBooking`, whose fields are
`id / serviceId / status / serviceName / totalAmount` — no `delivered_at`, no acceptance deadline, no
declaration. Rendering "delivered on <date>" or a window there would require either widening that
payload (an unratified change) or computing a deadline on the client, which is exactly the second
authority this lane exists to remove. The controls stay on My Bookings, where the server truth is
read. Recorded as the remainder of brief §7 lane 4 in `docs/PUNCHLIST.md`.

**The seller's "Mark as done" is drawn from a from-state list alone.** `resolveCompletionEligibility`
also resolves the listing's RULE (an artifact takes the traveler's acceptance; a place-anchored
booking waits for its date) from server-side evidence no client holds, and there is no
allowed-actions read to consult. Per the brief, the control is drawn where the from-state allows and
the rail's own **named** refusal is repeated verbatim. Drawing a button is never what keeps a write
out — the rail's gate is (§14 posture, LD 42 D16).

## 8 · Proofs

| Suite | Result | Wired |
|---|---|---|
| `client/src/lib/__tests__/booking-lifecycle.test.ts` (L1–L10) | 18/18 | `build.yml` — *Acceptance and declared-completion surfaces pin* |
| `client/src/components/__tests__/booking-lifecycle-panels.test.tsx` (P1–P10) | 15/15 | same step |

**Negative space:** these are predicate and render facts. They prove no browser painted anything and
they prove none of the SERVER's gates — those are `server/__tests__/acceptance-rails.db.test.ts` and
the completion suites, untouched by this lane.

## 9 · Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | 129 (baseline) |
| `npm run build` | green |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + run | OK |
| `phase2-fee-gate.sh` | PASS |
| `check-test-files-wired.cjs --self-test` + run | `test-orphan-ratchet: OK` (baseline 33, unchanged) |
| `check-duplicate-migration-prefixes.cjs` | OK |
| `grep -c replit.local package-lock.json` | 0 |
