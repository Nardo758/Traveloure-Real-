/**
 * Suppression gate (Z-21).
 *
 * Marketing mail is refused for any row on email_suppressions.
 * Transactional mail is refused for a hard bounce or a complaint.
 * Security mail is refused for a hard bounce. A complaint does not block it.
 * The refusal reason is the string sendEmail returns and the outbox stores.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { emailSuppressions } from "@shared/schema";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import {
  emailStreamForType,
  suppressionTreatsAsSecurity,
} from "./email-outbox-classes";

/**
 * N3 (Leon, Nov 15): a traveler who asked not to be contacted. It rides the SAME table and the SAME gate —
 * `reason = "do_not_contact"` — so no schema change is needed (`email_suppressions.reason` is a free-form
 * varchar, migration 423).
 */
export const DO_NOT_CONTACT_REASON = "do_not_contact";
export const SUPPRESSED_DO_NOT_CONTACT = "suppressed:do_not_contact";
export const SUPPRESSED_HARD_BOUNCE = "suppressed:hard_bounce";
export const SUPPRESSED_COMPLAINT = "suppressed:complaint";
export const SUPPRESSION_LOOKUP_FAILED = "suppression_lookup_failed";

export type AddressSuppressionHit = {
  error: string;
  suppressed: "address_suppressed" | "suppression_lookup";
};

/** Stored form of an address. Null when the value is not an address. */
export function normalizeSuppressionEmail(value: string): string | null {
  const trimmed = value.trim();
  const angle = trimmed.match(/<([^<>]+)>/);
  const candidate = (angle ? angle[1] : trimmed).trim().toLowerCase();
  if (!candidate || candidate.length > 320 || /[\s<>]/.test(candidate) || !candidate.includes("@")) return null;
  return candidate;
}

/**
 * The refusal reason, or null when this send may continue.
 * reasons are the reason column values for the recipients.
 */
export function suppressionRefusalReason(input: {
  emailType: string;
  authCritical: boolean;
  reasons: readonly string[];
}): string | null {
  const reasons = new Set(input.reasons.filter((reason) => reason.length > 0));
  if (reasons.size === 0) return null;
  const bounce = reasons.has("hard_bounce");
  const complaint = reasons.has("complaint");
  if (emailStreamForType(input.emailType) === "marketing") {
    if (bounce) return SUPPRESSED_HARD_BOUNCE;
    if (complaint) return SUPPRESSED_COMPLAINT;
    const other = Array.from(reasons)[0];
    return `suppressed:${other}`;
  }
  if (suppressionTreatsAsSecurity(input.emailType, input.authCritical)) {
    return bounce ? SUPPRESSED_HARD_BOUNCE : null;
  }
  if (bounce) return SUPPRESSED_HARD_BOUNCE;
  if (complaint) return SUPPRESSED_COMPLAINT;
  // N3: a do-not-contact request refuses TRANSACTIONAL mail too (it is the traveler's own ask, not a
  // deliverability signal), and never blocks security mail above - a password reset still has to arrive.
  if (reasons.has(DO_NOT_CONTACT_REASON)) return SUPPRESSED_DO_NOT_CONTACT;
  return null;
}

export async function addressSuppressionHit(input: {
  emailType: string;
  authCritical: boolean;
  recipients: readonly string[];
}): Promise<AddressSuppressionHit | null> {
  const normalized = Array.from(new Set(
    input.recipients
      .map((recipient) => normalizeSuppressionEmail(recipient))
      .filter((email): email is string => email != null),
  ));
  if (normalized.length === 0) return null;
  let reasons: string[] = [];
  try {
    const result = await db.execute(sql`
      SELECT reason
      FROM email_suppressions
      WHERE email IN (${sql.join(normalized.map((email) => sql`${email}`), sql`, `)})
    `);
    const rows = ((result as { rows?: Array<{ reason?: unknown }> }).rows ?? []);
    reasons = rows
      .map((row) => (typeof row.reason === "string" ? row.reason : ""))
      .filter((reason) => reason.length > 0);
  } catch {
    logger.error(
      { emailType: input.emailType, reason: SUPPRESSION_LOOKUP_FAILED },
      "[email] suppression lookup failed",
    );
    return { error: SUPPRESSION_LOOKUP_FAILED, suppressed: "suppression_lookup" };
  }
  const error = suppressionRefusalReason({
    emailType: input.emailType,
    authCritical: input.authCritical,
    reasons,
  });
  if (!error) return null;
  return { error, suppressed: "address_suppressed" };
}

export type SuppressionReason = "hard_bounce" | "complaint";

/** Insert one suppression. A repeat of the same address and reason writes nothing. Returns true when a row was inserted. */
export async function recordEmailSuppression(input: {
  email: string;
  reason: SuppressionReason;
  providerEventId?: string | null;
  providerEmailId?: string | null;
}): Promise<boolean> {
  const email = normalizeSuppressionEmail(input.email);
  if (!email) return false;
  const inserted = await db.insert(emailSuppressions).values({
    id: randomUUID(),
    email,
    reason: input.reason,
    providerEventId: input.providerEventId ?? null,
    providerEmailId: input.providerEmailId ?? null,
    recordedAt: new Date(),
    createdAt: new Date(),
  }).onConflictDoNothing({
    target: [emailSuppressions.email, emailSuppressions.reason],
  }).returning({ id: emailSuppressions.id });
  return inserted.length > 0;
}

/** How the outbox stores a sendEmail refusal. Null when the result is not one of these. */
export function outboxSettleForSendRefusal(result: {
  suppressed?: string;
  error?: string;
}): { status: "cancelled" | "held"; lastError: string } | null {
  if (result.suppressed === "address_suppressed") {
    return { status: "cancelled", lastError: result.error || "suppressed" };
  }
  if (result.suppressed === "marketing_stream") {
    return { status: "held", lastError: result.error || "marketing_stream_unconfigured" };
  }
  if (result.suppressed === "suppression_lookup") {
    return { status: "held", lastError: result.error || SUPPRESSION_LOOKUP_FAILED };
  }
  return null;
}
