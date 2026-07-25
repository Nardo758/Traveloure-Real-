/**
 * ready-made-purchase.service.ts — fulfillment for a PAID store listing (commerce lane, spec v3 §0):
 * "on purchase it clones into the buyer's editable PlanCard/trip". This is what distinguishes the
 * product from a view-only template — the buyer gets their own real trip with relational
 * itinerary_items, not an unlock.
 *
 * Mirrors the house money-safety posture (§15, the template-confirm pattern at routes.ts:3227):
 * the paid→cloned transition is claimed by an ATOMIC conditional UPDATE and only the winner
 * records the expert earning — a concurrent/duplicate fulfill loses the claim, cleans up its
 * orphan clone, and returns the winner's result. The earning is born HELD on the escrow spine
 * with the ratified 7-day `ready_made_sale` window (D7: refundable only while in escrow).
 */
import { db } from "../db";
import { storage } from "../storage";
import { trips, itineraryItems, readyMadeTrips, readyMadePurchases, expertEarnings } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getBand, PLATFORM_FEE_RATE } from "./commission";
import { availableAtFor, holdWindowDays } from "../config/earnings-hold.config";

export interface FulfillResult {
  purchase: typeof readyMadePurchases.$inferSelect;
  cloneTripId: string | null;
  alreadyFulfilled: boolean;
}

/** Platform take for a ready-made sale — the migration-133 `ready_made_trip` band (§8, no literal). */
export async function resolveReadyMadeTakeRate(): Promise<number> {
  const band = await getBand("ready_made_trip");
  if (band && band.rateType === "percent" && band.rate > 0 && band.rate < 1) return band.rate;
  // Same fallback posture as the resolver's data-model default: survive a missing band with the
  // documented default rather than refusing a paid buyer their clone. fee-literal-ok (fallback only).
  return PLATFORM_FEE_RATE;
}

/**
 * Clone the listing's source trip into the buyer's own editable trip and credit the author.
 * Idempotent: a purchase already `cloned` returns the existing clone; a lost race deletes its
 * orphan and returns the winner's clone.
 */
export async function fulfillReadyMadePurchase(purchaseId: string): Promise<FulfillResult> {
  const [purchase] = await db
    .select()
    .from(readyMadePurchases)
    .where(eq(readyMadePurchases.id, purchaseId))
    .limit(1);
  if (!purchase) throw new Error(`ready_made_purchase ${purchaseId} not found`);

  if (purchase.status === "cloned") {
    return { purchase, cloneTripId: purchase.cloneTripId ?? null, alreadyFulfilled: true };
  }
  if (purchase.status !== "paid") {
    // refunded/revoked purchases are terminal — never fulfil them.
    return { purchase, cloneTripId: purchase.cloneTripId ?? null, alreadyFulfilled: true };
  }

  const [listing] = await db
    .select()
    .from(readyMadeTrips)
    .where(eq(readyMadeTrips.id, purchase.readyMadeTripId))
    .limit(1);
  if (!listing) throw new Error(`listing ${purchase.readyMadeTripId} not found for purchase ${purchaseId}`);

  // ── Build the clone FIRST (trip + items), then claim. If the claim loses, the orphan is
  //    deleted — safer than claiming first and risking a 'cloned' row with no trip on a crash.
  const start = new Date();
  const end = new Date(start.getTime() + Math.max(0, listing.durationDays - 1) * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [cloneTrip] = await db
    .insert(trips)
    .values({
      userId: purchase.buyerId,   // the BUYER owns the clone — it appears in all their trip surfaces
      authorId: null,             // a clone is a normal traveler trip, never authoring-mode
      title: listing.title,
      destination: listing.market,
      // Placeholder window sized to the plan; the buyer re-dates it in their own planner.
      startDate: fmt(start),
      endDate: fmt(end),
      status: "draft",
    } as any)
    .returning();

  const sourceItems = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, listing.sourceTripId));
  if (sourceItems.length > 0) {
    await db.insert(itineraryItems).values(
      sourceItems.map(({ id: _id, tripId: _tripId, createdAt: _c, updatedAt: _u, ...rest }: any) => ({
        ...rest,
        tripId: cloneTrip.id,
      })),
    );
  }

  // §15: the paid→cloned transition is the concurrency guard.
  const [claimed] = await db
    .update(readyMadePurchases)
    .set({ status: "cloned", cloneTripId: cloneTrip.id } as any)
    .where(and(eq(readyMadePurchases.id, purchaseId), eq(readyMadePurchases.status, "paid")))
    .returning();

  if (!claimed) {
    // Lost the race — another fulfill already cloned. Remove our orphan (items cascade).
    await db.delete(trips).where(eq(trips.id, cloneTrip.id));
    const [winner] = await db
      .select()
      .from(readyMadePurchases)
      .where(eq(readyMadePurchases.id, purchaseId))
      .limit(1);
    return { purchase: winner, cloneTripId: winner?.cloneTripId ?? null, alreadyFulfilled: true };
  }

  // Only the claim winner credits the author (the template-confirm §15 pattern). Born HELD on the
  // escrow spine; D7: releasable after the 7-day ready_made_sale window, refund only before release.
  const takeRate = await resolveReadyMadeTakeRate();
  const expertShare = (purchase.pricePaidCents / 100) * (1 - takeRate);
  await storage.createExpertEarning({
    expertId: listing.authorId,
    type: "ready_made_sale",
    amount: expertShare.toFixed(2),
    currency: purchase.currency || "USD",
    referenceId: purchase.id,
    referenceType: "ready_made_purchase",
    description: `Ready-made trip sale: ${listing.title} (payment ${purchase.stripePaymentIntentId})`,
    status: "held",
    availableAt: availableAtFor("ready_made_sale"),
  } as any);

  return { purchase: claimed, cloneTripId: cloneTrip.id, alreadyFulfilled: false };
}

