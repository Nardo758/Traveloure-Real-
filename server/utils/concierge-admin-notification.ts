/**
 * Concierge → admin push signal (Lane C / C3+C4).
 *
 * Until this landed, server/routes/concierge.routes.ts inserted NO
 * admin_notifications row on request creation or tier selection — staff only
 * saw a concierge request if they happened to open the queue page. This module
 * builds the notification payload; the routes insert it non-fatally (the donor
 * shape: server/routes/service-requests.routes.ts:58 — type + message +
 * isRead:false + metadata; the admin_notifications table has no severity
 * column, `type` is the convention).
 *
 * Kept PURE (no db import) so route tests can exercise the exact payload the
 * routes insert without a database (this repo's DB-free test posture).
 */
import { z } from "zod";

export const CONCIERGE_NOTIFICATION_TYPE = "concierge_request";

export type ConciergeNotifyEvent = "created" | "tier_selected" | "escalated";

/** Traveler-facing ruled names, used in staff-facing messages too so the two
 *  consoles speak one vocabulary. */
const TIER_LABELS: Record<string, string> = {
  ai: "Platform",
  expert: "Destination",
  full: "Full / Done-for-You",
};

export function conciergeTierLabel(tier: string | null | undefined): string {
  return (tier && TIER_LABELS[tier]) || "no tier yet";
}

export interface ConciergeRequestLike {
  id: string;
  intent: string;
  chosenTier?: string | null;
  eventType?: string | null;
  userId?: string | null;
}

/**
 * Payload for the admin_notifications insert. `metadata.conciergeRequestId`
 * links back to the queue row (C2's Platform tab included); escalations add
 * `metadata.conversationId` so staff can open the AI chat context.
 */
export function buildConciergeAdminNotification(
  row: ConciergeRequestLike,
  event: ConciergeNotifyEvent,
  extraMetadata: Record<string, unknown> = {},
) {
  const tier = conciergeTierLabel(row.chosenTier);
  const intentSnippet = (row.intent ?? "").slice(0, 140);
  const message =
    event === "created"
      ? `New concierge request (${tier}): ${intentSnippet}`
      : event === "tier_selected"
        ? `Concierge tier selected (${tier}): ${intentSnippet}`
        : `AI chat escalation (Platform) — a traveler asked for help from our team: ${intentSnippet}`;
  return {
    type: CONCIERGE_NOTIFICATION_TYPE,
    message,
    isRead: false,
    metadata: {
      conciergeRequestId: row.id,
      event,
      chosenTier: row.chosenTier ?? null,
      eventType: row.eventType ?? null,
      userId: row.userId ?? null,
      ...extraMetadata,
    },
  };
}

/**
 * C4 — "Get help from our team" escalation body. ALLOWLIST (§19 posture):
 * only these two fields are ever read off the request body — zod strips
 * unknown keys, so a crafted userId/chosenTier/stripe* field never reaches
 * the insert. userId is derived from the session (§14), tier is pinned to
 * 'ai' server-side.
 */
export const escalationRequestSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  note: z.string().trim().max(2000).optional(),
});
export type EscalationRequestBody = z.infer<typeof escalationRequestSchema>;
