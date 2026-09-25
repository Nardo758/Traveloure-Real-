/**
 * CART PROJECTION — the single writer of `cart_items`.
 *
 * Trip-Canon Lane 1 (Reconcile), Phase 1b / W2.
 * Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W2, §3 Phase 1b, §4),
 * docs/briefs/ROUTING_STATE_CONTRACT.md (§2 "Projection sync" row),
 * docs/planning/TRIP_CANON_MASTER_BRIEF.md, docs/E2E_ITEM_LIFECYCLE.md §5 Q1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "SINGLE WRITER" MEANS HERE, EXACTLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Scope §4: "Do not let any path other than the projection-sync module write `cart_items`
 * after 1b." That is achieved as a MODULE FUNNEL, not as a semantic rewrite:
 *
 *   • Every pre-existing `cart_items` write site is re-pointed at a function in THIS file.
 *     Those functions are deliberately THIN PASSTHROUGHS to the storage layer — behavior is
 *     byte-identical to before the re-point. `server/storage.ts` remains the DB layer; this
 *     module is the only thing that calls its cart-write functions.
 *   • The one piece of NEW logic is `syncItemProjection()` — the actual W2 projection.
 *
 * Entry-point SEMANTICS are explicitly NOT changed in 1b (no trip-first add-to-cart, no guest
 * reshape — guests have no trips until G2). Re-pointing the funnel first is what made the
 * merge-gate constraint ("the optimizer's cart read behaves identically") provable: the diff
 * that moves the calls provably changes nothing, and the diff that adds projection rows only
 * fires when a traveler explicitly routes a trip item to checkout.
 *
 * ── THE MERGE-GATE CONSTRAINT IS RETIRED (Lane 5b, Jul 31 2026, decision-maker ratified) ──────
 * That constraint was always scoped "until the re-point lane", and the re-point has landed: the
 * optimizer now reads the TRIP (`server/services/optimizer-baseline.service.ts`), not the cart.
 * The cart⋈provider_services baseline read survives only as a labelled guest-only branch that is
 * unreachable while those endpoints are `isAuthenticated`, and it retires with G2.
 *
 * NOTHING ABOUT THIS MODULE'S OWN RULE CHANGES: it is still the SINGLE writer of `cart_items`,
 * and no path may write that table outside it. The retired constraint was about what the
 * optimizer READS; the single-writer rule is about who WRITES, and that stands.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE INVARIANT EVERY READER DEPENDS ON
 * ─────────────────────────────────────────────────────────────────────────────
 * A cart row with `itinerary_item_id IS NULL` is NOT a projection (legacy row, guest add,
 * direct add-to-cart, variant apply-to-cart). `syncItemProjection` NEVER reads, updates, or
 * deletes such a row — every one of its statements is keyed on `itinerary_item_id`. This is
 * the entire compatibility story for the nine Q1 cart consumers.
 *
 * CONTRACT (ROUTING_STATE_CONTRACT §2): this module READS all four routing states and writes
 * CART ROWS ONLY. It never writes `routing_status` — the transition endpoints own that, and
 * they call in here afterwards.
 */
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { cartItems, customVenues, itineraryItems, providerServices, trips } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
// V-11's predicate, the ONE translation of `provider_services.price` into the `hasPrice` fact
// `resolveBuyAction` decides on (ledger `2026-09-13-cart-priceless-gap`, s18 rule 1).
import { hasPublishedPrice, requestOnlyListingRefusals } from "./buy-action-payload";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — the funnel. Thin passthroughs, behavior-identical by construction.
// Do not add logic here; a behavior change in any of these breaks the Phase 1b
// merge gate (optimizer cart read byte-identical before/after the re-point).
// ─────────────────────────────────────────────────────────────────────────────

/** Direct add-to-cart (POST /api/cart, POST /api/cart/items). Passthrough. */
export async function addToCart(
  userId: string | null,
  item: Parameters<typeof storage.addToCart>[1],
): Promise<any> {
  return storage.addToCart(userId, item);
}

/** PATCH /api/cart/:id. Passthrough. */
export async function updateCartItem(
  id: string,
  updates: { quantity?: number; scheduledDate?: Date; notes?: string; pickupLocation?: unknown; partySize?: number | null },
): Promise<any | undefined> {
  return storage.updateCartItem(id, updates);
}

/** DELETE /api/cart/:id and the convert-to-itinerary removal. Passthrough. */
export async function removeFromCart(id: string): Promise<void> {
  return storage.removeFromCart(id);
}

/** DELETE /api/cart and the post-booking clear in /api/checkout. Passthrough. */
export async function clearCart(userId: string, experienceSlug?: string): Promise<void> {
  return storage.clearCart(userId, experienceSlug);
}

/**
 * POST /api/cart/migrate. Passthrough.
 * Contract §2 "Guest cart migration" row governs the ITEM side (migrated items land
 * `in_planning`) — that edge does not exist in 1b because guests have no trips yet (G2).
 * Here the cart row simply changes owner, exactly as before.
 */
export async function migrateGuestCart(
  guestSessionId: string,
  userId: string,
): Promise<{ migrated: number; deduplicated: number }> {
  return storage.migrateGuestCart(guestSessionId, userId);
}

/**
 * POST /api/itinerary-comparisons/:id/apply-to-cart (both the live inline copy in routes.ts
 * and the shadowed trips.routes.ts copy). Passthrough to the storage implementation, which
 * performs the identical delete-all-then-insert-per-variant-item the inline copy did inline.
 * The rows it writes carry NO `itineraryItemId` — they are direct adds, not projections, and
 * the sync module will never touch them.
 */
export async function replaceUserCartWithVariantItems(
  userId: string,
  variantItems: Array<{ providerServiceId: string | null; dayNumber: number | null; timeSlot: string | null }>,
): Promise<number> {
  return storage.replaceUserCartWithVariantItems(userId, variantItems);
}

/**
 * POST /api/cart/resolve-trip step 7 — backfill `tripId` onto the caller's existing cart rows
 * once a trip has been minted for them. Was a raw `db.update(cartItems)` at the route; moved
 * here verbatim (same WHERE, same SET) so the funnel is complete.
 */
