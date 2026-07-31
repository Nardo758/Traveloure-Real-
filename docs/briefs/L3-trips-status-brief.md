# Lane 3 decision brief — `trips.status`: own the lifecycle, or derive-and-retire?

**Date:** Jul 31, 2026 · **Status:** AWAITING DECISION-MAKER CALL — no code until one option is picked.
**Source finding:** Trip-Gravity Audit `[P2] [D] [S17×L6]` — "dead lifecycle field with a believing reader."

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
