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
import { cartItems, itineraryItems, providerServices, trips } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
// V-11's predicate, the ONE translation of `provider_services.price` into the `hasPrice` fact
// `resolveBuyAction` decides on (ledger `2026-09-13-cart-priceless-gap`, s18 rule 1).
import { hasPublishedPrice } from "./buy-action-payload";

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
      reason: "item_missing" | "no_owner" | "not_projected" | "no_published_price";
    };

/** contentType marker for a projected item that has no `providerServiceId`. */
const EXTERNAL_PROJECTION_CONTENT_TYPE = "itinerary_item";

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
    if (svc?.pricingUnit === "per_night") {
      stayMeta = stayContentMeta(item.checkIn, item.checkOut);
    }
  }

  const values = {
    userId: ownerId,
    guestSessionId: null as string | null,
    serviceId: item.providerServiceId ?? null,
    customVenueId: null as string | null,
    // External / free-text plan items keep the content-item shape the cart already renders
    // (storage._enrichCartItems branches on contentId+contentType). Real display strings only —
    // never an invented price or image (§13).
    contentType: item.providerServiceId ? null : EXTERNAL_PROJECTION_CONTENT_TYPE,
    contentId: item.providerServiceId ? null : item.id,
    contentMeta: item.providerServiceId
      ? // A per-night stay carries its night range; every other service keeps today's empty
        // object byte-for-byte. `stayMeta` is null whenever the listing is not per-night or the
        // item's range is absent/unparseable, so nothing is invented (§13).
        (stayMeta ?? {})
      : {
          ...(item.title ? { name: item.title } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.locationName ? { city: item.locationName } : {}),
          ...(item.estimatedCost ? { price: String(item.estimatedCost) } : {}),
          // D-4 (ruling 2026-09-15; ledger `2026-09-15-d4-item-kind-contract`): the partner
          // grounding, carried so the CART can tell a `recommended` line from an `external` one.
          // This branch already is the item's ONE copy-down (LD 39) — the cart row is written
          // FROM the item here and nowhere else — so the fact travels with the rest of the
          // display envelope rather than through a second copier (§18 rule 1).
          //
          // DISPLAY ONLY, AND IT MOVES NO MONEY. This whole branch is the NO-SERVICE case, which
          // checkout's subtotal and booking loops both skip (`if (!item.service) continue;`); the
          // id is the same one the plancard already publishes for agent-bookable items, and the
          // affiliate URL is still never emitted (§16). PRESENT ONLY when the item names one, so
          // a row that names none is byte-identical to before (§13 — absent means "names none").
          ...(item.affiliateProductId ? { affiliateProductId: item.affiliateProductId } : {}),
        },
    quantity: 1,
    tripId: item.tripId,
    scheduledDate: item.scheduledDate ? new Date(item.scheduledDate) : null,
    // The traveler's picked slot rides the projection (migration 275). INTENT only — the
    // capacity claim is still the atomic `storage.bookSlot` at checkout (§15), never here.
    // NULL when the item names no slot, which is every pre-275 row and every non-dated service.
    slotId: item.slotId ?? null,
    itineraryItemId: item.id,
  };

  const [existing] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(eq(cartItems.itineraryItemId, item.id))
    .limit(1);

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
//   • custom venue   — REFUSED. `itinerary_items` has no column pointing at `custom_venues`, so
//                      the line's own subject could not survive the round trip.
//   • content line   — REFUSED. A gem/hotel/activity row names a piece of CONTENT, not a
//                      listing; the round trip would rewrite its `contentType`/`contentId` and
//                      lose the link back to the source. `/api/cart/convert-to-itinerary` is
//                      that shape's existing home, and it MOVES the row (it deletes the cart
//                      line) rather than projecting it.
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

/** Why one cart line did not become a plan item. Reported, never silent (s13). */
export type CartLineSkipReason =
  | "quantity_gt_one"
  | "custom_venue"
  | "content_line"
  | "no_subject"
  | "service_missing"
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

    if (line.customVenueId) { skip("custom_venue"); continue; }
    if (!line.serviceId) { skip(line.contentId ? "content_line" : "no_subject"); continue; }
    if ((line.quantity ?? 1) > 1) { skip("quantity_gt_one"); continue; }

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
    if (!svc) { skip("service_missing"); continue; }
    if (!hasPublishedPrice(svc.price)) { skip("no_published_price"); continue; }

    const meta = (line.contentMeta ?? {}) as Record<string, unknown>;
    // The SAME predicate Section 2 projects a stay through, so the round trip reproduces the
    // night range the money path reads. s13: an unparseable range yields NOTHING.
    const stay = svc.pricingUnit === "per_night" ? stayContentMeta(meta.checkIn, meta.checkOut) : null;
    // s13: `provider_services.location` defaults to the literal "Unknown" — that is the ABSENCE
    // of a location, not a place name, and must never be copied onto a plan item (the same call
    // `/api/cart/convert-to-itinerary` already makes).
    const locationName = svc.location && svc.location !== "Unknown" ? svc.location : null;
    const scheduled = line.scheduledDate ? new Date(line.scheduledDate) : null;

    try {
      const itemId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(itineraryItems)
          .values({
            tripId,
            // NOT NULL. The LISTING'S OWN NAME — the one fact the column forces us to carry, and
            // the same source `/api/cart/convert-to-itinerary` reads. Never invented.
            title: svc.serviceName,
            description: svc.shortDescription ?? null,
            // The listing's own pricing unit is the listing's own statement about what it is.
            // Everything else takes the column default (`activity`) rather than a guess.
            ...(svc.pricingUnit === "per_night" ? { itemType: "accommodation" } : {}),
            dayNumber: resolvePlanDayNumber(scheduled, trip.startDate ?? null),
            // The line's own facts, and only those. No invented date, no invented title, and no
            // party size — `quantity` is units of the listing and is never promoted into one
            // (punchlist D-14), which is also why a multi-unit line is refused above.
            scheduledDate: scheduled ? toYmd(scheduled) : null,
            slotId: line.slotId ?? null,
            providerServiceId: svc.id,
            ...(stay ? { checkIn: stay.checkIn, checkOut: stay.checkOut } : {}),
            locationName,
            latitude: svc.latitude ?? null,
            longitude: svc.longitude ?? null,
            notes: line.notes ?? null,
            // NO `estimatedCost`: the plan reads this listing's price through the service link,
            // and a copied number is a second, staleable statement of an amount (s8/s14 posture).
            // LD 12 / LD 42 D23: the TRAVELER chose these lines — not an AI draft, not expert
            // work. `origin` decides what the optimizer may rewrite and what the item row's
            // provenance chip says, so it is stamped server-side here and settable nowhere else.
            origin: "traveler",
            suggestedBy: "user",
            status: "planned",
            // LD 39: the cart IS the `ready_for_checkout` projection of this table, so a line
            // sitting in the cart IS that state — this is a READ of the row that already exists,
            // not a routing TRANSITION (those belong to routing.routes.ts, which is why
            // `storage.createItineraryItem` strips the column and is deliberately not used here).
            // Born `in_planning` instead would make the very next sync DELETE the cart line.
            routingStatus: "ready_for_checkout",
          })
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