export async function attachTripToCartItems(
  userId: string,
  tripId: string,
  experienceSlug?: string,
): Promise<void> {
  const whereClause = experienceSlug
    ? and(eq(cartItems.userId, userId), eq(cartItems.experienceSlug, experienceSlug))
    : eq(cartItems.userId, userId);
  await db.update(cartItems).set({ tripId }).where(whereClause);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — the projection itself (the only new logic in this module).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `contentMeta` a per-night stay must carry for the money path to see it, in EXACTLY the
 * shape `getRoomNights()` (server/routes/payments.routes.ts) parses — `YYYY-MM-DD` strings,
 * `checkOut > checkIn`, 1..30 nights. Ledger 2026-09-03-slip-convergence.
 *
 * WHY A LOCAL PREDICATE AND NOT AN IMPORT: `getRoomNights` lives in the payments ROUTE module;
 * importing a route into the projection service would drag the whole Stripe/checkout graph into
 * every projection sync. The equivalence is proven instead — `server/__tests__/
 * slip-stay-projection.db.test.ts` runs the REAL `getRoomNights` over both a projected row and
 * the cart-direct row it replaces and asserts identical output. If that predicate ever moves,
 * the test fails rather than the two drifting silently (§18 rule 1's failure mode, pinned).
 *
 * §13: a range that would NOT parse produces NOTHING — no partial meta, no guessed second date.
 * An unparseable range must render as "no stay dates", never as a fabricated one-night stay.
 */
function stayContentMeta(
  checkIn: unknown,
  checkOut: unknown,
): { checkIn: string; checkOut: string } | null {
  const ci = typeof checkIn === "string" ? checkIn : null;
  const co = typeof checkOut === "string" ? checkOut : null;
  if (!ci || !co || !/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co)) return null;
  if (co <= ci) return null;
  const nights = Math.round((Date.parse(co) - Date.parse(ci)) / 86400000);
  if (!Number.isFinite(nights) || nights < 1 || nights > 30) return null;
  return { checkIn: ci, checkOut: co };
}

export type ProjectionSyncResult =
  | { action: "upserted"; cartItemId: string }
  | { action: "deleted"; removed: number }
  | {
      action: "noop";
      // `no_published_price` added by ledger `2026-09-13-cart-priceless-gap`: the item names a
      // listing the platform cannot price, so the CHECKOUT projection declines to hold it. It is
      // a reason, not a failure — the caller reports it and the item's own routing state is
      // untouched (s13: the traveler is told why, never silently given an empty cart).
      // `listing_requires_request` / `listing_not_bookable` added by ledger
      // `2026-09-25-checkout-request-mode`: the listing's seller must accept first, so the
      // checkout view does not hold it.
      reason:
        | "item_missing"
        | "no_owner"
        | "not_projected"
        | "no_published_price"
        | "listing_requires_request"
        | "listing_not_bookable";
    };

/** contentType marker for a projected item that has no `providerServiceId`. */
const EXTERNAL_PROJECTION_CONTENT_TYPE = "itinerary_item";

/**
 * The cart's DISPLAY envelope for an item that names no platform listing. Real display strings
 * only — never an invented price or image (s13).
 *
 * Extracted so Section 2 states it ONCE for both the external/free-text branch and the
 * content-linked branch below (s18 rule 1).
 */
function displayEnvelopeFor(item: typeof itineraryItems.$inferSelect): Record<string, unknown> {
  return {
    ...(item.title ? { name: item.title } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.locationName ? { city: item.locationName } : {}),
    ...(item.estimatedCost ? { price: String(item.estimatedCost) } : {}),
    // D-4 (ruling 2026-09-15; ledger `2026-09-15-d4-item-kind-contract`): the partner grounding,
    // carried so the CART can tell a `recommended` line from an `external` one. This branch
    // already is the item's ONE copy-down (LD 39) — the cart row is written FROM the item here
    // and nowhere else — so the fact travels with the rest of the display envelope rather than
    // through a second copier (s18 rule 1).
    //
    // DISPLAY ONLY, AND IT MOVES NO MONEY. This whole branch is the NO-SERVICE case, which
    // checkout's subtotal and booking loops both skip (`if (!item.service) continue;`); the id is
    // the same one the plancard already publishes for agent-bookable items, and the affiliate URL
    // is still never emitted (s16). PRESENT ONLY when the item names one, so a row that names
    // none is byte-identical to before (s13 — absent means "names none").
    ...(item.affiliateProductId ? { affiliateProductId: item.affiliateProductId } : {}),
  };
}

/**
 * Reconcile `cart_items` with ONE itinerary item's routing state.
 *
 *   routing_status = 'ready_for_checkout'  ⇒ upsert the projection row for this item
 *   any other status (or the item is gone) ⇒ delete the projection row for this item
 *
 * Idempotent: calling it twice in a row produces the same single row (or the same absence).
 * Keyed exclusively on `cart_items.itinerary_item_id`, so NULL-keyed rows are invisible to it.
 *
 * Never throws into the caller's transition — a projection failure must not roll back a
 * legitimate routing flip (the flip is the source of truth; the cart is the derived view).
 * The caller reports the result; the reconciler is re-runnable.
 */
export async function syncItemProjection(itemId: string): Promise<ProjectionSyncResult> {
  const [item] = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.id, itemId))
    .limit(1);

  // Item gone: the FK is ON DELETE CASCADE so the row is already gone, but stay defensive —
  // a projection with no source must not survive.
  if (!item) {
    const removed = await deleteProjectionFor(itemId);
    return removed > 0 ? { action: "deleted", removed } : { action: "noop", reason: "item_missing" };
  }

  if (item.routingStatus !== "ready_for_checkout") {
    const removed = await deleteProjectionFor(itemId);
    return removed > 0 ? { action: "deleted", removed } : { action: "noop", reason: "not_projected" };
  }

  // The projection belongs to the TRIP's owner — never to whoever triggered the sync.
  // (§14 posture: the principal is derived from the record, not from a request.)
  const [trip] = await db
    .select({ id: trips.id, userId: trips.userId })
    .from(trips)
    .where(eq(trips.id, item.tripId))
    .limit(1);

  const ownerId = trip?.userId ?? null;
  if (!ownerId) {
    // Owner-less trips are a known live defect (L10: three raw-SQL trip minters). A cart row
    // with no owner is unreachable by every cart read and uncheckoutable — writing one would be
    // a fabrication, so we honestly write nothing and leave the item routed.
    logger.warn(
      { itemId, tripId: item.tripId },
      "cart-projection: trip has no owner; skipping projection (L10 owner-less trip)",
    );
    await deleteProjectionFor(itemId);
    return { action: "noop", reason: "no_owner" };
  }

  // Ledger 2026-09-03-slip-convergence: a per-night STAY must project the night range the money
  // path reads. `getRoomNights()` gates on the SERVICE's `pricingUnit`, so the pricing unit is
  // resolved from the listing row here — never from the item, never from a request (§14). One
  // extra single-row read, only when the item actually names a service.
  let stayMeta: { checkIn: string; checkOut: string } | null = null;
  if (item.providerServiceId) {
    const [svc] = await db
      .select({
        pricingUnit: providerServices.pricingUnit,
        // Ledger `2026-09-13-cart-priceless-gap`: read on the SAME single-row query that was
        // already being run for the pricing unit — no extra round trip.
        price: providerServices.price,
        // Ledger `2026-09-25-checkout-request-mode`: the commitment facts, on the same read.
        userId: providerServices.userId,
        priceType: providerServices.priceType,
        bookingMode: providerServices.bookingMode,
      })
      .from(providerServices)
      .where(eq(providerServices.id, item.providerServiceId))
      .limit(1);
    // -- A LISTING THAT PUBLISHES NO PRICE IS NOT PROJECTED INTO THE CHECKOUT VIEW --------------
    // LD 39: the cart IS the `ready_for_checkout` projection of `itinerary_items`, so this is a
    // cart-ENTRY rail and it was reachable with a priceless listing — the row landed in the cart
    // and `GET /api/cart` reported it at `0.00`, the same s13 lie the add rails now refuse
    // (ruling 9 row 11: a priceless listing can only ever be REQUESTED).
    //
    // WHAT THIS DELIBERATELY DOES NOT DO: it does not refuse the traveler's ROUTING flip. The
    // routing state is the source of truth and the cart is the derived view (this module's own
    // header) — a "may this item be marked for checkout?" test at the routing rail would be a
    // second author of a plan-state rule nobody has ratified. So the item keeps its status, the
    // projection holds nothing it cannot price, any stale projection row is removed, and the
    // reason travels back on the result the route already returns (s13: said out loud).
    if (svc && !hasPublishedPrice(svc.price)) {
      await deleteProjectionFor(itemId);
      return { action: "noop", reason: "no_published_price" };
    }
    // -- NOR IS A LISTING THE SELLER MUST ACCEPT (ledger `2026-09-25-checkout-request-mode`) -----
    // Same posture, same placement, for the same reason: a `request`-mode, `hidden` or
    // `custom_quote` listing is refused at checkout, so the checkout VIEW does not hold it. The
    // item stays on the plan with its routing untouched, and the reason travels back (s13). ONE
    // predicate with the add rails and checkout (s18 rule 1).
    if (svc) {
      const requestOnly = (
        await requestOnlyListingRefusals([
          { id: item.providerServiceId, userId: svc.userId, priceType: svc.priceType, bookingMode: svc.bookingMode },
        ])
      ).get(item.providerServiceId);
      if (requestOnly) {
        await deleteProjectionFor(itemId);
        return { action: "noop", reason: requestOnly.reason };
      }
    }
    if (svc?.pricingUnit === "per_night") {
      stayMeta = stayContentMeta(item.checkIn, item.checkOut);
    }
  }

  // Read the row we are about to reconcile BEFORE composing the values: a content-linked item
  // needs the display keys the ITEM has no column for (see `contentMeta` below).
  const [existing] = await db
    .select({ id: cartItems.id, contentMeta: cartItems.contentMeta })
    .from(cartItems)
    .where(eq(cartItems.itineraryItemId, item.id))
    .limit(1);
  const existingMeta = (existing?.contentMeta ?? {}) as Record<string, unknown>;

  // ── THE ITEM'S OWN SUBJECT LINKS (migration 295; ledger `2026-09-15-d16-plan-holds-venues-and-content`)
  // Before 295 this table had no column for a traveler's OWN venue or for the Discover content a
  // line came from, so this projection could only ever write `customVenueId: null` and its own
  // `itinerary_item` marker — which is precisely why the materializer in Section 3 had to REFUSE
  // both shapes: the round trip could not reproduce the traveler's row. It can now, in BOTH
  // directions, and these three lines are that faithfulness.
  const linkedVenueId = item.customVenueId ?? null;
  const linkedContent =
    item.contentType && item.contentId
      ? { contentType: item.contentType, contentId: item.contentId }
      : null;
  // A row whose subject is a LISTING or a VENUE carries no content link — the cart's own reader
  // (`storage._enrichCartItems`) branches on the venue first and on the service last, and writing
  // the external marker onto either would be a second, contradictory statement of what the row
  // is. Only a subject-less item keeps the marker, which is exactly what it was invented for.
  const projectedContent =
    linkedContent ??
    (item.providerServiceId || linkedVenueId
      ? { contentType: null as string | null, contentId: null as string | null }
      : { contentType: EXTERNAL_PROJECTION_CONTENT_TYPE as string | null, contentId: item.id as string | null });

  const values = {
    userId: ownerId,
    guestSessionId: null as string | null,
    serviceId: item.providerServiceId ?? null,
    customVenueId: linkedVenueId,
    // External / free-text plan items keep the content-item shape the cart already renders
    // (storage._enrichCartItems branches on contentId+contentType).
    ...projectedContent,
    contentMeta: item.providerServiceId
      ? // A per-night stay carries its night range; every other service keeps today's empty
        // object byte-for-byte. `stayMeta` is null whenever the listing is not per-night or the
        // item's range is absent/unparseable, so nothing is invented (§13).
        (stayMeta ?? {})
      : linkedVenueId
        ? // A VENUE row's display is JOINED from `custom_venues` by the cart's own reader, not
          // read out of this envelope, so there is nothing to compose — and whatever the
          // traveler's row already carried is left exactly as it is (§13: do not rewrite an
          // answer nobody asked about).
          existingMeta
        : linkedContent
          ? // A CONTENT row's display envelope is PART OF THE ROW and carries keys this table has
            // no column for — `imageUrl` above all. The item authors what it can author and the
            // row keeps the rest: overwriting wholesale would silently drop the traveler's
            // Discover image, which is the very loss the old refusal existed to prevent (§13).
            { ...existingMeta, ...displayEnvelopeFor(item) }
          : displayEnvelopeFor(item),
    // ── UNITS, BOTH WAYS (migration 298; ruling 2026-09-15 punchlist D-41; ledger
    // `2026-09-15-d41-item-quantity`). This line read `quantity: 1` unconditionally, which is why
    // Section 3 had to REFUSE a multi-unit line: the round trip would write the traveler's 3 back
    // down to 1 and silently change what they are charged (`resolveItemBaseAmount` prices a line
    // rate x quantity). The item now HAS a unit column, so the copy-down carries it.
    //
    // s13 — NULL ON THE ITEM MEANS ONE UNIT, and that is the reading this `?? 1` states. It is not
    // a default standing in for a missing answer: every pre-298 item row was written by a rail
    // with no unit concept and every reader has always treated it as one unit, so 1 is what the
    // row already said. `cart_items.quantity` is NOT NULL-shaped in practice (DEFAULT 1) and the
    // money path multiplies by it, so a NULL must never reach it.
    //
    // ONE COPY-DOWN (s18 rule 1). This statement and `buildPlanItemValues` below are the only two
    // places the count crosses between the two tables, and they are inverses of each other — that
    // is what makes the round trip faithful and what the materializer's admission test relies on.
    quantity: item.quantity ?? 1,
    tripId: item.tripId,
    scheduledDate: item.scheduledDate ? new Date(item.scheduledDate) : null,
    // The traveler's picked slot rides the projection (migration 275). INTENT only — the
    // capacity claim is still the atomic `storage.bookSlot` at checkout (§15), never here.
    // NULL when the item names no slot, which is every pre-275 row and every non-dated service.
    slotId: item.slotId ?? null,
    itineraryItemId: item.id,
  };

  if (existing) {
    await db.update(cartItems).set(values).where(eq(cartItems.id, existing.id));
    return { action: "upserted", cartItemId: existing.id };
  }

  const [created] = await db.insert(cartItems).values(values).returning({ id: cartItems.id });
  return { action: "upserted", cartItemId: created.id };
}

