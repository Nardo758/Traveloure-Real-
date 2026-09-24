/**
 * Earner activity emails — the ONE sender (ledger `2026-09-24-earner-email-notifications`).
 *
 * Every event that should reach an expert or provider by email goes through here, so the three
 * rules below are stated once (§18 rule 1):
 *   1. CONSENT — the earner's own notification preference for the event's key, email channel
 *      (`isNotificationChannelEnabled`; a missing preference is the documented default, which is ON
 *      for these keys). Turning it off stops the email and nothing else.
 *   2. ADDRESS — the earner's chosen notification address, else their account email. No address ⇒
 *      no email (§13: never a guessed one).
 *   3. NO PILE-UP — a message email is sent at most once per sender→recipient per hour, checked
 *      against the outbox itself (no new table). A burst of chat lines is one email, not ten.
 *
 * Never throws: an email is an ancillary effect and must never fail the action that caused it
 * (§15b). Enqueued is not delivered — callers must not report it as received.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { enqueueEmail } from "./email-outbox.service";
import { isNotificationChannelEnabled } from "./notification-preferences.service";
import { buildActivityEmail, type ActivityEmailKind } from "../utils/activity-email-copy";
import { isEarnerRole, isProviderRole } from "@shared/roles";
import type { NotificationPreferenceKey } from "@shared/notification-preferences";

const PREFERENCE_FOR: Record<ActivityEmailKind, NotificationPreferenceKey> = {
  new_message: "newMessage",
  advisor_invite: "bookingRequest",
  quote_request: "bookingRequest",
  booking_cancelled: "bookingRequest",
  review_received: "bookingRequest",
};

const MESSAGE_THROTTLE_MINUTES = 60;

/** Where the earner acts on it — each console's own page (routes in client/src/App.tsx). */
export type ActivityDestination = "messages" | "inbox" | "bookings" | "catalog";
export function earnerConsolePath(role: string | null | undefined, destination: ActivityDestination): string {
  const provider = isProviderRole(role);
  switch (destination) {
    case "messages": return provider ? "/provider/messages" : "/expert/messages";
    case "inbox": return provider ? "/provider/inbox" : "/expert/inbox";
    case "bookings": return provider ? "/provider/bookings" : "/expert/bookings";
    case "catalog": return provider ? "/provider/services" : "/expert/catalog";
  }
}

export interface SendActivityEmailInput {
  recipientId: string;
  kind: ActivityEmailKind;
  actorName?: string | null;
  subject?: string | null;
  /** Which console page the email links to, resolved by the recipient's own role. */
  destination: ActivityDestination;
  /** Required for `new_message`: the pair the hourly throttle is keyed on. */
  throttleKey?: string;
}

export async function sendActivityEmail(input: SendActivityEmailInput): Promise<"sent" | "skipped"> {
  try {
    const recipient = await storage.getUser(input.recipientId);
    // Only earners: the decision was about experts and providers reaching their notifications.
    if (!recipient || !isEarnerRole(recipient.role)) return "skipped";
    if (!(await isNotificationChannelEnabled(input.recipientId, PREFERENCE_FOR[input.kind], "email"))) return "skipped";
    const to = (recipient as any).notificationEmail || recipient.email;
    if (!to) return "skipped";

    const emailType = `activity_${input.kind}`;
    if (input.kind === "new_message" && input.throttleKey) {
      const recent = await db.execute(sql`
        SELECT 1 FROM email_outbox
        WHERE email_type = ${emailType}
          AND metadata->>'throttleKey' = ${input.throttleKey}
          AND created_at > NOW() - (${MESSAGE_THROTTLE_MINUTES} * INTERVAL '1 minute')
        LIMIT 1
      `);
      if ((recent.rows?.length ?? 0) > 0) return "skipped";
    }

    const { getAppBaseUrl } = await import("./email.service");
    const email = buildActivityEmail({
      kind: input.kind,
      actorName: input.actorName,
      subject: input.subject,
      url: `${getAppBaseUrl()}${earnerConsolePath(recipient.role, input.destination)}`,
    });
    await enqueueEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      emailType,
      metadata: { recipientId: input.recipientId, ...(input.throttleKey ? { throttleKey: input.throttleKey } : {}) },
    });
    return "sent";
  } catch (err) {
    console.error(`[activity-email] ${input.kind} for ${input.recipientId} failed (non-fatal):`, err);
    return "skipped";
  }
}

/** A person's display name for an email line, or null (never "undefined undefined"). */
export async function displayNameOf(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const u = await storage.getUser(userId);
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
    return name || null;
  } catch {
    return null;
  }
}
