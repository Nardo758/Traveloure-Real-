# Cart-Slip Delta Audit

**Task 1668.** Reconciles the new "cart is the view of slip items with `routing_status =
ready_for_checkout`" ruling framing against the codebase as it actually stands. That framing is
**not itself in `docs/DECISIONS.md`** (checked — no `2026-08-27-cart-is-slip-checkout` entry, nor
any entry using its "plan (N items · $X planned) + Checkout" wording); it is a forthcoming
proposal restated by the task brief. The ratified mechanism it is being checked against is:

- `docs/briefs/ROUTING_STATE_CONTRACT.md` (§2 contract matrix, §3 locked decisions) — declares
  who may write each `routing_status` transition.
- `docs/briefs/SLIP_EXPERIENCE_DISPATCH.md` (§0 problem statement, §3 Lane S, §4 rendering specs,
  §4 surface-disposition table) — declares the slip/cart/checkout surface model.
- `server/services/cart-projection.service.ts` — the single writer of `cart_items`, the
  mechanism that actually implements "cart = projection of `ready_for_checkout`".

**Conclusion up front:** the mechanism the new ruling describes already exists and is already
correctly documented (`ROUTING_STATE_CONTRACT.md` §2 row "Projection sync"; `SLIP_EXPERIENCE_DISPATCH.md`
§4 disposition table row "Cart"). What does **not** yet exist is universal use of it — a second,
older "direct add-to-cart" path still runs in parallel and is the majority path for provider
services today (see Q1). The re-scope at the bottom of this doc is built on that gap, not on
building the projection mechanism from scratch.

---

## Q1 — Does each "Add to trip" / "Book now" card type write an `in_planning` item (excluded from
the cart projection) or a `cart_items` row directly?

**Both paths exist today, and which one runs depends on entry point, not card type.** There is no
single answer per card type — the same gem/event/service content can go through either path
depending on which button the user clicks.

### 1a. Feed-card "Add to trip" → `AddToExperienceDialog` (two mutations, one dialog)

`client/src/components/add-to-experience-dialog.tsx` is the single dialog every feed card type
funnels through. It offers exactly two actions, and **the direct-cart action is the primary,
default-styled one; the trip-item action is the secondary "or add to a specific trip" list**:

- **`addToCartMutation`** (`add-to-experience-dialog.tsx:61-96`, button at `:210-230`, testid
  `button-add-content-to-cart`) — `POST /api/cart` with `contentType`/`contentId`/`contentMeta`.
  This is a **direct `cart_items` write** (`storage.createCartItem` → `cart-projection.service.ts:61`
  passthrough funnel, comment: *"Direct add-to-cart (POST /api/cart, POST /api/cart/items).
  Passthrough."*). No itinerary item is ever created. The code comment at `:57-60` states this
  is deliberate: *"feed content items add straight to the CART (the one planning pipeline) — the
  trip/experience question is asked once, in the cart's Trip-details step, not at add-time."*
- **`addToTripMutation`** (`:103-134`, per-trip buttons at `:266-291`, testid
  `button-select-trip-{tripId}`) — `POST /api/trips/:tripId/itinerary-items` with no
  `routing_status` in the payload, so it lands on the schema default `"in_planning"`
  (`shared/schema.ts` `itineraryItems.routingStatus` default). **This item is excluded from the
  cart projection** — `cart-projection.service.ts:145` (`syncItemProjection`'s doc comment):
  *"routing_status = 'ready_for_checkout' ⇒ upsert the projection row … any other status ⇒ delete
  the projection row"* — `in_planning` never gets a `cart_items` row until a later, separate
  routing-status transition (Trip Card "add to checkout", per `ROUTING_STATE_CONTRACT.md` §2 row
  "Traveler UI (W7 Trip Card)": *"Sole writer of `ready_for_checkout`"*).

Card types that reach this dialog with a valid `item.type` (all correctly categorized, all in
the dialog's own union `gem | neighborhood | hotel | activity | event | recommendation` at
`add-to-experience-dialog.tsx:38`):

| Card / source | `type` value | file:line |
|---|---|---|
| Gem card (compact + full) | `"gem"` | `client/src/components/city-feed-card.tsx:987`, `:1111` |
| Event card (compact + full) | `"event"` | `client/src/components/city-feed-card.tsx:1298`, `:1437` |
| Vendor-service card (compact + full) | `"service"` → **bug, fixed this task to `"activity"`** | `client/src/components/city-feed-card.tsx` (was `:1611-1619`, `:1739-1747`; see "Bug fix" below) |
| Discover-location event | `"event"` | `client/src/pages/discover-location.tsx:1329` |
| Dashboard wishlist "+ Trip" | `item.contentType` (pass-through of whatever the saved item was categorized as at save time) | `client/src/components/dashboard/WishlistSection.tsx:110` |

### 1b. "Book now" on a provider service → always a **direct `cart_items` write**, never through
the dialog and never through an itinerary item at all

`service-detail.tsx`'s booking flows post `serviceId` straight to `/api/cart`, bypassing
`AddToExperienceDialog` entirely:

- `addToCartMutation` — `client/src/pages/service-detail.tsx:427-431` — `POST /api/cart` with
  `{ serviceId, quantity, scheduledDate, ... }`.
- `addRoomToCartMutation` (hotel rooms) — `client/src/pages/service-detail.tsx:573-577` — `POST
  /api/cart` with `{ serviceId, checkIn, checkOut }`.

Same pattern elsewhere: `client/src/pages/discover.tsx:1037` (`handleAddToCart` → `POST
/api/cart` with `serviceId`), `client/src/pages/cart.tsx:735-738` (offering-card quick-add → `POST
/api/cart` with `{ serviceId }`), `client/src/pages/trip-details.tsx:374-390` (same pattern).

**None of these create an itinerary item.** They are all the direct-add branch
`cart-projection.service.ts:61` funnels, and they are exactly the rows the module's own invariant
comment (`:40-42`) calls out: *"A cart row with `itinerary_item_id IS NULL` is NOT a projection
(legacy row, guest add, direct add-to-cart, variant apply-to-cart)."*

### Answer

For content cards (gem/event/hotel/activity/recommendation/wishlist), **the user chooses the path
at add-time**: the dialog's primary button writes `cart_items` directly; picking a specific trip
instead writes an `in_planning` itinerary item that the projection sync will not surface in the
cart until a later, separate routing transition. For provider-service "Book now" (the majority
real booking path, since it is the only path on the service detail page itself), **it is always
the direct `cart_items` write** — there is no itinerary-item-first option on that surface at all.

---

## Q2 — What does the TripStrip chip count/display today vs. the ruling's "plan (N items · $X
planned) + Checkout"?

**Today it counts and totals `cart_items` only** — the direct-add / `ready_for_checkout`-shaped
projection rows — **not** the union of `in_planning` + `ready_for_checkout` trip items.

- `client/src/components/trip/trip-strip.tsx` sources its chip from `useQuery(["/api/cart"])`,
  reading the response's `itemCount` and `total` fields directly.
- `GET /api/cart` (`server/routes.ts:7817-7934`) computes:
  - `items = await storage.getCartItems(userId, experienceSlug)` (`:7822`) — queries the
    `cart_items` table exclusively.
  - `itemCount: items.length` (`:7928`) — a straight count of `cart_items` rows.
  - `total: (subtotal + platformFeeTotal + conciergeFeeTotal + surchargeTotal).toFixed(2)`
    (`:7927`) — computed only from those same `cart_items` rows' resolved prices/fees.

There is currently **no read anywhere in this response, or in TripStrip, of `in_planning` trip
items that have not yet been routed to `ready_for_checkout`.** A trip with 6 items still fully
`in_planning` (never sent to checkout) shows a TripStrip cart chip of 0 / $0 today — which is
consistent with `SLIP_EXPERIENCE_DISPATCH.md` §4's disposition-table row "Cart | projection view
of `ready_for_checkout` | none … | Single-writer per W2" (the cart is defined there as narrower
than "the plan"), but is a real behavioral gap against the new ruling's "plan (N items · $X
planned)" framing, which describes counting the broader in-planning set, not just the
checkout-routed subset.

---

## Q3 — Does `migrateGuestCart` cover `in_planning` itinerary items owned by a guest-scoped trip,
or only `cart_items` rows? Does a guest-scoped trip exist today?

**`migrateGuestCart` only ever touches `cart_items` rows, and no guest-scoped trip exists
pre-signup today** — this question is currently moot on the itinerary-item side because there is
nothing to migrate there.

- `storage.migrateGuestCart` (`server/storage.ts:3700-3740`) — `SELECT ... FROM cart_items WHERE
  guest_session_id = $1`, then per-row either dedupes-and-deletes or `UPDATE cart_items SET
  user_id = $userId, guest_session_id = NULL`. It never references `itinerary_items` or `trips` —
  confirmed by reading the full function body; no other table appears in it.
- `trips.userId` (`shared/schema.ts:87`) references `users.id` with `onDelete: "set null"` and has
  no `guestSessionId`/guest-keying column anywhere on the table (confirmed via grep across
  `shared/schema.ts` — no match). A trip cannot exist unowned-by-a-real-user today; there is no
  pre-signup draft-trip concept.
- `cart-projection.service.ts:88-91`'s own doc comment on `migrateGuestCart` states this
  explicitly and cites the same reason: *"that edge does not exist in 1b because guests have no
  trips yet (G2)."* — matching `ROUTING_STATE_CONTRACT.md` §3 decision 3 ("Guest-migrated items
  land `in_planning`, not `ready_for_checkout`") which governs the *cart_items→cart_items*
  ownership handoff, not an itinerary-item migration, because no guest itinerary items exist.

**Today's "guest cart" is entirely `cart_items` rows keyed by `guest_session_id`** (direct adds
from Q1b's service/room booking flows, which are reachable while logged out). There is no guest
itinerary-item path to lose in a migration, because guests cannot create trips or itinerary items
at all pre-signup. This is exactly the dispatch's own `SLIP_EXPERIENCE_DISPATCH.md` note that "no
trip-first add-to-cart, no guest reshape" is out of scope "until guest trips (G2 reshape) exist"
(`cart-projection.service.ts:21-22`) — i.e. the new ruling's implicit assumption of a
pre-existing guest-scoped trip does not hold; G2 (guest draft trips) has to land before that part
of the ruling is even meaningful.

---

## Q4 — Production count of `cart_items` rows with `itinerary_item_id IS NULL`

Read-only query against the production replica:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE itinerary_item_id IS NULL) AS null_itinerary_item_id
FROM cart_items;
```

