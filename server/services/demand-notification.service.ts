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
 *   3. Loads each user's email + name from the users table.
 *   4. Sends a Resend email linking to the service page.
 *   5. Marks all notified rows with notified_at = NOW().
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

    const userIds = [...new Set(demands.map((d) => d.userId!))];

    // Load user emails and names
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const resend = getResend();
    const serviceUrl = `${getAppBaseUrl()}/services/${service.id}`;
    const sentDemandIds: string[] = [];

    for (const demand of demands) {
      const user = userMap.get(demand.userId!);
      if (!user?.email) continue;

      const greeting = user.firstName ? `Hi ${user.firstName},` : "Hi,";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #FF385C; margin-bottom: 8px;">Great news — your request is now available!</h2>
          <p style="color: #374151;">${greeting}</p>
          <p style="color: #374151;">
            You previously requested a <strong>${service.serviceName}</strong> service in
            <strong>${demand.city}</strong>. A provider has just listed exactly that — and you can
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
        `You previously requested a "${service.serviceName}" service in ${demand.city}. A provider has just listed exactly that — and you can book it now.`,
        ``,
        `View and book: ${serviceUrl}`,
        ``,
        `You're receiving this because you requested this service type on Traveloure.`,
      ].join("\n");

      if (resend) {
        try {
          await resend.emails.send({
            from: getFromAddress(),
            to: user.email,
            subject: `"${service.serviceName}" is now available in ${demand.city}`,
            html,
            text,
          });
          console.log(
            `[demand-notify] Sent availability email to ${user.email} for service ${serviceId} (demand ${demand.id})`
          );
        } catch (emailErr) {
          console.error(
            `[demand-notify] Failed to send email to ${user.email}:`,
            emailErr
          );
          continue;
        }
      } else {
        console.log(
          `[demand-notify] RESEND_API_KEY not set — skipping email to ${user.email} for demand ${demand.id}`
        );
      }

      sentDemandIds.push(demand.id);
    }

    // Mark sent (or would-have-been-sent) rows as notified
    if (sentDemandIds.length > 0) {
      await db
        .update(serviceDemandRequests)
        .set({ notifiedAt: new Date() })
        .where(inArray(serviceDemandRequests.id, sentDemandIds));

      console.log(
        `[demand-notify] Marked ${sentDemandIds.length} demand request(s) as notified for service ${serviceId}`
      );
    }
  } catch (err) {
    console.error("[demand-notify] Unexpected error in notifyDemandRequesters:", err);
  }
}
