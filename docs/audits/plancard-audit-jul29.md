# Trip Plan Card System Audit — Jul 29, 2026

Read-only, code-trace + live-drive audit of `client/src/components/plancard/*` and every context that
renders it: the trip dashboard/summary card, the owner full trip page (`/itinerary/:id`), the public
itinerary share/expert-review view (`/itinerary-view/:token`), the expert Workstation `embedded` mode, and
the `experience-template.tsx` linked-trip preview. Run against a local server (port 5001) seeded with real
trips, itinerary items, and a share fixture, driven via the live HTTP API and a cookie-authenticated
Playwright browser (screenshots below). All test fixtures were created and then deleted; the server was
stopped at the end of the session (see "Method & cleanup").

Per instructions, the previously-fixed Workstation day-count drift (durationDays now derives from the real
day list — `client/src/pages/expert/workspace.tsx:1610`, confirmed live and correct in this audit too) is
**not** re-reported.

## Summary

| Severity | Count |
|---|---|
| P1 | 3 |
| P2 | 3 |
| P3 | 2 |

**Top 5:**
1. **(P1)** No trip ever gets an owner row in `trip_collaborators` at creation time — the PlanCard's own
   data endpoint (`GET /api/trips/:id/plancard`) 403s *"Access denied"* for the trip's own owner on every
   freshly-created trip, live-reproduced, until a stale startup-only backfill script happens to catch it.
2. **(P1)** The entire itinerary-share / expert-review surface (create share link, accept/reject expert
   edits, submit expert edits, the `isOwner` flag) is wired to a session-shape that doesn't match the
   platform's primary (email/password) login — live-confirmed 403/401 on every mutating call, and
   `isOwner: false` returned to the actual, authenticated owner.
3. **(P1, content-gate leak)** A "view"-only (friend/family) itinerary share link exposes the expert's
   **private per-activity review notes** to any anonymous holder of the link — live-reproduced with a
   screenshot: an unauthenticated visitor sees a "💡 Expert Tip" box containing text explicitly marked
   confidential in the fixture.
4. **(P2)** The "Change History" panel is permanently blank ("User -", no description) on every surface
   that reads the top-level `changeLog` — a field-name mismatch (`action` vs `what`) between server and
   client, live-confirmed on both the traveler dashboard and the expert Workstation.
5. **(P2)** The share/expert-review view renders **"Invalid Date"** in place of every activity's start time
   — `formatTime()` assumes a parseable date string but the server only ever sends a bare `"HH:MM"`.

---

## P1 findings

### F1 — `trip_collaborators` is never written at trip creation → PlanCard 403s for the owner

**Surface:** every PlanCard context (dashboard, `/itinerary/:id`, Workstation) — the shared root cause.

**Mechanism:** `getTripRole()` (`server/utils/trip-role.ts:28-56`) resolves access **by assignment only**:
it looks for a row in `trip_collaborators` (or a `trip_expert_advisors` assignment), and explicitly does
**not** consult `trips.userId`. `GET /api/trips/:tripId/plancard` (`server/routes/plancard.routes.ts:158-172`)
gates on `getTripRole()` (with a narrow `isTripAuthor` fallback for expert-authored Ready-Made builds only —
not for ordinary consumer trips). But `storage.createTrip()` (`server/storage.ts:741-757`), the function
behind the live `POST /api/trips` (`server/routes.ts:739-756`), **never inserts a `trip_collaborators` owner
row.** The only code that ever writes one is `server/seeds/trip-ownership.seed.ts`, a **startup-only,
idempotent backfill** ("Ensures every *existing* trip has an owner row") that is not part of the create path.

**Seen vs. truth (live-reproduced):**
- Created a trip via the live `POST /api/trips` as `test-traveler-kyoto@traveloure.test` (id
  `c2844d3b-2ac9-45e5-a7fa-6fb5d31ed318`).
- `GET /api/trips/{id}/plancard` → **`403 {"error":"Access denied"}`**, same session, same user.
- The *same* user, *same* session, could freely `POST /api/trips/{id}/itinerary-items` (that route uses a
  different, correct check — `verifyTripOwnership`, i.e. direct `trips.userId === userId`) — confirming the
  divergence is specifically in the `getTripRole` gate, not a general auth problem.
