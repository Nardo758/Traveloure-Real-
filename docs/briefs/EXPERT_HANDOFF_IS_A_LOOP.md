# The "Get a local expert" hand-off is a loop, and the ruling that closes it was never built

**Found 2026-09-23 by the decision-maker, from the plan modal's finish. Verified against `main` @ `5967595`.**
**Status: BREAK 1 IS FIXED. Breaks 2–4 are RULED and unbuilt.**

> **Amended 2026-09-23 — D5 has landed** (ledger `2026-09-23-local-finish-mints`). The `local`
> finish now mints through `mintTripSlip` and forwards `tripId` to `/experts`, so the loop described
> in **Break 1** is closed and **Break 2's** machinery is live. §13 holds: a mint the traveler
> refused at the sign-in gate still yields exactly the browse this branch always showed.
>
> **The decision-maker ruled the three open questions on 2026-09-23:**
> - **(b) Yes** — choosing an expert opens a thread automatically, on request. The `notes` are
>   labelled as a request, never presented as words the traveler typed.
> - **(c) Agreed — contact-first.** "Request help" must stop creating a `service_bookings` row
>   against an arbitrary `services[0]`. **Note for the build:** `POST /api/expert-booking-requests`
>   is shared by five callers, so this is a SEPARATE contact rail, not a change to that endpoint.
> - **(d) A listing-less expert shows** a way to book them, to ask a question, or to send the
>   traveler's Experience selections. `POST /api/conversations/start` already accepts `{handle}`
>   for cold contact and `{tripId}` for the D22 advisor thread — both live, neither called from
>   this surface.
>
> Breaks 2, 3 and 4 below are therefore **decided and awaiting build**, not open questions.

---

## What the traveler does, and what happens

They finish the planning modal — occasion, where, when, who — and pick **"Get a local expert:
experts who live there build it with you."** Then:

1. They land on `/experts?destination=Kyoto`. **No plan was created.**
2. They click an expert.
3. They press **"Start a plan & request help"** — and **the planning modal they just finished
   re-opens.**

That is the whole of it. There is no way to choose an expert and reach them, because the one button
that would do it sends the traveler back to the beginning.

---

## Break 1 — the `local` finish does not mint, and Locked Decision 42 **D5 ruled that it must**

`client/src/contexts/PlanningContext.tsx`, the `local` arm of `runBranch`:

```ts
const dest = plan.destination || sourceDestination(source);
setLocation(dest ? `/experts?destination=${encodeURIComponent(dest)}` : "/experts");
```

No mint, no `tripId`. `plan-modal.tsx` says so at the mint site itself: *"`Build it myself` is the
only branch that needs a plan ROW, so it is the only one that mints"*, and the code agrees —
`if (branch === "myself" && !getTripContext().tripId && mintPlan)`.

**D5 says the opposite, in terms:**

> The `local` finish now **MINTS the slip** through the SAME `mintTripSlip` the `myself` finish uses
> — one mint door, one more caller (§18 rule 1) — behind the SAME sign-in gate, checked BEFORE
> anything is minted, and **forwards `tripId` to `/experts`** so the storefront request rail ruling
> 32(b) requires has the trip it needs.

D5 also gives the reason, which is Locked Decision 32's precondition: a traveler sent to `/experts`
with no trip *"walks straight into what ruling 32 forbids: an expert touchpoint with no slip, whose
lead surfaces to nobody."*

**So this is ratified-and-unbuilt, not undesigned.** It is the root cause; everything below is
downstream of it.

## Break 2 — the receiving side already works, and never gets the chance

This is the part worth knowing before anyone builds anything: **the hand-off is implemented.**

- `client/src/pages/experts.tsx` reads `?tripId=` and carries it into each expert's detail link.
- `client/src/pages/expert-detail.tsx` reads it as `handoffTripId` and posts it to
  `POST /api/expert-booking-requests`.
- `server/routes.ts` verifies the trip is the session user's, then calls `ensureTripAdvisorRow`
  — the ONE advisor-row author — and notifies the expert.

None of it fires, because `handoffTripId` is always `null` from this door.

**The loop is explicit and deliberate**, and its comment names the right ruling for the wrong
situation:

```ts
if (!handoffTripId) {
  planning.open({ city: heroLocation || undefined });   // expert-detail.tsx
  return;
}
```

