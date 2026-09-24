/**
 * SERVICE QUOTES — the rails (thin callers of `server/services/service-quotes.service.ts`).
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-28..D-31; ledger `2026-09-15-d28-d31-service-quotes`).
 *
 *   POST /api/services/:id/quote-requests   traveler asks; creates a `service_quotes` row, NO booking
 *   GET  /api/me/quotes                     the traveler's own quotes
 *   POST /api/quotes/:quoteId/accept        the atomic claim; mints through the existing writer
 *   POST /api/quotes/:quoteId/decline       the traveler's no (terminal)
 *   GET  /api/provider/quotes               every quote on the caller's OWN listings
 *   POST /api/provider/quotes/:quoteId/issue     the owner's amount + validity (D-29 ceiling)
 *   POST /api/provider/quotes/:quoteId/withdraw  the owner takes the offer back (terminal)
 *
 * §14: every actor is `getUserId(req)`; no body carries an identity. The traveler's accept carries
 * NO amount — the path names the quote and the server reads the amount off the row it wrote.
 * §19: the two bodies are the `.strict()` picks in `shared/service-quotes.ts`; a stray key is a
 * 400, never silently stripped. The owner rails are owner-gated at the ROW (the quote's listing
 * must belong to the session), which is why they need no role middleware: an expert's listing is
 * quoted by that expert, a provider's by that provider.
 * LD 40: an unresolvable quote is ONE 404 for "no such thing" and "not yours" alike, and no
 * response carries a `users.id`.
 */
import { Router } from "express";
import { z } from "zod";

import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { quoteIssueBodySchema, quoteRequestBodySchema } from "@shared/service-quotes";
import {
  acceptQuote,
  declineQuote,
  issueQuote,
  listQuotesForOwner,
  listQuotesForTraveler,
  requestQuote,
  withdrawQuote,
  type QuoteRefusal,
} from "../services/service-quotes.service";

const router = Router();

async function notifyQuoteRequested(serviceId: string, travelerId: string, quoteId: string): Promise<void> {
  try {
    const { storage } = await import("../storage");
    const { sendActivityEmail, displayNameOf, earnerConsolePath } = await import("../services/activity-email.service");
    const service = await storage.getProviderServiceById(serviceId);
    if (!service?.userId || !quoteId) return;
    const owner = await storage.getUser(service.userId);
    const actorName = await displayNameOf(travelerId);
    const { inserted } = await storage.createNotificationOnce({
      userId: service.userId,
      type: "quote_requested",
      title: "Quote requested",
      message: `${actorName ?? "A traveler"} asked you for a quote for ${service.serviceName}.`,
      relatedId: quoteId,
      relatedType: "quote",
      data: { workspacePath: earnerConsolePath(owner?.role, "catalog") },
      dedupeKey: `quote-requested:${quoteId}`,
    } as any);
    if (!inserted) return;
    await sendActivityEmail({
      recipientId: service.userId,
      kind: "quote_request",
      actorName,
      subject: service.serviceName,
      destination: "catalog",
    });
  } catch (err) {
    console.error("[service-quotes] seller notify failed (non-fatal):", err);
  }
}

function sendRefusal(res: any, r: QuoteRefusal) {
  const { ok: _ok, status, ...body } = r;
  return res.status(status).json(body);
}

function zodMessage(err: unknown): string | null {
  return err instanceof z.ZodError ? err.errors[0]?.message ?? "Invalid body" : null;
}

