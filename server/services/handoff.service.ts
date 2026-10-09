/**
 * THE HANDOFF (step 7b, R323; surface spec §12; rulings R-n, R-q, R-s, R-t, R-bd). ONE owner of a
 * handoff's lifecycle on its ONE `expert_requests` row (migration 354's columns).
 *
 *   Ask       → quote from the EXISTING expert-review bands (`resolveExpertReviewAmount`) + the
 *               traveler service fee (Trip Pass waives it), and AUTHORIZE: a manual-capture
 *               PaymentIntent. Nothing is taken yet (R-q).
 *   Match     → routing PROPOSES an expert; the expert ACCEPTS in their inbox (R-n). Admin may
 *               override the proposal; nobody else assigns.
 *   Accept    → CAPTURE the hold, under an atomic claim taken BEFORE the Stripe call (§15b). The
 *               expert gets a §12 WRITE-status advisor row, which on a traveler's plan only ever
 *               files SUGGESTIONS (`expert-suggestions.service.ts`); scoped items move to
 *               `with_expert`.
 *   Deliver   → refused while a suggestion is open or (book / plan it all) a scoped item is unbooked.
 *   Approve   → by the traveler, or the window (R-s). The expert is PAID here (the existing R6
 *               split), never at deliver; the pen returns (scoped items back to `in_planning`, the
 *               advisor row back to read-only `pending`).
 *   Withdraw  → by stage (R-t): before accept the hold is released and nothing is kept; after, the
 *               fee is refunded less the band-named share, the traveler fee in the same proportion.
 *   Timers    → 24 h fallback offered, 48 h hold released (R-q), 7 d auto-approve (R-s).
 *
 * Every transition is ONE atomic conditional on the from-status (§15/§18b). Money amounts are
 * derived from the row and the bands, never a body (§14); no rate literal lives here (§8).
 */
import { enqueuePlanLegRecompute } from "./routing/plan-legs-queue";
import { db } from "../db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { expertRequests, itineraryItems } from "@shared/schema";
import {
  HANDOFF_FEE_TIER,
  HANDOFF_KINDS,
  HANDOFF_LIVE_STATUSES,
  WITHDRAWAL_FEE_BAND,
  ON_TRIP_SUPPORT_BAND,
  HANDOFF_EVENTS,
  changeRoundAllowed,
  deliverRefusal,
  withdrawalKeptCents,
  withdrawalStage,
  type HandoffKind,
} from "@shared/handoff";
import { handoffAutoApproveDays, handoffFallbackHours, handoffReleaseHours } from "../config/handoff.config";
import { countOpenSuggestions, supersedeOpenSuggestions } from "./expert-suggestions.service";

// ─── The Stripe seam ───────────────────────────────────────────────────────────────────────────

export interface HandoffPayments {
  authorize(input: {
    userId: string;
    tripId: string;
    kind: string;
    amountCents: number;
    idempotencyKey: string;
    destination: string | null;
    travelerServiceFee?: Record<string, unknown> | null;
    /** Smoke 13 #6: named on the PaymentIntent's metadata as `handoffRequestId`. */
    requestId?: string | null;
  }): Promise<{ clientSecret: string | null; paymentIntentId: string; amountCents: number }>;
  retrieve(paymentIntentId: string): Promise<{ id: string; status: string; amountCents: number; amountCapturableCents: number; metadata: Record<string, string> }>;
  capture(paymentIntentId: string, idempotencyKey: string): Promise<{ id: string; status: string; amountReceivedCents: number }>;
  cancel(paymentIntentId: string, idempotencyKey: string, reason?: HoldReleaseReason): Promise<{ id: string; status: string }>;
  refund(input: { requestId: string; tripId: string; paymentIntentId: string; amountCents: number; idempotencyKey: string; auditReason: string }): Promise<{ id: string; status: string | null }>;
}

let paymentsOverride: HandoffPayments | null = null;
/** Test seam: the CI Stripe key is a stub, so the money e2e drives the lifecycle through a double. */
export function __setHandoffPaymentsForTest(p: HandoffPayments | null) {
  paymentsOverride = p;
}

