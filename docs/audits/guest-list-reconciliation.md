# Guest-list reconciliation — diagnosis

**Lane:** `task-guest-list` · **Ledger:** `2026-09-04-guest-list-reconciliation`
**as-of:** `6740165c7f08d59179a65c7bca45c029689570b3` (origin/main at the time of the sweep)
**Status:** diagnosis + one defect fix. **No schema change was made and none is proposed for
unilateral application** — the link between the two lists is a decision-maker call (§ *Recommendation*).

This document is grounded only in files read at the SHA above. Every claim carries a `file:line`.

---

## 0. The finding in one paragraph

There are two guest lists. They are **not two implementations of one concept** and should not be
merged: `event_invites` is a list of **people invited to an occasion**, and `trip_participants` is a
list of **people travelling on a plan**. Those are legitimately different populations (a grandmother
who is invited and declines; a wedding planner who travels and is not invited). What is wrong today
is not that both exist — it is that **the invite list is the only one that can gain a person, and the
participant list is the only one that carries the substance the platform actually computes on**, with
no path between them. The result is that the richer list is, in practice, permanently empty: as of
this SHA **no client screen in the repository creates a `trip_participants` row**, and the one screen
that tried to *edit* one wrote to a route that does not exist. That defect is fixed in this lane; the
link is not, because a link is a schema decision.

---

## 1. List A — `event_invites` (per-EVENT, can actually invite)

**Schema:** `shared/guest-invites-schema.ts:20-66` (plus `guest_travel_plans:74-116`,
`invite_templates:123-146`, `invite_send_log:150-168`).
Reached by `drizzle-kit push` only through the **second** entry of the `drizzle.config.ts` schema
array — see CLAUDE.md "Drizzle push has TWO schema entry points".

**Key:** `experienceId` → `user_experiences.id` (`:24`) and `organizerId` → `users.id` (`:27`).
It is keyed on an **event**, and per Locked Decision 29 a `user_experiences` row *is* the event.

**What it carries:** guest email/name/phone (`:30-32`), a unique invite token (`:35`), the guest's
**origin city + lat/lng** (`:38-42` — the feature's whole point: per-guest travel from where they
live), RSVP status/date/party size (`:45-47`), dietary restrictions, accommodation preference,
transportation-needed (`:50-52`), special requests + a message to the organizer (`:55-56`), and
view/send telemetry (`:59-62`).

### Writers

