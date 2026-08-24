# L10 — Owner under-grant + owner-less trips (Fable-designed, Jul 30 2026)

**The user-visible symptom, and why this is the highest-priority non-security item:** a traveler who **buys a
ready-made trip** lands on the Trip Card they just paid for and gets `403 Access denied`. Same class for a
cart-checkout auto-trip and a saved-trip conversion. Meanwhile the *same user in the same session* can
successfully add itinerary items, anchors, transport legs and budget rows to that trip — because those endpoints
use a different authorization chain. Full ground truth: the L7/L20 phase-0 audits + CLAUDE.md §13
("Trip-access model divergence + owner under-grant").

**Dispatch order: this lane runs AFTER L20 Phase 1 lands** — Phase 1 creates the canonical advisor predicate
(`pending|accepted|assigned` pass, `rejected`/unknown deny) and this lane's `getTripRole` change must sit on top
of the fixed predicate, never the status-blind one.

## Root cause (two independent halves — fix both or the bug returns)

1. **The read side under-grants.** `server/utils/trip-role.ts` `getTripRole` queries ONLY `trip_collaborators`
   and `trip_expert_advisors`. **It never reads `trips`.** So a trip's own owner (`trips.userId`) resolves to
   `null` and is refused by the 4 live "model A" gates:
   - `GET /api/trips/:tripId/plancard` (`plancard.routes.ts`)
   - `PATCH /api/transport-legs/:legId/status` (`plancard.routes.ts`) — **no author fallback at all here**
   - `PATCH /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts`)
   - `DELETE /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts`)
2. **The write side mints owner-less trips.** `storage.createTrip` now writes the owner `trip_collaborators`
   row, but **three live paths bypass it entirely** (all raw SQL): `ready-made-purchase.service.ts:69-80`
   (the buyer's clone — the headline victim), `booking.service.ts:93-96` (cart-checkout auto-trip), and
   `booking.service.ts:993-1002` (saved-trip conversion). `seedTripOwnership` only repairs them at the next boot.
   `createTrip`'s own trip-insert and collaborator-insert are also **not in one transaction**, so a crash between
   them still yields an owner-less trip.

## Ratified design

**A. Add an owner branch to `getTripRole`, as a ROW-VALUE comparison.** Read the trip and return `"owner"` when
`trips.userId === callerId`. **It must compare row values, never a platform-role string** — the historical
platform-role short-circuit was a real over-grant and is already fixed (`trip-role.ts:4-7`); do not reintroduce
that shape. Order the lookups so the common path stays cheap, and reuse the trip row the caller already fetched
where one is in hand (e.g. `plancard.routes.ts` already calls `storage.getTrip`).

**B. Do NOT fold authoring into `getTripRole`.** `trips.authorId` keeps its own explicit `isTripAuthor` branch.
Rationale: the ready-made authoring brief deliberately made authorship a separate, named check, and an author is
not an owner — collapsing them would be a semantic widening for no benefit. Only the OWNER under-grant is fixed
here. Consequence: the parallel `isTripAuthor` branches at the plancard read and the two per-item gates stay.

**C. Rewrite the four "known pre-launch bypass" comments** (`trip-authorship.ts:10-12`,
`trip-logistics-auth.ts:35-36`, `plancard.routes.ts:130-133`, `trips.routes.ts:3134-3135`). They currently say
"never route owner/author auth through `getTripRole`". After (A) that is **half-false**: the reason the rule
existed — the helper under-granted the owner — is gone for owners, while the author half still stands. Update
them to state exactly that, or the codebase starts lying to the next reader. **This is a deliberate, recorded
override of a rule set by a prior brief** (documented here + in CLAUDE.md §13); it is a bug fix restoring
intended behavior — an owner must be able to open their own trip — not a policy change.

**D. Harden the write side.** Make the three bypass paths create the owner collaborator row (idempotently,
`ON CONFLICT DO NOTHING`, matching `createTrip`'s posture), and wrap `createTrip`'s trip+collaborator inserts so
a partial failure cannot leave an owner-less trip. Keep `seedTripOwnership` as the repair backstop. **Both halves
matter:** (A) alone makes access correct even for rows the writes miss; (D) alone would leave model A refusing any
owner whose row is missing for any other reason. Together they are belt-and-braces on a bug that has already
escaped three times.

**E. Explicitly NOT in scope** (record, don't build): converging model A onto `authorizeTripLogistics` (it would
inherit a different grant set and the audit warns against it); creating `expert`/`friend` collaborator rows (that
is L20 Phase 2's invite→accept plumbing); `trips.managedByEaId` (zero production writers — an inert column).

## Verification bar

Real booted server + real Postgres. Users: OWNER-with-collaborator-row, **OWNER-WITHOUT-row (the bug)**,
STRANGER, ASSIGNED-EXPERT, REJECTED-ADVISOR, AUTHOR, ADMIN.
1. **The headline case, end to end:** run the real ready-made purchase so the buyer's trip is created by
   `ready-made-purchase.service.ts`, then `GET .../plancard` as the buyer → **200, not 403**. Prove it 403s on
   the pre-fix code (baseline) and passes after.
2. A bare owner (row deleted to simulate the three bypass paths + pre-fix trips) passes all **4** model-A gates.
3. **No widening:** STRANGER still denied on all 4; **REJECTED-ADVISOR still denied** (proves this lane sits on
   L20 Phase 1's fixed predicate and did not resurrect the status-blind over-grant); ADMIN unchanged.
4. The 3 write paths now create the owner row (assert the row exists immediately after each, without a reboot);
   `createTrip` still idempotent; re-running `seedTripOwnership` is a no-op.
5. Model B/B′/C endpoints behave exactly as before (spot-check add-item, anchors, budget) — this lane must change
   nothing there.
6. Gates: tsc no new errors in touched files; build; both CI guards green.

## Files
`server/utils/trip-role.ts` (owner branch), `server/storage.ts` (`createTrip` atomicity),
`server/services/ready-made-purchase.service.ts`, `server/services/booking.service.ts` (×2 sites), and the four
comment sites. Tier: **Opus**, with Fable reading the `getTripRole` diff line by line before it lands.
