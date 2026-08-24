# Expert-loop object-flow audit (Jul 30, 2026)

Read-only investigation. Question: what OBJECT circulates when (a) a traveler asks an expert for
help at cart/checkout, and (b) an expert sends the finished product back — and does delivery
actually land in the traveler's console. Traced statically (file:line) and proven live against a
booted server (`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure_b2 …
PORT=5001 npx tsx server/index.ts`), using a fresh disposable fixture (trip, service,
comparison/variant, expert user) — all deleted at the end; nothing in this doc depends on
leftover fixture data.

---

## 1. Object-flow diagram

```mermaid
flowchart TD
    subgraph LegA["Leg A — traveler asks for help"]
        Cart["cart.tsx: 'Find a Trip Planner'\nbare <Link> to /experts?tripId="] --> ExpertsPg["/experts?tripId=\ncarries tripId through"]
        ExpertsPg --> Detail["expert-detail.tsx\nhandleRequestHelpWithPlan()"]
        Detail -->|"POST /api/expert-booking-requests\n{tripId, serviceId}"| SB1["service_bookings row\n(tripId column SET, status=pending)"]
        SB1 -->|"notification + email\nto provider/expert"| InboxQ["Inbox › Queue tab\nGET /api/expert/bookings"]
        InboxQ -->|"Accept → PATCH .../status\nstatus=confirmed"| Bridge["E1 bridge\n(routes.ts:4288-4312)"]
        Bridge -->|"createTripExpertAdvisor\nstatus=accepted"| TEA1["trip_expert_advisors row"]
        TEA1 --> InboxAssign["Inbox › Assignments tab\nGET /api/expert/assigned-trips"]
        InboxAssign --> Workspace["/expert/workspace/:tripId"]

        PlanCard["PlanCard / EscalationCTA /\nVariantActionButtons / DeliveryOptions /\nPartnerizeBookingCTA / experience-template"] -->|"POST /api/expert-requests\n(+ optional payment-intent)"| ER["expert_requests row\n(fee, requestType, notes, optimizationContext)"]
        ER -->|"leadRoutingService.routeLead\n(fire-and-forget)"| Route["assignExpertAdvisorToRequest\n+ ensureTripAdvisorRow (F1)"]
        Route -->|"tripId present"| TEA2["trip_expert_advisors row\n(status=pending)"]
        Route -->|"notification\n'New trip assignment'"| Workspace
        TEA2 -.->|"NO expert-side reader of\nexpert_requests content\n(fee/notes/requestType)"| Nowhere1["dead end — expert never\nsees the paid request itself"]

        Optimize["Optimize/comparison flow\nPOST /api/itinerary-variants/:id/share"] --> SharedIt["shared_itineraries row\n(shareToken, permissions=suggest/edit)"]

        Concierge["Concierge intake, Full tier\nPATCH /api/concierge/requests/:id"] --> CoordSt["coordination_states row\n(documented Phase 1a — not re-verified live)"]
    end

    subgraph LegB["Leg B — expert delivers"]
        WS["Expert Workstation/workspace.tsx"] -->|"PATCH /expert/assignments/:id/workspace-status\ndraft→in_review→delivered"| TEA3["trip_expert_advisors.workspaceStatus"]
        TEA3 -->|"F2 fix: notification\ncorrect data.tripId + workspacePath"| TravelerNotif["traveler /api/notifications\n'Your itinerary is ready/delivered'"]
        TravelerNotif -->|"click-through"| TripPage["/trip/:id?tab=itinerary\n(NO delivered/in_review indicator\non the trip itself — verified live)"]

        Suggest["Expert 'Suggest'\nPOST /trips/:id/suggestions"] --> TripSugg["trip_suggestions row\n(status=pending)"]
        TripSugg -.->|"NO notification created\n(verified live: count unchanged)"| Nowhere2["silent — traveler only sees it\nif they revisit the trip page"]
        TripSugg -->|"traveler PATCH .../suggestions/:id\nstatus=approved"| ItinData["generated_itinerary_data\n(days[] array patched)"]

        ExpertReview["expert-review token flow\nPOST /api/expert-review/:token/submit"] --> ExpUpd["expert_updated_itineraries row\n+ shared_itineraries.expertDiff/expertNotes"]
        ExpUpd -->|"notification created,\nbut data: null (verified live)"| DeadNotif["dead-end notification —\nno tripId/workspacePath →\nno action button renders"]
        DeadNotif -.->|"only way back in"| TokenLink["/itinerary-view/:token\n(must already have the link;\nno 'my shares' list page)"]
    end
```