async function payments(): Promise<HandoffPayments> {
  if (paymentsOverride) return paymentsOverride;
  const { stripePaymentService } = await import("./stripe-payment.service");
  return {
    authorize: (i) => stripePaymentService.createHandoffAuthorization(i),
    retrieve: (id) => stripePaymentService.retrieveHandoffPaymentIntent(id),
    capture: (id, key) => stripePaymentService.captureHandoffPayment(id, key),
    cancel: (id, key, reason) => stripePaymentService.cancelPaymentIntent(id, key, reason),
    refund: (i) => stripePaymentService.refundHandoffFee(i),
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────────

export type HandoffRow = typeof expertRequests.$inferSelect;

export async function getHandoff(requestId: string): Promise<HandoffRow | null> {
  const [row] = await db.select().from(expertRequests).where(eq(expertRequests.id, requestId)).limit(1);
  return row && row.handoffKind ? row : null;
}

/** The plan's current handoff (live first, else the latest), or null. */
export async function getTripHandoff(tripId: string): Promise<HandoffRow | null> {
  const r = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE trip_id = ${tripId} AND handoff_kind IS NOT NULL
    ORDER BY (status IN (${sql.join(HANDOFF_LIVE_STATUSES.map((s) => sql`${s}`), sql`, `)}, 'authorizing')) DESC, created_at DESC
    LIMIT 1
  `);
  const id = (r.rows?.[0] as any)?.id;
  return id ? getHandoff(id) : null;
}

/** The handoffs routed to an expert and waiting for their answer (the inbox section). */
export async function listProposedForExpert(expertId: string): Promise<HandoffRow[]> {
  return db
    .select()
    .from(expertRequests)
    .where(and(eq(expertRequests.assignedExpertId, expertId), eq(expertRequests.status, "proposed"), sql`${expertRequests.handoffKind} IS NOT NULL`));
}

/** Typical hours from authorization to an expert's accept, over the last 90 days — measured or null (§13). */
export async function typicalAcceptHours(): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (accepted_at - authorized_at)) / 3600.0) AS h,
           count(*)::int AS n
    FROM expert_requests
    WHERE handoff_kind IS NOT NULL AND accepted_at IS NOT NULL AND authorized_at IS NOT NULL
      AND accepted_at > NOW() - INTERVAL '90 days'
  `);
  const row = r.rows?.[0] as any;
  if (!row || Number(row.n) < 5 || row.h == null) return null;
  return Math.max(1, Math.round(Number(row.h)));
}

// ─── Quote ─────────────────────────────────────────────────────────────────────────────────────

export interface HandoffQuote {
  kind: HandoffKind;
  scopeItemIds: string[];
  feeCents: number;
  travelerFeeCents: number;
  travelerFeeWaived: boolean;
  totalCents: number;
  travelerFeeSnapshot: Record<string, unknown> | null;
}

export type HandoffRefusal = { ok: false; status: number; code: string; message: string };

function isKind(k: unknown): k is HandoffKind {
  return typeof k === "string" && (HANDOFF_KINDS as readonly string[]).includes(k);
}

/**
 * The fee shown before confirming (§12 step 1). The scope is the ticked items ON THIS PLAN (an id
 * not on it is refused, never dropped); "plan it all" scopes every item. The fee's percent leg reads
 * the scoped items' own estimated cost — the plan's own figures, never a body amount (§14).
 */
export async function quoteHandoff(input: { tripId: string; kind: unknown; itemIds: unknown; prepaid?: boolean }): Promise<HandoffQuote | HandoffRefusal> {
  if (!isKind(input.kind)) return { ok: false, status: 400, code: "invalid_kind", message: "Choose how much help you want." };
  const kind = input.kind;
  const items = await db
    .select({ id: itineraryItems.id, estimatedCost: itineraryItems.estimatedCost })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, input.tripId));
  let scope: typeof items;
  // A prepaid revision (R-bd) reviews the whole bought plan, like "plan it all".
  if (kind === "plan_all" || input.prepaid) {
    scope = items;
  } else {
    const ids = Array.isArray(input.itemIds) ? input.itemIds.map(String) : [];
    if (ids.length === 0) return { ok: false, status: 400, code: "empty_scope", message: "Tick the stops you want help with." };
    if (ids.length > 200) return { ok: false, status: 400, code: "scope_too_large", message: "Too many stops in one ask." };
    const byId = new Map(items.map((i) => [i.id, i]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) return { ok: false, status: 400, code: "scope_not_on_plan", message: "Some ticked stops are not on this plan." };
    scope = ids.map((id) => byId.get(id)!);
  }
  const scopeItemIds = scope.map((i) => i.id);
  if (input.prepaid) {
    // R-bd: the included Ready Made revision is PREPAID — price 0, no hold, no traveler fee.
    return { kind, scopeItemIds, feeCents: 0, travelerFeeCents: 0, travelerFeeWaived: false, totalCents: 0, travelerFeeSnapshot: null };
  }
  const cost = scope.reduce((s, i) => s + (Number(i.estimatedCost) || 0), 0);
  const { resolveExpertReviewAmount } = await import("./booking-actions.service");
  const fee = await resolveExpertReviewAmount(HANDOFF_FEE_TIER[kind], cost);
  if (fee == null) return { ok: false, status: 400, code: "invalid_kind", message: "Choose how much help you want." };
  const feeCents = Math.round(fee * 100);
  const { resolveTravelerServiceFee } = await import("./fee-resolution.service");
  const { coversAction } = await import("./trip-entitlement.service");
  const covered = await coversAction(input.tripId, "traveler_service_fee").catch(() => false);
  const resolved = await resolveTravelerServiceFee(fee);
  const travelerFeeCents = covered ? 0 : Math.round(resolved.amount * 100);
  const travelerFeeSnapshot = {
    charged: travelerFeeCents / 100,
    wouldHaveBeen: resolved.amount,
    rate: resolved.rate,
    bandId: resolved.bandId,
    bandKey: resolved.bandKey,
    capApplied: resolved.capApplied,
    waived: covered,
    waiverBasis: covered ? "trip_pass" : null,
  };
  return { kind, scopeItemIds, feeCents, travelerFeeCents, travelerFeeWaived: covered, totalCents: feeCents + travelerFeeCents, travelerFeeSnapshot };
}

// ─── Ask ───────────────────────────────────────────────────────────────────────────────────────

