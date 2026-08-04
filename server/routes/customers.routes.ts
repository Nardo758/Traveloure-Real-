/**
 * customers.routes.ts — Customers read-only aggregate (Console IA PR-Ca phase C4, §17 module 6).
 *
 * ONE endpoint: GET /api/me/customers — an HONEST, self-scoped aggregation of the people this
 * earner has REAL relationships with. No CRM fields are invented (no notes, no tags, no lead
 * status — none of that exists in the schema and none is fabricated here, per the ratified
 * mockup-console-pages.html section 7 decision). Zero writes.
 *
 * Sources (each a real table, each scoped to the SESSION user — §14, never an id from
 * query/body):
 *   bookings  — service_bookings (providerId = session user), leftJoin users on travelerId for
 *               the display name and provider_services for the service name. The money column
 *               summed is service_bookings.total_amount, which is what the TRAVELER paid — so it
 *               is returned as `bookedValue` (gross booking value), NEVER labeled earnings
 *               (provider_earnings is nullable and not reliably populated; mislabeling gross as
 *               net would violate §13). Cancelled bookings stay in the count (a real interaction)
 *               but are excluded from the value sum (no money actually transacted).
 *   purchases — ready_made_purchases join ready_made_trips on authorId = session user, join
 *               users on buyerId. Value = price_paid_cents (what the buyer paid — gross, again
 *               `purchaseValue`, not earnings); refunded/revoked purchases stay counted but are
 *               excluded from the value sum.
 *   trips     — trip_expert_advisors (localExpertId = session user, status != 'rejected') join
 *               trips, leftJoin users on the trip owner. An advisor row whose trip has no owner
 *               (userId NULL — deleted user or an authoring trip) represents no customer and is
 *               omitted, never fabricated into one.
 *
 * Relationship chip (derived, honest):
 *   active_trip — at least one live assigned trip (endDate has not yet passed — date-derived,
 *                 NOT trips.status, which is a dead write-once field nothing ever advances past
 *                 its born draft/planning value; see CLAUDE.md §13 / docs/briefs/L3-trips-status-brief.md); wins.
 *   repeat      — 2+ paid-shaped transactions (bookings + purchases).
 *   one_time    — everything else.
 *
 * Guests: service_bookings.traveler_id is nullable — genuinely-existing guest bookings are
 * aggregated under a single "Guest" row (userId null); if no such rows exist, no Guest row.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { and, eq, ne } from "drizzle-orm";
import {
  serviceBookings,
  providerServices,
  readyMadePurchases,
  readyMadeTrips,
  tripExpertAdvisors,
  trips,
  users,
} from "@shared/schema";

const router = Router();

function sessionUserId(req: any): string | undefined {
  return getUserId(req)!;
}

type Relationship = "active_trip" | "repeat" | "one_time";

interface CustomerBookingItem {
  id: string;
  serviceName: string | null;
  status: string | null;
  totalAmount: number; // dollars — what the traveler paid (gross booking value)
  createdAt: string | null;
}

interface CustomerPurchaseItem {
  id: string;
  readyMadeTripId: string;
  listingTitle: string;
  status: string;
  pricePaid: number; // dollars — what the buyer paid (gross purchase value)
  purchasedAt: string | null;
}

interface CustomerTripItem {
  advisorId: string;
  tripId: string;
  title: string | null;
  destination: string | null;
  tripStatus: string;
  startDate: string | null;
  assignedAt: string | null;
}

interface CustomerRow {
  userId: string | null; // null = the aggregated Guest row
  displayName: string;
  relationship: Relationship;
  bookings: number;
  /** L10c: of `bookings`, how many are still at status "payment_pending" (checkout created the
   * row before the Stripe charge settled — see payments.routes.ts). Counted honestly in `bookings`
   * (a real interaction, matching this file's existing cancelled-bookings posture) but surfaced
   * separately so a client can label "2 bookings (1 pending payment)" instead of implying 2
   * completed transactions when other surfaces (Today/Inbox) that count confirmed bookings only
   * would show fewer. */
  pendingPaymentBookings: number;
  purchases: number;
  trips: number;
  hasActiveTrip: boolean;
  /** Gross value of this customer's non-cancelled bookings (sum of total_amount) — NOT earnings. */
  bookedValue: number;
  /** Gross value of this customer's non-refunded store purchases (price_paid_cents) — NOT earnings. */
  purchaseValue: number;
  /** bookedValue + purchaseValue: total gross transacted value — NOT this earner's earnings. */
  totalBookedValue: number;
  lastActivity: string | null; // ISO timestamp of the newest underlying row
  items: {
    bookings: CustomerBookingItem[];
    purchases: CustomerPurchaseItem[];
    trips: CustomerTripItem[];
  };
}