- Restoring access required a manual `INSERT INTO trip_collaborators (...) VALUES (..., 'owner', ...)` —
  exactly what the seed script does, but only at the *next server restart*, not on trip creation.

**Impact:** every trip created since the last server boot is invisible to its own owner's PlanCard (the
main `/itinerary/:id` page, the dashboard's expanded card, and the Workstation's author-mode fallback only
covers *expert-authored* builds) until the next deploy/restart re-runs the backfill. In a long-lived
production process this is not a one-time startup race — it is the **permanent state** for every trip a
user creates between restarts.

**Fix direction:** insert the `owner` row inside `storage.createTrip()` (single transaction with the trip
insert), not as a side-effect of a periodic backfill; keep the backfill as a defensive one-time repair for
pre-existing data, not the mechanism of record.

---

### F2 — Share/expert-review endpoints read `req.user?.id`, which is `undefined` for email/password sessions

**Surface:** `/itinerary-view/:token` (create/accept/reject/submit) — `server/routes/trips.routes.ts`.

**Mechanism:** the platform's session shape for email/password logins (the primary, non-Replit auth path —
see `server/replit_integrations/auth/emailAuth.ts:130-139`) is `{ claims: { sub: userId, ... } }` — there is
**no** top-level `req.user.id`. Most of `trips.routes.ts` correctly reads
`(req.user as any)?.claims?.sub ?? (req.user as any)?.id`, but a cluster of handlers on the itinerary-share
surface reads only `(req as any).user?.id`, which is always `undefined` for these sessions:

- `server/routes/trips.routes.ts:2005` — `POST /api/itinerary-variants/:variantId/share` (create link)
- `server/routes/trips.routes.ts:2203` — `isOwner: !!(shared.sharedByUserId && (req as any).user?.id === shared.sharedByUserId)` inside `GET /api/itinerary-share/:token`
- `server/routes/trips.routes.ts:2599` — `POST /api/itinerary-share/:token/suggest` (legacy expert-suggest)
- `server/routes/trips.routes.ts:2656` — `PATCH /api/itinerary-share/:token/acknowledge` (owner accept/reject)
- `server/routes/trips.routes.ts:2689` — `POST /api/expert-review/:shareToken/submit` (expert sends edits)