async function tripDestination(tripId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT destination FROM trips WHERE id = ${tripId} LIMIT 1`);
  return ((r.rows?.[0] as any)?.destination as string | undefined) ?? null;
}

async function track(userId: string | null, tripId: string, eventType: string, data: Record<string, unknown>) {
  try {
    const { trackFunnelEvent } = await import("../utils/funnelTracker");
    void trackFunnelEvent({ userId: userId ?? undefined, tripId: tripId || undefined, eventType, funnelStage: "SLIP", eventData: data } as any);
  } catch {
    /* instrumentation never fails the write it describes */
  }
}

async function notify(userId: string | null | undefined, tripId: string, type: string, title: string, message: string, data: Record<string, unknown> = {}) {
  if (!userId) return;
  try {
    const { storage } = await import("../storage");
    await storage.createNotification({ userId, type, title, message, relatedId: tripId, relatedType: "trip", data: { tripId, ...data } } as any);
  } catch (err) {
    console.error(`[handoff] notification ${type} failed (non-fatal):`, err);
  }
}

/**
 * Ask (§12 step 1). One live handoff per plan: the insert is guarded in the same statement, so a
 * double tap makes one row (§15). A priced ask returns the hold's client secret; a prepaid ask
 * (R-bd) is authorized on the spot and matched.
 */
export async function askHandoff(input: {
  tripId: string;
  userId: string;
  kind: unknown;
  itemIds: unknown;
  notes?: string | null;
  prepaid?: { purchaseId: string; expertId: string } | null;
}): Promise<
  | { ok: true; request: HandoffRow; clientSecret: string | null; quote: HandoffQuote }
  | HandoffRefusal
> {
  const quote = await quoteHandoff({ tripId: input.tripId, kind: input.kind, itemIds: input.itemIds, prepaid: !!input.prepaid });
  if ("ok" in quote) return quote;
  const destination = await tripDestination(input.tripId);
  const inserted = await db.execute(sql`
    INSERT INTO expert_requests (user_id, trip_id, destination_city, request_type, expert_fee, status, notes,
                                 handoff_kind, scope_item_ids, fee_cents, traveler_fee_cents, change_rounds, source_purchase_id,
                                 optimization_context)
    SELECT ${input.userId}, ${input.tripId}, ${(destination ?? "").toLowerCase()}, ${"handoff_" + quote.kind},
           ${(quote.feeCents / 100).toFixed(2)}, 'authorizing', ${input.notes ?? null},
           ${quote.kind}, ${JSON.stringify(quote.scopeItemIds)}::jsonb, ${quote.feeCents}, ${quote.travelerFeeCents}, 0,
           ${input.prepaid?.purchaseId ?? null},
           ${JSON.stringify({ travelerFeeSnapshot: quote.travelerFeeSnapshot })}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM expert_requests
      WHERE trip_id = ${input.tripId} AND handoff_kind IS NOT NULL
        AND status IN ('authorizing', ${sql.join(HANDOFF_LIVE_STATUSES.map((s) => sql`${s}`), sql`, `)})
    )
    RETURNING id
  `);
  const id = (inserted.rows?.[0] as any)?.id as string | undefined;
  if (!id) {
    return { ok: false, status: 409, code: "handoff_in_progress", message: "This plan already has a local working on it, or an ask in progress." };
  }
  void track(input.userId, input.tripId, HANDOFF_EVENTS.requested, { kind: quote.kind, scope: quote.scopeItemIds.length, feeCents: quote.feeCents, prepaid: !!input.prepaid });

  if (quote.totalCents <= 0) {
    // Nothing to hold (prepaid revision, or a band that priced the ask at zero).
    await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW(), status = 'proposed' WHERE id = ${id} AND status = 'authorizing'`);
    if (input.prepaid?.expertId) {
      await proposeTo(id, input.prepaid.expertId);
    } else {
      await matchHandoff(id);
    }
    return { ok: true, request: (await getHandoff(id))!, clientSecret: null, quote };
  }

  const pay = await payments();
  try {
    const auth = await pay.authorize({
      userId: input.userId,
      tripId: input.tripId,
      kind: quote.kind,
      amountCents: quote.totalCents,
      idempotencyKey: `handoff-auth-${id}`,
      destination,
      travelerServiceFee: quote.travelerFeeSnapshot,
      requestId: id,
    });
    await db.execute(sql`UPDATE expert_requests SET payment_intent_id = ${auth.paymentIntentId} WHERE id = ${id} AND payment_intent_id IS NULL`);
    return { ok: true, request: (await getHandoff(id))!, clientSecret: auth.clientSecret, quote };
  } catch (err: any) {
    // No PaymentIntent exists to hold anything: the ask is released, honestly, and may be re-asked.
    await db.execute(sql`UPDATE expert_requests SET status = 'released', released_at = NOW() WHERE id = ${id} AND status = 'authorizing'`);
    return { ok: false, status: 502, code: "authorize_failed", message: err?.message || "We couldn't place the hold on your card." };
  }
}

/**
 * The card confirmed the hold (client calls this after `stripe.confirmPayment`; the timers job
 * re-checks a straggler). Stripe's word decides — `requires_capture` with the full amount — never
 * the client's (§14). Idempotent: a second call finds the row already past `authorizing`.
 */
export async function confirmHandoffAuthorization(requestId: string, userId: string): Promise<{ ok: true; request: HandoffRow } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row || row.userId !== userId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  if (row.status !== "authorizing") return { ok: true, request: row };
  if (!row.paymentIntentId) return { ok: false, status: 409, code: "no_hold", message: "This ask has no hold to confirm." };
  const pi = await (await payments()).retrieve(row.paymentIntentId);
  const expected = (row.feeCents ?? 0) + (row.travelerFeeCents ?? 0);
  if (pi.status !== "requires_capture" || pi.amountCapturableCents < expected || pi.metadata?.type !== "expert_handoff") {
    return { ok: false, status: 402, code: "not_authorized", message: "The hold on your card isn't in place yet." };
  }
  const claimed = await db.execute(sql`
    UPDATE expert_requests SET status = 'proposed', authorized_at = NOW()
    WHERE id = ${requestId} AND status = 'authorizing' RETURNING id
  `);
  if (claimed.rows?.length) await matchHandoff(requestId);
  return { ok: true, request: (await getHandoff(requestId))! };
}

// ─── Match ─────────────────────────────────────────────────────────────────────────────────────

