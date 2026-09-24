/**
 * The 48-hour "no response yet" notice (decision-maker, Sep 24, 2026 — Phase 3; the answer to board
 * #1293). The platform promises NO response time. When an expert or provider has not answered a
 * traveler's request within the window, the traveler is told once that we see no response, and is
 * offered other experts. Nothing is cancelled and no money moves — the request stays open.
 *
 * Two kinds of request can go unanswered:
 *   1. a REQUEST BOOKING — a `service_bookings` row still `pending` (the traveler asked a specific
 *      expert/provider; `POST /api/expert-booking-requests`, `POST /api/bookings`). A quote-born
 *      booking is excluded: the earner already answered with a quote, and it waits on the traveler.
 *   2. an ASSIGNED EXPERT who never accepted — a `trip_expert_advisors` row still `pending` for an
 *      expert a routed request (`expert_requests.assigned_expert_id`) put on the traveler's plan.
 *      A concierge's read-only grant is also `pending` but has no request behind it, so it is never
 *      counted. A pair already covered by case 1 is left to case 1 — one request, one notice.
 * A reply in chat since the request counts as a response.
 *
 * EXACTLY ONCE: the notification's dedupe key (the notifications table's partial UNIQUE index) is
 * the marker; the email is sent only by the pass that inserted it (the ready-made announcer's
 * pattern). The email honours the traveler's own "Booking Request" email preference (#1230).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { enqueueEmail } from "./email-outbox.service";
import { isNotificationChannelEnabled } from "./notification-preferences.service";
import { escHtml } from "../utils/email-escape";
import {
  alternativeExpertsPath,
  earnerNoResponseCopy,
  earnerNoResponseDedupeKey,
  earnerNoResponseHours,
} from "@shared/earner-no-response";

export interface EarnerNoResponseStats {
  candidates: number;
  notified: number;
  emailed: number;
  errors: string[];
}

interface Candidate {
  kind: "booking" | "advisor";
  id: string;
  travelerId: string;
  earnerName: string | null;
  subject: string | null;
  city: string | null;
}

const BATCH = 200;

async function findCandidates(hours: number): Promise<Candidate[]> {
  const bookingRows = await db.execute(sql`
    SELECT sb.id, sb.traveler_id, ps.service_name, COALESCE(ps.city, t.destination) AS city,
           NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS earner_name
      FROM service_bookings sb
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
      LEFT JOIN trips t ON t.id = sb.trip_id
      LEFT JOIN users u ON u.id = sb.provider_id
     WHERE sb.status = 'pending'
       AND sb.created_at < NOW() - make_interval(hours => ${hours})
       AND sb.traveler_id IS NOT NULL
       AND sb.provider_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM service_quotes q WHERE q.booking_id = sb.id)
       AND NOT EXISTS (SELECT 1 FROM user_and_expert_chats c
                        WHERE c.sender_id = sb.provider_id AND c.receiver_id = sb.traveler_id
                          AND c.created_at >= sb.created_at)
       AND NOT EXISTS (SELECT 1 FROM notifications n
                        WHERE n.dedupe_key = 'booking:' || sb.id || ':earner_no_response')
     ORDER BY sb.created_at
     LIMIT ${BATCH}
  `);
  const advisorRows = await db.execute(sql`
    SELECT DISTINCT ON (tea.id) tea.id, t.user_id AS traveler_id, t.destination AS city,
           NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS earner_name
      FROM trip_expert_advisors tea
      JOIN trips t ON t.id = tea.trip_id
      JOIN expert_requests er ON er.trip_id = tea.trip_id AND er.assigned_expert_id = tea.local_expert_id
      LEFT JOIN users u ON u.id = tea.local_expert_id
     WHERE tea.status = 'pending'
       AND tea.assigned_at < NOW() - make_interval(hours => ${hours})
       AND t.user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM service_bookings sb
                        WHERE sb.trip_id = tea.trip_id AND sb.provider_id = tea.local_expert_id
                          AND sb.status = 'pending')
       AND NOT EXISTS (SELECT 1 FROM user_and_expert_chats c
                        WHERE c.sender_id = tea.local_expert_id AND c.receiver_id = t.user_id
                          AND c.created_at >= tea.assigned_at)
       AND NOT EXISTS (SELECT 1 FROM notifications n
                        WHERE n.dedupe_key = 'advisor:' || tea.id || ':earner_no_response')
     ORDER BY tea.id
     LIMIT ${BATCH}
  `);
  return [
    ...((bookingRows.rows ?? []) as any[]).map((r) => ({
      kind: "booking" as const, id: String(r.id), travelerId: String(r.traveler_id),
      earnerName: r.earner_name ?? null, subject: r.service_name ?? null, city: r.city ?? null,
    })),
    ...((advisorRows.rows ?? []) as any[]).map((r) => ({
      kind: "advisor" as const, id: String(r.id), travelerId: String(r.traveler_id),
      earnerName: r.earner_name ?? null, subject: "your plan", city: r.city ?? null,
    })),
  ];
}

export async function runEarnerNoResponseNotices(): Promise<EarnerNoResponseStats> {
  const hours = earnerNoResponseHours();
  const stats: EarnerNoResponseStats = { candidates: 0, notified: 0, emailed: 0, errors: [] };
  const candidates = await findCandidates(hours);
  stats.candidates = candidates.length;

  for (const c of candidates) {
    const copy = earnerNoResponseCopy({ earnerName: c.earnerName, subject: c.subject });
    const alternatives = alternativeExpertsPath(c.city);
    try {
      const { inserted } = await storage.createNotificationOnce({
        userId: c.travelerId,
        type: "earner_no_response",
        title: copy.title,
        message: copy.message,
        relatedId: c.id,
        relatedType: c.kind === "booking" ? "booking" : "trip_advisor",
        // `workspacePath` is used verbatim by resolveNotificationLink — the notice opens the
        // alternatives, which is the action it offers.
        data: { workspacePath: alternatives, kind: c.kind, id: c.id },
        dedupeKey: earnerNoResponseDedupeKey(c.kind, c.id),
      } as any);
      if (!inserted) continue;
      stats.notified++;

      // The email rides only on the pass that wrote the marker, and only with the traveler's consent.
      if (!(await isNotificationChannelEnabled(c.travelerId, "bookingRequest", "email"))) continue;
      const traveler = await storage.getUser(c.travelerId);
      if (!traveler?.email) continue;
      const { getAppBaseUrl } = await import("./email.service");
      const url = `${getAppBaseUrl()}${alternatives}`;
      await enqueueEmail({
        to: traveler.email,
        subject: copy.title,
        html: `<p>${escHtml(copy.message)}</p><p><a href="${escHtml(url)}">See other experts</a></p>`,
        text: `${copy.message}\n\nSee other experts: ${url}`,
        emailType: "earner_no_response",
        metadata: { kind: c.kind, id: c.id },
      });
      stats.emailed++;
    } catch (err) {
      stats.errors.push(`${c.kind}:${c.id}`);
      console.error(`[earner-no-response] notice failed for ${c.kind} ${c.id}:`, err);
    }
  }
  return stats;
}