export type RefundLedgerResult =
  | { ok: true; purchase: typeof readyMadePurchases.$inferSelect; alreadyRefunded: boolean }
  | { ok: false; status: number; message: string };

/**
 * D7 refund — LEDGER half (the Stripe refund itself is the route's job, keyed idempotently).
 *
 * Ratified rule: refundable only while the money is in escrow — "no refund after the money is
 * released in 7 days". The window is the SAME clock as the earning's escrow release
 * (holdWindowDays('ready_made_sale')), so a refund can never chase money that has already
 * cleared to the author — the dispute-window alignment lesson from the escrow spine.
 *
 * Effects, §15-ordered: atomic cloned|paid → refunded claim (a duplicate refund matches 0 rows
 * and returns alreadyRefunded so the route can still retry the idempotent Stripe leg), reverse
 * the author's held/releasable earning (paid_out is never auto-clawed-back — unreachable inside
 * the window by construction), and REVOKE the product: the clone trip is deleted. A refunded
 * buyer does not keep the itinerary they were refunded for.
 */
export async function refundReadyMadePurchaseLedger(
  purchaseId: string,
  buyerId: string,
): Promise<RefundLedgerResult> {
  const [purchase] = await db
    .select()
    .from(readyMadePurchases)
    .where(eq(readyMadePurchases.id, purchaseId))
    .limit(1);
  // 404 for not-yours too — don't leak other buyers' purchase ids.
  if (!purchase || purchase.buyerId !== buyerId) {
    return { ok: false, status: 404, message: "Purchase not found" };
  }
  if (purchase.status === "refunded") {
    return { ok: true, purchase, alreadyRefunded: true };
  }
  if (purchase.status === "revoked") {
    return { ok: false, status: 409, message: "Purchase is not refundable" };
  }

  const purchasedAt = purchase.purchasedAt ? new Date(purchase.purchasedAt) : null;
  const windowMs = holdWindowDays("ready_made_sale") * 24 * 60 * 60 * 1000;
  if (!purchasedAt || Date.now() > purchasedAt.getTime() + windowMs) {
    return {
      ok: false,
      status: 409,
      message: `refund_window_closed: refunds are available for ${holdWindowDays("ready_made_sale")} days after purchase`,
    };
  }

  const [claimed] = await db
    .update(readyMadePurchases)
    .set({ status: "refunded" } as any)
    .where(and(eq(readyMadePurchases.id, purchaseId), inArray(readyMadePurchases.status, ["paid", "cloned"])))
    .returning();
  if (!claimed) {
    // Lost a race with another refund call — treat as already refunded (idempotent).
    const [current] = await db.select().from(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseId)).limit(1);
    return { ok: true, purchase: current, alreadyRefunded: true };
  }

  // Reverse the author's escrowed earning (held/releasable only — the ratified reversal rule).
  await db
    .update(expertEarnings)
    .set({ status: "reversed" } as any)
    .where(and(
      eq(expertEarnings.referenceId, purchaseId),
      eq(expertEarnings.type, "ready_made_sale"),
      inArray(expertEarnings.status, ["held", "releasable"]),
    ));

  // Revoke the product: the clone (and its items, by cascade) goes with the refund.
  if (claimed.cloneTripId) {
    await db.delete(trips).where(eq(trips.id, claimed.cloneTripId));
  }

  return { ok: true, purchase: claimed, alreadyRefunded: false };
}