/** Routing PROPOSES (R-n): it names an expert, it does not assign the work. */
export async function matchHandoff(requestId: string): Promise<void> {
  const row = await getHandoff(requestId);
  if (!row || row.status !== "proposed") return;
  try {
    const { leadRoutingService } = await import("./lead-routing.service");
    const result = await leadRoutingService.routeLead({
      destination: row.destinationCity ?? "",
      topic: row.requestType ?? undefined,
      requestType: row.requestType ?? undefined,
      tripId: row.tripId ?? undefined,
      userId: row.userId ?? undefined,
      requireCanBookOnBehalf: row.handoffKind === "book" || row.handoffKind === "plan_all",
    });
    // The platform concierge account is a POOL MARKER, never an advisor (LD 51): a handoff is
    // proposed to the best-scoring PERSON, and the concierge is the 24 h fallback, not a match.
    // Smoke-13 addendum: the ONE pool-account test (routeLead already excludes it; this is the
    // second layer at the selector itself).
    const { isConciergePoolAccount } = await import("./expert-routability");
    for (const s of result.scores ?? []) {
      if (!(s.totalScore > 0)) break;
      if (await isConciergePoolAccount(s.expertId)) continue;
      await proposeTo(requestId, s.expertId);
      return;
    }
  } catch (err) {
    console.error("[handoff] routing failed (non-fatal; admin can assign):", err);
  }
  await db.execute(sql`UPDATE expert_requests SET status = 'unmatched' WHERE id = ${requestId} AND status = 'proposed' AND assigned_expert_id IS NULL`);
}

/**
 * Name the expert the ask is waiting on. They get a READ-only (`pending`, §12) advisor row so they
 * can read the plan before answering — the ONE advisor-row author, never a write grant.
 */
async function proposeTo(requestId: string, expertId: string): Promise<void> {
  const r = await db.execute(sql`
    UPDATE expert_requests SET assigned_expert_id = ${expertId}, assigned_at = NOW(), status = 'proposed'
    WHERE id = ${requestId} AND status IN ('proposed', 'unmatched') AND handoff_kind IS NOT NULL
    RETURNING trip_id
  `);
  const tripId = (r.rows?.[0] as any)?.trip_id as string | undefined;
  if (!tripId) return;
  const { upsertTripAdvisorRow, getTripLabel } = await import("./booking-actions.service");
  await upsertTripAdvisorRow({ tripId, localExpertId: expertId, status: "pending", message: null }).catch((err) =>
    console.error("[handoff] read grant failed (non-fatal):", err),
  );
  const label = await getTripLabel(tripId).catch(() => "a trip");
  await notify(expertId, tripId, "handoff_proposed", "A traveler wants your help", `${label} — accept or decline in your inbox.`, { requestId });
}

/** Admin override (R-n: "admin override only"). */
export async function adminAssignHandoff(requestId: string, expertId: string): Promise<{ ok: true } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  if (row.status !== "proposed" && row.status !== "unmatched") {
    return { ok: false, status: 409, code: "wrong_status", message: `This handoff is ${row.status}.` };
  }
  if (row.assignedExpertId && row.assignedExpertId !== expertId && row.tripId) {
    await db.execute(sql`UPDATE trip_expert_advisors SET status = 'rejected' WHERE trip_id = ${row.tripId} AND local_expert_id = ${row.assignedExpertId} AND status = 'pending'`);
  }
  await proposeTo(requestId, expertId);
  return { ok: true };
}

// ─── Accept / decline ──────────────────────────────────────────────────────────────────────────

async function flipScope(tripId: string, ids: string[], from: string, to: string, actorType: string, actorId: string) {
  if (!ids.length) return;
  const { logItemTransition } = await import("./item-transition-log.service");
  for (const itemId of ids.slice(0, 200)) {
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(itineraryItems)
        .set({ routingStatus: to, updatedAt: new Date() } as any)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, from)))
        .returning({ id: itineraryItems.id });
      if (rows.length) {
        await logItemTransition(tx as any, { tripId, itemId, eventType: "status_transition", fromStatus: from, toStatus: to, actorType, actorId } as any);
      }
    });
  }
}

function scopeIds(row: HandoffRow): string[] {
  return Array.isArray(row.scopeItemIds) ? (row.scopeItemIds as unknown[]).map(String) : [];
}

/**
 * The expert accepts (R-n) and the hold is CAPTURED (R-q). The claim (`proposed → accepted`) is
 * taken first; a failed capture hands the claim back so the expert may try again under the SAME
 * key — Stripe answers a repeat with the same single capture (§15).
 */
