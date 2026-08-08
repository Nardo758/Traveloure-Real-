# Trip Segmentation — design brief

**Status:** proposal, awaiting decision-maker sign-off. No code changed.
**Date:** 2026-08-08 · **Branch:** `claude/sync-local-repo-2j7ghv`
**Supersedes:** the "trip-first add" direction scoped in `docs/findings/TRIP_SLIP_FIRST_PHASE0_AUDIT.md`
(that audit's findings still hold; its *conclusion* is replaced by this brief — see §7).

---

## 1. Premise (decision-maker, Aug 8 2026)

Two statements set the design:

1. **"The platform revolves around finding the best content for your trip."** Discovery is the
   product. Therefore collecting content must never be gated behind *"which trip is this for?"* —
   the question interrupts the thing the platform is actually for.
2. **"How do we architect it to work both ways… as long as we have a user travel date input, the
   AI optimization should be able to let the user know the best way to map the trip — one trip,
   two, or a road trip."**

Statement 2 is the load-bearing one. It moves *"which trip does this belong to?"* from a question
the **traveler** answers at add-time to a question the **optimizer** answers at plan-time.

## 2. The finding this rests on

`POST /api/cart/resolve-trip` (`server/routes.ts:5625-5794`) **already computes the segmentation
input, then discards it.**

Step 3 (`server/routes.ts:5670-5684`) builds a full city histogram across the collection:

```
const cityCounts: Record<string, number> = {};
for (const item of items) {
  const city = (item.contentMeta as any)?.city || item.service?.location || null;
  if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
}
for (const ext of externalItems) {
  if (ext.city) cityCounts[ext.city] = (cityCounts[ext.city] || 0) + 1;
}
const destination = Object.entries(cityCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || …
```

It then takes `[0]` — the modal city — and calls that "the destination." Step 7
(`cartProjection.attachTripToCartItems`) attaches **every** item to that one trip.

**Consequence today:** a collection of 6 Kyoto items and 4 Osaka items silently becomes a Kyoto
trip, and the Osaka items ride along mislabeled. The information needed to do better is present
and thrown away on the same line it is computed.

Dates are inferred in the same handler (step 4, `routes.ts:5687-5703`): explicit body dates win,
else the earliest `scheduledDate` across platform + external items, else `today + 30d`; end date
is the explicit body end, else `start + 7d`.

**Segmentation is therefore not a new pipeline. It is: stop calling `[0]`, cluster instead, and
materialize N trips rather than 1.**

## 3. Architecture — collect → segment → materialize

| Stage | What it is | Status |
|---|---|---|
| **Collect** | Items land in a user-scoped pool with no trip commitment. Today's `cart_items`. | **exists** |
| **Date input** | A light, non-blocking date range on the *collection*, not on a trip. | partially exists (body dates / `TripContext`) |
| **Segment** | Cluster the collection into 1..N proposed trips. Returns a **proposal**, never a commitment. | **new** |
| **Materialize** | Create the accepted trips, assign items, hand off to the optimizer. | **exists** (steps 6-7, needs to loop) |

### Why this resolves the audit's blocker

The Phase 0 audit found three `NOT NULL` constraints that made trip-first-at-add expensive:
`itinerary_items.tripId` / `.dayNumber`, and `trips.startDate` / `.endDate` / `.destination`.

Under collect → segment → materialize, **none of them are a problem**: items only become
`itinerary_items` *after* segmentation has chosen a trip and a day. No nullable-dates migration,
no trip mint at first add, and — critically — **no multi-trip picker UI**, which the audit named
as the single largest net-new surface. The optimizer answers "which trip," so the traveler never
has to.

## 4. "Both ways" — already legal in the data model

This needs no new schema. `cart_items.tripId` is **nullable** (`shared/schema.ts`, cart_items), and
resolve-trip step 2 (`routes.ts:5660-5667`) already short-circuits on it:

```
const existingTripId = items.find((i) => i.tripId)?.tripId ?? req.body.tripId;
if (existingTripId) { … if (trip.userId === userId) return res.json({ tripId, created: false, trip }); }
```

So both modes are already representable rows:

- **Open collect** — `tripId IS NULL`. Browse, gather, decide later. Segmentation runs.
- **Targeted add** — `tripId` set. "Add this to my Japan trip." Segmentation is skipped entirely
  (the short-circuit above already does this, and is ownership-checked).

Only the UI currently forces a single path. **We are not architecting for both ways; we are
un-suppressing the mode that already exists.**

> ⚠️ Note carried from the Phase 0 audit: `POST /api/cart` accepts `tripId` from `req.body` with no
> ownership check (`routes.ts:5794` → `storage.addToCart`'s `tripId: item.tripId`). This is contained
> today because `syncItemProjection` derives the owner from `trips.userId`, never from the caller. The
> targeted-add UI must go through an ownership-checked path (the `isTripOwner` pattern in
> `routing.routes.ts:109-123`), not this one.

## 5. The segmentation contract

**Input** (all already assembled at `routes.ts:5670`):
- the city histogram over platform items + `externalItems` (client-side affiliate/AI descriptors,
  capped at 50, each carrying an explicit `city` — `routes.ts:5631-5641`)
- the traveler's date range (explicit, or inferred per step 4)
- per-item `scheduledDate` where present
- party size (step 5)

**Output** — a *proposal*, persisted nowhere until accepted:

```
{
  strategy: "single" | "multi_city" | "split" | "road_trip",
  rationale: string,              // shown verbatim to the traveler
  confidence: "high" | "low",     // low ⇒ present alternatives with equal weight
  segments: [{
    destination: string,
    startDate: string, endDate: string,
    itemIds: string[],            // platform cart_items.id
    externalIndexes: number[],    // positional, external items have no ids
    unplaced: string[]            // items with no resolvable city — NEVER silently dropped
  }],
  alternatives: Proposal[]        // at least one when confidence is "low"
}
```

**Rules the engine must obey:**

1. **Propose, never commit.** Nothing is written until the traveler accepts. The proposal is a
   pure function of the collection — re-runnable, no side effects. (Mirrors the existing
   projection contract: *"the reconciler is re-runnable"* — `server/routes/routing.routes.ts` header.)
2. **Every item is placed or explicitly `unplaced`.** An item with no resolvable city must surface
   in the UI as needing a decision. Silently attaching it to the modal city is the bug we are
   fixing; doing it inside a smarter-looking engine is the same bug.
3. **Override always wins.** The traveler can merge segments, split them, or move an item, and the
   engine must not re-cluster over that choice on the next run.
4. **No fabricated geography** (§6).
5. **Server-derived.** The strategy and the segment assignment are computed server-side from the
   collection. A client-supplied `strategy` or `segments` must never be trusted — same posture as
   CLAUDE.md §14, applied to planning rather than money.

## 6. The two real gaps

### 6a. Multi-city has no home in the schema

`trips.destination` is a single `NOT NULL varchar(255)`, and there is **no** trip-segments or legs
table. (The `segments` jsonb at `shared/schema.ts:6802` belongs to `ea_travel_arrangements` and is
unrelated.) Three options, decision required:

| Option | Shape | Cost | Note |
|---|---|---|---|
| **A. N linked trips** | one `trips` row per city, joined by a parent/group id | additive nullable column; no CHECK | cheapest; each city keeps a working Slip today |
| **B. `trip_segments` table** | one trip, ordered segment rows | new table + schema decl | the "right" model; largest change |
| **C. Label + route blob** | keep `destination` as primary label, store the route in jsonb | smallest | re-creates the unstructured-jsonb problem the codebase has been retiring |

Recommendation: **A** for phase 1 (it composes with everything that exists today), with B as the
migration target once multi-city proves out. Either way the new object must be declared in
`shared/schema.ts`, per the CLAUDE.md deploy-push trap.

### 6b. Geographic precision does not support road-tripping yet

`cart_items` carries **no geo columns at all**. City resolution comes from `contentMeta.city` (a
display-only jsonb field) or `service.location` (a plain string). Real coordinates exist only on
`provider_services` (migration 129), and that migration deliberately stamps `location_precision`
as `'neighborhood_centroid' | 'exact'` because the team chose **not** to fabricate coordinates.

Therefore:

- **City-string clustering works today** — `single`, `multi_city` and `split` are all buildable now.
- **`road_trip` is not.** Ordering stops along a driving route needs real coordinates and
  travel-time between nodes. Centroid-precision data will produce confident-looking nonsense —
  the exact failure mode `location_precision` was introduced to prevent.

**`road_trip` is gated on geo coverage and ships separately.** It should not be bundled into
phase 1 to make the feature sound complete.

## 7. Phasing

| Phase | Scope | Ships |
|---|---|---|
| **0** | Decisions in §8. No code. | — |
| **1** | Segmentation engine (`single` / `multi_city` / `split`) behind resolve-trip; proposal DTO; `unplaced` surfaced. Existing single-trip behavior stays the default when the histogram has one dominant city. | reversible: strategy `single` = today's behavior byte-for-byte |
| **2** | Proposal UI — accept / merge / split / move; override persistence. | |
| **3** | Multi-city materialization per §6a option A. | |
| **4** | Targeted-add mode un-suppressed in the UI (ownership-checked path). | |
| **5** | Vocabulary rename (`docs/findings/CART_VOCABULARY_INVENTORY.md`) — deliberately last, so naming follows settled behavior. | |
| **6** | `road_trip`, gated on a geo-coverage assessment. | |

Phase 1 is safe to ship dark: if the engine returns `strategy: "single"` it must produce exactly
today's trip, which makes it verifiable against the existing journey suite before any UI changes.

## 8. Decisions needed before phase 1

1. **Multi-city shape** — §6a option A, B, or C.
2. **Where does the date input live?** A range on the collection needs a home. Options: extend
   `TripContext` (exists, single global slot), or a new lightweight collection-scoped record.
3. **Default when confidence is low** — propose the split and let the traveler collapse it, or
   propose one trip and offer the split? (Affects whether the feature feels helpful or bossy.)
4. **Does `unplaced` block materialization**, or can a traveler proceed and resolve later?

## 9. Non-goals

- Not building a multi-trip picker (segmentation replaces the need).
- Not making `trips` dates nullable.
- Not renaming any `/api/cart/*` route or DB object (see the vocabulary inventory's DO-NOT-RENAME list).
- Not inferring coordinates for content that has none.