// §13: the display name comes from the real users row (name, else email); a guest/anonymous
// traveler renders the honest "Traveler"/"Guest" label — a name is never invented.
function realName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
  fallback: string,
): string {
  const name = [firstName ?? "", lastName ?? ""].join(" ").trim();
  return name || email || fallback;
}

// §13: `trips.status` is a dead write-once field — it is born draft/planning at creation and
// nothing ever advances it to "completed"/"cancelled", so a status-based "is this trip still
// live" check would ALWAYS be true. "Live" is derived from the trip's own dates instead, the
// same convention every traveler-facing renderer already uses (client/src/pages/my-trips.tsx):
// a trip is still live while its endDate has not yet passed. See
// docs/briefs/L3-trips-status-brief.md (Option B, ratified Jul 31, 2026).
function isTripStillLive(endDate: unknown, now: Date): boolean {
  return new Date(endDate as any) >= now;
}

// GET /api/me/customers — read-only, session-scoped, zero writes.
router.get("/api/me/customers", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const now = new Date();

    // ── Source 1: bookings on my services ────────────────────────────────────────────────
    const bookingRows = await db
      .select({
        travelerId: serviceBookings.travelerId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        id: serviceBookings.id,
        status: serviceBookings.status,
        totalAmount: serviceBookings.totalAmount,
        createdAt: serviceBookings.createdAt,
        serviceName: providerServices.serviceName,
      })
      .from(serviceBookings)
      .leftJoin(users, eq(serviceBookings.travelerId, users.id))
      .leftJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
      .where(eq(serviceBookings.providerId, userId));

    // ── Source 2: store purchases of my ready-made listings ──────────────────────────────
    const purchaseRows = await db
      .select({
        buyerId: readyMadePurchases.buyerId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        id: readyMadePurchases.id,
        status: readyMadePurchases.status,
        pricePaidCents: readyMadePurchases.pricePaidCents,
        purchasedAt: readyMadePurchases.purchasedAt,
        readyMadeTripId: readyMadePurchases.readyMadeTripId,
        listingTitle: readyMadeTrips.title,
      })
      .from(readyMadePurchases)
      .innerJoin(readyMadeTrips, eq(readyMadePurchases.readyMadeTripId, readyMadeTrips.id))
      .innerJoin(users, eq(readyMadePurchases.buyerId, users.id))
      .where(eq(readyMadeTrips.authorId, userId));

    // ── Source 3: my assigned-trip clients (rejected assignments are not a relationship) ──
    const advisorRows = await db
      .select({
        ownerId: trips.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        advisorId: tripExpertAdvisors.id,
        tripId: tripExpertAdvisors.tripId,
        tripTitle: trips.title,
        destination: trips.destination,
        tripStatus: trips.status,
        startDate: trips.startDate,
        endDate: trips.endDate,
        assignedAt: tripExpertAdvisors.assignedAt,
      })
      .from(tripExpertAdvisors)
      .innerJoin(trips, eq(tripExpertAdvisors.tripId, trips.id))
      .leftJoin(users, eq(trips.userId, users.id))
      .where(
        and(
          eq(tripExpertAdvisors.localExpertId, userId),
          ne(tripExpertAdvisors.status, "rejected"),
        ),
      );

    // ── Merge per user id ────────────────────────────────────────────────────────────────
    const GUEST_KEY = "__guest__";
    const byUser = new Map<string, CustomerRow>();

    const rowFor = (key: string, uid: string | null, displayName: string): CustomerRow => {
      let row = byUser.get(key);
      if (!row) {
        row = {
          userId: uid,
          displayName,
          relationship: "one_time",
          bookings: 0,
          pendingPaymentBookings: 0,
          purchases: 0,
          trips: 0,
          hasActiveTrip: false,
          bookedValue: 0,
          purchaseValue: 0,
          totalBookedValue: 0,
          lastActivity: null,
          items: { bookings: [], purchases: [], trips: [] },
        };
        byUser.set(key, row);
      }
      return row;
    };

    const bumpActivity = (row: CustomerRow, ts: Date | null | undefined) => {
      if (!ts) return;
      const iso = ts.toISOString();
      if (!row.lastActivity || iso > row.lastActivity) row.lastActivity = iso;
    };

    for (const b of bookingRows) {
      const key = b.travelerId ?? GUEST_KEY;
      const row = rowFor(
        key,
        b.travelerId,
        b.travelerId ? realName(b.firstName, b.lastName, b.email, "Traveler") : "Guest",
      );
      row.bookings += 1;
      if (b.status === "payment_pending") row.pendingPaymentBookings += 1;
      const amount = Number(b.totalAmount ?? 0);
      // Real interaction either way; only money that actually transacted counts as value.
      if (b.status !== "cancelled" && Number.isFinite(amount)) row.bookedValue += amount;
      bumpActivity(row, b.createdAt);
      row.items.bookings.push({
        id: b.id,
        serviceName: b.serviceName ?? null,
        status: b.status ?? null,
        totalAmount: Number.isFinite(amount) ? amount : 0,
        createdAt: b.createdAt ? b.createdAt.toISOString() : null,
      });
    }

    for (const p of purchaseRows) {
      const row = rowFor(p.buyerId, p.buyerId, realName(p.firstName, p.lastName, p.email, "Traveler"));
      row.purchases += 1;
      const paid = (p.pricePaidCents ?? 0) / 100;
      if (p.status !== "refunded" && p.status !== "revoked") row.purchaseValue += paid;
      bumpActivity(row, p.purchasedAt);
      row.items.purchases.push({
        id: p.id,
        readyMadeTripId: p.readyMadeTripId,
        listingTitle: p.listingTitle,
        status: p.status,
        pricePaid: paid,
        purchasedAt: p.purchasedAt ? p.purchasedAt.toISOString() : null,
      });
    }

    for (const t of advisorRows) {
      // No trip owner ⇒ no customer (deleted user or an authoring trip) — omit, never invent.
      if (!t.ownerId) continue;
      const row = rowFor(t.ownerId, t.ownerId, realName(t.firstName, t.lastName, t.email, "Traveler"));
      row.trips += 1;
      if (isTripStillLive(t.endDate, now)) row.hasActiveTrip = true;
      bumpActivity(row, t.assignedAt);
      row.items.trips.push({
        advisorId: t.advisorId,
        tripId: t.tripId,
        title: t.tripTitle ?? null,
        destination: t.destination ?? null,
        tripStatus: t.tripStatus,
        startDate: t.startDate ?? null,
        assignedAt: t.assignedAt ? t.assignedAt.toISOString() : null,
      });
    }

    const customers = Array.from(byUser.values()).map((row) => {
      row.totalBookedValue = Math.round((row.bookedValue + row.purchaseValue) * 100) / 100;
      row.bookedValue = Math.round(row.bookedValue * 100) / 100;
      row.purchaseValue = Math.round(row.purchaseValue * 100) / 100;
      row.relationship = row.hasActiveTrip
        ? "active_trip"
        : row.bookings + row.purchases >= 2
          ? "repeat"
          : "one_time";
      return row;
    });

    customers.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));

    res.json({ customers });
  } catch (err) {
    console.error("[Customers] aggregate error:", err);
    res.status(500).json({ message: "Failed to load customers" });
  }
});

export default router;
