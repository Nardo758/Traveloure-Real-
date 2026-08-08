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

## 3. Architecture — collect → **optimize (paid)** → materialize

Per the §5b ruling, segmentation lives **inside** the optimization. The traveler pays once to ask
*"how should this be executed?"*, and the number of trips is part of the answer.

| Stage | What it is | Status |
|---|---|---|
| **Collect** | Items land in a user-scoped pool with no trip commitment. Today's `cart_items`. | **exists** |
| **Date input** | A light, non-blocking date range on the *collection*, not on a trip. | partially exists (body dates / `TripContext`) |
| **Optimize** — *one fee* | The traveler pays once. The run returns the optimized plan **and** the execution recommendation (1..N trips). | fee + payment **exist**; the segmentation step is **new** |
| **Materialize** | Apply the recommendation: create the trips, assign items. **Never re-charged** (§5b derived-trip rule). | **exists** (resolve-trip steps 6-7, needs to loop) |

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

## 5b. Where the AI-optimization fee sits — ONE fee  (decision-maker, Aug 8 2026)

> **RULING (supersedes the per-trip fee sketch previously in this section).** *"The user simply
> selects the items and the AI optimization recommends the segmentation or the road trip — basically
> how to execute the trip. So there should be **one** AI optimization fee charged."*

**Segmentation is an OUTPUT of the optimization, not a step before it.** "How should this be
executed — one trip, two trips, or a road trip?" is part of what the traveler is buying. This is the
correct model and it simplifies the design in three ways:

1. **One fee, charged once**, on the Slip the traveler optimizes.
2. **The proposal screen is a POST-payment result surface**, not a free pre-step. The traveler has
   already paid when they see it.
3. **The multi-trip fee problem dissolves.** Trips born from a recommendation the traveler already
   paid for are **never re-charged** (see the derived-trip rule below).

### The flow

```
select items ──► they land in the working Slip ──► set travel dates
      │
      └──► "Optimize" on the Slip ──► ONE fee, paid ──► AI runs
                                                          │
                          ┌───────────────────────────────┘
                          ▼
            optimized plan  +  execution recommendation
            (one trip · split into N · multi-city · road trip)
                          │
                          └──► traveler applies it ──► Slip splits into N Slips if recommended
```

**Pay-before-result is unchanged** — the fee is paid at the optimize click, before results are shown.

### Why no server change is needed

All three optimization endpoints are **already keyed to a trip**
(`server/routes/optimization.routes.ts`):

| endpoint | line | keyed on |
|---|---|---|
| `GET /api/optimization-fee` | :133-145 | `tripId` (or `userExperienceId`) |
| `POST /api/optimization-payments` | :225-239 | `tripId` (or `userExperienceId`) |
| `POST /api/optimization-payments/confirm` | :389 | the payment intent |

The fee is resolved per trip by `resolveTargetFromDb(tripId, …)` (:176-183) from that trip's
`eventType` and owner. Because the traveler optimizes **one** working Slip, that is **one** `tripId`
and therefore **one** fee — the existing contract already produces the ruled behavior. The cart was
never the unit of pricing; the trip always was. Today's pay panel on `/cart` is an artifact of where
the optimize *button* lives, not of how the money is scoped.

### The derived-trip rule (new, must not be weakened)

**A trip created by applying an optimization recommendation must never trigger a second optimization
fee for that same recommendation.** The split is the delivery of a paid result, not a new purchase.

Concretely: when the recommendation materializes N trips, those trips are born already carrying the
optimization they came from. A later, *fresh* optimization run on one of them is a new purchase and
charges normally — but applying the original recommendation must not.

This needs an explicit guard, because the fee endpoints key on `tripId` and a freshly-minted child
trip is, to them, just another chargeable trip. Getting this wrong charges the traveler twice for one
result, which is a §14/§15 class defect (a charge with no corresponding purchase decision). The
proof obligation for C4: **materialize a `split` recommendation and assert exactly one
`optimization_payment` exists across the parent and all children.**

### Where the pay modal sits

**On the Slip**, at the optimize CTA. `SlipView.tsx` is already half-wired for this: it renders the
*result* of optimization — the `slip-optimized-badge` (gated on a real `variant_applied` diary row)
and optimizer-attributed rows via `suggestedBy === "ai"` — but has **no trigger to run one**. It
displays the outcome of an action it cannot invoke. Adding the CTA and its pay step closes the loop,
and is a pure client change.

With a saved card this is one click end to end: **Optimize → off-session charge → results**, no
modal. `chargeSavedMethod` (`optimization.routes.ts:295`) already exists to serve it — this is the
streamlined path originally asked for, preserved intact.

Amounts stay server-derived (§14 — never `req.body`) and sourced from `fee_bands` (§8).

### One honesty consequence for `road_trip`

Because the traveler is now **paying** for the execution recommendation, the quality bar on that
recommendation is higher, not lower. Per §6b the geo data cannot support real route ordering yet.
**An optimization that has been paid for must not answer "road trip" on centroid-precision data** —
recommending badly is worse than not recommending. Until geo coverage supports it, `road_trip` stays
out of the engine's output vocabulary rather than shipping as a guess.

