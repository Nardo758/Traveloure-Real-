/**
 * calendar.routes.ts — Channel Calendar read-only aggregate (Console IA PR-Ca phase C3, §17).
 *
 * ONE channel-filtered calendar for the earner console (the ratified 9th module). Every event is
 * backed by a REAL row in an existing table — no new tables, no migration, zero writes (§13: a lane
 * with no rows contributes no events; an empty month renders empty). Events REFERENCE their owning
 * module via `href` (Inbox for bookings/requests, Workstation build for deliveries/listings,
 * Catalog for slots) — the calendar never re-renders another module's surface.
 *
 * Lanes and their owning rows:
 *   availability — vendor_availability_slots (providerId = session user) with open capacity,
 *                  joined to provider_services for the service name. Same table Catalog's slot
 *                  CRUD (expert-console.routes.ts /api/me/services/:serviceId/slots) writes.
 *   inbound      — service_bookings (providerId = session user). Event date is the REAL schedule:
 *                  the claimed slot's date (slot_id → vendor_availability_slots.date, migration
 *                  145) or bookingDetails->>'scheduledDate' (written at checkout,
 *                  payments.routes.ts). A booking with NEITHER has no calendar day and is
 *                  deliberately OMITTED rather than fabricated onto created-at (§13).
 *              — affiliate_booking_requests claimable/claimed by this expert (§16 rail;
 *                  expertId = session user OR unclaimed, expert-family roles only — the same
 *                  visibility contract as storage.getAffiliateBookingRequestsByExpert). Dated by
 *                  travel_date, falling back to the request's created_at day (both real columns).
 *              — ready_made_purchases of this author's listings (join ready_made_trips on
 *                  authorId) by purchased_at.
 *   store        — ready_made_trips lifecycle timestamps (authorId = session user):
 *                  submitted_at → "submitted", reviewed_at + status approved → "approved".
 *   outbound     — trip_expert_advisors (localExpertId = session user) join trips: the trip's
 *                  start_date is the client-delivery horizon.
 *                  coordination_states assigned to this expert are deliberately OMITTED: the
 *                  `dates` jsonb column is never written by any create/patch path (only `budget`
 *                  is — the §7 D-BUDGET note; title/metadata are dropped), so there is no real,
 *                  populated event-date to place on a calendar. Omit, never fabricate (§13).
 *
 * §14: acting user from the session only — never from query/body; every lane query is self-scoped
 * to that user. Role-aware (expert or provider — same response shape): the agent-request lane only
 * exists for expert-family roles, and hrefs resolve to the caller's own console.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { and, eq, gte, lte, or, isNull, sql } from "drizzle-orm";
import {
  vendorAvailabilitySlots,
  providerServices,
  serviceBookings,
  serviceAvailabilityBlackouts,
  affiliateBookingRequests,
  readyMadePurchases,
  readyMadeTrips,
  tripExpertAdvisors,
  trips,
} from "@workspace/db";
import { isExpertRole, isProviderRole } from "@shared/roles";
import { readPartnerDemandRollup } from "../services/demand-rollup.service";
import { getMarketByKey } from "../services/trend-engine/operating-markets";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WINDOW_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

type Lane = "inbound" | "outbound" | "availability" | "store";

interface CalendarEvent {
  id: string;
  lane: Lane;
  kind: string;
  date: string; // YYYY-MM-DD
  title: string;
  href: string;
  status?: string;
}

function sessionUserId(req: any): string | undefined {
  return getUserId(req)!;
}

// GET /api/me/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — read-only, session-scoped aggregate.
router.get("/api/me/calendar", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Window: default = the current month; explicit from/to must be valid and ≤ 62 days.
    const now = new Date();
    const defFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const defTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : defFrom;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : defTo;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return res.status(400).json({ message: "from/to must be YYYY-MM-DD" });
    }
    const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
    if (!Number.isFinite(spanDays) || spanDays < 0 || spanDays > MAX_WINDOW_DAYS) {
      return res.status(400).json({ message: `Window must be 0–${MAX_WINDOW_DAYS} days` });
    }

    // Role (from the DB, §2 posture) picks the agent-request lane + the owning-console hrefs.
    const dbUser = await storage.getUser(userId);
    const role = dbUser?.role ?? "";
    const isExpert = isExpertRole(role) || role === "admin";
    const isProviderOnly = isProviderRole(role) && !isExpert;
    const hrefs = {
      slots: isProviderOnly ? "/provider/services" : "/expert/catalog",
      inbox: isProviderOnly ? "/provider/inbox" : "/expert/inbox",
      build: (tripId: string | null | undefined) =>
        tripId ? `/expert/workspace/${tripId}` : "/expert/workspace",
    };

    const events: CalendarEvent[] = [];

    // ── availability: all slots (open and full) in-window ───────────────────────────────
    const slotRows = await db
      .select({
        id: vendorAvailabilitySlots.id,
        date: vendorAvailabilitySlots.date,
        startTime: vendorAvailabilitySlots.startTime,
        capacity: vendorAvailabilitySlots.capacity,
        bookedCount: vendorAvailabilitySlots.bookedCount,
        serviceName: providerServices.serviceName,
      })
      .from(vendorAvailabilitySlots)
      .innerJoin(providerServices, eq(vendorAvailabilitySlots.serviceId, providerServices.id))
      .where(
        and(
          eq(vendorAvailabilitySlots.providerId, userId),
          gte(vendorAvailabilitySlots.date, from),
          lte(vendorAvailabilitySlots.date, to),
        ),
      );
    for (const s of slotRows) {
      const booked = s.bookedCount ?? 0;
      const cap = s.capacity;
      const isFull = cap != null && booked >= cap;
      const timePfx = s.startTime ? `${s.startTime} · ` : "";
      const name = s.serviceName ?? "Service";
      let title: string;
      if (isFull) {
        title = `${timePfx}${name} · ${cap} of ${cap} — full`;
      } else if (cap != null) {
        title = `${timePfx}${name} · ${booked} of ${cap} seats booked`;
      } else {
        title = `${timePfx}${name}`;
      }
      events.push({
        id: `slot-${s.id}`,
        lane: "availability",
        kind: isFull ? "full_slot" : "open_slot",
        date: s.date,
        title,
        href: hrefs.slots,
      });
    }

    // ── availability: blackout ranges ────────────────────────────────────────────────────
    const blackoutRows = await db
      .select({
        id: serviceAvailabilityBlackouts.id,
        startDate: serviceAvailabilityBlackouts.startDate,
        endDate: serviceAvailabilityBlackouts.endDate,
        reason: serviceAvailabilityBlackouts.reason,
        serviceName: providerServices.serviceName,
      })
      .from(serviceAvailabilityBlackouts)
      .innerJoin(providerServices, eq(serviceAvailabilityBlackouts.serviceId, providerServices.id))
      .where(
        and(
          eq(providerServices.userId, userId),
          lte(serviceAvailabilityBlackouts.startDate, to),
          gte(serviceAvailabilityBlackouts.endDate, from),
        ),
      );
    for (const b of blackoutRows) {
      const winStart = new Date(Math.max(Date.parse(`${b.startDate}T00:00:00Z`), Date.parse(`${from}T00:00:00Z`)));
      const winEnd   = new Date(Math.min(Date.parse(`${b.endDate}T00:00:00Z`),   Date.parse(`${to}T00:00:00Z`)));
      const reason = b.reason ? b.reason.charAt(0).toUpperCase() + b.reason.slice(1) : "Closed";
      const name = b.serviceName ?? "Service";
      for (let d = new Date(winStart); d <= winEnd; d = new Date(d.getTime() + DAY_MS)) {
        const dateStr = d.toISOString().slice(0, 10);
        events.push({
          id: `blackout-${b.id}-${dateStr}`,
          lane: "availability",
          kind: "blackout",
          date: dateStr,
          title: `${name} · ${reason}`,
          href: hrefs.slots,
        });
      }
    }

    // ── inbound: bookings on my services, dated by their REAL schedule ───────────────────
    // COALESCE(claimed slot's date, bookingDetails->>'scheduledDate' when it starts with a
    // YYYY-MM-DD). Rows where both are absent produce NULL and fall out of the BETWEEN —
    // an unscheduled booking has no honest calendar day (§13), so it is omitted.
    const bookingDateExpr = sql<string>`COALESCE(${vendorAvailabilitySlots.date}::text, substring(${serviceBookings.bookingDetails}->>'scheduledDate' from '^\\d{4}-\\d{2}-\\d{2}'))`;
    const bookingRows = await db
      .select({
        id: serviceBookings.id,
        status: serviceBookings.status,
        eventDate: bookingDateExpr,
        serviceName: providerServices.serviceName,
      })
      .from(serviceBookings)
      .leftJoin(vendorAvailabilitySlots, eq(serviceBookings.slotId, vendorAvailabilitySlots.id))
      .leftJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
      .where(
        and(
          eq(serviceBookings.providerId, userId),
          sql`${bookingDateExpr} >= ${from}`,
          sql`${bookingDateExpr} <= ${to}`,
        ),
      );
    for (const b of bookingRows) {
      events.push({
        id: `booking-${b.id}`,
        lane: "inbound",
        kind: "booking",
        date: b.eventDate,
        title: `Booked · ${b.serviceName ?? "Service"}`,
        href: hrefs.inbox,
        status: b.status ?? undefined,
      });
    }

    // ── inbound: agent-booking requests (§16 rail) — expert-family only ──────────────────
    if (isExpert) {
      const agentDateExpr = sql<string>`COALESCE(${affiliateBookingRequests.travelDate}::text, to_char(${affiliateBookingRequests.createdAt}, 'YYYY-MM-DD'))`;
      const agentRows = await db
        .select({
          id: affiliateBookingRequests.id,
          itemName: affiliateBookingRequests.itemName,
          status: affiliateBookingRequests.status,
          eventDate: agentDateExpr,
        })
        .from(affiliateBookingRequests)
        .where(
          and(
            or(
              eq(affiliateBookingRequests.expertId, userId),
              isNull(affiliateBookingRequests.expertId),
            ),
            sql`${agentDateExpr} >= ${from}`,
            sql`${agentDateExpr} <= ${to}`,
          ),
        );
      for (const r of agentRows) {
        events.push({
          id: `agent-${r.id}`,
          lane: "inbound",
          kind: "agent_request",
          date: r.eventDate,
          title: `Agent request · ${r.itemName}`,
          href: hrefs.inbox,
          status: r.status ?? undefined,
        });
      }
    }

    // ── inbound: store purchases of my listings ──────────────────────────────────────────
    const purchaseDateExpr = sql<string>`to_char(${readyMadePurchases.purchasedAt}, 'YYYY-MM-DD')`;
    const purchaseRows = await db
      .select({
        id: readyMadePurchases.id,
        status: readyMadePurchases.status,
        eventDate: purchaseDateExpr,
        listingTitle: readyMadeTrips.title,
      })
      .from(readyMadePurchases)
      .innerJoin(readyMadeTrips, eq(readyMadePurchases.readyMadeTripId, readyMadeTrips.id))
      .where(
        and(
          eq(readyMadeTrips.authorId, userId),
          sql`${purchaseDateExpr} >= ${from}`,
          sql`${purchaseDateExpr} <= ${to}`,
        ),
      );
    for (const p of purchaseRows) {
      events.push({
        id: `purchase-${p.id}`,
        lane: "inbound",
        kind: "purchase",
        date: p.eventDate,
        title: `Store purchase · ${p.listingTitle}`,
        href: "/expert/catalog",
        status: p.status ?? undefined,
      });
    }

    // ── store: my listings' lifecycle transitions ────────────────────────────────────────
    const listingRows = await db
      .select({
        id: readyMadeTrips.id,
        title: readyMadeTrips.title,
        status: readyMadeTrips.status,
        sourceTripId: readyMadeTrips.sourceTripId,
        submittedDate: sql<string | null>`to_char(${readyMadeTrips.submittedAt}, 'YYYY-MM-DD')`,
        reviewedDate: sql<string | null>`to_char(${readyMadeTrips.reviewedAt}, 'YYYY-MM-DD')`,
      })
      .from(readyMadeTrips)
      .where(
        and(
          eq(readyMadeTrips.authorId, userId),
          or(
            sql`to_char(${readyMadeTrips.submittedAt}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}`,
            sql`to_char(${readyMadeTrips.reviewedAt}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}`,
          ),
        ),
      );
    for (const l of listingRows) {
      if (l.submittedDate && l.submittedDate >= from && l.submittedDate <= to) {
        events.push({
          id: `listing-submitted-${l.id}`,
          lane: "store",
          kind: "listing_submitted",
          date: l.submittedDate,
          title: `Listing submitted · ${l.title}`,
          href: hrefs.build(l.sourceTripId),
        });
      }
      if (
        l.reviewedDate &&
        l.reviewedDate >= from &&
        l.reviewedDate <= to &&
        l.status === "approved"
      ) {
        events.push({
          id: `listing-approved-${l.id}`,
          lane: "store",
          kind: "listing_approved",
          date: l.reviewedDate,
          title: `Listing approved · ${l.title}`,
          href: hrefs.build(l.sourceTripId),
        });
      }
    }

    // ── outbound: client-delivery horizons on my assigned trips ──────────────────────────
    const deliveryRows = await db
      .select({
        id: tripExpertAdvisors.id,
        tripId: tripExpertAdvisors.tripId,
        assignmentStatus: tripExpertAdvisors.status,
        tripTitle: trips.title,
        startDate: trips.startDate,
      })
      .from(tripExpertAdvisors)
      .innerJoin(trips, eq(tripExpertAdvisors.tripId, trips.id))
      .where(
        and(
          eq(tripExpertAdvisors.localExpertId, userId),
          gte(trips.startDate, from),
          lte(trips.startDate, to),
        ),
      );
    for (const d of deliveryRows) {
      events.push({
        id: `delivery-${d.id}`,
        lane: "outbound",
        kind: "delivery",
        date: d.startDate,
        title: `Delivery · ${d.tripTitle ?? "Trip"}`,
        href: hrefs.build(d.tripId),
        status: d.assignmentStatus ?? undefined,
      });
    }

    // ── ghost slots (3.3 Item 1.2): requested-but-uncovered windows ──────────────────────
    // A "ghost" is a day the L6 rollup shows OPEN traveler demand in one of the caller's markets
    // with NO bookable inventory — a slot they could open. It is NOT a booking and NOT their own
    // listing's demand: it is MARKET-LEVEL and the copy says so ("N requested in Kyoto"), never
    // "requested from you" (that would over-claim). Source is the SAME L6 read the Market Research
    // page uses — extend, never a parallel demand path — floor-enforced (own_book) and R16-filtered
    // there, so a below-floor day contributes no ghost (§13). No client math: the month-header
    // aggregate is computed HERE and returned in `demand`.
    let ghostRequested = 0;
    const ghostDates = new Set<string>();
    try {
      const rollup = await readPartnerDemandRollup(userId, { from, to });
      for (const r of rollup.rows) {
        // MARKET-LEVEL requested slip cells only: a forward window (kind "requested"), floor-cleared
        // (status "ok"), not a per-service/partner child (hero-not-sum), inside the calendar window.
        if (
          r.metric !== "unmet_demand_slip" ||
          r.kind !== "requested" ||
          r.status !== "ok" ||
          r.serviceId != null ||
          r.partnerId != null ||
          r.date < from ||
          r.date > to
        ) {
          continue;
        }
        const v = r.value as { count?: number } | null;
        const count = v?.count ?? 0;
        if (count <= 0) continue;
        const marketName = getMarketByKey(r.marketSlug)?.cityName ?? r.marketSlug;
        // R29: a thin (low-n) requested cell now clears the lowered enumerable floor — it still shows
        // as a ghost, but the copy states the thinness ("early signal"), never as a full sample (§13).
        const earlyTag = r.lowN ? " · early signal" : "";
        events.push({
          id: `ghost-${r.marketSlug}-${r.date}`,
          lane: "availability",
          kind: "ghost",
          date: r.date,
          // Honest market-level copy — "in <Market>", never "from you".
          title: `${count} requested in ${marketName} · no open slot${earlyTag}`,
          // Tap → the availability editor with this day as the window preselected.
          href: `/provider/availability?date=${r.date}`,
        });
        ghostRequested += count;
        ghostDates.add(r.date);
      }
    } catch (ghostErr) {
      // Demand is ADDITIVE furniture — never let it fail the whole calendar (the base lanes above
      // are the contract). Log and return the calendar without ghosts (§13 honest absence).
      console.error("[Channel Calendar] ghost-slot demand read failed (non-fatal):", ghostErr);
    }

    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
    // `demand`: the month-header aggregate, computed server-side (no client math). uncoveredDays =
    // distinct days carrying a ghost; requested = Σ requested count across them (both server-derived).
    res.json({ events, from, to, demand: { requested: ghostRequested, uncoveredDays: ghostDates.size } });
  } catch (err) {
    console.error("[Channel Calendar] aggregate error:", err);
    res.status(500).json({ message: "Failed to load calendar" });
  }
});

export default router;