export async function acceptHandoff(requestId: string, expertId: string): Promise<{ ok: true; request: HandoffRow } | HandoffRefusal> {
  const claimed = await db.execute(sql`
    UPDATE expert_requests SET status = 'accepted', accepted_at = NOW()
    WHERE id = ${requestId} AND assigned_expert_id = ${expertId} AND status = 'proposed' AND handoff_kind IS NOT NULL
    RETURNING id
  `);
  if (!claimed.rows?.length) {
    const row = await getHandoff(requestId);
    if (!row || row.assignedExpertId !== expertId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
    if (row.status === "accepted") return { ok: true, request: row };
    return { ok: false, status: 409, code: "wrong_status", message: `This handoff is ${row.status}.` };
  }
  const row = (await getHandoff(requestId))!;
  const total = (row.feeCents ?? 0) + (row.travelerFeeCents ?? 0);
  if (total > 0 && row.paymentIntentId && !row.capturedAt) {
    try {
      await (await payments()).capture(row.paymentIntentId, `handoff-capture-${requestId}`);
    } catch (err: any) {
      await db.execute(sql`UPDATE expert_requests SET status = 'proposed', accepted_at = NULL WHERE id = ${requestId} AND status = 'accepted' AND captured_at IS NULL`);
      return { ok: false, status: 402, code: "capture_failed", message: err?.message || "The traveler's hold could not be captured." };
    }
    await db.execute(sql`UPDATE expert_requests SET captured_at = NOW() WHERE id = ${requestId} AND captured_at IS NULL`);
    await recordCapturedRevenue(row);
  }
  const { upsertTripAdvisorRow } = await import("./booking-actions.service");
  if (row.tripId) {
    await upsertTripAdvisorRow({ tripId: row.tripId, localExpertId: expertId, status: "accepted", message: null });
    await flipScope(row.tripId, scopeIds(row), "in_planning", "with_expert", "expert", expertId);
    await notify(row.userId, row.tripId, "handoff_accepted", "Your local accepted", "Their changes will arrive as suggestions on your plan.", { requestId });
  }
  void track(expertId, row.tripId ?? "", HANDOFF_EVENTS.accepted, { requestId, kind: row.handoffKind });
  // An accepted handoff unlocks routed legs (step 9a ruling 2, ledger 2026-10-07-step9a-routing-engine).
  enqueuePlanLegRecompute(row.tripId);
  // S1 (ledger `2026-10-09-s1-one-stay`, ruling 3): an accepted handoff makes the plan routed — pick its stay.
  void import("./stay-pick.service").then((m) => m.scheduleStayPick(row.tripId)).catch(() => undefined);
  return { ok: true, request: (await getHandoff(requestId))! };
}

/** The captured fee becomes revenue (100% platform until approval re-splits it — the R6 posture). */
async function recordCapturedRevenue(row: HandoffRow): Promise<void> {
  if (!row.paymentIntentId || !(row.feeCents && row.feeCents > 0)) return;
  try {
    const { revenueTrackingService } = await import("./revenue-tracking.service");
    await revenueTrackingService.recordRevenueEventOnce({
      sourceType: "expert_review_fee",
      sourceId: row.paymentIntentId,
      grossAmount: row.feeCents / 100,
      description: `Local expert handoff (${row.handoffKind}) — ${row.destinationCity ?? ""}`,
      metadata: { userId: row.userId, requestId: row.id, handoffKind: row.handoffKind, paymentIntentId: row.paymentIntentId },
    } as any);
  } catch (err) {
    console.error("[handoff] revenue record failed (non-fatal):", err);
  }
  try {
    const snap = (row.optimizationContext as any)?.travelerFeeSnapshot;
    if (snap) {
      const { recordExpertReviewTravelerFeeLedger } = await import("./fee-ledger.service");
      await recordExpertReviewTravelerFeeLedger({ paymentIntentId: row.paymentIntentId, snapshot: snap, actor: "handoff_capture" });
    }
  } catch (err) {
    console.error("[handoff] traveler-fee ledger failed (non-fatal):", err);
  }
}

/** The expert declines: the read grant ends and the ask goes back to routing's admin queue. */
export async function declineHandoff(requestId: string, expertId: string): Promise<{ ok: true } | HandoffRefusal> {
  const r = await db.execute(sql`
    UPDATE expert_requests SET status = 'unmatched', assigned_expert_id = NULL
    WHERE id = ${requestId} AND assigned_expert_id = ${expertId} AND status = 'proposed' AND handoff_kind IS NOT NULL
    RETURNING trip_id
  `);
  const tripId = (r.rows?.[0] as any)?.trip_id as string | undefined;
  if (!tripId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  await db.execute(sql`UPDATE trip_expert_advisors SET status = 'rejected' WHERE trip_id = ${tripId} AND local_expert_id = ${expertId} AND status = 'pending'`);
  return { ok: true };
}

// ─── Deliver / approve / changes ───────────────────────────────────────────────────────────────

export async function deliverHandoff(requestId: string, expertId: string, opts: { offerOnTripSupport?: boolean } = {}): Promise<{ ok: true; request: HandoffRow } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row || row.assignedExpertId !== expertId || !row.tripId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  const ids = scopeIds(row);
  let unbooked = 0;
  if (ids.length && (row.handoffKind === "book" || row.handoffKind === "plan_all")) {
    const rows = await db
      .select({ id: itineraryItems.id, bookingId: itineraryItems.bookingId, routingStatus: itineraryItems.routingStatus })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, row.tripId), inArray(itineraryItems.id, ids)));
    unbooked = rows.filter((r) => !r.bookingId && r.routingStatus !== "purchased").length;
  }
  const refusal = deliverRefusal({
    status: row.status,
    kind: row.handoffKind,
    openSuggestions: await countOpenSuggestions(row.tripId, expertId),
    unbookedInScope: unbooked,
  });
  if (refusal) {
    const message =
      refusal === "open_suggestions"
        ? "The traveler still has suggestions to answer."
        : refusal === "unbooked_items"
          ? "Some stops in scope aren't booked yet."
          : `This handoff is ${row.status}.`;
    return { ok: false, status: 409, code: refusal, message };
  }
  const r = await db.execute(sql`
    UPDATE expert_requests SET status = 'delivered', delivered_at = NOW(),
      on_trip_support_offered_at = ${opts.offerOnTripSupport ? sql`NOW()` : sql`on_trip_support_offered_at`}
    WHERE id = ${requestId} AND assigned_expert_id = ${expertId} AND status = 'accepted' RETURNING id
  `);
  if (!r.rows?.length) return { ok: false, status: 409, code: "wrong_status", message: "This handoff changed — refresh." };
  await notify(row.userId, row.tripId, "handoff_delivered", "Your plan is ready", "Approve it, or ask for changes.", { requestId });
  return { ok: true, request: (await getHandoff(requestId))! };
}

/**
 * Approve (R-s) — by the traveler, or by the window. The ONE place the expert is paid (R-n): the
 * existing R6 split of the captured fee's revenue row into a HELD expert earning. Returns the pen.
 */