---

*Superseded detail, retained so the reasoning is auditable:* an earlier draft of this section
proposed a fee per materialized trip, on the grounds that the endpoints are trip-keyed and each
trip's `eventType` can price differently. The ruling above replaces it — the traveler buys one
answer to one question, and the number of trips in that answer is the AI's finding, not a
multiplier on the price.

All three optimization endpoints are **already keyed to a trip, not to a cart**
(`server/routes/optimization.routes.ts`):

| endpoint | line | keyed on |
|---|---|---|
| `GET /api/optimization-fee` | :133-145 | `tripId` (or `userExperienceId`) |
| `POST /api/optimization-payments` | :225-239 | `tripId` (or `userExperienceId`) |
| `POST /api/optimization-payments/confirm` | :389 | the payment intent |

The fee itself is resolved per trip — `resolveTargetFromDb(tripId, …)` (:176-183) reads the trip's
`eventType` and owner, and the fee follows from that. **The cart was never the unit of pricing; the
trip always was.** Today's placement of the pay panel on `/cart` is an artifact of the cart being
where the optimize button happens to live, not of how the money is scoped.

**The Slip is already half-wired for this.** `SlipView.tsx` renders the *result* of optimization —
the `slip-optimized-badge` (Spec B, gated on a real `variant_applied` diary row) and
optimizer-attributed rows (`suggestedBy === "ai"`). What it has **no** trigger for is *running* one.
The Slip displays the outcome of an action it cannot invoke. Moving the optimize CTA and its pay
step onto the Slip closes that loop, and is a pure client change.

### The consequence that needs a ruling: one fee per trip

If segmentation produces **two** trips, it produces **two** optimization fees — and, because the fee
is derived from each trip's own `eventType`, they may legitimately be **different amounts**.

**This makes the mockup's single "Accept & optimize" button wrong under multi-trip**, and that button
should be corrected before C3 is built. Accepting a *structure* and paying for *optimization* are two
decisions; fusing them works only in the single-trip case.

**Proposed shape:**

| case | flow |
|---|---|
| 1 trip, saved card | **one click.** Accept → off-session charge → results. No modal. This is the streamlined path already asked for, and `chargeSavedMethod` (`optimization.routes.ts:295`) already exists to serve it. |
| 1 trip, no saved card | Accept → land on the Slip → pay panel on the Slip → results. |
| N trips | Accept creates N trips. **No charge at accept.** Each Slip carries its own optimize CTA, its own server-derived fee, and its own pay step. |

Rules this must not break: **pay-before-result stands** (decision-maker ruling, unchanged — the fee
is paid before AI results are shown). The amount is **server-derived** from the trip (§14 — never
`req.body`), and the fee comes from `fee_bands`, never a literal (§8). Charging once and optimizing
two trips, or charging per trip without showing each amount before the click, both violate the first
of those.

**Open question for C1 (add as decision 5):** on a multi-trip acceptance, is optimization offered
per-Slip on demand (proposed above), or should the traveler be able to pay for all segments in one
action? The latter is friendlier but needs a defined behavior when one segment's charge succeeds and
another's fails — which is a §15 partial-commit problem, and the reason the per-Slip default is
recommended.

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

> **RULED (decision-maker, Aug 8 2026): OPTION B — "so it's done right."** One trip, ordered
> `trip_segments` rows; `trips.destination` survives as the display label only. Standing
> obligations that follow: the table and every index on it are declared in `shared/schema.ts`
> (deploy-push trap); no DB CHECK (publish trap) — ordering and vocabulary enforced app-side;
> its insert schema is born `.pick()`-based (§19); and every consumer that assumes ONE
> destination per trip is enumerated BEFORE the migration is cut — the full consequence map,
> expert-delivery through Trip-Card delivery, lives in
> `docs/findings/TRIP_SEGMENTS_B_CONSEQUENCE_MAP.md`.

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
| **1** | Segmentation engine (`single` / `multi_city` / `split`) as part of the **optimization run**, not a pre-step; proposal DTO; `unplaced` surfaced. The city histogram it consumes is the one resolve-trip already computes (§2). | reversible: strategy `single` = today's behavior byte-for-byte |
| **2** | Optimize CTA + pay step on the Slip (§5b); recommendation shown as a **post-payment result**; accept / merge / split / move; override persistence. | |
| **3** | Multi-city + `split` materialization per §6a option A, **with the derived-trip no-recharge rule and its one-payment proof** (§5b). | |
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
~~5. Multi-trip optimization fees~~ — **RULED, no longer open.** One fee, charged once at the
   optimize click; trips derived from the recommendation are never re-charged (§5b).

## 9. Non-goals

- Not building a multi-trip picker (segmentation replaces the need).
- Not making `trips` dates nullable.
- Not renaming any `/api/cart/*` route or DB object (see the vocabulary inventory's DO-NOT-RENAME list).
- Not inferring coordinates for content that has none.
