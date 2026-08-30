# Lane 3 decision brief — `trips.status`: own the lifecycle, or derive-and-retire?

**audited@80d00ea7** (2026-07-31) — volatile claims as-of that SHA. Decision = DECISIONS.md ruling 2.
**Date:** Jul 31, 2026 · **Status:** RATIFIED Jul 31, 2026 — Option B (derive-and-retire).
**Source finding:** Trip-Gravity Audit `[P2] [D] [S17×L6]` — "dead lifecycle field with a believing reader."

## Shipped (Option B, this lane)

- **Admin trips dashboard** (`server/routes/admin.routes.ts` `GET /api/admin/trips`) now derives
  per-trip phase and the `stats` counts from `startDate`/`endDate` vs now (`upcoming` / `active` /
  `past`), mirroring the convention every traveler-facing renderer already uses
  (`client/src/pages/my-trips.tsx`). `trips.status` is no longer read anywhere in this endpoint —
  not for the per-trip display field, not for the counts, not for the `?status=` filter (which
  previously ran `eq(trips.status, status)` against values the client never actually sent, so it
  silently always returned zero rows for "active"/"pending"). Client consumer
  (`client/src/pages/admin/plans.tsx`) updated to the same honest vocabulary — no more
  `mapStatus` remap, no fabricated "pending"/"completed" buckets.
- **Sweep found two more live believing readers, also fixed** (in scope per this lane's own
  "fix decision-makers found during the sweep" instruction):
  - `server/routes/customers.routes.ts` (`GET /api/me/customers`) computed `hasActiveTrip` /
    the `active_trip` relationship chip from `LIVE_TRIP_EXCLUDED.has(trips.status)` — since
    `trips.status` never reaches `completed`/`cancelled`, every assigned trip was permanently
    "active" regardless of whether it had already happened. Now derived from `endDate >= now`.
  - `client/src/pages/executive-assistant.tsx` (`/executive-assistant`) had the exact admin-dashboard
    bug independently: `stats.active`/`stats.completed`/`stats.draft` computed from `trips.status`
    (`completed` structurally always 0). Now derives `upcoming`/`active`/`past` from dates, same
    as the admin dashboard; the "drafts awaiting completion" alert (which read the same dead
    `draft` bucket) now surfaces upcoming-trip count instead.
  - `client/src/components/curated-content-section.tsx` and
    `client/src/components/add-to-experience-dialog.tsx` ("Add to a Trip" pickers) filtered
    candidate trips on `["planning","draft","confirmed"].includes(trips.status)` — a permanent
    no-op (nothing is ever NOT in that set), so a trip whose dates had already passed still
    appeared as a valid target to add items to. Now filtered on `endDate >= now`.
- **Left as pass-throughs (report only, not fixed — they echo the stored value, they don't
  decide anything from it):** `server/services/trip-plan.service.ts` (`TripPlanMeta.status` and
  `plancard.trip.status`, both unused by any client consumer), `server/routes/ready-made.routes.ts`
  `GET /api/expert/ready-made/builds` (`status` field on the response, typed client-side but never
  read — the chip logic actually keys off `listingStatus`), `client/src/pages/shared-trip.tsx`,
  `client/src/pages/trip-details.tsx`, `client/src/components/travelpulse/CityGrid.tsx` (raw
  `{trip.status}` badge text), `client/src/pages/expert/workspace.tsx:1330` (`AssignedTrip.status`
  populated for the authoring-mode shape but never read), `server/routes/customers.routes.ts`
  `CustomerTripItem.tripStatus` (still echoed to the client `StatusBadge` for display — only the
  `hasActiveTrip` *decision* was fixed, per-item raw-status display was left as-is), and
  `client/src/components/trip-card.tsx` (`TripCard`) — this last one is dead code, no importers
  anywhere in the app; its `trip.status === 'draft' ? … : trip.status === 'planned' ? … : 'Completed'`
  ternary is also independently broken (the enum value is `planning`, not `planned`, so that branch
  never matches) but it never runs.