---

## 2. GAPS (numbered, each with file:line evidence + severity + how it was established)

### GAP 1 — CRITICAL, live-verified: experts cannot create/edit services at all (`POST /api/provider/services` 403s for every expert role)
`server/routes.ts:344-360` registers a session-role RBAC backstop: any path under `/api/provider/…`
(including `/api/provider/services`, line 345) is gated by `isProvider`
(`server/middleware/role-rbac.ts:39-56`), which only allows `role === "service_provider"` or
`"admin"`. But `POST/PATCH /api/provider/services` is the **single shared offering-creation
endpoint for both roles** — `client/src/components/ServiceForm.tsx:734-735` calls exactly this
path regardless of `role="expert"` vs `role="provider"` prop, and CLAUDE.md §5 / "Service Model"
documents it as such ("Experts creating custom services use the same route/schema as providers").
**Proven live:** identical POST body against the identical endpoint returned `403 {"message":
"Provider access required"}` with `role='expert'` and `201 Created` with `role='service_provider'`
on the same user id (only the `users.role` column differed). All four `EXPERT_ROLES`
(`expert, local_expert, travel_expert, event_planner` — `shared/roles.ts:25`) are blocked.
**Impact:** this breaks the supply side of the entire chain traced in this doc — no expert-role
account can create the `provider_services` row that `expert-detail.tsx`'s `services[0]?.id`
handoff depends on, nor use the Product Builder. (`client/src/pages/expert/service-form.tsx:12-19`
carries a Jul 29, 2026 comment referencing "CLAUDE.md §5 Phase 3 'role is the gate' (ratified …)"
— dated the same day as this audit — suggesting this RBAC backstop is a very recent, likely
uncoordinated change that was not reconciled against the shared ServiceForm endpoint.)

### GAP 2 — CRITICAL, live-verified: paid expert-request fee is never split to the expert (money silently stays 100% platform)
The expert's earning credit for a **paid** `expert_requests` row (the $50 review /
booking-review / full-concierge tiers priced via `resolveExpertReviewAmount`) is created **only**
inside `completeExpertRequest()` (`server/services/booking-actions.service.ts:22-70`), which calls
`creditExpertReviewSplit()` (lines 82-120) — this is the *only* code path that ever calls
`storage.createExpertEarning({ type: "expert_review_fee", … })` for these requests. That function
is reachable **only** via `PATCH /api/expert-requests/:id/complete`
(`server/routes/booking-actions.ts:283-299`). Exhaustive grep of `client/src` for
`expert-requests` (every `.tsx`/`.ts` file) finds **zero** callers of this endpoint — every
consumer (`PlanCard.tsx`, `EscalationCTA.tsx`, `VariantActionButtons.tsx`, `DeliveryOptions.tsx`,
`PartnerizeBookingCTA.tsx`, `experience-template.tsx`) only ever **creates** an `expert_requests`
row or **reads** the traveler's own list; none patches `/complete`. Nor does the expert console
(`inbox.tsx`, `workspace.tsx`) expose the row or a "mark complete" action anywhere — confirmed by
grep (`grep -rn "expert-requests" client/src/pages/expert client/src/pages/provider` → no hits).
**Consequence, traced through the money path:** `platform_revenue` is recorded **100%-platform**
at request-creation time (`server/routes/booking-actions.ts:170-181`, `sourceType:
'expert_review_fee'`), and the 75/25 re-split to the assigned expert is coded to happen only at
completion — which nothing ever triggers. The traveler pays; the assigned expert never gets
credited for that specific paid engagement. (Not proven with a live Stripe charge — `sk_test_dummy`
was used — but the code path and the absence of any caller were verified directly.)

