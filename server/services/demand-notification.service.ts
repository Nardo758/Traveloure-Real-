/**
 * Demand Notification Service
 *
 * When a new provider_services row is created (or an existing one is
 * activated), this service:
 *   1. Resolves the offeringTypeKey for the service via its
 *      expertOfferingTypeId FK → expert_offering_types.offering_type_key.
 *   2. Queries service_demand_requests for matching rows where
 *      city ≈ service.location (case-insensitive) AND
 *      offering_type_key = resolved key AND
 *      user_id IS NOT NULL AND
 *      notified_at IS NULL.
 *   3. Deduplicates to one email per user (a user may have submitted
 *      multiple demand requests for the same city + offering type).
 *   4. Loads each user's email + name from the users table.
 *   5. Sends a Resend email (one per user) linking to the service page.
 *   6. Marks ALL of that user's matching demand rows with notified_at = NOW()
 *      — but ONLY after the email is confirmed sent.
 *   7. If RESEND_API_KEY is absent, logs a warning and leaves rows
 *      un-notified so they can be picked up once the key is configured.
 */

import { db } from "../db";
import { eq, and, ilike, isNull, isNotNull, inArray } from "drizzle-orm";
import { serviceDemandRequests, expertOfferingTypes, providerServices } from "@shared/schema";
import { users } from "@shared/models/auth";
import { Resend } from "resend";
import { getAppBaseUrl } from "./email.service";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || "Traveloure <no-reply@traveloure.com>";
}

/**
 * Called after a provider service is inserted or its status is set to "active".
 * Fires-and-forgets from the route handler (errors are caught internally).
 */
export async function notifyDemandRequesters(serviceId: string): Promise<void> {
  try {
    const [service] = await db
      .select({
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        location: providerServices.location,
        expertOfferingTypeId: providerServices.expertOfferingTypeId,
        status: providerServices.status,
      })
      .from(providerServices)
      .where(eq(providerServices.id, serviceId));

    if (!service || service.status !== "active") return;

    // Resolve offeringTypeKey from the FK if available
    let offeringTypeKey: string | null = null;
    if (service.expertOfferingTypeId) {
      const [ot] = await db
        .select({ offeringTypeKey: expertOfferingTypes.offeringTypeKey })
        .from(expertOfferingTypes)
        .where(eq(expertOfferingTypes.id, service.expertOfferingTypeId));
      offeringTypeKey = ot?.offeringTypeKey ?? null;
    }

    if (!offeringTypeKey || !service.location) {
      console.log(
        `[demand-notify] Service ${serviceId} has no offeringTypeKey or location — skipping demand notifications`
      );
      return;
    }

    // Find unnotified demand requests for this city + offering type
    const demands = await db
      .select({
        id: serviceDemandRequests.id,
        userId: serviceDemandRequests.userId,
        city: serviceDemandRequests.city,
      })
      .from(serviceDemandRequests)
      .where(
        and(
          ilike(serviceDemandRequests.city, service.location),
          eq(serviceDemandRequests.offeringTypeKey, offeringTypeKey),
          isNotNull(serviceDemandRequests.userId),
          isNull(serviceDemandRequests.notifiedAt)
        )
      );

    if (demands.length === 0) {
      console.log(
        `[demand-notify] No unnotified demand requests for offering "${offeringTypeKey}" in "${service.location}"`
      );
      return;
    }

    // Group demand row IDs by userId so each user gets exactly one email,
    // but all their matching rows get marked notified after a successful send.
    const byUser = new Map<string, { city: string; demandIds: string[] }>();
    for (const demand of demands) {
      const uid = demand.userId!;
      if (!byUser.has(uid)) {
        byUser.set(uid, { city: demand.city, demandIds: [] });
      }
      byUser.get(uid)!.demandIds.push(demand.id);
    }

    const userIds = [...byUser.keys()];

    // Load user emails and names
    const userRows = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName })
      .from(users)
      .where(inArray(users.id, userIds));

    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const resend = getResend();
    if (!resend) {
      console.warn(
        `[demand-notify] RESEND_API_KEY not set — ${demands.length} demand request(s) for ` +
        `offering "${offeringTypeKey}" in "${service.location}" will NOT be notified until key is configured`
      );
      return;
    }

    const serviceUrl = `${getAppBaseUrl()}/services/${service.id}`;
    let notifiedCount = 0;

    for (const [userId, { city, demandIds }] of byUser) {
      const user = userMap.get(userId);
      if (!user?.email) continue;

      const greeting = user.firstName ? `Hi ${user.firstName},` : "Hi,";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #FF385C; margin-bottom: 8px;">Great news — your request is now available!</h2>
          <p style="color: #374151;">${greeting}</p>
          <p style="color: #374151;">
            You previously requested a <strong>${service.serviceName}</strong> service in
            <strong>${city}</strong>. A provider has just listed exactly that — and you can
            book it now.
          </p>
          <p style="margin: 24px 0;">
            <a href="${serviceUrl}"
               style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                      padding: 12px 24px; border-radius: 6px; font-weight: 600;">
              View Service &amp; Book
            </a>
          </p>
          <p style="color: #6B7280; font-size: 13px;">
            Or paste this link into your browser:<br>
            <span style="color: #374151; word-break: break-all;">${serviceUrl}</span>
          </p>
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
            You're receiving this because you requested this service type on Traveloure.<br>
            To manage your notifications, visit your account settings.
          </p>
        </div>
      `;

      const text = [
        `Great news — your request is now available!`,
        ``,
        greeting,
        ``,
        `You previously requested a "${service.serviceName}" service in ${city}. A provider has just listed exactly that — and you can book it now.`,
        ``,
        `View and book: ${serviceUrl}`,
        ``,
        `You're receiving this because you requested this service type on Traveloure.`,
      ].join("\n");

      try {
        const { data, error: sendError } = await resend.emails.send({
          from: getFromAddress(),
          to: user.email,
          subject: `"${service.serviceName}" is now available in ${city}`,
          html,
          text,
        });

        // Resend SDK resolves with { data, error } — a non-null error means the
        // message was NOT accepted, so we must NOT mark rows as notified.
        if (sendError || !data?.id) {
          console.error(
            `[demand-notify] Resend rejected email to ${user.email} for service ${serviceId}` +
            ` — rows left un-notified for retry:`,
            sendError ?? "no message id returned"
          );
          continue;
        }

        // Email accepted — now mark ALL this user's matching demand rows notified
        await db
          .update(serviceDemandRequests)
          .set({ notifiedAt: new Date() })
          .where(inArray(serviceDemandRequests.id, demandIds));

        notifiedCount += demandIds.length;
        console.log(
          `[demand-notify] Sent availability email to ${user.email} (msgId: ${data.id}) ` +
          `for service ${serviceId} — marked ${demandIds.length} demand row(s) notified`
        );
      } catch (emailErr) {
        // Leave rows un-notified so they can be retried on a future activation run.
        console.error(
          `[demand-notify] Exception sending email to ${user.email} for service ${serviceId}` +
          ` — rows left un-notified for retry:`,
          emailErr
        );
      }
    }

    console.log(
      `[demand-notify] Done for service ${serviceId}: ${notifiedCount}/${demands.length} demand row(s) notified`
    );
  } catch (err) {
    console.error("[demand-notify] Unexpected error in notifyDemandRequesters:", err);
  }
}