- **Found, not fixed, filed as a low-priority follow-up:** `storage.getTrips(userId, status)` /
  `getAdminTripsList(search, status)` both accept an optional `status` filter that runs
  `eq(trips.status, status)`; `getAdminTripsList` has zero callers (dead), and `getTrips`'s status
  branch is reachable (`GET /api/trips?status=`) but no client ever sends that query param today —
  so both are latent, not live. Leaving them as-is (no schema/route change); a future caller that
  wants to filter `GET /api/trips` by phase should filter on dates, not resurrect this branch.
- **`trips.status` itself:** left physically in place, still write-once `draft`/`planning` at
  creation — no schema change, no migration (deliberately, per Option B). Do-not-read/do-not-write
  note added to `shared/schema.ts` next to the column, and to CLAUDE.md §13 (see the draft entry in
  the Lane 3 PR/report — Fable places the final wording).

## The facts (ground-truthed Jul 31)

- `trips.status` (`shared/schema.ts:80`) is `varchar(20) NOT NULL DEFAULT 'draft'`, vocabulary
  `tripStatusEnum = draft | planning | confirmed | completed | cancelled` (schema.ts:12). No DB CHECK.
- **Writers:** creation paths only (born `draft` or `planning` depending on the path). **Nothing ever
  advances it** — no code path writes `confirmed`, `completed`, or `cancelled`. `storage.updateTrip`
  *could* pass it through (`Partial<InsertTrip>`), but no live endpoint sends a `status` field.
- **Readers:** every traveler-facing renderer **ignores it** and derives phase from dates (upcoming/
  live/past). The ONE believing reader is the admin trips dashboard (`admin.routes.ts:~4088`): its
  `statusCounts` treats the field as a real lifecycle — `active = planning|confirmed`,
  `pending = draft`, and a `completed` count that is **structurally always ~0** because nothing
  writes it. The admin dashboard's numbers are wrong today, permanently.
- The audit's transition map: L4→L5 (planning→live) and L5→L6 (live→past) are **UNOWNED** — but low
  harm, because date-derivation already answers "what phase is this trip in" everywhere it matters.

## Option A — own the lifecycle (build the writers)

Define transition owners and write them: e.g. `planning` at first itinerary item, `confirmed` at
first paid booking, `completed` when `endDate` passes (needs a scheduler tick or read-time repair),
`cancelled` on an explicit traveler action (which today has no surface). Keep the admin reader as-is.

- **For:** the field becomes real; future features (post-trip review prompts, rebooking, L7
  afterlife) get a queryable lifecycle instead of re-deriving.
- **Against:** it's a real feature build (a scheduler or repair-on-read, a cancel surface, edge
  cases like date changes moving a trip back out of `completed`), for which **no current consumer
  exists** except the admin stat that Option B fixes in one hunk. It also creates a second source
  of truth alongside date-derivation — the two can disagree (the exact class of bug this program
  exists to remove). The deferred P3 inventory (L7 afterlife) is the honest future customer; it can
  ratify its own lifecycle needs when it's pulled.

## Option B — derive-and-retire (RECOMMENDED)

Fix the one believing reader: the admin dashboard derives phase the same way the renderers do
(dates + real bookings), so its counts become true. Document `trips.status` as a dead field
(CLAUDE.md §13-style "do not read, do not write" note); leave the column physically in place —
write-once `draft` — with **no schema change** (dropping a column is its own decision + deploy-push
consideration, deliberately not bundled).

- **For:** one small hunk closes the only live harm (wrong admin numbers). One source of truth
  (derivation) — matches how the whole platform already behaves. Zero new machinery, zero new
  unowned transitions. Reversible: if the L7-afterlife lane later needs a real lifecycle, Option A
  can still be built then, by a consumer that actually needs it.
- **Against:** the enum stays as an attractive nuisance for future authors (mitigated by the
  documented do-not-read note + the field staying visibly `draft` everywhere).

## The ask

Pick A or B. B is recommended: it removes the live defect at minimal cost and defers lifecycle
ownership until a real consumer (L7 afterlife) exists to shape it. If B: Sonnet lane, one PR
(admin derive + CLAUDE.md note). If A: a fuller scope doc follows before any code.