### GAP 3 — HIGH, live-verified: expert "Suggest" submissions are silent — no traveler notification
`createTripSuggestion()` (`server/services/booking-actions.service.ts:627-644`) inserts into
`trip_suggestions` with no accompanying `notifications` insert, and the route handler
(`server/routes/booking-actions.ts:720-749`) does not add one either. **Proven live:** submitting
a suggestion via `POST /api/trips/:id/suggestions` left the traveler's `/api/notifications` count
unchanged (2 before, 2 after) while `GET /api/trips/:id/suggestions` correctly showed the new
`pending` row. The traveler can only discover a pending suggestion by manually revisiting
`/trip/:id` (`trip-details.tsx:270-282` renders `suggestionsData`) — there is no push signal at
all, unlike the (correctly-notifying) `workspace-status` transitions (GAP evidence for asymmetry:
the code comment at `server/routes/booking-actions.ts:911` claims this is "mirroring the
suggestion loop's notification symmetry" — that symmetry does not exist; the suggestion loop has
no notification).

### GAP 4 — HIGH, live-verified: expert-review submissions notify but the notification is a dead end
`POST /api/expert-review/:shareToken/submit` (`server/routes/trips.routes.ts:2709-2829`) does
create a `notifications` row for the traveler (line 2814-2821), but passes only `relatedId` /
`relatedType` — **no `data` object at all**, so `data` is `null`. **Proven live:** the created
notification's JSON was `"data":null`. The client's notification renderer
(`client/src/pages/notifications.tsx:269`) only renders an action button when
`notification.tripId` (sourced from `n.data?.tripId`, line 113) is truthy; with `data: null` the
button block falls through to `null` (line 293) — the traveler sees the title/message text with
**no click-through control**. Even if it did carry a link, the actual diff/accept-reject UI lives
at the **token-scoped** route `/itinerary-view/:token` (`client/src/pages/itinerary-view.tsx:109`),
not at `/trip/:id` — and there is no "my shared itineraries" list endpoint/page (grep for
`getSharedItinerariesByUser` or an equivalent GET-all found nothing), so a traveler who has lost
the original share link has **no way back into a review that already arrived**, notification or
not. This directly answers the task's question 3: the traveler is told a review arrived, but must
already have the original link to see it.

### GAP 5 — MEDIUM, live-verified: "delivered" has no visible state on the trip itself
`GET /api/trips/:id` (verified live) returns no field derived from
`trip_expert_advisors.workspaceStatus` — trip `status` stays whatever the traveler set (`"draft"`
in the fixture) regardless of the assignment's `workspaceStatus` reaching `"delivered"`. Grep of
`client/src/pages/trip-details.tsx` and `client/src/components/plancard/PlanCard.tsx` for
`workspaceStatus`/`delivered` found no hits — only `client/src/pages/expert/workspace.tsx` (lines
2225, 2264-2267) renders the Delivered chip, and only on the **expert's own** side. So the only
signal the traveler ever gets that "this is done" is the one-shot notification from GAP-free hop
(workspace-status → notification, which **is** correctly wired, see "What's connected" below) —
if it's dismissed/missed, there is no persistent UI truth to fall back on.

### GAP 6 — MEDIUM, static: three non-unifying parallel "expert help" object systems
The task's suspicion of a fragmented relay is correct in shape, though the individual hops that do
connect are more solid than "dropped baton" implies. Three genuinely separate object families
carry "an expert is helping with this trip", with only ad hoc bridging between them:
1. `service_bookings` (booking/commission-bearing; bridges to `trip_expert_advisors` only on
   accept, and only when created with a `tripId` — GAP-free path, see below).
2. `expert_requests` (fee-tier/lead-routing bearing; bridges to `trip_expert_advisors` only when
   `tripId` is supplied and lead-routing successfully auto-assigns — but the `expert_requests` row
   content itself, per GAP 2, never resurfaces to the expert).
3. `shared_itineraries` / `expert_updated_itineraries` (token/permission bearing; does **not**
   bridge to `trip_expert_advisors` at all — an expert can hold share-token "edit" access to a
   trip's variant without ever being an assigned `trip_expert_advisors` row, so `isExpertAssignedToTrip()`
   checks used by the Suggest flow and the workspace do not recognize this kind of access).
No single query answers "is an expert helping with trip X, and what did they say" — three tables
must be checked, and only two of the three converge on `trip_expert_advisors` at all.