router.post("/api/services/:id/quote-requests", isAuthenticated, async (req, res) => {
  try {
    const travelerId = getUserId(req)!;
    const body = quoteRequestBodySchema.parse(req.body ?? {});
    const r = await requestQuote({
      serviceId: String(req.params.id),
      travelerId,
      note: body.note ?? null,
      tripId: body.tripId ?? null,
      itineraryItemId: body.itineraryItemId ?? null,
    });
    if (!r.ok) return sendRefusal(res, r);
    // Ledger 2026-09-24-earner-email-notifications: a NEW request reached its seller by nothing at
    // all — no bell, no email. The seller is told once (the quote id is the dedupe key) and, on
    // their own consent, by email. Ancillary: it never fails the request (§15b).
    if (r.created) {
      void notifyQuoteRequested(String(req.params.id), travelerId, String((r.quote as any)?.id ?? ""));
    }
    return res.status(r.created ? 201 : 200).json({ quote: r.quote, created: r.created });
  } catch (err) {
    const zm = zodMessage(err);
    if (zm) return res.status(400).json({ message: zm });
    console.error("[service-quotes] request failed:", err);
    return res.status(500).json({ message: "Failed to request a quote" });
  }
});

router.get("/api/me/quotes", isAuthenticated, async (req, res) => {
  try {
    const travelerId = getUserId(req)!;
    return res.json({ quotes: await listQuotesForTraveler(travelerId) });
  } catch (err) {
    console.error("[service-quotes] traveler list failed:", err);
    return res.status(500).json({ message: "Failed to load quotes" });
  }
});

router.post("/api/quotes/:quoteId/accept", isAuthenticated, async (req, res) => {
  try {
    const travelerId = getUserId(req)!;
    const r = await acceptQuote({ quoteId: String(req.params.quoteId), travelerId });
    if (!r.ok) return sendRefusal(res, r);
    return res.status(r.minted ? 201 : 200).json({ quote: r.quote, bookingId: r.bookingId, minted: r.minted });
  } catch (err) {
    console.error("[service-quotes] accept failed:", err);
    return res.status(500).json({ message: "Failed to accept the quote" });
  }
});

router.post("/api/quotes/:quoteId/decline", isAuthenticated, async (req, res) => {
  try {
    const travelerId = getUserId(req)!;
    const r = await declineQuote({ quoteId: String(req.params.quoteId), travelerId });
    if (!r.ok) return sendRefusal(res, r);
    return res.json({ quote: r.quote });
  } catch (err) {
    console.error("[service-quotes] decline failed:", err);
    return res.status(500).json({ message: "Failed to decline the quote" });
  }
});

router.get("/api/provider/quotes", isAuthenticated, async (req, res) => {
  try {
    const ownerUserId = getUserId(req)!;
    return res.json({ quotes: await listQuotesForOwner(ownerUserId) });
  } catch (err) {
    console.error("[service-quotes] owner list failed:", err);
    return res.status(500).json({ message: "Failed to load quotes" });
  }
});

router.post("/api/provider/quotes/:quoteId/issue", isAuthenticated, async (req, res) => {
  try {
    const actorUserId = getUserId(req)!;
    const body = quoteIssueBodySchema.parse(req.body ?? {});
    const r = await issueQuote({
      quoteId: String(req.params.quoteId),
      actorUserId,
      amountCents: body.amountCents,
      validityDays: body.validityDays ?? null,
      note: body.note ?? null,
    });
    if (!r.ok) return sendRefusal(res, r);
    return res.json({ quote: r.quote, ...(r.supersededQuoteId ? { supersededQuoteId: r.supersededQuoteId } : {}) });
  } catch (err) {
    const zm = zodMessage(err);
    if (zm) return res.status(400).json({ message: zm });
    console.error("[service-quotes] issue failed:", err);
    return res.status(500).json({ message: "Failed to issue the quote" });
  }
});

router.post("/api/provider/quotes/:quoteId/withdraw", isAuthenticated, async (req, res) => {
  try {
    const actorUserId = getUserId(req)!;
    const r = await withdrawQuote({ quoteId: String(req.params.quoteId), actorUserId });
    if (!r.ok) return sendRefusal(res, r);
    return res.json({ quote: r.quote });
  } catch (err) {
    console.error("[service-quotes] withdraw failed:", err);
    return res.status(500).json({ message: "Failed to withdraw the quote" });
  }
});

export default router;