/** Delete the projection row(s) for one item. NULL-keyed rows can never match. */
async function deleteProjectionFor(itemId: string): Promise<number> {
  const removed = await db
    .delete(cartItems)
    .where(and(isNotNull(cartItems.itineraryItemId), eq(cartItems.itineraryItemId, itemId)))
    .returning({ id: cartItems.id });
  return removed.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — MATERIALIZATION: the cart line that has no item yet GETS one.
// Ledger `2026-09-13-guest-cart-becomes-plan`; the gap named by
// `2026-09-13-guest-optimization-is-a-plan-gap` / punchlist D-15.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS LIVES IN THIS MODULE AND NOT AT THE ROUTE
// --------------------------------------------------
// LD 39 makes this file the single writer of `cart_items`, and `cart_items.itineraryItemId` is
// the projection-source key: NULL = "not a projection" (a guest add, a direct add-to-cart),
// NON-NULL = "the materialized projection of one item". A GUEST ADD IS EXACTLY A NULL-KEYED
// ROW, and this is the one operation that gives it an item. Writing it at the route would be a
// second author of the cart<->item relationship — the drift class s18 rule 1 names.
//
// THE DIRECTION, STATED, BECAUSE IT IS THE OPPOSITE OF SECTION 2's
// ---------------------------------------------------------------
// `syncItemProjection` writes the CART ROW FROM THE ITEM: the item is the source of truth and
// the cart is the derived view. This function runs ONCE, at the moment a plan is born around a
// cart that predates it, and it ESTABLISHES that relationship rather than inverting it: after it
// the item is authoritative and every later sync is an ordinary re-derivation. It does NOT teach
// Section 2 to read NULL-keyed rows — Section 2's statements are still all keyed on
// `itinerary_item_id`, and this function never calls into it.
//
// THE ADMISSION TEST IS SECTION 2's OWN OUTPUT SHAPE, AND THAT IS THE WHOLE DESIGN
// -------------------------------------------------------------------------------
// The instant a cart row is linked, `syncItemProjection` becomes entitled to REWRITE it from the
// item — that is what the key means. So a line may only be materialized when the round trip is
// FAITHFUL: the projection Section 2 would write must reproduce the line the traveler actually
// has. Section 2 writes `quantity: 1`, `customVenueId: null`, and — for an item with no
// `providerServiceId` — a `contentType: "itinerary_item"` content shape. Therefore:
//
//   • quantity > 1   — STILL REFUSED, and now for a NAMED reason rather than an undecided one.
//                      `resolveItemBaseAmount` prices a line `rate * quantity`, so a silent 3 -> 1
//                      is a silent change to what the traveler is charged. D-14 is ANSWERED
//                      (ruling 2026-09-15, ledger `2026-09-15-d14-quantity-is-units`): `quantity`
//                      is UNITS of the listing and `party_size` is the party. But `itinerary_items`
//                      has NO unit column, so the plan cannot CARRY a multi-unit line faithfully —
//                      Section 2 would write `quantity: 1` back over it on the next sync. Adding
//                      that column is punchlist D-41 and needs the decision-maker; until it lands
//                      the refusal stands and is reported per line (s13), never silently reduced.
//   • custom venue   — MATERIALIZED since migration 295 (ruling 2026-09-15, punchlist D-16 (b);
//                      ledger `2026-09-15-d16-plan-holds-venues-and-content`). It was refused
//                      because `itinerary_items` had no column pointing at `custom_venues`, so
//                      the line's own subject could not survive the round trip. It has one now,
//                      and Section 2 writes it back. THE VENUE'S OWNER IS VERIFIED HERE (s14 /
//                      ledger `2026-09-05-custom-venues-owner-scope`): the cart row's owner IS
//                      the trip's owner by the check at the top of this function, so a venue
//                      belonging to anyone else is refused rather than filed onto the plan.
//   • content line   — MATERIALIZED since migration 295 (D-16 (c)). A gem/hotel/activity row
//                      names a piece of CONTENT, not a listing; it was refused because the round
//                      trip would rewrite its `contentType`/`contentId` into the projection's own
//                      `itinerary_item` marker and lose the link back to the source. The item now
//                      CARRIES that link, so the marker is no longer written over it.
//                      `/api/cart/convert-to-itinerary` remains that shape's OTHER home and is a
//                      DIFFERENT operation, not a second copy of this one: it MOVES the row (it
//                      deletes the cart line) where this one PROJECTS it — and since this lane it
//                      composes its item through the SAME builder below (s18 rule 1).
//   • no price       — REFUSED, through the SAME `hasPublishedPrice` Section 2 consults (s18
//                      rule 1): Section 2 would delete the projection on its very next run, so
//                      linking such a line would destroy the traveler's own cart row.
//
// AND MATERIALIZE <=> LINK, NEVER ONE WITHOUT THE OTHER. An item born `ready_for_checkout` with
// no cart row behind it would make the next `syncItemProjection` INSERT a second cart line for a
// service the traveler already has — a duplicate on the money path. So the insert and the link
// are ONE transaction, and the link is an ATOMIC CONDITIONAL (`WHERE itinerary_item_id IS NULL`)
// so two concurrent resolves cannot both materialize the same line (s15's posture: the statement
// is the guard, never a check-then-write).
//
// s13 — WHAT IS REFUSED IS NAMED, NOT DROPPED. Every skipped line comes back with its reason so
// the surface can say what the plan does not hold. Nothing is deleted, nothing is defaulted, and
// a cart holding only external/affiliate descriptors (which have no `cart_items` rows at all)
// materializes NOTHING and says so rather than pretending the plan carries them.

/**
 * Why one cart line did not become a plan item. Reported, never silent (s13).
 *
 * `custom_venue` and `content_line` are GONE from this union as of migration 295 — those two
 * lines are materialized now, not refused. `custom_venue_missing` is not their replacement: it is
 * the venue-shaped sibling of `service_missing`, and it says ONE sentence for "no such venue" and
 * "not yours" deliberately (the `2026-09-05-custom-venues-owner-scope` posture), so the reason can
 * never be used to tell the two apart.
 */
export type CartLineSkipReason =
  // `quantity_gt_one` is GONE (ruling 2026-09-15, punchlist D-41; migration 298) — a multi-unit
  // line is materialized now, not refused, so nothing produces it. s18c: a union member with no
  // producer is not kept "just in case"; it would read to the next author as a refusal that can
  // still happen. `custom_venue`/`content_line` left the same way at migration 295.
  | "no_subject"
  | "ambiguous_subject"
  | "service_missing"
  | "custom_venue_missing"
  | "no_published_price"
  | "raced";

export type MaterializeCartLinesResult = {
  /** Items created by THIS call. A second call over the same cart returns 0. */
  created: number;
  itemIds: string[];
  skipped: Array<{ cartItemId: string; reason: CartLineSkipReason }>;
};

/** One line lost the atomic link to a concurrent resolve, so its transaction rolls back. */
class CartLineRacedError extends Error {}

function toYmd(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * The plan's own day for a line, from the ONLY two dates that exist: the line's `scheduledDate`
 * and the trip's `startDate`. s13: `itinerary_items.dayNumber` is NOT NULL, so "the traveler
 * never said a day" has no representation in the column — day 1 is this codebase's existing
 * unplaced convention (`/api/cart/convert-to-itinerary` writes the same literal), and the item's
 * own `scheduledDate` stays NULL in that case so no DATE is ever claimed on their behalf.
 */
function resolvePlanDayNumber(scheduled: Date | null, tripStart: string | null): number {
  if (!scheduled || !tripStart) return 1;
  const startMs = Date.parse(`${tripStart}T00:00:00Z`);
  const dayMs = Date.parse(`${toYmd(scheduled)}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(dayMs)) return 1;
  const diff = Math.round((dayMs - startMs) / 86400000);
  return diff >= 0 ? diff + 1 : 1;
}

/**
 * THE RESOLVED SUBJECT OF A CART LINE — what the plan item will be ABOUT.
 *
 * `cart_items` can name exactly one of three things, and since migration 295 `itinerary_items`
 * has a column for each of them. Resolving the subject is where every DB read and every refusal
 * lives; composing the item's values from it (`buildPlanItemValues` below) is then PURE.
 */
type CartLineSubject =
  | {
      kind: "service";
      service: {
        id: string;
        serviceName: string;
        shortDescription: string | null;
        location: string | null;
        latitude: string | null;
        longitude: string | null;
        pricingUnit: string | null;
      };
    }
  | {
      kind: "custom_venue";
      venue: {
        id: string;
        name: string;
        notes: string | null;
        address: string | null;
        latitude: string | null;
        longitude: string | null;
      };
    }
  | { kind: "content"; contentType: string; contentId: string };

/**
 * Resolve ONE cart line's subject, or say why it has none that a plan item can carry (s13).
 *
 * `ownerId` is the TRIP OWNER, which is also the cart line's owner — every caller establishes
 * that before reaching here. It is passed because the CUSTOM VENUE branch verifies it: a venue is
 * an owner-scoped row (ledger `2026-09-05-custom-venues-owner-scope`), so a line naming someone
 * else's venue is refused rather than filed onto this plan (s14). "No such venue" and "not yours"
 * are deliberately the SAME answer.
 */
async function resolveCartLineSubject(
  line: typeof cartItems.$inferSelect,
  ownerId: string,
  opts: {
    /**
     * Whether a listing with NO published price refuses the line.
     *
     * TRUE for the PROJECTION rail (`materializeCartLinesAsItems`), because linking such a line
     * would have `syncItemProjection` DELETE the traveler's own cart row on its very next run.
     * FALSE for the CONVERT rail, which MOVES the row — it deletes the cart line itself and never
     * projects it, so there is no sync to destroy anything, and refusing here would newly strand a
     * legacy priceless row the traveler is trying to put on their plan. One resolver with a stated
     * parameter, never two resolvers (s18 rule 1).
     */
    refusePricelessListing: boolean;
  },
): Promise<{ ok: true; subject: CartLineSubject } | { ok: false; reason: CartLineSkipReason }> {
  // A row that names TWO subjects is refused rather than resolved by precedence. The admission
  // test for materialization is that `syncItemProjection` can REPRODUCE the line, and Section 2
  // writes exactly one subject — so choosing one here would silently drop the other off the
  // traveler's own cart row on the very next sync. `storage.addToCart` never writes two, so this
  // is a fence, not a live path (s13: refused and named, never quietly resolved).
  const named = [line.customVenueId, line.serviceId, line.contentId].filter(Boolean).length;
  if (named > 1) return { ok: false, reason: "ambiguous_subject" };

  if (line.customVenueId) {
    const [venue] = await db
      .select({
        id: customVenues.id,
        name: customVenues.name,
        notes: customVenues.notes,
        address: customVenues.address,
        latitude: customVenues.latitude,
        longitude: customVenues.longitude,
        userId: customVenues.userId,
      })
      .from(customVenues)
      .where(eq(customVenues.id, line.customVenueId))
      .limit(1);
    if (!venue || venue.userId !== ownerId) return { ok: false, reason: "custom_venue_missing" };
    return { ok: true, subject: { kind: "custom_venue", venue } };
  }

  if (line.serviceId) {
    const [svc] = await db
      .select({
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        shortDescription: providerServices.shortDescription,
        location: providerServices.location,
        latitude: providerServices.latitude,
        longitude: providerServices.longitude,
        pricingUnit: providerServices.pricingUnit,
        price: providerServices.price,
      })
      .from(providerServices)
      .where(eq(providerServices.id, line.serviceId))
      .limit(1);
    if (!svc) return { ok: false, reason: "service_missing" };
    // REFUSED through the SAME `hasPublishedPrice` Section 2 consults (s18 rule 1): Section 2
    // would DELETE the projection on its very next run, so linking such a line would destroy the
    // traveler's own cart row. D-16's priceless refusal, unchanged by this lane.
    if (opts.refusePricelessListing && !hasPublishedPrice(svc.price)) {
      return { ok: false, reason: "no_published_price" };
    }
    const { price: _price, ...service } = svc;
    return { ok: true, subject: { kind: "service", service } };
  }

  if (line.contentId && line.contentType) {
    return { ok: true, subject: { kind: "content", contentType: line.contentType, contentId: line.contentId } };
  }

  return { ok: false, reason: "no_subject" };
}

/**
 * THE ONE PLACE A CART LINE BECOMES A PLAN ITEM'S VALUES (s18 rule 1).
 *
 * PURE — no DB, no clock, no request. Both rails that turn a cart line into an
 * `itinerary_items` row call it: `materializeCartLinesAsItems` (which LINKS the line and leaves
 * it in the cart) and `convertCartLinesToItems` (which MOVES it — it deletes the line). Those two
 * DISPOSITIONS are the only difference between them, and each states its own; a second copy of
 * this mapping is how a converted item and a projected item would start describing the same cart
 * line differently.
 *
 * `routingStatus` is deliberately NOT set here: it is the disposition, and the two callers
 * genuinely disagree about it for a stated reason (see each).
 */
function buildPlanItemValues(args: {
  tripId: string;
  line: typeof cartItems.$inferSelect;
  subject: CartLineSubject;
  tripStartDate: string | null;
}): Record<string, unknown> {
  const { tripId, line, subject, tripStartDate } = args;
  const meta = (line.contentMeta ?? {}) as Record<string, unknown>;
  const scheduled = line.scheduledDate ? new Date(line.scheduledDate) : null;

  // ── THE LINE'S UNIT COUNT (migration 298; ruling 2026-09-15 punchlist D-41; ledger
  // `2026-09-15-d41-item-quantity`). D-14 settled what the number MEANS — UNITS of the listing,
  // the multiplier `resolveItemBaseAmount` reads — and 298 gives the plan somewhere to hold it.
  //
  // s13 — ONE UNIT IS WRITTEN AS NULL, NOT AS 1, AND THAT IS DELIBERATE. `cart_items.quantity` is
  // `DEFAULT 1`, so a 1 on a cart line is usually the COLUMN's answer and not the traveler's: on
  // every archetype that asks no unit question at all (a stay, a bundle, an artifact —
  // `shared/cart-quantity.ts`) it is pinned there by rule and nobody was ever asked. Writing 1
  // onto the item would turn "never asked" into "the traveler answered one" and make a new item
  // indistinguishable from an old one for no gain, since NULL ALREADY MEANS ONE UNIT and every
  // reader — `syncItemProjection` above included — resolves it that way. So the count is carried
  // only where it is a real, above-one answer, and the round trip is faithful either way.
  const lineUnits = Number.isFinite(line.quantity as number) ? Math.floor(line.quantity as number) : null;
  const carriedQuantity = lineUnits !== null && lineUnits > 1 ? { quantity: lineUnits } : {};

  const common = {
    tripId,
    dayNumber: resolvePlanDayNumber(scheduled, tripStartDate),
    // The line's own facts, and only those. No invented date, no invented title, and no party
    // size — `quantity` is units of the listing and is never promoted into one (punchlist D-14).
    ...carriedQuantity,
    scheduledDate: scheduled ? toYmd(scheduled) : null,
    slotId: line.slotId ?? null,
    notes: line.notes ?? null,
    // LD 12 / LD 42 D23: the TRAVELER chose these lines — not an AI draft, not expert work.
    // `origin` decides what the optimizer may rewrite and what the item row's provenance chip
    // says, so it is stamped server-side here and settable nowhere else.
    origin: "traveler",
    suggestedBy: "user",
    status: "planned",
  };

  if (subject.kind === "service") {
    const svc = subject.service;
    // The SAME predicate Section 2 projects a stay through, so the round trip reproduces the
    // night range the money path reads. s13: an unparseable range yields NOTHING.
    const stay = svc.pricingUnit === "per_night" ? stayContentMeta(meta.checkIn, meta.checkOut) : null;
    // s13: `provider_services.location` defaults to the literal "Unknown" — that is the ABSENCE
    // of a location, not a place name, and must never be copied onto a plan item.
    const locationName = svc.location && svc.location !== "Unknown" ? svc.location : null;
    return {
      ...common,
      // NOT NULL. The LISTING'S OWN NAME — the one fact the column forces us to carry. Never
      // invented.
      title: svc.serviceName,
      description: svc.shortDescription ?? null,
      // The listing's own pricing unit is the listing's own statement about what it is.
      // Everything else takes the column default (`activity`) rather than a guess.
      ...(svc.pricingUnit === "per_night" ? { itemType: "accommodation" } : {}),
      providerServiceId: svc.id,
      ...(stay ? { checkIn: stay.checkIn, checkOut: stay.checkOut } : {}),
      locationName,
      // R26 coords cheap-fix (ledger 2026-08-18-partner-demand-coords-fix): the listing's own pin
      // travels so neighborhood history can accrue. NULL stays NULL — nothing is invented (§13).
      latitude: svc.latitude ?? null,
      longitude: svc.longitude ?? null,
      // NO `estimatedCost`: the plan reads this listing's price through the service link, and a
      // copied number is a second, staleable statement of an amount (s8/s14 posture).
    };
  }

  if (subject.kind === "custom_venue") {
    const venue = subject.venue;
    // The VENUE's own row is the source of every display fact, exactly as the cart's own reader
    // (`storage._enrichCartItems`) already joins it — so nothing here is invented and the price,
    // which the venue row alone states, is deliberately NOT copied onto the item (the same reason
    // the service branch copies none).
    return {
      ...common,
      title: venue.name,
      description: venue.notes ?? null,
      customVenueId: venue.id,
      locationName: venue.address ?? null,
      latitude: venue.latitude ?? null,
      longitude: venue.longitude ?? null,
    };
  }

  // CONTENT. A gem / hotel / activity / event / neighborhood from Discover. The row's own display
  // envelope is the only source of facts — there is no catalog row behind it to read — and every
  // field is OMITTED when the envelope does not state it (s13), never defaulted.
  const name = typeof meta.name === "string" && meta.name.trim() ? meta.name : subject.contentId;
  const city = typeof meta.city === "string" && meta.city.trim() ? meta.city : null;
  const description = typeof meta.description === "string" && meta.description.trim() ? meta.description : null;
  // The traveler's own display price, carried ONLY when the envelope states one — the behaviour
  // `/api/cart/convert-to-itinerary` has always had for a content row. It is not a platform
  // price and charges nothing: an item that names no service is `recommended`
  // (`shared/item-kind.ts` rule 4) and checkout skips it on both loops. The cart's add rail
  // allowlists content meta to strings and REFUSES a price (s14), so only legacy rows carry one.
  const rawPrice = meta.price != null ? String(meta.price).replace(/[^0-9.]/g, "") : "";
  const estimatedCost = rawPrice && parseFloat(rawPrice) > 0 ? rawPrice : null;
  return {
    ...common,
    title: name,
    description,
    ...(subject.contentType === "hotel" ? { itemType: "accommodation" } : {}),
    contentType: subject.contentType,
    contentId: subject.contentId,
    locationName: city,
    ...(estimatedCost ? { estimatedCost } : {}),
  };
}

/**
 * Give every NULL-keyed cart line on this plan an `itinerary_items` row, and link it.
 *
 * The owner is derived from the TRIP ROW (s14 posture — the principal comes from the record,
 * never from a request) and the call is refused outright when the trip is not this caller's.
 *
 * Idempotent by construction: an already-keyed row is invisible to the SELECT, so a second
 * resolve creates nothing, and a plan that already holds items is ADDED TO, never duplicated
 * into, because the rows that produced those items are already keyed.
 *
 * Never throws into the caller's trip mint — a plan that exists with an unmaterialized line is
 * recoverable (the next resolve materializes it); a mint that rolls back because a projection
 * failed is not (s15b's "an ancillary effect may not break the operation that authorizes it").
 */
export async function materializeCartLinesAsItems(
  userId: string,
  tripId: string,
  experienceSlug?: string,
): Promise<MaterializeCartLinesResult> {
  const out: MaterializeCartLinesResult = { created: 0, itemIds: [], skipped: [] };

  const [trip] = await db
    .select({ id: trips.id, userId: trips.userId, startDate: trips.startDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip || !trip.userId || trip.userId !== userId) {
    // Not this caller's plan — or an owner-less authoring draft, the `trips.userId` NULL case the
    // sync path already refuses above. Writing items into it would file one person's cart onto
    // another's plan.
    logger.warn(
      { tripId, userId },
      "cart-projection: refusing to materialize into a trip the caller does not own",
    );
    return out;
  }

  // THIS PLAN'S LINES, and the caller's UNATTACHED ones. The fresh-mint branch of
  // `/api/cart/resolve-trip` stamps `tripId` on every line before calling here, so the NULL arm is
  // inert there; on the REUSE branch (an existing plan) the route returns early WITHOUT that
  // backfill, so a line added to the cart AFTER the plan was minted carries no `tripId` at all and
  // would otherwise never become an item. The arm is deliberately NARROWER than
  // `attachTripToCartItems`, which re-points EVERY one of the caller's rows: a line already bound
  // to a DIFFERENT plan is left where the traveler put it.
  const ownerAndTrip = and(
    eq(cartItems.userId, userId),
    or(eq(cartItems.tripId, tripId), isNull(cartItems.tripId)),
    isNull(cartItems.itineraryItemId),
  );
  const lines = await db
    .select()
    .from(cartItems)
    .where(experienceSlug ? and(ownerAndTrip, eq(cartItems.experienceSlug, experienceSlug)) : ownerAndTrip);

  for (const line of lines) {
    const skip = (reason: CartLineSkipReason) => {
      out.skipped.push({ cartItemId: line.id, reason });
    };

    // D-16 (a) IS LIFTED (ruling 2026-09-15, punchlist D-41 = yes; ledger
    // `2026-09-15-d41-item-quantity`; migration 298). A `if ((line.quantity ?? 1) > 1) {
    // skip("quantity_gt_one"); continue; }` stood here, and its stated reason was exactly this:
    // `itinerary_items` had NO unit column, so the round trip would write `quantity: 1` back over
    // the traveler's 3 and silently change what a priced line costs. The column exists now,
    // `buildPlanItemValues` carries the count up and Section 2 carries it back down, so the
    // admission test this whole module turns on — CAN SECTION 2 REPRODUCE THE LINE? — is now
    // satisfied for a multi-unit line and the refusal has nothing left to protect.
    //
    // NOTHING ELSE MOVED WITH IT. The unit count is still set on the CART LINE and nowhere else
    // (D-14: `shared/cart-quantity.ts` `archetypeAsks` decides whether a listing's archetype is
    // even asked, and a units-pinned archetype REFUSES a multi-unit body rather than clamping it),
    // `insertItineraryItemSchema` still omits the column and storage still strips it (s19), and
    // checkout still prices a line off the CART row. This lane lifted a refusal; it opened no new
    // way to author the number.

    // The subject, and every refusal that depends on reading a row (§18 rule 1: one resolver,
    // shared with the convert rail below).
    const resolved = await resolveCartLineSubject(line, userId, { refusePricelessListing: true });
    if (!resolved.ok) { skip(resolved.reason); continue; }

    try {
      const itemId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(itineraryItems)
          .values({
            ...buildPlanItemValues({
              tripId,
              line,
              subject: resolved.subject,
              tripStartDate: trip.startDate ?? null,
            }),
            // LD 39: the cart IS the `ready_for_checkout` projection of this table, so a line
            // sitting in the cart IS that state — this is a READ of the row that already exists,
            // not a routing TRANSITION (those belong to routing.routes.ts, which is why
            // `storage.createItineraryItem` strips the column and is deliberately not used here).
            // Born `in_planning` instead would make the very next sync DELETE the cart line.
            routingStatus: "ready_for_checkout",
          } as any)
          .returning({ id: itineraryItems.id });

        // THE ATOMIC LINK (s15 posture): a concurrent resolve that already keyed this row wins
        // and this transaction rolls back — one item per line, never two.
        const linked = await tx
          .update(cartItems)
          // `tripId` rides the SAME statement because Section 2 writes `tripId: item.tripId` on
          // every sync anyway — stamping it here means the row is consistent the moment it is
          // linked, rather than only after the first later sync.
          .set({ itineraryItemId: created.id, tripId })
          .where(and(eq(cartItems.id, line.id), isNull(cartItems.itineraryItemId)))
          .returning({ id: cartItems.id });
        if (linked.length === 0) throw new CartLineRacedError();
        return created.id;
      });
      out.created += 1;
      out.itemIds.push(itemId);
    } catch (err) {
      if (err instanceof CartLineRacedError) { skip("raced"); continue; }
      // A failure here must never break the trip mint that authorized it (s15b). The line stays
      // NULL-keyed, nothing partial is left behind (the transaction rolled back), and the next
      // resolve picks it up.
      logger.error(
        { err, cartItemId: line.id, tripId },
        "cart-projection: failed to materialize a cart line into a plan item",
      );
      skip("raced");
    }
  }

  return out;
}

/**
 * THE CONVERT RAIL — `POST /api/cart/convert-to-itinerary`, the OTHER way a cart line becomes a
 * plan item, and it MOVES the line rather than projecting it.
 *
 * Ledger `2026-09-15-d16-plan-holds-venues-and-content`. Until this lane the route composed its
 * own `itinerary_items` values inline, which is how the two rails came to disagree about the same
 * cart line — the drift class s18 rule 1 names. It is now a CALLER of the shared resolver and the
 * shared value builder above; what remains its own is exactly the DISPOSITION, which is a real
 * difference and is stated here rather than hidden in a flag:
 *
 *   • ROUTING. The item is born at the column default, `in_planning` — a converted item is a plan
 *     item, not purchase intent (ROUTING_STATE_CONTRACT §2). The projection rail must instead be
 *     born `ready_for_checkout`, because its line STAYS in the cart and `syncItemProjection` would
 *     otherwise delete it.
 *   • THE CART LINE. It is DELETED, in the same transaction as the insert, so a crash can never
 *     leave the traveler holding both a cart line and an item made out of it. The projection rail
 *     LINKS its line instead and leaves it exactly where the traveler put it.
 *   • THE UNIT COUNT NOW SURVIVES HERE TOO (migration 298, punchlist D-41; ledger
 *     `2026-09-15-d41-item-quantity`). This rail never carried the D-16 (a) refusal — it has no
 *     round trip to be unfaithful, because it DELETES the line — so the count was simply lost on
 *     conversion, which this bullet recorded and named D-41 as the fix for. It is the fix now.
 *     Both rails compose their item through the same `buildPlanItemValues`, so the count travels
 *     on both by construction rather than by a second decision taken here (s18 rule 1).
 *
 * OWNERSHIP IS RE-DERIVED FROM THE RECORD (s14), even though the route checks it too: the trip
 * must be this caller's, and a cart line that is not this caller's is skipped SILENTLY — naming it
 * would confirm to a prober that the id exists (the `POST /api/conversations/start` posture).
 */
export type ConvertCartLinesResult = {
  converted: number;
  itemIds: string[];
  /** Lines that named nothing a plan item can carry. Reported, never silent (s13). */
  skipped: Array<{ cartItemId: string; reason: CartLineSkipReason }>;
};

export async function convertCartLinesToItems(
  userId: string,
  tripId: string,
  cartItemIds: string[],
): Promise<ConvertCartLinesResult> {
  const out: ConvertCartLinesResult = { converted: 0, itemIds: [], skipped: [] };

  const [trip] = await db
    .select({ id: trips.id, userId: trips.userId, startDate: trips.startDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip || !trip.userId || trip.userId !== userId) {
    logger.warn(
      { tripId, userId },
      "cart-projection: refusing to convert cart lines into a trip the caller does not own",
    );
    return out;
  }

  for (const cartItemId of cartItemIds) {
    const [line] = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.id, cartItemId))
      .limit(1);
    // Absent, or not this caller's — the SAME silence for both (see the doc above).
    if (!line || line.userId !== userId) continue;

    const resolved = await resolveCartLineSubject(line, userId, { refusePricelessListing: false });
    if (!resolved.ok) {
      out.skipped.push({ cartItemId: line.id, reason: resolved.reason });
      continue;
    }

    try {
      const itemId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(itineraryItems)
          .values(
            buildPlanItemValues({
              tripId,
              line,
              subject: resolved.subject,
              tripStartDate: trip.startDate ?? null,
            }) as any,
          )
          .returning({ id: itineraryItems.id });
        // THE MOVE. This module is the single writer of `cart_items` (LD 39), so the delete is
        // written here rather than through the Section 1 passthrough, which cannot join this
        // transaction. A line already gone loses the race and the whole conversion rolls back.
        const removed = await tx
          .delete(cartItems)
          .where(eq(cartItems.id, line.id))
          .returning({ id: cartItems.id });
        if (removed.length === 0) throw new CartLineRacedError();
        return created.id;
      });
      out.converted += 1;
      out.itemIds.push(itemId);
    } catch (err) {
      if (err instanceof CartLineRacedError) {
        out.skipped.push({ cartItemId: line.id, reason: "raced" });
        continue;
      }
      logger.error(
        { err, cartItemId: line.id, tripId },
        "cart-projection: failed to convert a cart line into a plan item",
      );
      out.skipped.push({ cartItemId: line.id, reason: "raced" });
    }
  }

  return out;
}

