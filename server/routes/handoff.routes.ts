/**
 * handoff.routes.ts — mount: app.use(handoffRoutes). Step 7b (R323; surface spec §12; R-n, R-q, R-s,
 * R-t). THE one request route: the slip's "Hand off to a local expert" and every "Book this for me"
 * (item, leg, whole plan) open the same chooser and post here.
 *
 *   Traveler (the plan's OWNER — §14, the session):
 *     GET  /api/trips/:tripId/handoff                     the plan's handoff, its banner state, the measured wait
 *     POST /api/trips/:tripId/handoff/quote               { kind, itemIds? } → the fee before confirming
 *     POST /api/trips/:tripId/handoff                     { kind, itemIds?, notes? } → the ask (+ the hold's client secret)
 *     POST /api/handoffs/:id/authorized                   the card confirmed the hold → match
 *     POST /api/handoffs/:id/approve | /changes | /withdraw
 *     POST /api/handoffs/:id/on-trip-support | /on-trip-support/confirm
 *     GET  /api/trips/:tripId/expert-suggestions          (owner, or an advisor reading their own)
 *     POST /api/trips/:tripId/expert-suggestions/:id/accept | /decline,  …/accept-all
 *   Expert (the request's assigned expert — the session):
 *     GET  /api/expert/handoffs                           proposed + in-progress, for the inbox
 *     POST /api/handoffs/:id/accept | /decline | /deliver { offerOnTripSupport? }
 *   Admin (§2 blanket guard):
 *     POST /api/admin/handoffs/:id/assign                 { expertId } — the override (R-n)
 *
 * Bodies are `.strict()` picks (§19). Amounts are never read from a body (§14). A request or a
 * suggestion that does not exist or is not the caller's is one 404 (LD 40).
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { isTripAdvisor } from "../utils/trip-advisor";
import {
  acceptHandoff,
  adminAssignHandoff,
  approveHandoff,
  askHandoff,
  confirmHandoffAuthorization,
  confirmOnTripSupport,
  declineHandoff,
  deliverHandoff,
  getHandoff,
  getTripHandoff,
  listProposedForExpert,
  onTripSupportCents,
  quoteHandoff,
  requestHandoffChanges,
  startOnTripSupport,
  typicalAcceptHours,
  withdrawHandoff,
  type HandoffRow,
} from "../services/handoff.service";
import {
  acceptAllExpertSuggestions,
  listExpertSuggestions,
  resolveExpertSuggestion,
  suggestionSummary,
} from "../services/expert-suggestions.service";
import { HANDOFF_KINDS, handoffBannerState } from "@shared/handoff";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

const kindSchema = z.enum(HANDOFF_KINDS as unknown as [string, ...string[]]);
const askBody = z
  .object({ kind: kindSchema, itemIds: z.array(z.string().min(1).max(64)).max(200).optional(), notes: z.string().max(2000).optional().nullable() })
  .strict();
const quoteBody = z.object({ kind: kindSchema, itemIds: z.array(z.string().min(1).max(64)).max(200).optional() }).strict();
const changesBody = z.object({ note: z.string().max(2000).optional().nullable() }).strict();
const deliverBody = z.object({ offerOnTripSupport: z.boolean().optional() }).strict();
const assignBody = z.object({ expertId: z.string().min(1).max(64) }).strict();
const emptyBody = z.object({}).strict();

/** What a client may read about a handoff. The ids of money objects stay server-side. */
export function projectHandoff(row: HandoffRow | null, opts: { expertName?: string | null } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    tripId: row.tripId,
    kind: row.handoffKind,
    status: row.status,
    scopeItemIds: Array.isArray(row.scopeItemIds) ? row.scopeItemIds : [],
    feeCents: row.feeCents,
    travelerFeeCents: row.travelerFeeCents,
    expertId: row.assignedExpertId,
    expertName: opts.expertName ?? null,
    authorizedAt: row.authorizedAt,
    acceptedAt: row.acceptedAt,
    fallbackOfferedAt: row.fallbackOfferedAt,
    releasedAt: row.releasedAt,
    withdrawnAt: row.withdrawnAt,
    withdrawalFeeCents: row.withdrawalFeeCents,
    deliveredAt: row.deliveredAt,
    changeRounds: row.changeRounds ?? 0,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    onTripSupportOfferedAt: row.onTripSupportOfferedAt,
    onTripSupportAcceptedAt: row.onTripSupportAcceptedAt,
    prepaid: !!row.sourcePurchaseId,
    createdAt: row.createdAt,
  };
}

async function expertDisplayName(expertId: string | null | undefined): Promise<string | null> {
  if (!expertId) return null;
  const r = await db.execute(sql`SELECT first_name, last_name FROM users WHERE id = ${expertId} LIMIT 1`);
  const u = r.rows?.[0] as any;
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
}

function refuse(res: any, r: { status: number; code: string; message: string }) {
  return res.status(r.status).json({ code: r.code, message: r.message });
}

