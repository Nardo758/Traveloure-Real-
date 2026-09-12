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
import { trips, itineraryItems, readyMadeTrips, readyMadePurchases, expertEarnings, platformRevenue, tripCollaborators, users } from "@shared/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getBand, getExpertSplitRates, PROCESSING_FEE_RATE } from "./commission";
import { READY_MADE_TRIP_BAND } from "./fee-band-requirements";
import { availableAtFor, holdWindowDays } from "../config/earnings-hold.config";
import { resolveTripTimezone } from "./trip-timezone";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

export interface FulfillResult {
  purchase: typeof readyMadePurchases.$inferSelect;
  cloneTripId: string | null;
  alreadyFulfilled: boolean;
}

/** Platform take for a ready-made sale — the migration-133 `ready_made_trip` band (§8, no literal). */
export async function resolveReadyMadeTakeRate(): Promise<number> {
  const band = await getBand(READY_MADE_TRIP_BAND);
  if (band && band.rateType === "percent" && band.rate > 0 && band.rate < 1) return band.rate;
  // Same fallback posture as the resolver's data-model default: survive a missing band with the
  // expert_standard band (admin-editable; ruling 25) rather than refusing a paid buyer their clone.
  return (await getExpertSplitRates()).platformFeeRate;
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

  // The trip-level "Note from your expert" (§21, expertTravelerNote) is part of what the buyer
  // paid for — it renders atop the delivered plan. It lives on the SOURCE trip (not the listing
  // row), so read it from there and carry it onto the clone. The PRIVATE build-notes field
  // (trips.expertNotes, §21) is deliberately NOT read — it must never reach a traveler surface.
  const [sourceTrip] = await db
    .select({ expertTravelerNote: trips.expertTravelerNote })
    .from(trips)
    .where(eq(trips.id, listing.sourceTripId))
    .limit(1);

  // Lane S ruling 17: every trip mints its identity at birth — one scheme, no exceptions.
  const trackingNumber = await storage.generateTrackingNumber("TRV");
  const [cloneTrip] = await db
    .insert(trips)
    .values({
      userId: purchase.buyerId,   // the BUYER owns the clone — it appears in all their trip surfaces
      authorId: null,             // a clone is a normal traveler trip, never authoring-mode
      title: listing.title,
      destination: listing.market,
      trackingNumber,
      // §21: the traveler-facing expert note travels with the plan (private expertNotes does not).
      expertTravelerNote: sourceTrip?.expertTravelerNote ?? null,
      // Ledger `2026-09-04-plan-mint` (CLAUDE.md entry 30): the clone carries the plan's IANA zone,
      // derived server-side from the listing's market by the ONE shared module. NULL when the
      // market resolves to none of the operating markets — "not captured", honoured as such (§13).
      // The pre-trip EVENT pen is deliberately NOT drained here: the buyer bought a fixed plan, and
      // injecting their own held chips into a purchased product is content that plan never claimed.
      timezone: resolveTripTimezone(listing.market),
      // Locked Decision 42 (D12) / ledger `2026-09-05-mint-market-slug-invariant`: market_slug is a
      // MINT INVARIANT for EVERY mint, derived from the same destination by the same ONE resolver
      // as the zone directly above (§18 rule 1). A clone is an ordinary traveler plan, so it is
      // market-scoped like any other; a listing whose `market` is none of the 8 operating markets
      // resolves to NULL and stays NULL — "not one of our markets", never a nearest guess (§13).
      marketSlug: resolveMarketSlug(listing.market),
      // Placeholder window sized to the plan; the buyer re-dates it in their own planner.
      startDate: fmt(start),
      endDate: fmt(end),
      status: "draft",
    } as any)
    .returning();

  // L10 owner row (same posture as storage.createTrip): without it the BUYER 403s on
  // their own just-purchased clone's Trip Card until the boot-time backfill seed runs —
  // the highest-probability real victim in the L10 audit. If this fulfil loses the §15
  // claim race below, the orphan-trip delete cascades this row away too (FK CASCADE).
  await db
    .insert(tripCollaborators)
    .values({ tripId: cloneTrip.id, userId: purchase.buyerId, role: "owner" })
    .onConflictDoNothing();

  const sourceItems = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, listing.sourceTripId));
  if (sourceItems.length > 0) {
    await db.insert(itineraryItems).values(
      sourceItems.map(({ id: _id, tripId: _tripId, createdAt: _c, updatedAt: _u, ...rest }: any) => ({
        ...rest,
        tripId: cloneTrip.id,
        routing_status: "in_planning", // §3.1: explicit override — cloned items must never inherit author-side routing state
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

  // Record platform revenue for this sale — mirrors the booking_commission pattern
  // (server/services/booking.service.ts:721-729). §15: guarded by insertPlatformRevenueOnce
  // with metadata.paymentIntentId so the migration-244 DB unique index (not just the
  // advisory read-then-write check) blocks a double-write on any Stripe retry or
  // concurrent duplicate submission. Non-fatal so a bookkeeping failure never blocks
  // the buyer's fulfilled clone.
  try {
    const grossAmount = purchase.pricePaidCents / 100;
    const platformFee = grossAmount - expertShare;
    const processingFees = platformFee * PROCESSING_FEE_RATE;
    const netAmount = platformFee - processingFees;
    await storage.insertPlatformRevenueOnce({
      sourceType: "ready_made_commission",
      sourceId: purchase.id,
      grossAmount: String(grossAmount),
      platformFee: String(platformFee),
      netAmount: String(netAmount),
      processingFees: String(processingFees),
      currency: purchase.currency || "USD",
      expertId: listing.authorId,
      expertEarnings: String(expertShare),
      description: `Ready-made trip sale commission: ${listing.title}`,
      metadata: { paymentIntentId: purchase.stripePaymentIntentId },
      status: "recorded",
      transactionDate: new Date(),
    } as any);
  } catch (err) {
    console.error(`Failed to record platform revenue for ready-made purchase ${purchase.id}:`, err);
  }

  return { purchase: claimed, cloneTripId: cloneTrip.id, alreadyFulfilled: false };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RECOVERY PATH — ONE fulfilment implementation, TWO callers
// (ledger 2026-09-12-readymade-recovery-path; CLAUDE.md §15b/§15c, ruling 40/§17)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// WHAT WAS BROKEN. The `ready_made_purchases` row was written by exactly ONE thing in the whole
// platform: the buyer's OWN BROWSER calling `POST /api/ready-made/:id/purchase/confirm` after the
// Stripe sheet returned. The `payment_intent.succeeded` webhook — the platform's authoritative
// late signal — keys on `metadata.bookingIds`, which a ready-made PaymentIntent never carries, so
// it read the delivery and did nothing at all. A tab closed between capture and confirm meant:
// money taken, NO purchase row, NO clone, NO author earning, and not one line in any log. The cart
// rail has three recovery layers (client confirm / webhook / TTL sweep — §15b/§15c); this rail had
// ZERO. The V-3 detector lane (ledger 2026-09-12-readymade-reconciliation-rail) made the hole
// VISIBLE as `rm_pi_succeeded_no_purchase` and deliberately did not fill it, because a detector
// that fulfils is a fourth unreviewed writer on the money path (§17). This is the fill, and it is
// on the WEBHOOK, where authorization arriving late belongs.
//
// THE SHAPE IS §15c's, ONE TABLE OVER. `fulfillReadyMadePurchase` above is THE fulfilment
// implementation and it is UNCHANGED by this lane — the webhook becomes its second caller, exactly
// as `handlePaymentSucceeded` and `POST /api/bookings/confirm-payment` both drive the ONE
// `promotePaidCheckout`. What the webhook additionally needs — turning a succeeded PaymentIntent
// into the purchase ROW that fulfilment takes an id of — is the confirm route's own INSERT, so that
// too becomes ONE implementation with two callers rather than a second author of
// `ready_made_purchases` (§18 rule 1). The confirm route keeps its session gate, its IDOR
// cross-check and its response shape verbatim; it hands the retrieved intent to the function below
// instead of re-typing the insert.
//
// NO NEW WRITE WAS ADDED TO THE PURCHASE PATH TO MAKE THIS WORK (§17 rule 4's reasoning). The
// linkage is the metadata `POST /api/ready-made/:id/purchase` already writes server-side —
// `{ type: 'ready_made_purchase', listingId, buyerId }` — which is why this recovery works for
// PaymentIntents that ALREADY EXIST, not only for future ones.
//
// IDEMPOTENCY IS STRUCTURAL AND STAYS THAT WAY (§15).
// `ready_made_purchases.stripe_payment_intent_id` is NOT NULL and UNIQUE, so the
// INSERT … ON CONFLICT DO NOTHING *is* the guard — never a check-then-insert, which is the TOCTOU
// bug this codebase has already paid for. Downstream, `fulfillReadyMadePurchase`'s atomic
// `paid → cloned` conditional is the second guard: the loser deletes its own orphan clone and only
// the WINNER credits the author. So a double signal — a webhook delivery racing the buyer's own
// confirm, or two deliveries of the same event — yields ONE row, ONE clone trip, ONE author earning
// and ONE platform-revenue row.
//
// §15b — IRREVERSIBLE EFFECTS FOLLOW AUTHORIZATION. This runs only after Stripe's own word that the
// money is captured, and it re-runs nothing non-idempotent that the confirm path may already have
// done: every effect below is either the ON CONFLICT insert, the atomic claim, or guarded by
// `insertPlatformRevenueOnce`'s unique index.
//
// §13 — AN UNRESOLVABLE PAYMENTINTENT IS NOT INVENTED INTO A PURCHASE. A deleted listing, a buyer
// whose account is gone, or metadata that names neither: this creates NOTHING and says why. It is
// left exactly where it already was — in the detector's `rm_pi_succeeded_no_purchase` bucket, for a
// human to decide refund vs. manual fulfilment. An unresolvable PaymentIntent has no honest
// fulfilment, and the worst possible answer is a purchase row pointing at a listing nobody sold.

/**
 * Which server-verified signal is recording this purchase.
 *
 * There is deliberately NO client actor. `buyer_confirm` is the confirm ROUTE — which holds a
 * session user and has itself RETRIEVED the PaymentIntent from Stripe with the platform's own
 * secret key; the only thing the browser supplies on that path is an id string, and the route
 * cross-checks the retrieved metadata against the session user and the route's listing before it
 * ever gets here. See `SERVER_VERIFIED_ACTORS` for the capability that separates the two.
 */
export type ReadyMadePurchaseActor = "webhook" | "buyer_confirm";

/**
 * §15c's authorization clause, verbatim and unweakened: **only a SIGNATURE-VERIFIED Stripe
 * delivery may resolve a purchase from PaymentIntent metadata alone.**
 *
 * The capability at stake here is RECOVERY: creating a `ready_made_purchases` row for a buyer who
 * is not present, identified by nothing but `metadata.buyerId`. That is Stripe's word about who
 * paid, and it is trustworthy exactly when the PaymentIntent object arrived through a
 * signature-verified `payment_intent.succeeded` delivery. Any other actor MUST name the buyer and
 * the listing its own authenticated context already established, and Stripe's metadata must agree —
 * so a PaymentIntent id lifted from somebody else's checkout resolves nothing and fulfils nothing.
 *
 * This is the ready-made rail's N17c. Do not add an actor to this set to make a caller simpler.
 */
const SERVER_VERIFIED_ACTORS: ReadonlySet<ReadyMadePurchaseActor> = new Set<ReadyMadePurchaseActor>([
  "webhook",
]);

/** The metadata `POST /api/ready-made/:id/purchase` stamps server-side on every ready-made PI. */
export const READY_MADE_INTENT_TYPE = "ready_made_purchase";

/**
 * The slice of a Stripe PaymentIntent this rail reads. Narrowed deliberately: a webhook delivery
 * and a `paymentIntents.retrieve` both satisfy it, and a test can construct one without a network.
 */
export interface ReadyMadeIntentView {
  id: string;
  status: string;
  amount: number;
  amount_received?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

export type ReadyMadeRecordRefusal =
  | "not_a_ready_made_intent"
  | "payment_not_succeeded"
  | "amount_not_fully_captured"
  | "metadata_incomplete"
  | "metadata_mismatch"
  | "unverified_actor_without_expectation"
  | "listing_not_found"
  | "buyer_not_found"
  | "purchase_row_unresolvable";

export type ReadyMadeRecordResult =
  | { ok: true; purchaseId: string; createdRow: boolean; fulfilment: FulfillResult }
  | { ok: false; reason: ReadyMadeRecordRefusal; message: string };

/**
 * Record a ready-made purchase from a server-verified PaymentIntent and drive the ONE fulfilment.
 *
 * `intent` is the PaymentIntent as STRIPE stated it — a signature-verified delivery object, or the
 * confirm route's own `paymentIntents.retrieve`. NEVER a client-shaped body: the only amounts read
 * from it are `amount`/`amount_received`, which are what Stripe authorized and captured (§14 — the
 * charge was server-derived from the listing at PI creation, and `price_paid_cents` records what
 * was actually taken, never a client number and never the listing's possibly-since-changed price).
 *
 * `expect` is what the caller's own authenticated context says this purchase must be. It is
 * REQUIRED for any actor outside `SERVER_VERIFIED_ACTORS`.
 */
export async function recordAndFulfilReadyMadePurchase(opts: {
  intent: ReadyMadeIntentView;
  actor: ReadyMadePurchaseActor;
  expect?: { listingId?: string | null; buyerId?: string | null };
}): Promise<ReadyMadeRecordResult> {
  const { intent, actor, expect } = opts;

  // ── 1. Is this ours at all? ─────────────────────────────────────────────────────────────────
  if (intent?.metadata?.type !== READY_MADE_INTENT_TYPE) {
    return {
      ok: false,
      reason: "not_a_ready_made_intent",
      message: `PaymentIntent ${intent?.id ?? "<none>"} is not a ready-made purchase`,
    };
  }

  // ── 2. Stripe's own word that the money is captured (§15b: authorization BEFORE effects) ────
  if (intent.status !== "succeeded") {
    return {
      ok: false,
      reason: "payment_not_succeeded",
      message: `Payment not completed (status: ${intent.status})`,
    };
  }
  // §14: verify what was CAPTURED against what was AUTHORIZED — both Stripe's own figures, the
  // amount locked server-side from the listing price at PI creation. A partial capture is not a
  // paid purchase, and fulfilling one would hand over the product for less than was agreed. It is
  // deliberately NOT compared against the listing's CURRENT price: a listing may legitimately be
  // repriced after a sale, and refusing then would strand a buyer who paid exactly what they were
  // quoted (the same reasoning the detector's `rm_amount_mismatch` note states).
  const captured = Number(intent.amount_received ?? intent.amount);
  if (!Number.isFinite(captured) || captured !== Number(intent.amount)) {
    return {
      ok: false,
      reason: "amount_not_fully_captured",
      message: `PaymentIntent ${intent.id} captured ${captured} of ${intent.amount} — not a completed purchase`,
    };
  }

  // ── 3. Resolve the purchase from metadata the PURCHASE ROUTE wrote server-side ──────────────
  const listingId = intent.metadata?.listingId ?? null;
  const buyerId = intent.metadata?.buyerId ?? null;
  if (!listingId || !buyerId) {
    return {
      ok: false,
      reason: "metadata_incomplete",
      message: `PaymentIntent ${intent.id} carries no listingId/buyerId — nothing to resolve`,
    };
  }

  // §15c's clause, enforced structurally: an actor that is not a signature-verified delivery may
  // not resolve a buyer from metadata alone — it must name the buyer and listing its own
  // authenticated context already established, and Stripe's metadata must agree.
  if (!SERVER_VERIFIED_ACTORS.has(actor) && (!expect?.buyerId || !expect?.listingId)) {
    return {
      ok: false,
      reason: "unverified_actor_without_expectation",
      message: `actor '${actor}' may not resolve a ready-made purchase from PaymentIntent metadata alone`,
    };
  }
  if (
    (expect?.listingId != null && expect.listingId !== listingId) ||
    (expect?.buyerId != null && expect.buyerId !== buyerId)
  ) {
    return {
      ok: false,
      reason: "metadata_mismatch",
      message: "PaymentIntent does not match this purchase",
    };
  }

  // §13: a PaymentIntent naming a listing or a buyer that no longer exists is NOT invented into a
  // purchase. Creating nothing leaves it exactly where the detector already reports it
  // (`rm_pi_succeeded_no_purchase`) — a human decides refund vs. manual fulfilment.
  const [listing] = await db
    .select({ id: readyMadeTrips.id })
    .from(readyMadeTrips)
    .where(eq(readyMadeTrips.id, listingId))
    .limit(1);
  if (!listing) {
    return {
      ok: false,
      reason: "listing_not_found",
      message: `listing ${listingId} named by PaymentIntent ${intent.id} does not exist`,
    };
  }
  const [buyer] = await db.select({ id: users.id }).from(users).where(eq(users.id, buyerId)).limit(1);
  if (!buyer) {
    return {
      ok: false,
      reason: "buyer_not_found",
      message: `buyer ${buyerId} named by PaymentIntent ${intent.id} does not exist`,
    };
  }

  // ── 4. The row. The UNIQUE stripe_payment_intent_id IS the guard (§15) ──────────────────────
  // One purchase per payment, ever — a second delivery, a retry, or the buyer's own confirm
  // arriving alongside inserts nothing and falls through to the idempotent fulfilment below.
  const inserted = await db
    .insert(readyMadePurchases)
    .values({
      buyerId,
      readyMadeTripId: listingId,
      pricePaidCents: intent.amount, // what Stripe captured — never re-read the listing, never a client number
      currency: (intent.currency ?? "usd").toUpperCase(),
      stripePaymentIntentId: intent.id,
      status: "paid",
    } as any)
    .onConflictDoNothing({ target: readyMadePurchases.stripePaymentIntentId })
    .returning({ id: readyMadePurchases.id });

  const purchaseId =
    inserted[0]?.id ??
    (
      await db
        .select({ id: readyMadePurchases.id })
        .from(readyMadePurchases)
        .where(eq(readyMadePurchases.stripePaymentIntentId, intent.id))
        .limit(1)
    )[0]?.id;
  if (!purchaseId) {
    return {
      ok: false,
      reason: "purchase_row_unresolvable",
      message: "Failed to record purchase",
    };
  }

  // ── 5. The ONE fulfilment, unchanged and idempotent (§18 rule 1) ────────────────────────────
  const fulfilment = await fulfillReadyMadePurchase(purchaseId);
  return { ok: true, purchaseId, createdRow: Boolean(inserted[0]?.id), fulfilment };
}

/**
 * Q3 (ledger 2026-08-22-concierge-p3): server-side outer bound on the ADMIN refund path — safely
 * inside Stripe's ~120–180-day refund floor so the Stripe leg can never fail after the ledger
 * flip. Not a fee/rate (§8-exempt): it is a recoverability window, like holdWindowDays.
 */
const ADMIN_REFUND_OUTER_BOUND_DAYS = 90;

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
 * the window by construction), and REVOKE the product: the clone trip is deleted — UNLESS the
 * buyer has already booked/purchased on it, in which case the clone is preserved (soft-revoke)
 * so the refund can never destroy the buyer's own work or orphan a live paid charge (see the
 * guard at the delete site). A refunded buyer with no paid history does not keep the itinerary.
 */
export async function refundReadyMadePurchaseLedger(
  purchaseId: string,
  buyerId: string | null,
  opts: { actor?: "buyer" | "admin" } = {},
): Promise<RefundLedgerResult> {
  // Ledger 2026-08-22-concierge-p3: ONE refund implementation, TWO actors (L6 — the §15c
  // "one promotion, two callers" shape applied to refunds). actor:'buyer' (the default; the
  // 2-arg legacy form) keeps the original behavior verbatim. actor:'admin' is the dispute
  // escape hatch: buyer-identity gate skipped (admin proven by session role at the route),
  // the 7-day window replaced by a 90-day outer bound (ratified Q3 — safely inside Stripe's
  // ~120-180-day refund floor so the Stripe leg can't fail AFTER the ledger flip), the clone
  // ALWAYS soft-revoked (ratified Q2 — weeks later the buyer may have invested heavily), and
  // a paid-out author earning REFUSES the refund (ratified Q1 "prevent that from happening":
  // the escape hatch only works while the money is still recoverable — never pay both sides).
  const actor = opts.actor ?? "buyer";
  const [purchase] = await db
    .select()
    .from(readyMadePurchases)
    .where(eq(readyMadePurchases.id, purchaseId))
    .limit(1);
  // 404 for not-yours too — don't leak other buyers' purchase ids.
  if (!purchase || (actor === "buyer" && purchase.buyerId !== buyerId)) {
    return { ok: false, status: 404, message: "Purchase not found" };
  }
  if (purchase.status === "refunded") {
    return { ok: true, purchase, alreadyRefunded: true };
  }
  if (purchase.status === "revoked") {
    return { ok: false, status: 409, message: "Purchase is not refundable" };
  }

  const purchasedAt = purchase.purchasedAt ? new Date(purchase.purchasedAt) : null;
  if (actor === "buyer") {
    const windowMs = holdWindowDays("ready_made_sale") * 24 * 60 * 60 * 1000;
    if (!purchasedAt || Date.now() > purchasedAt.getTime() + windowMs) {
      return {
        ok: false,
        status: 409,
        message: `refund_window_closed: refunds are available for ${holdWindowDays("ready_made_sale")} days after purchase`,
      };
    }
  } else {
    // Q3: 90-day server-side outer bound on the admin path — older cases are manual ops by
    // construction rather than a Stripe failure after the ledger already flipped.
    const adminWindowMs = ADMIN_REFUND_OUTER_BOUND_DAYS * 24 * 60 * 60 * 1000;
    if (!purchasedAt || Date.now() > purchasedAt.getTime() + adminWindowMs) {
      return {
        ok: false,
        status: 409,
        message: `admin_refund_window_closed: admin refunds are available for ${ADMIN_REFUND_OUTER_BOUND_DAYS} days after purchase`,
      };
    }
    // Q1 "prevent": if the author's earning already left the platform, this refund would pay
    // both sides — refuse instead of silently under-reversing (the skippedPaidOut lesson).
    const [paidOut] = await db
      .select({ id: expertEarnings.id })
      .from(expertEarnings)
      .where(and(
        eq(expertEarnings.referenceId, purchaseId),
        eq(expertEarnings.type, "ready_made_sale"),
        eq(expertEarnings.status, "paid_out"),
      ))
      .limit(1);
    if (paidOut) {
      return {
        ok: false,
        status: 409,
        message: "author_paid_out: the author's earning was already paid out — not refundable through this path; dismiss the dispute or handle manually",
      };
    }
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

  // Mirror storage.reversePlatformRevenueForBooking's double-entry reversal (server/storage.ts:3615-3638):
  // the atomic status flip (WHERE status <> 'reversed') IS the idempotency guard — a duplicate refund
  // call finds 0 rows and inserts no second compensating entry. Non-fatal: bookkeeping must never
  // block the refund ledger.
  try {
    const now = new Date();
    const reversedRows = await db
      .update(platformRevenue)
      .set({ status: "reversed" } as any)
      .where(and(eq(platformRevenue.sourceId, purchaseId), ne(platformRevenue.status, "reversed")))
      .returning();
    for (const o of reversedRows) {
      const neg = (v: string | null) => String(-parseFloat(v || "0"));
      await storage.recordPlatformRevenue({
        sourceType: o.sourceType,
        sourceId: o.sourceId,
        trackingNumber: o.trackingNumber,
        grossAmount: neg(o.grossAmount),
        platformFee: neg(o.platformFee),
        netAmount: neg(o.netAmount),
        processingFees: neg(o.processingFees),
        currency: o.currency,
        expertId: o.expertId,
        expertEarnings: neg(o.expertEarnings),
        providerId: o.providerId,
        providerEarnings: neg(o.providerEarnings),
        description: `Reversal of platform revenue ${o.id} (ready-made purchase ${purchaseId})`,
        metadata: { reversalOf: o.id, reason: "ready_made_refund" },
        status: "reversed",
        transactionDate: now,
      } as any);
    }
  } catch (err) {
    console.error(`Failed to reverse platform revenue for ready-made purchase ${purchaseId}:`, err);
  }

  // Revoke the product. On the ADMIN path the clone is ALWAYS preserved (ratified Q2,
  // ledger 2026-08-22-concierge-p3 — "the buyer keeps the trip": weeks later they may have
  // invested heavily in it, and every admin-refund surface promises "the buyer keeps their
  // trip"). Only the legacy buyer path (the self-serve /refund route, RETIRED in P3) runs the
  // conditional delete below — and even there it never deletes a clone carrying paid itinerary
  // history, because an unconditional delete would (a) cascade-destroy the buyer's own
  // itinerary_items (trip_id ON DELETE CASCADE) and (b) orphan a live, separately-paid
  // service_booking (trip_id ON DELETE SET NULL) this refund never touches — a live un-refunded
  // charge pointing at a deleted trip, and the bookings-have-purchased-items invariant broken.
  // (The ratified "concierge revision instead of refund" model never destroys the clone at all,
  // which is why the admin escape hatch preserves it unconditionally.)
  if (actor === "buyer" && claimed.cloneTripId) {
    const [paidItem] = await db
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(and(
        eq(itineraryItems.tripId, claimed.cloneTripId),
        sql`(${itineraryItems.routingStatus} = 'purchased' OR ${itineraryItems.bookingId} IS NOT NULL)`,
      ))
      .limit(1);
    if (!paidItem) {
      await db.delete(trips).where(eq(trips.id, claimed.cloneTripId));
    }
  }

  return { ok: true, purchase: claimed, alreadyRefunded: false };
}
