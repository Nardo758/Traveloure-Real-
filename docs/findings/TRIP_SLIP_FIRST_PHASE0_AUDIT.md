# Trip-Slip-First — Phase 0 Audit (read-only)

**Scope:** what it costs to invert cart-first → trip-first (Trip Slip is the first destination; every add-to-cart
becomes an add-to-trip; cart becomes a pure `ready_for_checkout` filter view). **No code changed.** Every claim
below is file:line-cited against `claude/sync-local-repo-2j7ghv` as read on 2026-08-08. Where the code could not
settle a question, it is marked **UNVERIFIED** rather than guessed.

---

## Verdict

**Feasible, and roughly two-thirds already built — but not small, and not one phase.**

The repo is mid-way through a *related but distinct* rearchitecture (**Trip-Canon Lane 1**, `docs/planning/TRIP_CANON_MASTER_BRIEF.md`) that already made the Trip the canonical container for *routed* items and turned
`cart_items` into a single-writer projection (`server/services/cart-projection.service.ts`). That lane's own
scope doc says outright: **"Entry-point SEMANTICS are explicitly NOT changed in 1b (no trip-first add-to-cart, no
guest reshape — guests have no trips until G2)"** (`server/services/cart-projection.service.ts:21`). Trip-first
add-to-cart is literally the next named, deferred phase of a plan already ratified in principle — it is not a
foreign idea being bolted on.

Three structural facts set the honest floor on how big this is:

1. `itinerary_items.tripId` and `itinerary_items.dayNumber` are **`NOT NULL`** (`shared/schema.ts:3382,3391`).
   An item cannot exist without a trip and a day slot. `cart_items.tripId` and `cart_items.userId` are **both
   nullable** (`shared/schema.ts:1073,1082`) by design, which is *why* cart-first could exist trip-less and
   guest-less in the first place.
2. `trips.startDate`, `trips.endDate`, `trips.destination` are **`NOT NULL`** (`shared/schema.ts:91-93`). There
   is no such thing as a trip without dates in this schema — trip-first does not get to defer that question, it
   inherits the exact same "synthesize honest defaults" problem `POST /api/cart/resolve-trip` already solves
   (`server/routes.ts:5693-5701`, fallback start = now+30d, end = start+7d, `server/routes.ts:5685`
   destination fallback `"Your Destination"`).
3. The **guest-trip-mint machinery already exists** and is more built than the cart-first guest path:
   `POST /api/trips` mints a trip with `userId = null` plus a `shareToken` for unauthenticated callers
   (`server/routes.ts:978-1008`), and a full claim-on-signup loop already exists client-side
   (`client/src/contexts/GuestTripContext.tsx`, `client/src/hooks/use-claim-guest-trips.ts`, wired live in
   `client/src/App.tsx:314`) and server-side (`server/routes.ts:1079-1105`). By contrast, the **guest *cart*
   path that trip-first would supersede is already dead code in production** — see §c.

**Honest size:** this is a multi-phase program on the order of the Trip-Canon Lane 1 program itself (1a–1d took
four gated phases for a *narrower* change — routing status only, no entry-point semantics). Trip-first touches
entry-point semantics for **every** "add" surface in the app (≈9 client call sites, §a), the guest funnel, the
trip-selector UX (which does not exist yet, §e), and a schema change to `trips` dates (§d). It should not be
attempted as a single PR even though a large fraction of the plumbing (routing state machine, projection sync,
claim-a-guest-trip) is already sitting in the repo ready to be reused.

---

## (a) Every cart-item write site

### Server routes — all funnel through `cart-projection.service.ts`

`cart-projection.service.ts` documents itself as **"the single writer of `cart_items`"** (line 2) — every route
below calls one of its passthrough functions, never `storage.*Cart*` directly (enforced by convention, not by a
guard script — see Risk register).

| Route | File:line | Writes | Assumes "no trip yet"? |
|---|---|---|---|
| `POST /api/cart` | `server/routes.ts:5791-5924` | `cartProjection.addToCart` → `cart_items` row (service/venue/content); accepts raw `tripId` from body, **no ownership check** (line 5794, 5912) | Yes — `tripId` is optional, defaults to none |
| `POST /api/cart/items` | `server/routes.ts:4522-4559` | Same shape, older/parallel entry point; also accepts raw `tripId` unchecked (line 4525, 4549) | Yes |
| `GET /api/cart` | `server/routes.ts:5531-5622` | Read-only (fee quote) | — |
| `PATCH /api/cart/:id` | `server/routes.ts:5927-5947` | `cartProjection.updateCartItem` (quantity/date/notes); ownership checked via `existing.userId !== userId` (line 5934) | N/A (edits existing row) |
| `DELETE /api/cart/:id` | `server/routes.ts:5950-5965` | `cartProjection.removeFromCart`; same ownership check (line 5957) | N/A |
| `DELETE /api/cart` | `server/routes.ts:5968-5977` | `cartProjection.clearCart` (bulk) | N/A |
| `POST /api/cart/migrate` | `server/routes.ts:5980-5993` | `cartProjection.migrateGuestCart` → re-owns `guestSessionId` rows to `userId` | Yes, but **unreachable in practice** — see §c |
| `POST /api/cart/convert-to-itinerary` | `server/routes.ts:5996-6093` | **Cross-boundary**: creates an `itinerary_items` row (`storage.createItineraryItem`, line 6068) then removes the cart row (line 6084). Mints a trip on the fly if none given (`storage.createTrip`, line 6013-6023) | Yes — this is literally "the bridge cart-first needs today and trip-first would delete" |
| `POST /api/cart/resolve-trip` | `server/routes.ts:5625-5788` | No cart-item write itself; mints-or-reuses a trip and backfills `tripId` onto existing cart rows via `cartProjection.attachTripToCartItems` (`cart-projection.service.ts:119-128`) | This *is* the "cart existed before the trip" bridge named in the task |
| `POST /api/itinerary-comparisons/:id/apply-to-cart` (+ shadowed `trips.routes.ts` copy) | `cart-projection.service.ts:107-112` → `storage.replaceUserCartWithVariantItems` | Deletes and rewrites the whole cart from an AI-optimization variant; rows carry **no** `itineraryItemId` (comment, `cart-projection.service.ts:104-105`) | Yes |