async function ownerOr404(req: any, res: any): Promise<string | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  if (!(await verifyTripOwnership(req.params.tripId, userId))) {
    res.status(404).json({ message: "No such plan" });
    return null;
  }
  return userId;
}

// ─── Traveler ──────────────────────────────────────────────────────────────────────────────────

router.get("/api/trips/:tripId/handoff", isAuthenticated, async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  const tripId = req.params.tripId;
  const owner = await verifyTripOwnership(tripId, userId);
  const row = await getTripHandoff(tripId);
  // The assigned expert may read the handoff they hold; anyone else is one 404.
  if (!owner && !(row && row.assignedExpertId === userId && (await isTripAdvisor(tripId, userId)))) {
    return res.status(404).json({ message: "No such plan" });
  }
  const city = row?.destinationCity ? row.destinationCity.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  res.json({
    handoff: projectHandoff(row, { expertName: await expertDisplayName(row?.assignedExpertId) }),
    banner: row ? handoffBannerState({ status: row.status, fallbackOfferedAt: row.fallbackOfferedAt, city }) : null,
    city,
    typicalAcceptHours: await typicalAcceptHours().catch(() => null),
    onTripSupportCents: row?.onTripSupportOfferedAt ? await onTripSupportCents() : null,
  });
});

router.post("/api/trips/:tripId/handoff/quote", isAuthenticated, async (req: any, res) => {
  const userId = await ownerOr404(req, res);
  if (!userId) return;
  const parsed = quoteBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Choose how much help you want" });
  const q = await quoteHandoff({ tripId: req.params.tripId, kind: parsed.data.kind, itemIds: parsed.data.itemIds });
  if ("ok" in q) return refuse(res, q);
  const { travelerFeeSnapshot: _snap, ...visible } = q;
  res.json(visible);
});

router.post("/api/trips/:tripId/handoff", isAuthenticated, async (req: any, res) => {
  const userId = await ownerOr404(req, res);
  if (!userId) return;
  const parsed = askBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Choose how much help you want" });
  try {
    const out = await askHandoff({ tripId: req.params.tripId, userId, kind: parsed.data.kind, itemIds: parsed.data.itemIds, notes: parsed.data.notes ?? null });
    if (!out.ok) return refuse(res, out);
    const { travelerFeeSnapshot: _snap, ...quote } = out.quote;
    res.status(201).json({ handoff: projectHandoff(out.request), clientSecret: out.clientSecret, quote });
  } catch (err) {
    console.error("[handoff] ask failed:", err);
    res.status(500).json({ message: "Couldn't start the handoff" });
  }
});

async function ownedHandoff(req: any, res: any): Promise<{ userId: string; row: HandoffRow } | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const row = await getHandoff(req.params.id);
  if (!row || row.userId !== userId) {
    res.status(404).json({ message: "Not found" });
    return null;
  }
  return { userId, row };
}

router.post("/api/handoffs/:id/authorized", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  try {
    const out = await confirmHandoffAuthorization(o.row.id, o.userId);
    if (!out.ok) return refuse(res, out);
    res.json({ handoff: projectHandoff(out.request) });
  } catch (err) {
    console.error("[handoff] authorization confirm failed:", err);
    res.status(500).json({ message: "Couldn't confirm the hold" });
  }
});

router.post("/api/handoffs/:id/approve", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  const out = await approveHandoff(o.row.id, "traveler", o.userId);
  if (!out.ok) return refuse(res, out);
  res.json({ handoff: projectHandoff(out.request) });
});

router.post("/api/handoffs/:id/changes", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  const parsed = changesBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid note" });
  const out = await requestHandoffChanges(o.row.id, o.userId, parsed.data.note ?? null);
  if (!out.ok) return refuse(res, out);
  res.json({ handoff: projectHandoff(await getHandoff(o.row.id)) });
});

router.post("/api/handoffs/:id/withdraw", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  try {
    const out = await withdrawHandoff(o.row.id, o.userId);
    if (!out.ok) return refuse(res, out);
    res.json({ handoff: projectHandoff(await getHandoff(o.row.id)), keptCents: out.keptCents, refundedCents: out.refundedCents });
  } catch (err) {
    console.error("[handoff] withdraw failed:", err);
    res.status(500).json({ message: "Couldn't withdraw" });
  }
});

router.post("/api/handoffs/:id/on-trip-support", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  try {
    const out = await startOnTripSupport(o.row.id, o.userId);
    if (!out.ok) return refuse(res, out);
    res.json({ clientSecret: out.clientSecret, amountCents: out.amountCents });
  } catch (err) {
    console.error("[handoff] on-trip support start failed:", err);
    res.status(500).json({ message: "Couldn't start on-trip support" });
  }
});

router.post("/api/handoffs/:id/on-trip-support/confirm", isAuthenticated, async (req: any, res) => {
  const o = await ownedHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  const out = await confirmOnTripSupport(o.row.id, o.userId);
  if (!out.ok) return refuse(res, out);
  res.json({ handoff: projectHandoff(await getHandoff(o.row.id)) });
});