**Seen vs. truth (live-reproduced):**
- Logged in as the trip owner (email/password), called `POST /api/itinerary-variants/audit-variant-1/share`
  with a body the owner is entitled to share → **`403 {"error":"Not authorized"}`**, always (comparison's
  real `userId` matched the session's real user; only the broken read fails).
- Inserted a share row directly (to unblock further testing) and then, **while authenticated as the real
  owner**, called `GET /api/itinerary-share/audit-share-token-xyz123` → response includes **`"isOwner": false`**.

**Impact:** with this endpoint cluster broken, standard accounts can never (a) create a share link from the
UI at all, (b) as an expert, send suggested edits back, (c) as the owner, accept/reject those edits, or (d)
see the owner-gated UI (`isOwnerView`-conditioned Expert Notes banner and Accept/Reject banner in
`client/src/pages/itinerary-view.tsx:298-299,563,572`) even on their own share. The whole expert-review loop
this page exists to support is non-functional end-to-end for the platform's primary auth path.

**Fix direction:** replace `(req as any).user?.id` with the same
`(req.user as any)?.claims?.sub ?? (req.user as any)?.id` fallback used everywhere else in this file —
mechanical, five call sites.

---

### F3 — Content-gate leak: private expert review notes exposed to any anonymous "view" share-link holder

**Surface:** `/itinerary-view/:token`, non-expert/non-owner ("view" permission) branch.

**Mechanism:** `GET /api/itinerary-share/:token` (`server/routes/trips.routes.ts:2087-2209`) is **public, no
auth required** (comment: `// GET /api/itinerary-share/:token — PUBLIC`), and returns `expertNotes` and the
full `expertDiff` (including every per-activity private note) **unconditionally to any token holder** —
`server/routes/trips.routes.ts:2198-2200` applies no permission or ownership filter at all. On the client,
`itinerary-view.tsx:350-352` builds each `PlanCardActivity.expertNote` gated **only** on
`expertStatus ∈ {notes_complete, acknowledged}` — **not** on `isOwnerView` (unlike the page-level "Expert
Notes from …" banner at `itinerary-view.tsx:572`, which *is* correctly owner-gated). The non-expert branch
then renders `<PlanCard role="viewer" stage="full" days={planCardDays} />` (`itinerary-view.tsx:594-600`),
and `ActivitiesSection.tsx:515-546` renders any non-null `a.expertNote` as a "💡 Expert Tip" disclosure —
with no viewer check at all.

**Seen vs. truth (live-reproduced):** built a fixture share (`permissions: "view"`, `expertStatus:
"notes_complete"`, a private per-activity note reading *"Private aside: this client complained about crowds
and budget, consider recommending a cheaper alternative quietly"*) and opened
`/itinerary-view/{token}` in a browser context carrying **no cookies at all**. Result: the private note
renders verbatim inside a visible, expandable "Expert Tip" box.

![Anonymous viewer sees the private expert note](plancard-audit-assets/share-leak-anon-expanded.png)

**Impact:** any traveler who shares a "just look at this" view-only link with a friend or family member —
the ordinary, everyday use of this feature — leaks the expert's private commentary about that traveler to
that friend/family member once the expert has reviewed the trip. This is exactly the class of bug the audit
was scoped to catch: content meant for the owner alone reaching a viewer who shouldn't see it.

**Fix direction:** gate the `expertNote` value in the `!isExpertView` branch on `isOwnerView` (mirroring the
banner's own gate), and/or have the server omit `expertNotes`/`expertDiff` entirely from the public payload
unless the requester is the verified owner or the share's `permissions` is `suggest`/`edit`.

*(Minor, filed alongside — not escalating severity: the same public response also returns the trip owner's
raw internal `userId` in `sharedBy.userId` (`trips.routes.ts:2190-2196`) to anonymous viewers. No exploitable
surface currently reads it client-side, but it's unnecessary exposure.)*

---

## P2 findings

### F4 — "Change History" is permanently blank: server sends `action`, client reads `.what`

**Surface:** every PlanCard full-stage render that uses the live `/api/trips/:id/plancard` query (the
dashboard's expanded card, `/itinerary/:id`, the expert Workstation `Day list` tab).

**Mechanism:** `ChangeLogPanel.tsx:33` renders `{c.what}` per `PlanCardChange.what`
(`plancard-types.tsx:230`). The server's top-level `changeLog` array
(`server/routes/plancard.routes.ts:411-418`) maps each row as `{ id, who, action: c.action, when, type,
role }` — the key is **`action`**, not `what`, so `c.what` is `undefined` on every entry. Tellingly, the
*per-activity* mini change-note built two dozen lines earlier in the same file
(`server/routes/plancard.routes.ts:258-261`) gets this right: `.map(c => ({ who: c.who, what: c.action,
when: ... }))` — proving this is a plain naming slip in one of the two mappings, not an intentional shape.

**Seen vs. truth (live-reproduced):** on both the dashboard's "Audit Kyoto Trip" card and the expert
Workstation's "Day list" view, the Change History strip shows three/two entries reading **"User -"** with
the description blank, immediately above the per-activity "User: Added …" lines which *do* render correctly.

![Blank Change History on the dashboard](plancard-audit-assets/dashboard.png)

**Fix direction:** rename `action:` to `what:` in `server/routes/plancard.routes.ts:414` (one line).

---

### F5 — Share/expert-review view renders "Invalid Date" for every activity time

**Surface:** `/itinerary-view/:token`.

**Mechanism:** `itinerary-view.tsx:87-94`'s `formatTime()` calls `new Date(timeStr)` and formats with
`.toLocaleTimeString()`, assuming `timeStr` is a parseable date/timestamp. But the variant items the share
endpoint returns only ever carry a bare `"HH:MM"` string for `startTime`
(`server/routes/trips.routes.ts:2129`, sourced from `itinerary_variant_items.start_time`, a
`varchar(20)` — see schema check earlier in this audit). `new Date("09:00")` is an Invalid Date, so
`toLocaleTimeString()` returns the literal string `"Invalid Date"`.

**Seen vs. truth (live-reproduced):** in the same anonymous-viewer screenshot as F3, both activity rows show
**"Invalid Date"** in the time column instead of `09:00` / `12:30`.

**Fix direction:** parse `"HH:MM"` directly (it's already display-ready) instead of routing it through
`new Date(...)`; reserve `formatTime()` for genuinely ISO/timestamp-shaped inputs.

---

### F6 — Day-count formula disagrees between the summary card and the full card for a cold (zero-item) trip

**Surface:** the one live call site of `stage="summary"` — the "Linked Trip PlanCard Preview" on the
wedding/proposal/birthday experience page (`client/src/pages/experience-template.tsx:1922-1939`) — versus
every `stage="full"` render (dashboard, `/itinerary/:id`, Workstation).

**Mechanism:** two independent client-side fallback formulas compute "Days" when the server has returned
`days: []` (no itinerary items yet):
- `PlanCard.tsx:339-341` (`PlanCardSummary`): `days.length || Math.max(1, Math.round((end - start) / 86400000))` — **no +1**.
- `HeroSection.tsx:62`: `days.length || (start && end ? differenceInDays(end, start) + 1 : 0)` — **+1** (inclusive).
- `StatsRow.tsx:24` (a third call site, used only by `itinerary-view.tsx`): same `+1` formula as HeroSection.

**Seen vs. truth (live-reproduced + computed):** created a trip with `startDate=2026-10-01`,
`endDate=2026-10-05`, zero itinerary items. `GET /api/trips/{id}/plancard` confirmed `"days": []`. The full
page's HeroSection metric strip **live-shows "5" Days** (screenshot below). The `PlanCardSummary` formula on
identical inputs computes `Math.round(4) = 4` (`differenceInDays` here is exactly 4×86400000ms, no
half-day rounding ambiguity) — a **1-day disagreement for the same trip**, same class of bug as the
already-fixed Workstation drift, recurring in a sibling formula the fix didn't touch.

![Full-page HeroSection shows 5 Days for the same 0-item, Oct 1–5 trip](plancard-audit-assets/cold-trip-dashboard.png)

**Fix direction:** delete the duplicated fallback math in `PlanCardSummary`/`StatsRow` and have all three
call the same single day-count helper (or just import `HeroSection`'s formula) so a cold trip can't disagree
with itself across surfaces.

---

## P3 findings

### F7 — `EscalationCTA` planSnapshot sends `day: d.day`, a field that doesn't exist

**Surface:** `/itinerary/:id`, "Request expert" (`EscalationCTA`) — server-side payload only, not rendered.

**Mechanism:** `PlanCard.tsx:1034-1037` builds `planSnapshot.days` as
`days.map(d => ({ day: d.day, date: d.date, activityCount: ... }))`. `PlanCardDay` (`plancard-types.tsx:217-224`)
has no `day` field — only `dayNum`. `d.day` is `undefined` on every entry, silently dropped by
`JSON.stringify`, so the day number never actually reaches the server's `optimizationContext.planSnapshot`.
Low severity — nothing renders this value to a user — but worth the one-word fix (`d.day` → `d.dayNum`).

### F8 — Anonymous share response exposes the owner's raw internal `userId`

Already noted alongside F3: `sharedBy.userId` (`server/routes/trips.routes.ts:2190-2196`) is returned to
unauthenticated viewers. No client code currently reads it for anything privileged, so this is hygiene, not
an active leak — filed at P3.

---

## Verified clean (checked, no issue found)

- **§13 fabrication check** — no hardcoded fake ratings/costs/images anywhere in `components/plancard/*`.
  `TYPE_COLORS`/`STATUS_STYLES`/`ENERGY_COLORS` are pure style lookup maps, not fabricated data; all
  numeric displays (cost, duration, scores) trace back to real query data with honest `null`/empty handling.
- **`ActivitiesSection`'s "live today" / "up next" temporal logic** — `computeTemporalStates`,
  `upNextIndex`/`lastPastIndex` derivation, and the sticky "Navigate" FAB's coordinate/`mapsUrl` guard
  (`hasValidCoords`) all read correctly off real data; no fabricated fallback state.
- **`MapControlCenter`** — pins are strictly resolved-on-write, server-persisted `lat`/`lng` (comment and
  code confirm no client-side geocoding path); consistent with the plancard endpoint's own
  `resolveMissingItemCoordinates` (`server/routes/plancard.routes.ts:20-47`).
- **Expert Workstation `embedded` mode** — confirmed live: the previously-fixed day-count-vs-chip drift
  holds (`"2 items · 2 days"` chip matches the embedded HeroSection's own "2/2" reading); `ConciergeModule`,
  the card/map view toggle, both `PlanCardUpsellSlot`s, and `EscalationCTA` are all correctly suppressed via
  the `embedded` prop (`PlanCard.tsx:897-907,973,1003-1044`); the migration-152 `expertNote` shown on the
  expert's own build in Workstation is correctly the expert's own authored tip on their own content, not a
  cross-viewer leak (contrast with F3).
- **Ready-made store preview / traveler's purchased view** (`expert-template-detail.tsx`) — confirmed via
  grep this surface does **not** render `PlanCard` at all; it has its own component and its own
  server-verified teaser-gate (`itineraryPreview` vs `itineraryData`, `template-content-gate.ts`), out of
  this component's scope. No PlanCard-side leak possible here because PlanCard isn't in the path.
- **Guest-invite trip views** — grepped the whole client tree; no guest-invite page imports `PlanCard`. N/A
  to this audit.
- **KML/GPX export endpoints** (`/api/itinerary-share/:token/export/{kml,gpx}`) — geometry/label-only
  formats; spot-checked they do not embed `expertNotes`/`expertDiff` content.
- **`TransportSection`/`TransportConnector` mode-switching, accept/decline, per-leg booking panel** — all
  wired to real mutations with optimistic update + rollback on error; no dead buttons found in this
  component tree.

---

## Method & cleanup

Server: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure_b2 SESSION_SECRET=verify-secret
STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY] AMADEUS_API_KEY=dummy AMADEUS_API_SECRET=dummy PORT=5001 npx tsx server/index.ts`,
stopped at the end of the session. Accounts used: `test-traveler-kyoto@traveloure.test` (traveler) and
`kyoto-food@traveloure.test`, a seeded `travel_expert` account with an existing authored Ready-Made build
used for the Workstation `embedded` check (the `test-expert-kyoto@traveloure.test` account named in the
brief does not exist in this seed set).

**Fixtures created and deleted** (all confirmed removed by post-cleanup `SELECT count(*)`):
- Trip `c2844d3b-2ac9-45e5-a7fa-6fb5d31ed318` ("Audit Kyoto Trip", 4 itinerary items across 2 days) +
  its `trip_collaborators`/`itinerary_changes` rows.
- Trip `ab795d7a-4c19-40a5-8801-cc52f2346c7d` ("Cold Empty Trip", 0 items, used for F6) + its
  `trip_collaborators` row.
- `itinerary_comparisons` row `audit-comp-1`, `itinerary_variants` row `audit-variant-1`,
  `itinerary_variant_items` rows `audit-vi-1`/`audit-vi-2` (used for F3/F5 since the share/expert-review
  system runs on the AI-comparison-variant model, not the live trip's `itinerary_items`).
- `shared_itineraries` row `audit-share-1` (token `audit-share-token-xyz123`, the F3/F5 fixture).
- Two `trip_collaborators` rows were inserted manually to work around F1 and continue testing past it;
  both were deleted along with their trips.

Screenshots referenced above live alongside this report in `docs/audits/plancard-audit-assets/`.