### The routing-state edge that also writes `cart_items` (not a cart-item write site by name, but the same table)

`POST /api/trips/:tripId/items/:itemId/route` (`server/routes/routing.routes.ts:125-251`) does **not** write
`cart_items` directly — it flips `itinerary_items.routingStatus` and then calls
`syncItemProjection` (`routing.routes.ts:244`, defined `cart-projection.service.ts:155-232`), which is the
**only** function in the codebase that upserts/deletes a `cart_items` row keyed by `itinerary_item_id`. This is
the mechanism §b covers.

### Client call sites (9, all POST/PATCH/DELETE against the routes above)

| Site | File:line | Notes |
|---|---|---|
| Discover feed add-to-cart | `client/src/pages/discover.tsx:683-709` | On 401 falls back to `saveToGuestCart` → localStorage only (`discover.tsx:671-680`) |
| Content-card add-to-cart | `client/src/components/add-to-experience-dialog.tsx:61-84` | States the design intent directly in its own comment: *"the trip/experience question is asked once, in the cart's Trip-details step, not at add-time"* (`add-to-experience-dialog.tsx:57-59`) — this is the exact policy trip-first reverses |
| Service detail page | `client/src/pages/service-detail.tsx:263-271`, `:386-393` | Two mutations (service add, upsell add) |
| Experience-template flow | `client/src/pages/experience-template.tsx:1513-1581` | POST/PATCH/DELETE trio, quantity-aware |
| Trip-details page | `client/src/pages/trip-details.tsx:388-391` | Adds a service while already inside a trip page — i.e. **this one already knows the trip** |
| Cart page itself | `client/src/pages/cart.tsx:344` (guest migration replay), `:557` (convert-to-itinerary), `:588`/`:600` (patch/delete), `:620` (upsell add) | |
| Itinerary-comparison page | `client/src/pages/itinerary-comparison.tsx:764` (apply-to-cart), `:792` (direct add) | |