export async function approveHandoff(requestId: string, by: "traveler" | "auto", userId?: string): Promise<{ ok: true; request: HandoffRow } | HandoffRefusal> {
  const r = await db.execute(sql`
    UPDATE expert_requests SET status = 'approved', approved_at = NOW(), approved_by = ${by}, completed_at = NOW()
    WHERE id = ${requestId} AND status = 'delivered' AND handoff_kind IS NOT NULL
      ${userId ? sql`AND user_id = ${userId}` : sql``}
    RETURNING id
  `);
  if (!r.rows?.length) {
    const row = await getHandoff(requestId);
    if (!row || (userId && row.userId !== userId)) return { ok: false, status: 404, code: "not_found", message: "Not found" };
    if (row.status === "approved") return { ok: true, request: row };
    return { ok: false, status: 409, code: "wrong_status", message: `This handoff is ${row.status}.` };
  }
  const row = (await getHandoff(requestId))!;
  if (row.assignedExpertId && row.paymentIntentId) {
    try {
      const { creditExpertReviewSplit } = await import("./booking-actions.service");
      await creditExpertReviewSplit(requestId, row.assignedExpertId, row.paymentIntentId);
    } catch (err) {
      console.error("[handoff] expert pay on approval failed (retryable from the ledger row):", err);
    }
  }
  await returnPen(row);
  void track(row.userId, row.tripId ?? "", HANDOFF_EVENTS.approved, { requestId, by });
  return { ok: true, request: row };
}

/** The pen goes back: scoped items to `in_planning`, the advisor row to read-only `pending`. */
async function returnPen(row: HandoffRow): Promise<void> {
  if (!row.tripId || !row.assignedExpertId) return;
  await supersedeOpenSuggestions(row.tripId, row.assignedExpertId);
  await flipScope(row.tripId, scopeIds(row), "with_expert", "in_planning", "traveler", row.userId ?? "system");
  // On-trip support keeps the expert able to READ the plan (`pending` is §12 read-only either way).
  await db.execute(sql`
    UPDATE trip_expert_advisors SET status = 'pending'
    WHERE trip_id = ${row.tripId} AND local_expert_id = ${row.assignedExpertId} AND status IN ('accepted', 'assigned')
  `);
}

/** Request changes (R-s): two rounds included; a third is a new ask. */
export async function requestHandoffChanges(requestId: string, userId: string, note?: string | null): Promise<{ ok: true } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row || row.userId !== userId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  if (row.status !== "delivered") return { ok: false, status: 409, code: "wrong_status", message: `This handoff is ${row.status}.` };
  if (!changeRoundAllowed(row.changeRounds)) {
    return { ok: false, status: 409, code: "rounds_used", message: "Both included rounds of changes are used — a new ask starts a new request." };
  }
  const r = await db.execute(sql`
    UPDATE expert_requests SET status = 'accepted', delivered_at = NULL, change_rounds = COALESCE(change_rounds, 0) + 1
    WHERE id = ${requestId} AND status = 'delivered' AND COALESCE(change_rounds, 0) = ${row.changeRounds ?? 0}
    RETURNING id
  `);
  if (!r.rows?.length) return { ok: false, status: 409, code: "wrong_status", message: "This handoff changed — refresh." };
  await notify(row.assignedExpertId, row.tripId ?? "", "handoff_changes_requested", "Changes requested", note?.slice(0, 300) || "The traveler asked for changes.", { requestId });
  return { ok: true };
}

// ─── Withdraw (R-t) ────────────────────────────────────────────────────────────────────────────

async function bandShare(bandKey: string): Promise<number | null> {
  const { getBand } = await import("./commission");
  const band = await getBand(bandKey);
  if (!band || band.rateType !== "percent" || !(band.rate > 0)) {
    // The manifest's documented fallback (§8: read, never restated) — keep nothing, refund all.
    const { declaredFallbackValue } = await import("./fee-band-requirements");
    if (!band) console.warn(`[handoff] withdrawal band ${bandKey} is missing — using its declared fallback (§13)`);
    return declaredFallbackValue(bandKey);
  }
  return band.rate;
}

export async function withdrawHandoff(requestId: string, userId: string): Promise<
  { ok: true; keptCents: number; refundedCents: number; refundId: string | null } | HandoffRefusal