/**
 * What `POST /api/cart/resolve-trip` tells the traveler about the plan it just built.
 *
 * s13 — THE ABSENCES ARE ANSWERS, AND THEY ARE DIFFERENT ONES.
 *   • `created` is always present: 0 is a real count, not a missing one.
 *   • `skipped` is present ONLY when a platform line did not become an item, and it names WHY —
 *     so the surface can say what the plan does not hold instead of quietly holding less than the
 *     cart does.
 *   • `externalItemsNotProjected` is present ONLY when the caller sent external/affiliate
 *     descriptors. Those have no `cart_items` rows at all (they live in the client's
 *     sessionStorage), so there is nothing to materialize and the plan says so rather than
 *     pretending to carry them.
 * A resolve that materialized everything answers `{ created: n }` and nothing else.
 */
export function describePlanItemMaterialization(
  result: MaterializeCartLinesResult,
  externalItemCount: number,
): {
  created: number;
  skipped?: Array<{ cartItemId: string; reason: CartLineSkipReason }>;
  externalItemsNotProjected?: number;
} {
  return {
    created: result.created,
    ...(result.skipped.length > 0 ? { skipped: result.skipped } : {}),
    ...(externalItemCount > 0 ? { externalItemsNotProjected: externalItemCount } : {}),
  };
}