**Cross-cutting observation for the risk register:** `POST /api/cart` and `POST /api/cart/items` both accept a
client-supplied `tripId` with **no verification the caller owns that trip** (`server/routes.ts:5794`→`5912`,
`4525`→`4549`, and `storage.addToCart` writes it verbatim at `server/storage.ts:2241`). Today this is low-impact
because `syncItemProjection` re-derives the owner from `trips.userId` at sync time and ignores whatever
`cart_items.tripId` says (`cart-projection.service.ts:174-193`, explicit comment: *"the principal is derived
from the record, not from a request"*). **A trip-first first-add endpoint must not repeat this pattern** — it
would be writing directly to `itinerary_items`, which has real routing/ownership consequences per §18/§19; the
correct precedent to copy is `routing.routes.ts`'s `isTripOwner` check (lines 109-123), not `POST /api/cart`'s.

---

## (b) The projection reconciler

**File:** `server/services/cart-projection.service.ts`. Confirmed by direct read, not assumed — the docstring at
line 1 self-identifies as *"CART PROJECTION — the single writer of `cart_items`."*

**What it reconciles:** one `itinerary_items` row's `routingStatus` against zero-or-one `cart_items` row keyed by
`cart_items.itineraryItemId` (`cart-projection.service.ts:150,219-222`). `routing_status = 'ready_for_checkout'`
⇒ upsert a projection row; any other status, or the item no longer existing ⇒ delete it
(`syncItemProjection`, lines 155-232). It is explicitly idempotent and re-runnable (line 148, and the caller
`routing.routes.ts:263-271` swallows its errors on purpose — "projection failure never fails the transition").

**When it runs:** only from `routing.routes.ts` after a successful atomic `routingStatus` flip (`routing.routes.ts:244,189`) — i.e. only on the traveler/expert routing edges, **not** on any of the direct `cart_items` writes
in §a. Those direct writes (`POST /api/cart`, apply-to-cart, etc.) bypass `syncItemProjection` entirely and write
`cart_items` rows with `itineraryItemId = NULL` — the module's own contract calls these **"NOT a projection"**
(line 40-43) and guarantees it never touches them.

**Two populations coexist in `cart_items` today**, and the module is careful to only own one of them:
- **Projected rows** (`itineraryItemId` set): the single-writer output of `syncItemProjection`, sourced from a
  trip item that's `ready_for_checkout`.
- **Legacy/direct rows** (`itineraryItemId` NULL): everything in §a's route table — guest adds, direct
  add-to-cart, apply-to-cart variant writes, migrated guest items. These have **no trip relationship at all**
  until `resolve-trip` backfills one.

**What changes under trip-first, and whether the reconciler becomes a no-op:** **not a no-op — its job gets
*bigger*, not smaller.** Trip-first does not remove the need to project `ready_for_checkout` items into a
checkout-facing view; if anything, it is the mechanism that makes the cart's remaining job ("show me what's
ready to buy") entirely accurate, because **every** item would already be an `itinerary_items` row with a real
`routingStatus`, not just the ones that survived a routing-endpoint round trip. Under trip-first, the direct-add
routes in §a (`POST /api/cart`, `POST /api/cart/items`, apply-to-cart) would need to be **retired or repointed**
to create `itinerary_items` rows (born `in_planning`, per the existing `ROUTING_STATE_CONTRACT.md` convention —
see the "Guest cart migration" row, §c) instead of `cart_items` rows directly, and `syncItemProjection` becomes
the **sole** path from "item exists" to "item shows in the checkout cart" — no more NULL-keyed legacy rows at
all. That is a strict simplification of the *contract*, but it means deleting/rewriting most of §a's routes, not
leaving them alone.

---

## (c) The guest path — `guestPendingIds` and `POST /api/cart/migrate` traced end to end

**Headline finding: the DB-level guest-cart mechanism (`guestSessionId` column, `storage.addToCart(null, …)`,
`storage.migrateGuestCart`) is fully implemented but structurally unreachable from any live HTTP surface today.**
`storage.addToCart` is called from exactly two places in the whole server tree
(`grep -rn "\.addToCart("` over `server/**/*.ts` excluding tests), both of them the routes in §a
(`server/routes.ts:4545` and `:5906`), and **both are gated `isAuthenticated`**
(`server/routes.ts:4522`, `:5791`). There is no route anywhere that calls `cartProjection.addToCart`/
`storage.addToCart` without a session — so no HTTP request can ever produce a `cart_items` row with
`guestSessionId` set and `userId` NULL in production. `POST /api/cart/migrate`
(`server/routes.ts:5980-5993`) is real code, reachable, and correctly written — it will faithfully migrate zero
rows every single time it's called, because there is nothing to migrate.

**What actually happens today (traced from the client):**
1. A logged-out visitor clicks "Add to cart" on Discover. The mutation POSTs to `/api/cart`
   (`discover.tsx:686`), gets a `401`, and the `onError` handler falls back to `saveToGuestCart(serviceId)`
   (`discover.tsx:694-704`), which writes the bare `serviceId` into `localStorage["traveloure_guest_cart_pending"]` (`discover.tsx:671-680`) — **no server call, no DB row, no `guestSessionId` involved.**
2. Separately, a *different* localStorage key (`traveloure_guest_session`, `client/src/lib/guest-session.ts:1-11`
   and its byte-for-byte duplicate `client/src/lib/guestSession.ts:1-14` — two near-identical files, worth
   consolidating but out of scope) holds a UUID used only for non-cart telemetry (`upsell.routes.ts`
   `guestSessionId` fields, `city-feed-card.tsx:142` service-request tracking).
3. On sign-in, `cart.tsx`'s own effect (lines 338-365) reads the `traveloure_guest_cart_pending` array and
   **individually re-POSTs each `serviceId` to `/api/cart`** now that the session cookie is set — this is the
   *actual* migration mechanism. It is retry-safe (only clears IDs that succeeded, line 352-359).
4. `SignInModal.tsx:53-71` and `App.tsx`'s `GuestCartMigrator` (`App.tsx:1116-1147`) **also** independently fire
   `POST /api/cart/migrate` with the `traveloure_guest_session` UUID — which, per the headline finding, always
   migrates 0 rows. This call is harmless (200 or logged-warning, never surfaced to the user) but is dead weight:
   two parallel "migrate the guest cart" code paths exist, only one of which does anything.

**The `ROUTING_STATE_CONTRACT.md` already has an opinion on the trip-first shape of this.** Its consumer matrix
row for "Guest cart migration" reads: *"WRITES (all migrated items) [in_planning] | NEVER | NEVER | NEVER —
Migrated items land `in_planning`... a pre-split cart carried Q1 ambiguity; do not import it as purchase intent.
User re-routes after signup"* (`docs/briefs/ROUTING_STATE_CONTRACT.md:36`). That is describing a **future**
state the code does not implement yet — migrated items landing as `itinerary_items` rows, not `cart_items` rows.

**A logged-out visitor cannot own a trip (schema fact):** `trips.userId` is nullable and
`references(users.id, {onDelete:"set null"})` (`shared/schema.ts:87`) — so the column *permits* NULL — but every
routing/access gate that matters (`routing.routes.ts:109-123`, `verifyTripOwnership`) resolves ownership by
`trips.userId === callerId`, which is impossible to satisfy pre-signup. **This is exactly the shape `POST /api/trips` already solves** for the direct trip-creation flow: guests get `userId = null` + a `shareToken`
(`server/routes.ts:978-1008`), and claim it post-signup via `POST /api/trips/:id/claim`
(`server/routes.ts:1079-1105`) which flips `trips.userId` from NULL to the new user's id (line 1095-1098) after
verifying the token (line 1084-1087) and refusing a second claim (line 1090-1092). The full claim loop is wired
client-side and live: `GuestTripContext.tsx` persists `{tripId: shareToken}` pairs in `localStorage["guestTrips"]`
(lines 3, 21, 33), and `useClaimGuestTrips` (`client/src/hooks/use-claim-guest-trips.ts`) is mounted in
`App.tsx:314` and fires `claimTrips(user.id)` on sign-in.

**Options for trip-first + guests, with tradeoffs:**

| Option | Mechanism | Pro | Con |
|---|---|---|---|
| **A — Reuse the existing guest-trip-claim machinery** | First add-to-item calls `POST /api/trips` (guest path) if no `tripId` is in `TripContext`, gets back `{id, shareToken}`, stores it via `addGuestTrip` (already wired), writes the item straight to `itinerary_items` under that trip | Almost the whole mechanism already exists and is exercised by the direct "create a trip" flow today; claim-on-signup is already live | The mint requires `startDate`/`endDate`/`destination` NOT NULL (§d) with no user input yet at first-add — same synthesized-defaults problem `resolve-trip` already has, just moved earlier; owner-less trip is intentionally the ready-made/guest posture already (`storage.createTrip`'s owner-row insert is skipped when `userId` is falsy, `server/storage.ts:771`) |
| **B — Defer trip mint until login (localStorage-only, current cart-first guest shape, kept)** | Keep exactly today's `traveloure_guest_cart_pending` shape but store richer descriptors than a bare `serviceId`; mint the trip at the *first* post-signup write, same as `resolve-trip` does now | Zero guest-side schema/route change; smallest diff | Perpetuates the two-store problem trip-first is meant to kill — a guest's "trip" isn't really a trip until after signup, so any pre-signup feature that wants to *show* a Trip Slip (the whole point of the proposal) has nothing to render |
| **C — Session-bound anonymous trip, no shareToken** | Trip minted with `userId = null` at first add, identified purely by a server session cookie (not a claimable link) | Simpler than A — no token plumbing | Loses the "share/resume from another device before signup" property the current `shareToken` design already provides for free; would be strictly worse than reusing A |

**Recommendation implied by the evidence, not asserted as a decision:** Option A costs the least *new* code
because both halves (guest trip mint, guest trip claim) are already built and live for the direct trip-creation
flow — the work is wiring the **cart/Discover add-flow** to call into that existing machinery instead of
`POST /api/cart`, not inventing a new guest-identity primitive.

---

## (d) What breaks if the trip is resolved at first-add

**Trip-mint obligations (from the one canonical path, `server/storage.createTrip`, `server/storage.ts:761-790`,
confirmed as canonical — the three legacy raw-SQL minters were fixed to match it, `docs/briefs/L10-owner-access.md`):**
1. Generate `trackingNumber` (line 762) — cheap, no external dependency.
2. Insert the `trips` row — **requires `startDate`, `endDate`, `destination` (all NOT NULL,** `shared/schema.ts:91-93`).
3. Insert the `trip_collaborators` owner row **only if `newTrip.userId` is truthy** (line 771-776) — guest trips
   (`userId = null`) deliberately skip this, which is why they're owner-less by design until claimed.
4. `registerContent(...)` — the tracking/content-registry mirror (lines 779-787).

**Every one of these must happen at first-add instead of at "click optimize."** Item 2 is the load-bearing
constraint: **a trip is never valid without dates in this schema — there is no partial/draft trip shape.**
`resolve-trip` handles this today by synthesizing `start = now+30d`, `end = start+7d`,
`destination = "Your Destination"` when the user hasn't supplied any (`server/routes.ts:5693-5701,5682-5685`).
Trip-first inherits this exact same synthesis, just triggered on the very first click instead of on "Continue —
Optimize" — **the fabricated-default problem does not go away, it just moves earlier**, and now every trip a
user starts (even one they abandon after one click) carries a `synthesized-dates ≠ real-dates` trip row from the
start, which the dates-modal flow currently prevents from reaching this state until the user is already
committed to a session (see next point).

**The dates modal — when is it required today, and is a trip valid without dates:** No. Client-enforced, not
just DB-enforced: `handleOptimizeClick` in `cart.tsx:1047-1079` explicitly blocks progress and opens the dates
modal (`setEditTripOpen(true)`, line 1070) if `effectiveTripStartDate`/`effectiveTripEndDate` are unset (lines
1063-1073), with the comment *"Every trip needs dates before it can be prepared."* This is currently a **late**
gate — after N items have already been added to a trip-less cart. Trip-first would need to either (i) show the
same modal at first-add (adding friction to the very first click of a session — a real UX cost the
decision-maker should weigh explicitly) or (ii) keep synthesizing defaults silently and let the user fix dates
later via `EditTripPanel` (`client/src/components/trip/edit-trip-panel.tsx`) — which is closer to what
`resolve-trip` already does and is the lower-friction, more consistent-with-current-behavior option.

**NOT NULL / FK constraints that bind an item to a trip, and cannot be deferred:** `itinerary_items.tripId`
NOT NULL, `ON DELETE CASCADE` (`shared/schema.ts:3382`); `itinerary_items.dayNumber` NOT NULL
(`shared/schema.ts:3391`, comment "1, 2, 3, etc."); `itinerary_items.title` NOT NULL (`schema.ts:3385`). The
`dayNumber` requirement is a second, less obvious cost: at first-add, before dates are even confirmed, the item
needs *some* day number. `convert-to-itinerary` (the closest existing precedent) always hardcodes `dayNumber: 1`
(`server/routes.ts:6074`) — a workable, already-used precedent, but worth naming explicitly as a decision the
build must make (bucket everything into day 1 until the optimizer/user reorders it), not discover mid-build.

**Code that reads "cart items with no trip" today (would need retargeting or retirement):**
- `syncItemProjection`'s NULL-keyed-row exclusion (`cart-projection.service.ts:40-43,222`) — the entire reason
  this guard exists is that most `cart_items` rows have no trip/routing relationship; under trip-first this
  population should shrink to zero over time (existing rows are the migration's own backward-compat tail).
- `GET /api/cart` (`server/routes.ts:5531-5622`) reads `storage.getCartItems(userId, experienceSlug)` — trip-less
  by construction today; under trip-first this becomes a filtered read of `itinerary_items` (or keeps reading a
  now-pure `cart_items` projection — either is consistent with §b's conclusion).
- The optimizer's **guest-only** fallback branch, which the Trip-Canon master brief already flags for deletion
  under the guest-trip reshape (its own name for this problem, "G2"): *"When G2 lands, delete both cart-read
  branches in `server/routes.ts` (create + `/:id/generate`) so the Trip is the single optimizer baseline for
  every principal"* (`docs/planning/TRIP_CANON_MASTER_BRIEF.md:93`). This is direct, dated confirmation that the
  decision-maker's own prior planning already anticipated retiring this exact code path once guests have trips.

**Places a user legitimately has items they do NOT want on a trip:** this is the sharpest open design question,
and the current codebase's own stated rationale argues *against* trip-first at add-time. The content-card
add-to-cart dialog states its policy outright: *"feed content items add straight to the CART (the one planning
pipeline) — the trip/experience question is asked once, in the cart's Trip-details step, not at add-time"*
(`add-to-experience-dialog.tsx:57-59`). This is a deliberate, load-bearing UX decision already in the repo:
browsing/saving-for-later is treated as trip-agnostic by design, precisely because a browsing session and a
travel-planning commitment are not the same intent. Trip-first collapses that distinction at the moment of
first click. There is no code today for a "saved items, not yet assigned to any trip" bucket outside the cart
itself — under trip-first, *the cart itself* was that bucket, and removing it removes the only trip-agnostic
save mechanism the app has. This is a genuine product tradeoff, not a technical one, and belongs with the
decision-maker rather than being silently resolved by whichever phase ships first.

---

## (e) Which-trip targeting

**How the app currently knows "the active trip":** a **single global, session-scoped slot**, not a list/selector.
`TripContext` (`client/src/lib/trip-context.ts:1-374`) is explicitly a *singleton* blob stored under one
`sessionStorage` key (`STORAGE_KEY = "experienceContext"`, line 65) — its own docstring calls it *"the single
typed owner of the site-wide trip details blob"* (line 4). `tripId` is one field on that blob (line 50).
`TripStrip` (`client/src/components/trip/trip-strip.tsx:49-192`) is the only UI that surfaces it — it reads
`useTripContext()` (line 50) and shows an "Edit trip ›" link that opens `EditTripPanel` when `ctx.tripId` is
unset, or navigates to `/trip/${ctx.tripId}` ("Server-truth mode") once it is (lines 173-186). **There is no
picker UI anywhere that lets a user choose among several existing trips as the add-to-cart/add-to-trip target.**
`my-trips.tsx` (`client/src/pages/my-trips.tsx`) lists all of a user's trips via `useTrips()`
(`client/src/hooks/use-trips.ts:11-21`, `GET /api/trips`) but its cards link straight to `/plans/:tripId` — it
never calls `switchTripContext` or otherwise sets the *active* trip; browsing "My Trips" and having an "active
trip for adding things" are two unconnected concepts today.

**Could `TripContext` serve as the first-add target picker as-is?** Partially — the plumbing (`switchTripContext`,
`client/src/lib/trip-context.ts:185-214`, with its explicit atomic-identity-vs-merge distinction) is sound and
reusable, but **the selection surface does not exist.** Today `ctx.tripId` only ever gets set by one of: (a)
`resolve-trip`'s response (`cart.tsx:1027-1033`), (b) presumably some trip-detail-page mount effect
(**UNVERIFIED** — not traced in this pass), or (c) never, for a session that hasn't reached the optimize step
yet. None of these are "the user explicitly chose this trip as the target for what I'm about to add."

**Zero / one / many trips at first-add — what happens today (traced) vs. what trip-first needs:**
- **Zero trips:** today, nothing happens until `resolve-trip` mints one. Trip-first needs the exact same
  first-mint logic, just moved to the add action itself (§d's synthesized-dates cost applies here).
- **One existing trip:** **UNVERIFIED whether `TripContext.tripId` would already be populated** in this case —
  it depends on whether the user navigated through a trip page (which may or may not call `switchTripContext`)
  since their last session. If not populated, trip-first has no signal to silently target that one trip and
  would need to either ask, or default to "most recently active," which is new logic that doesn't exist yet.
- **Many trips:** genuinely unbuilt. There is no UI concept of "pick which of my 3 trips this Positano hotel
  belongs to." This is very likely the single largest net-new UI surface trip-first requires — everything else
  in this audit is substantially reusable plumbing; this is not.

---

## (f) Item-count delta — today vs. trip-first, cited to real files

**Today (cart-first), first add → sees AI optimization results:**
1. Click "Add to cart" on any of §a's 9 surfaces → `POST /api/cart` (`server/routes.ts:5791`).
2. Repeat for N items, no trip involved.
3. Navigate to `/cart` (`client/src/pages/cart.tsx`).
4. Click "Continue — Optimize" → `handleOptimizeClick` (`cart.tsx:1047`) → gated on dates → if missing, dates
   modal (`cart.tsx:1070`, `EditTripPanel`) → user fills dates → retry.
5. `proceedOptimize` → `POST /api/cart/resolve-trip` (`cart.tsx:974`, server `server/routes.ts:5625`) — mints or
   reuses the trip, backfills `tripId` onto cart rows (`cart-projection.service.ts:119-128`).
6. `flowStep` moves `cart → optimize` (`cart.tsx:955`) — a preview/paid-optimization gate
   (`docs/planning/TRIP_CANON_MASTER_BRIEF.md` row "L5a — DONE", the 402/pay-gate logic) then
   `POST /api/itinerary-comparisons` (or `/:id/generate`) runs the actual AI optimization.
7. `flowStep → "itinerary"` (`cart.tsx:2316`) renders `optimizationResult`.

**Steps: ≥7 distinct user-visible actions, one of which (resolve-trip) is invisible/automatic.**

**Under trip-first (projected from what's reusable today, not built):**
1. Click "Add to trip" on any of §a's 9 surfaces → **first click ever** triggers trip-target resolution (§e: no
   trip → mint via the `POST /api/trips` guest/auth pattern already at `server/routes.ts:978`; one trip → auto
   target, **UNVERIFIED how**; many trips → **new picker UI, unbuilt**) → item lands as an `itinerary_items` row,
   `routingStatus = 'in_planning'` (the existing born-state default, per `ROUTING_STATE_CONTRACT.md`'s
   consumer-matrix convention).
2. Repeat for N items — every one already on the trip, no separate cart entity to reconcile.
3. Navigate to the Trip Slip (`/trip/:tripId` or `/plans/:tripId` — both already exist as routes).
4. Per-item "send to checkout" flips `routingStatus → ready_for_checkout` via the **already-built**
   `POST /api/trips/:tripId/items/:itemId/route` (`routing.routes.ts:125-251`) — this is the one piece of the
   *target* architecture that is 100% done today, just not wired to a first-add UI.
5. Optimize runs against the trip directly — already true today per Lane 5b (`ROUTING_STATE_CONTRACT.md:33`,
   *"Optimizer (Lane 5b)"* row, RATIFIED Jul 31 2026 and landed): the optimizer already reads
   `itinerary_items` (`in_planning` + `ready_for_checkout`), not the cart. **This step needs zero new work.**
6. Results render on the same Trip Slip / PlanCard surface (`docs/briefs/RECONCILE_PHASE1_SCOPE.md` W7, "Routing
   actions on the Trip Card").

**Steps: ~5-6, but step 1 hides genuinely new complexity (trip targeting) that today's step-5-of-7 (resolve-trip)
does not have, because resolve-trip only ever deals with "no trip yet" — it never has to ask "which of your 3
trips."** The nominal step count goes down; the amount of *new, unbuilt* logic concentrates entirely into step 1.

---

## Risk register

| # | Risk | Where it would bite | Severity |
|---|---|---|---|
| R1 | **§15/§15b claim semantics are untouched by this proposal but must not be confused with routing state.** `ready_for_checkout`/`purchased` and the checkout claim machine (`checkout-claim.service.ts`, CLAUDE.md §15b) are a completely separate state machine from "which trip owns this item." Trip-first only changes *when* an item gets a `tripId`, never how money claims work. **Verify explicitly, per phase:** no phase of this build may let a first-add write path touch `routingStatus`, `stripePaymentIntentId`, or any `service_bookings` column — those remain `routing.routes.ts` / `checkout-claim.service.ts`'s exclusive territory. | Any new "add to trip" endpoint that's tempted to also set a routing status "for convenience" | High if violated, but avoidable by construction — born `in_planning` only, per existing contract |
| R2 | **§19 mass-assignment class.** A new/changed insert schema for the first-add endpoint must be built as the codebase's stated future direction (allowlist/pick-based, `CLAUDE.md` §19) even though all 186 existing `createInsertSchema` calls are still `.omit()`-based today (`§19` posture note) — do not copy the `.omit()` pattern for a brand-new endpoint when the governing doc has already flagged that pattern as the standing defect class. | The new first-add route's request schema | Medium — avoidable if the build explicitly opts into a pick-based schema from day one |
| R3 | **`tripId`-from-body-with-no-ownership-check precedent.** `POST /api/cart` and `POST /api/cart/items` both already accept a raw `tripId` with zero ownership verification (`server/routes.ts:5794/5912`, `4525/4549`, `storage.ts:2241`). It's low-impact today only because `syncItemProjection` ignores `cart_items.tripId` and re-derives ownership from `trips.userId` (`cart-projection.service.ts:174-193`). **A trip-first first-add endpoint writing directly to `itinerary_items` must not copy this precedent** — it must use the `isTripOwner` pattern already proven at `routing.routes.ts:109-123`. | Any first-add route that accepts `tripId` in the body | High if the wrong precedent is copied — this is the one place in the existing code where "client-trusted tripId" is currently tolerated, and trip-first is exactly the change that would make it matter |
| R4 | **Owner-less trips.** Guest-created trips (`userId = null`) deliberately skip the `trip_collaborators` owner-row insert (`storage.ts:771`, guarded on `if (newTrip.userId)`) — this is intentional, not a bug, but it means every trip minted by a trip-first first-add-while-logged-out flow is owner-less until claimed. The claim endpoint (`server/routes.ts:1079-1105`) sets `trips.userId` but does **not** insert a `trip_collaborators` row the way `createTrip` does. **UNVERIFIED** whether any currently-live gate depends on `trip_collaborators` specifically (as opposed to `verifyTripOwnership`'s direct `trips.userId` read, which the claim path does satisfy) for a claimed trip — worth a direct check before relying on the claim path at scale, since it is an existing asymmetry, not one this proposal introduces. | Claimed guest trips under heavier first-add traffic | Medium — likely fine post-L10 (`verifyTripOwnership` reads `trips.userId` directly) but not proven end-to-end in this pass |
| R5 | **Schema change to `trips` (dates/destination NOT NULL) is not itself required** — trip-first can reuse the exact synthesized-defaults pattern `resolve-trip` already uses (§d) with **no migration**. But if the decision-maker instead wants a genuinely dateless/destination-less "draft trip" concept (removing the NOT NULL constraints), that *is* a schema migration, and per `CLAUDE.md`'s "Replit deploy-push vs. our migrations" trap, **relaxing a NOT NULL is safe** (no CHECK, no preflight risk) but any accompanying default/backfill logic must still be declared in `shared/schema.ts`, not just the migration SQL, or a future push could re-diverge it. | Only if "no dates yet" becomes a first-class trip state, which is a product decision, not a forced technical one | Low if the no-migration path is chosen (recommended); Medium if the schema is relaxed |
| R6 | **§17 reconciliation / drift detection is untouched but scope-adjacent.** The daily Stripe-vs-DB job (`server/jobs/stripeReconciliation.ts`) scans both booking rails and is keyed off `service_bookings`/`bookingId`/`stripe_payment_intent_id` linkage, never off `routingStatus` or trip identity. Trip-first changes nothing it reads. Confirmed by inspection of its keying description in `CLAUDE.md` §17 point 4 — no new write surface is implied. | None expected | Low (informational — recorded so nobody "extends" the reconciler unnecessarily during this build) |
| R7 | **Two near-duplicate guest-session helper files** (`client/src/lib/guest-session.ts` vs. `client/src/lib/guestSession.ts`) with a real behavioral difference (impression-session storage: `localStorage` in one, `sessionStorage` in the other, compare lines 17-24 of each). Not caused by this proposal, but any trip-first work touching guest identity should consolidate onto one, not add a third. | Guest-session code touched by any phase of this build | Low, but free to fix in passing |
| R8 | **Dead-but-reachable duplicate route:** `POST /api/trips/:id/claim` is defined twice — the live one at `server/routes.ts:1079` (registered early) and a shadowed, unreachable copy at `server/routes/trips.routes.ts:339` (mounted last, `server/routes.ts:9489`, so Express's first-match-wins means it never fires). Not a functional risk today, but a maintenance trap: an editor "fixing" the wrong copy would silently no-op. Any phase touching the claim endpoint should delete or clearly flag the shadowed copy rather than edit it. | Claim endpoint maintenance during trip-first build | Low |

---

## Proposed build plan (for decision-maker sign-off — phases independently shippable and reversible)

Each phase below ships behind its own gate and can be reverted without breaking the one before it, mirroring the
Trip-Canon Lane 1 discipline (`docs/briefs/RECONCILE_PHASE1_SCOPE.md` §3's phase-gate pattern) this program
should extend rather than duplicate.

**Phase 0 — Decision-maker calls (blocking, no code):**
- Which guest option from §c (A/B/C) — this determines Phase 2's shape entirely.
- Whether "no dates yet" becomes a first-class trip state (schema relaxation) or stays synthesized-defaults
  (recommended: stay synthesized — matches existing `resolve-trip` behavior, zero migration risk, R5).
- Whether the "browse without committing to a trip" UX (`add-to-experience-dialog.tsx:57-59`'s stated rationale)
  is deliberately given up, or preserved as a parallel "wishlist" concept outside any trip. This is the one
  open product question with no purely-technical answer in the code.

**Phase 1 — Wire existing routing-state machinery to a real UI (reversible, additive only):**
- Ship the Trip-Canon `W7` Trip Card routing actions if not already live (per `RECONCILE_PHASE1_SCOPE.md`
  Phase 1d) — verify current status, since this audit did not re-verify 1d's landing state.
- No entry-point change yet; this phase only proves the "send to checkout" flip (already-built
  `routing.routes.ts`) is reachable and correct in the UI a trip-first flow will eventually rely on.
- **Gate:** Playwright pass on route→checkout journeys (mirrors the existing 1d gate).

**Phase 2 — Guest trip-mint reuse for one surface (small, isolated, reversible):**
- Pick the single lowest-traffic add-to-cart surface (likely `trip-details.tsx:388`, since it already knows a
  trip exists) and repoint it to write `itinerary_items` directly instead of `cart_items`, using the existing
  `isTripOwner` pattern (R3) for the ownership check.
- **Does not touch guest/logged-out flows yet** — authenticated-with-known-trip only.
- **Gate:** behavioral proof the item round-trips through routing → checkout → purchased exactly as a
  `convert-to-itinerary`-born item does today (that conversion path is the closest live precedent).

**Phase 3 — Trip targeting UI for zero/one trips (net-new, the §e gap):**
- Build the "no trip yet → mint (reusing Phase 0's guest decision)" and "exactly one trip → auto-target"
  branches. Explicitly **defer** the "many trips" picker to Phase 5 — do not block on it.
- **Gate:** a logged-in user with 0 trips and a user with exactly 1 trip can both complete first-add → Trip Slip
  → checkout without seeing cart-first UI at all.

**Phase 4 — Guest first-add (depends on Phase 0's choice; assumed Option A here):**
- Repoint one guest-reachable add surface (Discover is the highest-traffic candidate,
  `discover.tsx:683-709`) to call `POST /api/trips` guest-mint on first add instead of `saveToGuestCart`
  localStorage fallback, then rely on the **already-live** claim loop (`GuestTripContext.tsx`,
  `use-claim-guest-trips.ts`, `App.tsx:314`) for post-signup ownership transfer.
- Retire the now-redundant `traveloure_guest_cart_pending` localStorage path and the always-empty
  `POST /api/cart/migrate` call sites (`SignInModal.tsx:53-71`, `App.tsx:1116-1147`) — dead-code removal, not a
  behavior change, since §c proved they migrate 0 rows today.
- **Gate:** a fresh incognito session can add an item, sign up, and find that item still `in_planning` on their
  now-claimed trip — the concrete end-to-end proof the current guest path cannot offer (§c).

**Phase 5 — Many-trips picker + remaining 7 surfaces (largest phase, sequence last):**
- Build the trip-selector UI §e found does not exist.
- Migrate the remaining add-to-cart call sites from §a's table one at a time, each independently gated and
  revertible, retiring `POST /api/cart` / `POST /api/cart/items` as *entry points* only once every caller is
  moved (the routes can stay as thin back-compat shims briefly, per the Trip-Canon Lane's own "thin
  compatibility layer" precedent, `RECONCILE_PHASE1_SCOPE.md` §0.1).

**Phase 6 — Retire `cart_items` as anything but a projection:**
- Once no surface writes `cart_items` directly, delete `addToCart`/`updateCartItem`/`removeFromCart` from the
  funnel (`cart-projection.service.ts`'s Section 1) and confirm `syncItemProjection` (Section 2) is the only
  writer left standing, closing the loop this audit's §b started.
- **Gate:** grep-provable — zero call sites outside `cart-projection.service.ts` insert/update/delete
  `cart_items`, mirroring the discipline `CLAUDE.md`'s existing guard scripts (`check-money-endpoints.cjs`,
  `check-unmounted-routers.cjs`) already apply to other single-writer invariants in this codebase. A committed
  grep-gate guard for this specific invariant would be a reasonable Phase 6 deliverable, since the module's
  "single writer" claim (`cart-projection.service.ts:2,12-18`) is currently enforced by comment convention only,
  not by CI — worth naming explicitly rather than leaving implicit.

---

*Everything cited above was read directly from the working tree; nothing here required running the server,
migrations, or the database. Any point marked UNVERIFIED should be resolved by a short, targeted follow-up read
(or, where genuinely runtime-dependent, a scripted check) before Phase 0 sign-off, not assumed either way.*
