/**
 * Resend bounce and complaint webhook (Z-21).
 *
 * The signature is Resend's (standardwebhooks / svix headers). The secret is
 * RESEND_WEBHOOK_SECRET. A missing secret or a bad signature records nothing.
 * email.bounced is stored when the bounce is permanent (or the type is absent,
 * which is this event's hard-bounce shape). Transient and undetermined bounces
 * are not stored. email.complained is stored as complaint.
 */
import type { Request, Response } from "express";
import { Resend } from "resend";
import { logger } from "../infrastructure/logger";
import { recordEmailSuppression, type SuppressionReason } from "./email-suppression";

export const RESEND_WEBHOOK_SECRET_ENV = "RESEND_WEBHOOK_SECRET";

type BounceLike = { type?: unknown; bounce?: { type?: unknown } };

function headerValue(req: Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function rawPayload(req: Request): string {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (typeof raw === "string") return raw;
  return "";
}

/** Permanent, hard, or an absent type. Transient, temporary, soft, and undetermined are not hard. */
export function isHardBounce(bounce: { type?: unknown } | null | undefined): boolean {
  const type = typeof bounce?.type === "string" ? bounce.type.trim().toLowerCase() : "";
  if (type === "transient" || type === "temporary" || type === "soft" || type === "undetermined") return false;
  return type === "" || type === "permanent" || type === "hard";
}

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
): { type?: string; data?: BounceLike & { to?: unknown; email_id?: unknown } } {
  const resend = new Resend(process.env.RESEND_API_KEY || "re_webhook_verify_only");
  return resend.webhooks.verify({
    payload,
    headers,
    webhookSecret: secret,
  }) as { type?: string; data?: BounceLike & { to?: unknown; email_id?: unknown } };
}

/** How many new suppression rows this event stored. Other event types store none. */
export async function recordResendSuppressionEvent(
  event: { type?: string; data?: BounceLike & { to?: unknown; email_id?: unknown } },
  providerEventId: string | null,
): Promise<number> {
  let reason: SuppressionReason | null = null;
  if (event.type === "email.complained") reason = "complaint";
  else if (event.type === "email.bounced" && isHardBounce(event.data?.bounce)) reason = "hard_bounce";
  if (!reason) return 0;
  const to = Array.isArray(event.data?.to) ? event.data.to : [];
  const providerEmailId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
  let recorded = 0;
  for (const entry of to) {
    if (typeof entry !== "string") continue;
    const inserted = await recordEmailSuppression({
      email: entry,
      reason,
      providerEventId,
      providerEmailId,
    });
    if (inserted) recorded += 1;
  }
  return recorded;
}

export async function resendWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env[RESEND_WEBHOOK_SECRET_ENV]?.trim() ?? "";
  if (!secret) {
    res.status(401).json({ message: "Webhook secret is not set" });
    return;
  }
  const payload = rawPayload(req);
  const id = headerValue(req, "svix-id");
  const timestamp = headerValue(req, "svix-timestamp");
  const signature = headerValue(req, "svix-signature");
  if (!payload || !id || !timestamp || !signature) {
    res.status(400).json({ message: "Invalid signature" });
    return;
  }
  let event: { type?: string; data?: BounceLike & { to?: unknown; email_id?: unknown } };
  try {
    event = verifyResendWebhook(payload, { id, timestamp, signature }, secret);
  } catch {
    logger.warn({ reason: "invalid_signature" }, "[resend-webhook] signature rejected");
    res.status(400).json({ message: "Invalid signature" });
    return;
  }
  try {
    const recorded = await recordResendSuppressionEvent(event, id);
    res.status(200).json({ received: true, recorded });
  } catch {
    logger.error({ reason: "record_failed" }, "[resend-webhook] record failed");
    res.status(500).json({ message: "Webhook processing failed" });
  }
}