// ─── Suggestions ───────────────────────────────────────────────────────────────────────────────

router.get("/api/trips/:tripId/expert-suggestions", isAuthenticated, async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  const tripId = req.params.tripId;
  const owner = await verifyTripOwnership(tripId, userId);
  const advisor = owner ? false : await isTripAdvisor(tripId, userId);
  if (!owner && !advisor) return res.status(404).json({ message: "No such plan" });
  const rows = await listExpertSuggestions(tripId);
  const visible = owner ? rows : rows.filter((r) => r.expertId === userId);
  res.json({
    suggestions: visible.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      kind: r.kind,
      status: r.status,
      summary: suggestionSummary(r as any),
      payload: r.payload,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      expertId: r.expertId,
    })),
  });
});

router.post("/api/trips/:tripId/expert-suggestions/accept-all", isAuthenticated, async (req: any, res) => {
  const userId = await ownerOr404(req, res);
  if (!userId) return;
  try {
    res.json(await acceptAllExpertSuggestions(req.params.tripId));
  } catch (err) {
    console.error("[expert-suggestions] accept-all failed:", err);
    res.status(500).json({ message: "Couldn't accept the suggestions" });
  }
});

for (const decision of ["accept", "decline"] as const) {
  router.post(`/api/trips/:tripId/expert-suggestions/:id/${decision}`, isAuthenticated, async (req: any, res) => {
    const userId = await ownerOr404(req, res);
    if (!userId) return;
    try {
      const out = await resolveExpertSuggestion(req.params.tripId, req.params.id, decision);
      if (!out.ok) return res.status(out.status).json({ code: out.code, message: out.message });
      if (decision === "accept") {
        const { HANDOFF_EVENTS } = await import("@shared/handoff");
        const { trackFunnelEvent } = await import("../utils/funnelTracker");
        void trackFunnelEvent({ userId, tripId: req.params.tripId, eventType: HANDOFF_EVENTS.suggestionAccepted, funnelStage: "SLIP", eventData: { kind: out.suggestion?.kind } });
      }
      res.json({ status: out.status, suggestion: { id: out.suggestion.id, status: out.status }, result: out.result ?? null });
    } catch (err) {
      console.error(`[expert-suggestions] ${decision} failed:`, err);
      res.status(500).json({ message: "Couldn't apply that suggestion" });
    }
  });
}

// ─── Expert ────────────────────────────────────────────────────────────────────────────────────

router.get("/api/expert/handoffs", isAuthenticated, async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  const proposed = await listProposedForExpert(userId);
  const r = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE assigned_expert_id = ${userId} AND handoff_kind IS NOT NULL AND status IN ('accepted', 'delivered')
    ORDER BY created_at DESC LIMIT 100
  `);
  const working = await Promise.all(((r.rows ?? []) as any[]).map((x) => getHandoff(x.id)));
  res.json({
    proposed: proposed.map((p) => projectHandoff(p)),
    working: working.filter(Boolean).map((p) => projectHandoff(p as HandoffRow)),
  });
});

async function expertHandoff(req: any, res: any): Promise<{ userId: string; row: HandoffRow } | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const row = await getHandoff(req.params.id);
  if (!row || row.assignedExpertId !== userId) {
    res.status(404).json({ message: "Not found" });
    return null;
  }
  return { userId, row };
}

router.post("/api/handoffs/:id/accept", isAuthenticated, async (req: any, res) => {
  const o = await expertHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  try {
    const out = await acceptHandoff(o.row.id, o.userId);
    if (!out.ok) return refuse(res, out);
    res.json({ handoff: projectHandoff(out.request) });
  } catch (err) {
    console.error("[handoff] accept failed:", err);
    res.status(500).json({ message: "Couldn't accept" });
  }
});

router.post("/api/handoffs/:id/decline", isAuthenticated, async (req: any, res) => {
  const o = await expertHandoff(req, res);
  if (!o) return;
  if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ message: "No body expected" });
  const out = await declineHandoff(o.row.id, o.userId);
  if (!out.ok) return refuse(res, out);
  res.json({ ok: true });
});

router.post("/api/handoffs/:id/deliver", isAuthenticated, async (req: any, res) => {
  const o = await expertHandoff(req, res);
  if (!o) return;
  const parsed = deliverBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
  const out = await deliverHandoff(o.row.id, o.userId, { offerOnTripSupport: parsed.data.offerOnTripSupport });
  if (!out.ok) return refuse(res, out);
  res.json({ handoff: projectHandoff(out.request) });
});

// ─── Admin (under the §2 blanket guard) ────────────────────────────────────────────────────────

router.post("/api/admin/handoffs/:id/assign", isAuthenticated, async (req: any, res) => {
  const parsed = assignBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send an expertId" });
  const out = await adminAssignHandoff(req.params.id, parsed.data.expertId);
  if (!out.ok) return refuse(res, out);
  res.json({ handoff: projectHandoff(await getHandoff(req.params.id)) });
});

export default router;