> {
  const row = await getHandoff(requestId);
  if (!row || row.userId !== userId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  // Re-entry: a withdrawal whose refund call failed is re-driven under the SAME key.
  if (row.status === "withdrawn") return driveWithdrawalRefund(row);
  const stage = row.status === "authorizing" ? "before_accept" : withdrawalStage(row.status);
  if (!stage) return { ok: false, status: 409, code: "wrong_status", message: `This handoff is ${row.status}.` };

  if (stage === "before_accept") {
    const r = await db.execute(sql`
      UPDATE expert_requests SET status = 'withdrawn', withdrawn_at = NOW(), withdrawal_fee_cents = ${withdrawalKeptCents(0, null)}
      WHERE id = ${requestId} AND status IN ('authorizing', 'proposed', 'unmatched') RETURNING id
    `);
    if (!r.rows?.length) return { ok: false, status: 409, code: "wrong_status", message: "This handoff changed — refresh." };
    await releaseHold(row, `handoff-withdraw-${requestId}`, "requested_by_customer");
    if (row.tripId && row.assignedExpertId) {
      await db.execute(sql`UPDATE trip_expert_advisors SET status = 'rejected' WHERE trip_id = ${row.tripId} AND local_expert_id = ${row.assignedExpertId} AND status = 'pending'`);
    }
    return { ok: true, keptCents: 0, refundedCents: 0, refundId: null };
  }

  const share = await bandShare(WITHDRAWAL_FEE_BAND[stage]);
  const kept = withdrawalKeptCents(row.feeCents ?? 0, share);
  const r = await db.execute(sql`
    UPDATE expert_requests SET status = 'withdrawn', withdrawn_at = NOW(), withdrawal_fee_cents = ${kept}
    WHERE id = ${requestId} AND status = ${row.status} RETURNING id
  `);
  if (!r.rows?.length) return { ok: false, status: 409, code: "wrong_status", message: "This handoff changed — refresh." };
  await returnPen(row);
  return driveWithdrawalRefund((await getHandoff(requestId))!);
}

/** Pure. What a withdrawal refunds: the fee less what is kept, the traveler fee in proportion. */
export function withdrawalRefundCents(feeCents: number, travelerFeeCents: number, keptCents: number): number {
  const fee = Math.max(0, feeCents);
  const kept = Math.min(Math.max(0, keptCents), fee);
  const feeBack = fee - kept;
  const travelerBack = fee > 0 ? Math.round((Math.max(0, travelerFeeCents) * feeBack) / fee) : Math.max(0, travelerFeeCents);
  return feeBack + travelerBack;
}

async function driveWithdrawalRefund(row: HandoffRow): Promise<{ ok: true; keptCents: number; refundedCents: number; refundId: string | null } | HandoffRefusal> {
  const kept = row.withdrawalFeeCents ?? 0;
  const amount = withdrawalRefundCents(row.feeCents ?? 0, row.travelerFeeCents ?? 0, kept);
  if (row.refundId || !row.capturedAt || !row.paymentIntentId || amount <= 0) {
    return { ok: true, keptCents: kept, refundedCents: row.refundId ? amount : 0, refundId: row.refundId ?? null };
  }
  try {
    const refund = await (await payments()).refund({
      requestId: row.id,
      tripId: row.tripId ?? "",
      paymentIntentId: row.paymentIntentId,
      amountCents: amount,
      idempotencyKey: `handoff-withdraw-refund-${row.id}`,
      auditReason: `handoff_withdrawal_${row.handoffKind}`,
    });
    await db.execute(sql`UPDATE expert_requests SET refund_id = ${refund.id} WHERE id = ${row.id} AND refund_id IS NULL`);
    // The revenue row now records what was KEPT, not the whole fee.
    await db.execute(sql`
      UPDATE platform_revenue SET gross_amount = ${(kept / 100).toFixed(2)}::numeric,
        platform_fee = ${(kept / 100).toFixed(2)}::numeric,
        net_amount = ${(kept / 100).toFixed(2)}::numeric - COALESCE(processing_fees, 0)
      WHERE source_id = ${row.paymentIntentId} AND source_type = 'expert_review_fee' AND expert_id IS NULL
    `).catch((err) => console.error("[handoff] revenue adjust failed (non-fatal):", err));
    return { ok: true, keptCents: kept, refundedCents: amount, refundId: refund.id };
  } catch (err: any) {
    // The claim stays: the withdrawal happened; the refund is re-driven by a retry under the same key.
    return { ok: false, status: 502, code: "refund_failed", message: err?.message || "The refund didn't go through — try again." };
  }
}

/**
 * Smoke 13 #5: the Stripe `cancellation_reason` a released hold carries — the traveler's own
 * withdrawal is `requested_by_customer`; ONLY the timer's release is `abandoned`.
 */
export type HoldReleaseReason = "abandoned" | "requested_by_customer";

async function releaseHold(row: HandoffRow, key: string, reason: HoldReleaseReason): Promise<void> {
  if (!row.paymentIntentId || row.capturedAt) return;
  try {
    await (await payments()).cancel(row.paymentIntentId, key, reason);
  } catch (err) {
    console.error(`[handoff] release of hold ${row.paymentIntentId} failed — Stripe expires an uncaptured hold on its own:`, err);
  }
}

// ─── On-trip support ───────────────────────────────────────────────────────────────────────────

/** The on-trip support price, from its band (flat dollars) — null when no band is set (§13). */
export async function onTripSupportCents(): Promise<number | null> {
  const { getBand } = await import("./commission");
  const band = await getBand(ON_TRIP_SUPPORT_BAND);
  if (!band || band.rateType !== "flat" || !(band.rate > 0)) return null;
  return Math.round(band.rate * 100);
}

/**
 * The traveler takes the on-trip support the expert offered at delivery. It is priced by its OWN
 * band; authorized now and captured on confirm (the expert already said yes by offering it).
 */
export async function startOnTripSupport(requestId: string, userId: string): Promise<{ ok: true; clientSecret: string | null; amountCents: number } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row || row.userId !== userId || !row.tripId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  if (!row.onTripSupportOfferedAt) return { ok: false, status: 409, code: "not_offered", message: "Your local didn't offer on-trip support." };
  if (row.onTripSupportAcceptedAt) return { ok: false, status: 409, code: "already_accepted", message: "On-trip support is already on." };
  const cents = await onTripSupportCents();
  if (cents == null) return { ok: false, status: 409, code: "not_priced", message: "On-trip support isn't available yet." };
  const auth = await (await payments()).authorize({
    userId,
    tripId: row.tripId,
    kind: "on_trip_support",
    amountCents: cents,
    idempotencyKey: `handoff-ots-auth-${requestId}`,
    destination: row.destinationCity ?? null,
    requestId,
  });
  await db.execute(sql`UPDATE expert_requests SET on_trip_support_payment_intent_id = ${auth.paymentIntentId} WHERE id = ${requestId} AND on_trip_support_payment_intent_id IS NULL`);
  return { ok: true, clientSecret: auth.clientSecret, amountCents: cents };
}