**Result: `total = 2`, `null_itinerary_item_id = 2`.** Every `cart_items` row that exists in
production today is a legacy/direct-add row (`itinerary_item_id IS NULL`) — there are currently
**zero** projection rows (`itinerary_item_id IS NOT NULL`) live in production.

**Does this block retiring anything?** No — the opposite. With only 2 legacy rows total, there is
no meaningful migration burden to worry about if/when `cart_items`' direct-add role is narrowed;
whatever plan Phase 2-4 settles on for those two rows (leave them, migrate them to a real
itinerary item, or explicitly document them as grandfathered) is a trivial, bounded cleanup, not
a blocker. The more consequential finding is qualitative, not quantitative: because **zero**
production rows are projections, the projection-sync mechanism (`syncItemProjection`) is
effectively unexercised in production today — nobody has yet routed an item all the way to
`ready_for_checkout` in a way that produced a live projection row. That is worth flagging for
Phase 2-4 planning as a "this mechanism is real but not yet load-bearing in prod" caveat, separate
from the retirement question the count itself answers.

---

## Re-scope of dispatch Phase 2-4 against what already exists

The dispatch (task brief, not yet in `DECISIONS.md`) describes Phase 2-4 as: new endpoints
(`POST /api/trips/:id/items`, `GET /api/trips/:id/checkout`), a guest draft-trip reshape, and
`cart_items` retirement. Given Q1-Q4 above:

1. **The core mechanism ("cart = view of `ready_for_checkout` items") is already built and
   correctly documented** — `cart-projection.service.ts` + `ROUTING_STATE_CONTRACT.md` §2 +
   `SLIP_EXPERIENCE_DISPATCH.md` §4's disposition table already say exactly this. **Nothing needs
   to be built for the mechanism itself; this phase step is already done.**
2. **What is NOT done, and is the actual gap Phase 2-4 should target:** the direct-add-to-cart
   path (Q1b, and the dialog's own primary "Add to my trip cart" button in Q1a) is still the
   dominant real-world path and bypasses itinerary items / routing_status entirely. Re-scoped
   as a delta: **re-point the existing direct-add call sites (service-detail.tsx, discover.tsx,
   cart.tsx, trip-details.tsx, and the dialog's primary button) to create an `in_planning`
   itinerary item + immediately route it to `ready_for_checkout`**, rather than building a new
   parallel endpoint. This is a call-site re-point of existing, working machinery, not new
   endpoint design — `POST /api/trips/:id/items` from the dispatch's Phase 2 description is
   largely already served by the existing `POST /api/trips/:tripId/itinerary-items` route; the
   real work is wiring a `routing_status: "ready_for_checkout"` write (or an immediate follow-up
   transition call) onto the existing route/flow, not inventing a new one.
3. **TripStrip's chip (Q2)** needs a small, additive change, not a rebuild: extend its query (or
   `/api/cart`'s response) to also report the count/subtotal of `in_planning` trip items
   alongside the existing `ready_for_checkout` projection count, matching "plan (N items · $X
   planned) + Checkout" as two numbers from two already-queryable sets — no new write path
   required.
4. **Guest draft-trip reshape (Q3)** is a real, not-yet-started piece of work — G2 does not exist
   today. This is correctly still Phase-2-or-later scope; the dispatch should not assume a
   guest-scoped trip already exists when scoping this phase.
5. **`cart_items` retirement (Q4)**: not blocked by data volume (2 legacy rows in prod), but
   should not be scheduled until (a) the direct-add call sites in point 2 are re-pointed (or
   `cart_items`'s direct-add role is explicitly kept as a permanent legacy lane) and (b) the
   projection mechanism has actually been exercised in production at least once — retiring a
   table whose replacement mechanism has zero production mileage is premature regardless of row
   count.

---

## Notes (out of scope for this task, not fixed)

- `AddToExperienceDialog`'s `ExperienceItem.id` field (`add-to-experience-dialog.tsx:34`) is never
  actually populated by any caller in `city-feed-card.tsx` — every call site passes
  `sourceContentId`/`sourceImpressionId` (impression-tracking fields), never `id`. `contentId`
  therefore always falls back to the title-slug (`:64-67`) for every card type, not just the
  vendor-service one this task fixed. This predates and is broader than the assigned bug; flagged
  here as a note per the task's "log it, don't fix it" instruction, not acted on.
- The TripStrip/`/api/cart` gap in Q2 is a real behavioral divergence from the ruling's framing
  but was not touched — it is Phase-2-3 scope, not part of this task's "bugs first" step.