### GAP 7 — LOW, static: cart handoff CTA does not itself create anything
`client/src/pages/cart.tsx:2107` ("Find a Trip Planner") is, by its own code comment
(lines 2102-2106), a bare `<Link>` that only carries `?tripId=` through the URL — no cart-snapshot
object is created at this hop. The actual `service_bookings` row is created two navigations later,
inside `expert-detail.tsx`'s `handleRequestHelpWithPlan()`, and only if the visited expert happens
to have at least one **approved+active** service (`services[0]?.id`) — which, per GAP 1, no
expert-role account can currently produce through the normal UI. If `services` is empty, the code
falls through to the inquiry-only branch (`server/routes.ts:1196-1243`) which creates **no
booking, no trip_expert_advisors row, only per-expert notifications** — a strictly weaker object
than the cart CTA's copy ("Let an expert handle every detail") implies.

---

## 3. What IS connected and working (proven live, not just read)

- **Cart → paid handoff → expert Inbox → accept → Workstation** is a real, single, traceable
  chain when a `serviceId` is available: `POST /api/expert-booking-requests` →
  `service_bookings` row (`tripId` column set) → shows immediately in
  `GET /api/expert/bookings` (Inbox Queue tab) → `PATCH .../status {confirmed}` → E1 bridge
  (`server/routes.ts:4288-4312`) atomically creates/reuses a `trip_expert_advisors` row → shows
  immediately in `GET /api/expert/assigned-trips` (Inbox Assignments tab, "Active") → links to
  `/expert/workspace/:tripId`. All hops proven with real HTTP calls against the booted server.
- **Lead-routed `expert_requests` → trip visibility** also bridges: the F1 fix
  (`ensureTripAdvisorRow`, `server/routes/booking-actions.ts:244-249`) creates the same
  `trip_expert_advisors` row for the free/lead-routed path, so the trip becomes visible to the
  expert even though (per GAP 2) the request's own paid-fee content does not.
- **Workspace-status notifications are correctly wired** (post-fix, referenced in code as "F2"):
  both `draft→in_review` and `in_review→delivered` transitions create a traveler notification
  with the correct `data.tripId` + `data.workspacePath` (`/trip/:id?tab=itinerary`) — proven live,
  both notifications rendered with populated `data`, unlike GAP 4's expert-review notification.
- **Suggest approval writes real content**: `PATCH /trips/:id/suggestions/:id {approved}`
  (`server/routes/booking-actions.ts:755-`) patches the approved suggestion into the trip's
  generated itinerary data — the mechanism is sound; only the notification (GAP 3) is missing.
- **Concierge Full-tier → coordination_states**, per CLAUDE.md's own Phase 1a/1b/1c/2 record, is
  documented as landed and previously proven behaviorally (idempotent engagement creation, `/my-events`
  surfacing, admin coordinator assignment, paid capture) — not independently re-verified live in
  this pass (out of scope budget), but no contradicting evidence was found either.

---

## Compact chain summary

**Leg A:** cart CTA (no object) → `/experts?tripId=` (URL only) → expert-detail.tsx →
`POST /api/expert-booking-requests` → **`service_bookings`** (tripId set) → Inbox Queue →
Accept → **`trip_expert_advisors`** (E1 bridge) → Inbox Assignments → `/expert/workspace/:tripId`.
Parallel/weaker paths: `POST /api/expert-requests` → **`expert_requests`** (fee/tier) →
lead-routing → same `trip_expert_advisors` bridge for the *trip*, but the `expert_requests` row's
own content and paid-completion payout are orphaned (GAP 2). A third parallel object,
**`shared_itineraries`** (token-based, from the optimizer "share" action), never joins
`trip_expert_advisors` at all (GAP 6).

**Leg B:** workspace status advance → **`trip_expert_advisors.workspaceStatus`** → traveler
notification (correctly linked) → `/trip/:id?tab=itinerary` (no persistent delivered indicator,
GAP 5). Suggest → **`trip_suggestions`** → silent, no notification (GAP 3), traveler must revisit
the page. Expert-review token flow → **`expert_updated_itineraries`** +
`shared_itineraries.expertDiff` → traveler notification fires but is a dead end (`data: null`,
GAP 4) and the only real entry point (`/itinerary-view/:token`) requires the original link, which
nothing in-app re-surfaces.

**Most severe finding:** GAP 1 (experts 403 on the shared service-creation endpoint) currently
blocks the supply side of this entire loop for expert-role accounts, and GAP 2 (paid
expert-request fee never splits to the expert because nothing ever calls `/complete`) is a live
money-integrity hole, not a UX gap.
