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
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { cartItems, itineraryItems, trips } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";

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
  updates: { quantity?: number; scheduledDate?: Date; notes?: string; pickupLocation?: unknown },
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

export type ProjectionSyncResult =
  | { action: "upserted"; cartItemId: string }
  | { action: "deleted"; removed: number }
  | { action: "noop"; reason: "item_missing" | "no_owner" | "not_projected" };

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
      ? {}
      : {
          ...(item.title ? { name: item.title } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.locationName ? { city: item.locationName } : {}),
          ...(item.estimatedCost ? { price: String(item.estimatedCost) } : {}),
        },
    quantity: 1,
    tripId: item.tripId,
    scheduledDate: item.scheduledDate ? new Date(item.scheduledDate) : null,
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
