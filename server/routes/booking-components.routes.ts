/**
 * BUNDLE COMPONENTS + SETTLEMENT — the READ the surfaces had no server truth to read.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`. Locked Decision 48 gave a purchased bundle
 * `booking_component_states` rows and Locked Decision 50 gave a partially fulfilled one a
 * `bundle_partial_settlements` row. Both are WRITTEN by rails that already exist and, until this
 * file, were READ by nothing outside the services that write them: every component write rail
 * answers with the outcome of THAT call, and a surface that wants to draw the list before acting —
 * or to show what a settlement did after the fact — had no endpoint at all. This adds exactly ONE
 * read and no write; every action on those surfaces still calls the existing rails.
 *
 * §14 READ CLAUSE — THE ACTOR IS THE SESSION. The booking is named in the PATH; the audience is
 * DERIVED from the row (`travelerId` ⇒ traveler, `providerId` ⇒ seller) and never from a query
 * string. Anyone else, and a booking that does not exist, get the SAME undifferentiated 404 (the
 * LD 40 / custom-venues posture), so the rail cannot be used to probe which bookings exist.
 *
 * §14 THIRD-INSTANCE RULE — A DENYLIST IS NOT A PROJECTION. Nothing here spreads a row. The
 * component projection names its fields one by one and the settlement projection names four
 * amounts, a refund id and two timestamps. `component_outcomes` (the settlement's immutable jsonb)
 * is deliberately NOT published: it is the settlement's own audit record, it carries no field this
 * surface renders, and an unbounded jsonb on a response is the shape that lane warned about. No
 * `users.id` of either party appears (LD 40).
 *
 * §13 — THE ABSENCES ARE ANSWERS. An absent `allocation_cents` is OMITTED, never 0 (a pre-307
 * purchase genuinely did not record one). An absent settlement row is OMITTED, never an empty
 * settlement — "nothing has settled" and "a settlement returned nothing" are different facts. The
 * `source` field NAMES which record answered, because a legacy jsonb bundle can be listed and
 * nothing more can be said about it. And `settled` is stamped ONLY from `settled_at`: a claimed
 * but unpromoted settlement is IN PROGRESS, and calling it settled would be the "prepared,
 * awaiting" ≠ "refunded" lie one table over.
 *
 * NO CAPACITY FIELD IS EMITTED. Nothing reserves capacity per component (LD 50, last paragraph) —
 * the write rails state that with `componentCapacity: { released: 0, reason:
 * "no_component_capacity_reserved" }`. Repeating a zero here would invite a surface to render "0
 * released", which describes a release that never happens; the surfaces render no capacity claim
 * at all instead.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";

import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { db } from "../db";
import { storage } from "../storage";
import { bundlePartialSettlements } from "@shared/schema";
import {
  readBundleComponentRows,
  readBundleComponentStates,
} from "../services/bundle-component-states.service";

const router = Router();

const iso = (d: Date | string | null | undefined): string | undefined => {
  if (d === null || d === undefined) return undefined;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
};

/** The ONE projection of a component row. Named fields only — never a spread (§14 third instance). */
interface ComponentView {
  componentServiceId: string;
  serviceName?: string;
  position?: number;
  status: string;
  allocationCents?: number;
  snapshotPriceCents?: number;
  cancelRefundPercent?: number;
  failureReason?: string;
  cancelReason?: string;
  failedAt?: string;
  cancelledAt?: string;
  completedAt?: string;
  refundedAt?: string;
  refundAmountCents?: number;
  stripeRefundId?: string;
}

router.get("/api/bookings/:id/components", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const bookingId = String(req.params.id);
    const booking = await storage.getServiceBooking(bookingId);
    // "No such booking" and "not yours" are the same sentence.
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    const isTraveler = booking.travelerId === userId;
    const isSeller = booking.providerId === userId;
    if (!isTraveler && !isSeller) return res.status(404).json({ message: "Booking not found" });

    // ROWS FIRST, legacy jsonb second, with the source NAMED — the ONE reader (§18 rule 1); this
    // file re-implements neither the row query nor the legacy fallback.
    const states = await readBundleComponentStates({
      bookingId,
      bookingDetails: (booking.bookingDetails ?? null) as Record<string, unknown> | null,
      bundleServiceId: booking.serviceId ?? null,
    });

    let components: ComponentView[];
    if (states.source === "rows") {
      // The shared reader returns the derivation's view (status + the money facts). The timestamps
      // and the two reason strings live only on the row, so the rows are read once more here and
      // projected field by field.
      const rows = await readBundleComponentRows(db, bookingId);
      components = rows.map((r) => {
        const v: ComponentView = { componentServiceId: r.componentServiceId, status: r.status };
        if (r.serviceName) v.serviceName = r.serviceName;
        if (r.position !== null && r.position !== undefined) v.position = r.position;
        if (r.allocationCents !== null && r.allocationCents !== undefined) v.allocationCents = r.allocationCents;
        if (r.snapshotPriceCents !== null && r.snapshotPriceCents !== undefined) v.snapshotPriceCents = r.snapshotPriceCents;
        if (r.cancelRefundPercent !== null && r.cancelRefundPercent !== undefined) v.cancelRefundPercent = r.cancelRefundPercent;
        if (r.failureReason) v.failureReason = r.failureReason;
        if (r.cancelReason) v.cancelReason = r.cancelReason;
        const failedAt = iso(r.failedAt); if (failedAt) v.failedAt = failedAt;
        const cancelledAt = iso(r.cancelledAt); if (cancelledAt) v.cancelledAt = cancelledAt;
        const completedAt = iso(r.completedAt); if (completedAt) v.completedAt = completedAt;
        const refundedAt = iso(r.refundedAt); if (refundedAt) v.refundedAt = refundedAt;
        if (r.refundAmountCents !== null && r.refundAmountCents !== undefined) v.refundAmountCents = r.refundAmountCents;
        if (r.stripeRefundId) v.stripeRefundId = r.stripeRefundId;
        return v;
      });
    } else {
      // A legacy bundle: WHICH components, and completed-or-pending. It carried no price, no
      // failure and no refund, so nothing else is emitted for it (§13).
      components = states.components.map((c) => {
        const v: ComponentView = { componentServiceId: c.componentServiceId, status: c.status };
        if (c.serviceName) v.serviceName = c.serviceName;
        if (c.position !== null && c.position !== undefined) v.position = c.position;
        return v;
      });
    }

    const [settlementRow] = await db
      .select()
      .from(bundlePartialSettlements)
      .where(eq(bundlePartialSettlements.bookingId, bookingId));

    const settlement = settlementRow
      ? {
          // Stamped from `settled_at` ALONE: a claim is not a settlement.
          settled: settlementRow.settledAt !== null && settlementRow.settledAt !== undefined,
          settledAmountCents: settlementRow.settledAmountCents,
          travelerRefundCents: settlementRow.travelerRefundCents,
          ...(settlementRow.stripeRefundId ? { stripeRefundId: settlementRow.stripeRefundId } : {}),
          ...(iso(settlementRow.claimedAt) ? { claimedAt: iso(settlementRow.claimedAt) } : {}),
          ...(iso(settlementRow.settledAt) ? { settledAt: iso(settlementRow.settledAt) } : {}),
        }
      : undefined;

    return res.json({
      bookingId,
      audience: isTraveler ? "traveler" : "seller",
      bookingStatus: booking.status,
      source: states.source,
      components,
      ...(settlement ? { settlement } : {}),
    });
  } catch (err) {
    console.error("[booking-components] read failed:", err);
    return res.status(500).json({ message: "Failed to load this booking's parts" });
  }
});

export default router;