| Writer | Where | Note |
|---|---|---|
| `POST /api/events/:experienceId/invites` | `server/routes/guest-invites.ts:170` | Organizer creates guests. Gated on session ownership of the parent experience. |
| `POST /api/events/:experienceId/invites/send` | `server/routes/guest-invites.ts:284` | Outbound email via the shared outbox (ledger `2026-09-04-invite-mailer`, PR #737). Stamps `invite_sent_at` under an atomic claim. |
| `DELETE /api/invites/:inviteId` | `server/routes/guest-invites.ts:377` | Gated on the invite's PARENT experience. |
| `POST /api/invites/:token/origin` | `server/routes/guest-invites.ts:439` | **The guest**, public-by-token. |
| `POST /api/invites/:token/rsvp` | `server/routes/guest-invites.ts:473` | **The guest**, public-by-token. |
| `POST /api/invites/:token/travel-plans` | `server/routes/guest-invites.ts:571` | **The guest**, public-by-token. |
| view-count stamp | `server/storage.ts:8105-8111` | On the token GET. |

Storage layer: `server/storage.ts:7889-8137`.

### Readers

| Reader | Where |
|---|---|
| `GET /api/events/:experienceId/invites` (organizer list) | `server/routes/guest-invites.ts:226` |
| `GET /api/events/:experienceId/invites/stats` | `server/routes/guest-invites.ts:338` |
| `GET /api/invites/:token` (redacted event view) | `server/routes/guest-invites.ts:414` |
| `GET /api/invites/:token/recommendations` | `server/routes/guest-invites.ts:519` |

### Surfaces

- **`GuestInviteManager`** (`client/src/components/GuestInviteManager.tsx`) — the organizer's guest
  list. Calls `/api/events/:id/invites` (`:110`), `/invites/stats` (`:120`), create (`:142`), send
  (`:201`), delete (`:286`). **Mounted once**, at `SlipLogisticsSection.tsx:129`.
- **`GuestInvitePage`** (`client/src/pages/GuestInvitePage.tsx`) — the public RSVP page, routed at
  `/invite/:token` (`client/src/App.tsx:487-488`).

**A "guest" in list A = a person the organizer invited to one occasion.** They need not have an
account (that is why the rail is token-based), need not accept, and need not travel.

---

## 2. List B — `trip_participants` (per-TRIP, holds the substance)

**Schema:** `shared/schema.ts:4208-4252`. Insert schema `:4834`.

**Key:** `tripId` → `trips.id`, NOT NULL (`:4210`). **Not** keyed on an event.
`userId` → `users.id` is nullable "null for non-registered guests" (`:4211`).

**What it carries that list A does not:** `name` NOT NULL (`:4214`), `role` (`:4217`),
per-participant **payment tracking** — `paymentStatus`/`amountOwed`/`amountPaid`/`paymentMethod`
(`:4231-4235`), **emergency contacts** (`:4238-4240`), **arrival/departure datetimes** and
`mobilityLevel` (`:4243-4245`), and `accessibilityNeeds` (`:4226`).

### Writers

| Writer | Where | Note |
|---|---|---|
| `POST /api/trips/:tripId/participants` | `server/routes.ts:10584` | **LIVE copy.** Strips `userId` from the body with an explicit L20 note (`:10590-10594`). |
| `POST /api/trips/:tripId/participants` | `server/routes/trips.routes.ts:864` | §9 mount-order-dead twin; parses `insertTripParticipantSchema` **without** the `userId` strip. |
| `POST /api/trips/:tripId/participants/bulk-invite` | `server/routes.ts:10611` | **LIVE copy.** `authorizeTripOwnerTier` — owner-only, *deliberately* no assigned-expert branch ("L20 tier 4 — participant PII is OWNER-only", `:10608-10610`). Despite the name it sends **no email**: `coordinationService.bulkInvite` only inserts rows with `status:"invited"` (`server/services/coordination.service.ts:188-210`). |
| `POST /api/trips/:tripId/participants/bulk-invite` | `server/routes/trips.routes.ts:895` | Dead twin, already annotated as escalated-not-fixed (`:885-894`). |
| `PATCH /api/participants/:id` | `server/routes/content.routes.ts:6856` | Generic update. **Hardened by this lane** (see §5). |
| `PATCH /api/participants/:id/rsvp` | `server/routes/content.routes.ts:6882` | Owns `status` + `rsvpNotes`, stamps `respondedAt`. |
| `POST /api/participants/:id/payment` | `server/routes/content.routes.ts:6901` | Owns the payment cluster; **derives** running paid + status from the stored row (`coordination.service.ts:131-156`). |
| `DELETE /api/participants/:id` | `server/routes/content.routes.ts:6920` | |
| `coordinationService.setAmountOwed` | `server/services/coordination.service.ts:208` | Service method with **no route** — unreachable. |

All the above gate on `verifyTripOwnership` (or `authorizeTripOwnerTier`) — owner-only, never the
§12 advisor. That is a standing ruling on this table, not an omission: the rows carry
dietary/accessibility/phone/emergency-contact PII.

### Readers

| Reader | Where |
|---|---|
| `GET /api/trips/:tripId/participants` (+ `/stats`, `/payment-stats`, `/dietary`) | `server/routes.ts:10548-10581` (live) and `server/routes/trips.routes.ts:824-857` (dead twins) |
| `budget.service.ts` — per-person cost splitting | `server/services/budget.service.ts:200-201`, `:328-330`, `:401-402` |
| `coordination.service.ts` — RSVP / payment / dietary stats | `server/services/coordination.service.ts:81-186` |

### Surfaces

- **`TripLogisticsDashboard`** (`client/src/components/logistics/trip-logistics-dashboard.tsx`) —
  **READ-ONLY**. Queries `/participants/stats`, `/payment-stats`, `/dietary`, `/participants`
  (`:114-153`). Mounted on three live pages: `client/src/pages/itinerary.tsx:545`,
  `client/src/pages/my-itinerary.tsx:1010`, `client/src/pages/trip-details.tsx:563`.
- **`ParticipantTravelTracker`** (`client/src/components/logistics/participant-travel-tracker.tsx`) —
  the only *write* surface. **Barrel-exported (`logistics/index.ts:23`) but mounted NOWHERE** —
  verified by name across `client/src`. Its write was also broken (§4).

**A "guest" in list B = a person travelling on the plan, whose money, dietary needs, mobility and
arrival time the platform computes with.**

---

## 3. The gap, stated precisely

**There is no shared key and no copy path.** Verified by grep at this SHA:

- `guest-invites-schema.ts`, `server/routes/guest-invites.ts` and
  `server/services/guest-invite-send.service.ts` contain **zero** references to
  `trip_participants` / `tripParticipants`.
- `coordination.service.ts` and `budget.service.ts` contain **zero** references to `eventInvites`.
- The only files referencing `tripParticipants` are `shared/schema.ts`,
  `server/services/coordination.service.ts`, `server/services/budget.service.ts` and
  `scripts/check-privileged-field-completeness.cjs`. The only files referencing `eventInvites` are
  `shared/guest-invites-schema.ts`, `server/storage.ts` and `scripts/verify-guest-invite-context.ts`.

Structurally the two keys do not even live at the same grain: `event_invites.experience_id` names an
**event**; `trip_participants.trip_id` names a **plan**; and `user_experiences.trip_id` is
**nullable with no uniqueness** (`shared/schema.ts:1937`) — many events per plan, by Locked
Decision 29. So the relationship between a list-A row and a list-B row is not even
functional-by-construction; it is many-to-many across two different populations.

### Consequences visible today

1. **List B cannot gain a person from any screen.** `POST /api/trips/:tripId/participants` exists
   and is correctly gated, but no client file calls it — the only client references to
   `/participants` are the dashboard's four reads and the tracker's one (broken) write.
   `bulk-invite` has no caller either.
2. **List B is therefore empty in practice, and everything that reads it renders zeros honestly.**
   The dashboard's participant/payment/dietary tiles and `budget.service`'s per-person split are
   correct code over an unfillable table.
3. **List A cannot answer the questions list B was built for.** It has no `amountOwed`, no
   emergency contact, no `mobilityLevel`, no arrival/departure time — so the budget split and the
   logistics dashboard cannot be driven from invites even though invites are the only rail that
   collects real people.
4. **`mandatoryEventIds` / `optionalEventIds` (`shared/schema.ts:4246-4247`) are
   collected-and-never-read.** They are typed in the dark tracker component
   (`participant-travel-tracker.tsx:34-35`) and declared in the schema, and **no server code reads
   them anywhere**. Note their comment says "itinerary item IDs" — they predate Locked Decision 29
   and are *not* `user_experiences` ids, so they are not a latent per-event link.

---

## 4. The verified defect (CONFIRMED — with one correction to the brief)

`client/src/components/logistics/participant-travel-tracker.tsx:62` (pre-fix) issued:

```
apiRequest("PATCH", `/api/trips/${tripId}/participants/${participantId}`, updates)
```

**No such route is declared anywhere in `server/`.** The only participant PATCH routes are
`router.patch("/api/participants/:id", …)` (`content.routes.ts`, now `:6856`) and
`…/:id/rsvp` (`:6882`). Confirmed by enumerating every `app.*`/`router.*` declaration under
`server/` (the test in §6 does this programmatically). **The write never landed.**

### Correction: the failure was NOT silent, and §9 no longer describes `/api/*`

The brief predicted a 200-HTML fall-through per CLAUDE.md §9, with `onSuccess` firing and the UI
looking saved. **The code says otherwise.** `server/index.ts:583` registers
`app.use("/api", notFoundHandler)` immediately after `registerRoutes`, with the comment "Unknown
`/api/*` paths must return 404 JSON, not fall through to the SPA catch-all (which returned 200
text/html and masked missing routes)". `notFoundHandler`
(`server/infrastructure/error-handler.ts:175-177`) raises a `NotFoundError`. `apiRequest`
(`client/src/lib/queryClient.ts:38`) calls `throwIfResNotOk`, so a 404 **rejects the mutation** and
`onError` fires a destructive "Update failed" toast (`participant-travel-tracker.tsx:82-84`).

So the user-visible symptom was an **opaque failure**, not a fake success. The defect — the write
never reaching the database from the only screen that offers it — is exactly as described; only the
mechanism differs. **§9's "dead endpoints return 200-HTML, NOT 404" is now stale for the `/api` and
`/internal` namespaces** (`server/index.ts:583`, `:592`) and remains true elsewhere. That is
recorded here rather than in CLAUDE.md, which this lane may not edit.

**Second-order finding:** because the component is mounted nowhere, this defect was unreachable in
the running app. Fixing it does not restore a broken user journey; it makes the component correct
for whoever mounts it, and it closes the class.

---

## 5. What was fixed, and the §19 hole the fix uncovered

**The client now calls the route that exists** — `PATCH /api/participants/:id`. Preferred over
inventing `PATCH /api/trips/:tripId/participants/:id` for two reasons: a new route would be a
**second write rail for the same fact** (§18 rule 1), and the existing route is *strictly safer* —
it resolves the participant's `tripId` from the **stored row** and owner-gates on that, so ownership
can never be asserted through the URL (§14).

**But routing a live write into that rail exposed a §19 mass-assignment hole that had to be closed
in the same change.** Pre-fix, the handler body was:

```
const participant = await coordinationService.updateParticipant(req.params.id, req.body);
```

— no zod parse at all, and `updateParticipant` spreads its argument into a Drizzle `.set()`
(`coordination.service.ts:56-62`). Every real column was settable, including **`userId`** — the
exact field the sibling CREATE rail strips with an explicit note that setting it "becomes a
self-service authorization grant the moment any gate reads `trip_participants.userId`"
(`server/routes.ts:10590-10593`). `insertTripParticipantSchema` was even *imported* into
`content.routes.ts:164` and never used on this rail. This is §18 rule 2 verbatim: **update paths were not
checked as hard as inserts.**

Closed with an exported pick-based allowlist, `tripParticipantPatchSchema`
(`server/routes/content.routes.ts`), following the `userExperienceBodySchema` precedent in the same
file (`:1729`). It admits the participant's *profile & logistics* facts only. Excluded, each because
another rail already owns the field (a second author is derivation-drift, §18 rule 1):

| Excluded | Owner |
|---|---|
| `tripId`, `userId`, `id` | Nobody — linkage/identity, never client-settable (§14, L20) |
| `status`, `rsvpNotes`, `respondedAt`, `invitedAt` | `PATCH /api/participants/:id/rsvp` (stamps `respondedAt`) |
| `amountPaid`, `paymentStatus`, `paymentMethod`, `paymentNotes` | `POST /api/participants/:id/payment` — **derives** them (`coordination.service.ts:145-155`) |
| `amountOwed` | No client-reachable writer today; §18 rule 3 — a field with no consumer is still stripped |

`arrivalDatetime`/`departureDatetime` are re-admitted through `.extend()` with
`z.coerce.date().nullable().optional()` — the `anchorCreateInput` route-boundary-coercion precedent
(`server/routes/trips.routes.ts:1717-1726`). `.nullable()` wraps the coercion deliberately: an
explicit `null` (how the tracker clears a time) short-circuits instead of coercing to the epoch.

**The §12 advisor branch is deliberately NOT added.** This table's standing ruling is owner-only.

`tripParticipants.status`, `.paymentStatus` and `.role` are already ratified as non-privileged by
`scripts/check-privileged-field-completeness.cjs:191-201`; that ratification is not disturbed —
`role` stays admitted, and `status`/`paymentStatus` are excluded for the rail-ownership reason
above, not a privilege one.

---

## 6. What the canvas "column per event" page would need

The mock is **one page, one column per event, guests down the rows**. Against this SHA:

**What already exists.** The events themselves: `user_experiences` rows filtered by `trip_id`.
`client/src/components/trip/trip-strip.tsx:182` already computes exactly that
(`planEvents.filter(e => e.tripId === ctx.tripId).length`) off the shared `/api/user-experiences`
query key. Per-event invite lists and stats exist per column
(`GET /api/events/:id/invites`, `…/invites/stats`).

**Blocker 1 — the existing guest surface is hard-wired to ONE event per plan.**
`SlipLogisticsSection.tsx:52` does:

```
const linkedExperience = allUserExperiences?.find((e) => e.tripId === tripId) ?? null;
```

`.find()` takes the **first** match. Locked Decision 29 states plainly that
`user_experiences.trip_id` has *no uniqueness* — many events per trip. So the strip already counts
N events for a plan while the guest manager can only ever address event #1. **A column-per-event
page cannot be built on this component as written**; it needs the list, not `.find()`. That is a
UI change inside the existing contract (no schema), and it is the smallest real step toward the mock.

**Blocker 2 — rows.** The mock's rows are "guests". Which list?
- If rows come from **list A**, the page is buildable today with no schema change, but every column
  can only show RSVP-grade facts. There is no "who owes what", no arrival time, no mobility.
- If rows come from **list B**, there is exactly **one row set for the whole plan**, so it cannot be
  split into columns at all — `trip_participants` has no event dimension. Rendering the same list
  under each column would be a fabricated attribution (§13).

**This is why the page cannot be drawn honestly yet, and it is a schema question, not a layout one.**

**Blocker 3 — no identity across columns.** "Is the person in column A the same person as in
column B" is unanswerable. Both lists key guests by free-text email/name. A name- or
email-similarity match is explicitly **rejected**: two people share a name, one person uses two
addresses, and a fuzzy match rendered as an identity is the fabricated-authority failure §13
forbids. Any cross-column identity must be a **stored, human-asserted** link.

---

## 7. Recommendation — LINK, do not merge (proposal only; requires ratification)

**They are two honest concepts.** Merging them would destroy information in both directions: list A
would lose the token/RSVP/origin-city rail that lets a person without an account respond, and list B
would lose its per-plan, event-independent identity that budget-splitting depends on. "Invited to the
wedding" and "travelling on the plan" are different predicates over different, overlapping sets of
people, and the platform genuinely needs both.

**Recommended shape (NOT built in this lane):** one additive nullable FK,
`trip_participants.event_invite_id` → `event_invites.id`, `ON DELETE SET NULL`, no DB CHECK, declared
in `shared/schema.ts` per the publish-trap and deploy-push-durability rules, admitted through a
pick-based allowlist (§19) and **server-verified** — refused unless the invite's parent experience's
`trip_id` equals the participant's `trip_id` (the ruling-29 `item-event-link.service.ts` posture).

Why this direction and not the reverse:

- **The nullable side must be the participant.** A participant with no invite is ordinary (the
  planner, the organizer, a plus-one added by hand). An invite with no participant is also ordinary
  (invited, declined, never travelled). Putting the FK on `event_invites` instead would imply every
  invitee travels, which is false.
- **`ON DELETE SET NULL`, never CASCADE.** Deleting an invite must not delete the travelling person
  or their money — the same reasoning ruling 29 applied to `itinerary_items.user_experience_id`.
- **It makes the mock drawable honestly.** Column = event; a guest row can then say *invited to this
  event* (list A, per column) **and** *travelling, owes $X, arrives Tuesday* (list B, per plan),
  because the link is a stored fact. Unlinked rows in either list stay visible and stay labelled as
  unlinked — never silently joined.
- **It costs nothing today.** NULL everywhere on apply; every current reader is unaffected.

**Trade-offs the decision-maker should weigh:**

1. **One invite ↔ one participant is an assumption.** `event_invites.numberOfGuests` (`:47`) already
   allows a party of N behind one token. A single FK models the invitee, not the party; the plus-ones
   would have no invite of their own. The alternative — a join table — is heavier and probably
   premature.
2. **A person invited to two events in one plan.** With the FK on the participant, they can be
   linked to only one of the two invites, even though the same human is in both columns. If
   cross-column identity is a real product requirement, the FK is the *wrong* shape and the answer is
   a plan-level person record that both lists point at. **That is the question worth deciding first**,
   because it changes the recommendation.
3. **Who creates the link, and when.** The honest options are an organizer action ("this guest is
   travelling") or an RSVP-accept hook. An automatic email match is explicitly ruled out. **No
   automatic linkage should be built without an explicit ruling.**
4. **The link alone does not fill list B.** Even linked, nothing writes participants today (§3.1). A
   separate, smaller decision — should accepting an invite create a participant row? — is the one that
   determines whether the budget/logistics surfaces ever have data.

**Can this lane proceed further without ratification? No.** Every remaining step — the column-per-event
page, any cross-list read, any backfill — depends on the answer to trade-off 2. Building a join in the
interim would bake in an assumption the decision-maker has not made, so the lane stops here, as
designed.

### Filed, not fixed (each verified above, each out of this lane's scope)

| # | Finding | Where |
|---|---|---|
| F1 | `SlipLogisticsSection` binds the guest surface to `.find()` — the first of N events | `SlipLogisticsSection.tsx:52` |
| F2 | No client screen creates a `trip_participants` row; `POST …/participants` and `…/bulk-invite` have no callers | grep, §3.1 |
| F3 | `bulkInvite` sends no email despite the name | `coordination.service.ts:188-210` |
| F4 | `mandatoryEventIds`/`optionalEventIds` are collected-and-never-read, and are itinerary-item ids, not event ids | `shared/schema.ts:4246-4247` |
| F5 | `coordinationService.setAmountOwed` has no route | `coordination.service.ts:208` |
| F6 | `ParticipantTravelTracker` and most of the logistics barrel are exported but never mounted | `logistics/index.ts` |
| F7 | The dead `POST …/participants` twin in `trips.routes.ts:864` lacks the live copy's `userId` strip — harmless while shadowed, a live hole if mount order ever changes | `trips.routes.ts:864-877` |
| F8 | CLAUDE.md §9's "dead endpoints return 200-HTML, NOT 404" is stale for `/api/*` and `/internal/*` | `server/index.ts:583`, `:592` |