The author's reasoning was sound — without a `tripId` the request would 400, so opening the planner
is better than firing a doomed call. It only becomes a loop because the *planner itself* is what
sent the traveler here without one. **Fix break 1 and this line stops being reachable from this
door.**

## Break 3 — the request CTA is gated on the expert having a listing

```tsx
{services.length > 0 && ( <button … data-testid="button-request-help-with-plan"> )}
```

An expert with **no approved `provider_services` row shows no request button at all** — no disabled
state, no explanation. Since `/experts` lists experts by profile rather than by listing, a traveler
can click a card and find nothing to press. §13 says an absence should be stated, not rendered as
nothing.

## Break 4 — "request help" is a **booking**, not a contact

The mutation sends `serviceId: services[0]?.id` — **the expert's first listing, whichever that
is** — and the server creates a `service_bookings` row with a real `totalAmount`. The traveler
pressed a button labelled *"Share plan & request help"*; what they got was a booking request against
a product they never chose.

---

## The question asked: is a message sent automatically?

**A notification and an email, yes. A conversation, no.**

`server/routes.ts` creates `storage.createNotification({ userId: providerId, type:
"booking_request", … })` and emails the provider when `emailBookingAlerts !== false`. The advisor row
is created. So the expert **is** told.

But **no thread exists**. Nothing calls `POST /api/conversations/start`, so the traveler has no
place to say anything and no reply surface. That is the gap the traveler feels as *"I picked someone
and then nothing."*

**Locked Decision 40 D22 built the rail for exactly this and it is uncalled.** D22 added a fourth
address kind, `advisor`, which is **plan-scoped**: the client names `{ tripId }` — a plan, not a
person — and the server resolves the counterpart from the trip plus the `trip_expert_advisors` row
in a §12 access status. It needs no migration (`conversation_contexts.context_kind` is app-enforced
with no DB CHECK, precisely so a fourth kind is a code change).

So the thread can be opened the moment an advisor row exists — which `ensureTripAdvisorRow` has just
created, one line earlier.

---

## What should be built, and what needs a ruling first

**Build without a ruling — it is already ratified:**

**(a) Implement D5.** The `local` finish mints through `mintTripSlip` behind the same sign-in gate,
then navigates to `/experts?destination=…&tripId=…`. One mint door, one more caller. This alone
converts the loop into a working hand-off, because breaks 2's machinery is live.

**Needs a ruling — each changes what the traveler is agreeing to:**

**(b) Does choosing an expert open a thread automatically?** Three options.
  1. **Advisor thread on request** — the request rail calls `conversations/start` with
     `{ tripId }` (LD 40 D22) right after `ensureTripAdvisorRow`, and the traveler's `notes` become
     the first message. Traveler and expert can talk immediately. **Cost:** every request creates a
     thread, including ones the expert declines.
  2. **Thread on acceptance only** — the expert accepts first, then the thread opens. Quieter
     inbox; the traveler waits in silence, which is the complaint that started this.
  3. **No automatic thread; a "Message" button.** Most explicit, least automatic — and it is the
     only option that does not put words in the traveler's mouth. LD 44's open question about
     attribution is the same shape: a message the traveler did not type should not be attributed to
     them.

  **Recommendation: (1), with the notes as an explicitly-labelled request rather than a message
  the traveler appears to have written.**

**(c) Should "request help" create a booking at all?** Today it books `services[0]` — an
arbitrary listing — at a real amount. The alternatives are a contact-only rail (no
`service_bookings` row until the traveler picks a service), or making the traveler choose the
service first. **Recommendation: contact-first.** A traveler choosing a *person* has not chosen a
*product*, and §14's posture is that the thing being charged for is never inferred.

**(d) What does an expert with no listing show?** Either a contact-only CTA (which (c) would
provide), or an honest line saying this expert has nothing bookable yet. **Never the current
silence.**

---

## Negative space

This brief describes the **`local` finish from the plan modal** only. The storefront request rail
(LD 32 (b)), the auto-route `EscalationCTA`, and the concierge door's `expert` tier each reach
experts by their own path and are **not** examined here; the `expert` tier already forwards a real
`tripId` (ledger `2026-09-07-concierge-door`), so it does not share break 1.

No code was changed by this brief, and no ruling is recorded by it. The four options above are
written to be ruled on, not to be read as decided.