export async function confirmOnTripSupport(requestId: string, userId: string): Promise<{ ok: true } | HandoffRefusal> {
  const row = await getHandoff(requestId);
  if (!row || row.userId !== userId) return { ok: false, status: 404, code: "not_found", message: "Not found" };
  if (row.onTripSupportAcceptedAt) return { ok: true };
  const piId = row.onTripSupportPaymentIntentId;
  if (!piId) return { ok: false, status: 409, code: "no_hold", message: "Start on-trip support first." };
  const pay = await payments();
  const pi = await pay.retrieve(piId);
  if (pi.status !== "requires_capture" && pi.status !== "succeeded") return { ok: false, status: 402, code: "not_authorized", message: "The hold on your card isn't in place yet." };
  const claimed = await db.execute(sql`UPDATE expert_requests SET on_trip_support_accepted_at = NOW() WHERE id = ${requestId} AND on_trip_support_accepted_at IS NULL RETURNING id`);
  if (!claimed.rows?.length) return { ok: true };
  try {
    if (pi.status === "requires_capture") await pay.capture(piId, `handoff-ots-capture-${requestId}`);
  } catch (err: any) {
    await db.execute(sql`UPDATE expert_requests SET on_trip_support_accepted_at = NULL WHERE id = ${requestId}`);
    return { ok: false, status: 402, code: "capture_failed", message: err?.message || "We couldn't take the payment." };
  }
  try {
    const { revenueTrackingService } = await import("./revenue-tracking.service");
    await revenueTrackingService.recordRevenueEventOnce({
      sourceType: "expert_review_fee",
      sourceId: piId,
      grossAmount: pi.amountCents / 100,
      description: `On-trip support — ${row.destinationCity ?? ""}`,
      metadata: { userId, requestId, kind: "on_trip_support", paymentIntentId: piId },
    } as any);
    if (row.assignedExpertId) {
      const { creditExpertReviewSplit } = await import("./booking-actions.service");
      await creditExpertReviewSplit(requestId, row.assignedExpertId, piId);
    }
  } catch (err) {
    console.error("[handoff] on-trip support revenue/credit failed (non-fatal):", err);
  }
  return { ok: true };
}

// ─── Timers (R-q, R-s) ─────────────────────────────────────────────────────────────────────────

export interface HandoffTimerResult {
  fallbackOffered: number;
  released: number;
  autoApproved: number;
  stragglersAuthorized: number;
}

export async function runHandoffTimers(now: Date = new Date()): Promise<HandoffTimerResult> {
  const out: HandoffTimerResult = { fallbackOffered: 0, released: 0, autoApproved: 0, stragglersAuthorized: 0 };
  const fallbackCut = new Date(now.getTime() - handoffFallbackHours() * 3600_000);
  const releaseCut = new Date(now.getTime() - handoffReleaseHours() * 3600_000);
  const approveCut = new Date(now.getTime() - handoffAutoApproveDays() * 86_400_000);

  // A hold the card confirmed but whose confirm call never reached us.
  const stragglers = await db.execute(sql`
    SELECT id, user_id FROM expert_requests
    WHERE handoff_kind IS NOT NULL AND status = 'authorizing' AND payment_intent_id IS NOT NULL
      AND created_at < ${new Date(now.getTime() - 10 * 60_000)} LIMIT 200
  `);
  for (const s of (stragglers.rows ?? []) as any[]) {
    const r = await confirmHandoffAuthorization(s.id, s.user_id).catch(() => null);
    if (r && r.ok && r.request.status !== "authorizing") out.stragglersAuthorized += 1;
    else {
      const rel = await db.execute(sql`
        UPDATE expert_requests SET status = 'released', released_at = NOW()
        WHERE id = ${s.id} AND status = 'authorizing' AND created_at < ${releaseCut} RETURNING id
      `);
      if (rel.rows?.length) {
        out.released += 1;
        // Smoke 13 #9: a straggler released by the clock had its PaymentIntent left open; cancel
        // it too (the conditional above is the claim, so a second run releases nothing twice).
        const released = await getHandoff(s.id);
        if (released) await releaseHold(released, `handoff-release-${released.id}`, "abandoned");
      }
    }
  }

  const fb = await db.execute(sql`
    UPDATE expert_requests SET fallback_offered_at = NOW()
    WHERE handoff_kind IS NOT NULL AND status IN ('proposed', 'unmatched')
      AND fallback_offered_at IS NULL AND authorized_at < ${fallbackCut}
    RETURNING id, user_id, trip_id
  `);
  for (const r of (fb.rows ?? []) as any[]) {
    out.fallbackOffered += 1;
    await notify(r.user_id, r.trip_id, "handoff_fallback", "Still finding your local", "Our concierge can take this on now if you'd like.", { requestId: r.id });
  }

  const rel = await db.execute(sql`
    UPDATE expert_requests SET status = 'released', released_at = NOW()
    WHERE handoff_kind IS NOT NULL AND status IN ('proposed', 'unmatched') AND authorized_at < ${releaseCut}
    RETURNING id
  `);
  for (const r of (rel.rows ?? []) as any[]) {
    out.released += 1;
    const row = await getHandoff(r.id);
    if (row) {
      await releaseHold(row, `handoff-release-${row.id}`, "abandoned");
      if (row.tripId && row.assignedExpertId) {
        await db.execute(sql`UPDATE trip_expert_advisors SET status = 'rejected' WHERE trip_id = ${row.tripId} AND local_expert_id = ${row.assignedExpertId} AND status = 'pending'`);
      }
      await notify(row.userId, row.tripId ?? "", "handoff_released", "No local was free", "We released the hold on your card. Nothing was charged.", { requestId: row.id });
    }
  }

  const due = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE handoff_kind IS NOT NULL AND status = 'delivered' AND delivered_at < ${approveCut} LIMIT 200
  `);
  for (const r of (due.rows ?? []) as any[]) {
    const a = await approveHandoff(r.id, "auto");
    if (a.ok) out.autoApproved += 1;
  }
  return out;
}
