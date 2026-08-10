/**
 * Statements (mockup §06e) — replaces the dead "Download Statement" button on the earnings page.
 *
 * GOVERNING RULE (CLAUDE.md §8/§14/§18): this file REPORTS recorded ledger amounts only. It never
 * computes a fee, never reads a commission rate, and never derives money from anything but the
 * session (identity) and the earner's own ledger rows (amount). `gross`/`fees` are populated ONLY
 * from columns some other writer already recorded (`bookings.total_amount` / `bookings.platform_fee`
 * for provider events, `platform_revenue.gross_amount` / `platform_revenue.platform_fee` for expert
 * events, joined by the same source/reference id the canonical writers already use — see
 * storage.ts:3716-3746 for the expertEarnings.referenceId <-> platformRevenue.sourceId pairing this
 * mirrors). `net` is always the ledger event's own recorded `amount` — never gross-minus-fee.
 *
 * Both reads below reuse the SAME storage calls `GET /api/provider/earnings/summary` and
 * `GET /api/payouts` already use (server/routes/experts.routes.ts:207-223,
 * server/routes/payments.routes.ts:1459-1481) — no parallel/re-derived earnings math.
 *
 * §13: a month with no ledger activity is simply absent from the months list — never a zeroed row.
 *
 * PDF is deferred — CSV only for v1:
 *   // TODO(statements-pdf): add GET /api/me/statements/:month.pdf once a PDF renderer is chosen.
 */
import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { isProviderRole, isExpertRole } from "@shared/roles";
import { bookings, platformRevenue } from "@shared/schema";
import { inArray } from "drizzle-orm";

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

/** One row of the ledger — either an earning event or a payout event, uniform shape. */
interface LedgerEvent {
  date: Date;
  type: string; // the ledger's own recorded type ("service_booking", "tip", ...) or "payout"
  bookingRef: string;
  serviceName: string;
  gross: number | null; // null = not recorded anywhere reachable — never fabricated/computed
  fees: number | null;
  net: number; // the ledger event's own recorded `amount` (verbatim)
  isBookingEarning: boolean; // drives the months-list `bookings` count
}

// === Provider ledger (provider_earnings + provider_payouts; the rail /api/provider/earnings/summary
// and /api/payouts already read — same storage calls, reused here, not re-derived). ===
async function loadProviderEvents(userId: string): Promise<LedgerEvent[]> {
  const [earnings, payouts] = await Promise.all([
    storage.getProviderEarnings(userId),
    storage.getProviderPayouts(userId),
  ]);

  // provider_earnings.source_id (sourceType='booking') references the legacy `bookings` row, which
  // already carries the recorded gross/fee/title/confirmation code for that transaction (booking.
  // service.ts:724-734 writes the earning; :392-462 writes the booking row itself). Reading those
  // columns is not fee computation — it is the same figures the booking was confirmed with.
  const bookingIds = Array.from(
    new Set(earnings.filter((e) => e.sourceType === "booking" && e.sourceId).map((e) => e.sourceId as string)),
  );
  const bookingById = new Map<string, typeof bookings.$inferSelect>();
  if (bookingIds.length > 0) {
    const rows = await db.select().from(bookings).where(inArray(bookings.id, bookingIds));
    for (const b of rows) bookingById.set(b.id, b);
  }

  const earningEvents: LedgerEvent[] = earnings
    .filter((e) => e.createdAt)
    .map((e) => {
      const b = e.sourceId ? bookingById.get(e.sourceId) : undefined;
      return {
        date: new Date(e.createdAt as any),
        type: e.type,
        bookingRef: b?.confirmationCode || e.sourceId || "",
        serviceName: b?.title || e.description || "",
        gross: b ? num(b.totalAmount) : null,
        fees: b ? num(b.platformFee) : null,
        net: num(e.amount) ?? 0,
        isBookingEarning: e.sourceType === "booking",
      };
    });

  const payoutEvents: LedgerEvent[] = payouts
    .filter((p) => p.requestedAt)
    .map((p) => ({
      date: new Date(p.requestedAt as any),
      type: "payout",
      bookingRef: p.payoutReference || p.id,
      serviceName: `Payout (${p.status})`,
      gross: null,
      fees: null,
      net: num(p.amount) ?? 0,
      isBookingEarning: false,
    }));

  return [...earningEvents, ...payoutEvents];
}

// === Expert ledger (expert_earnings + expert_payouts). gross/fees are filled ONLY when the SAME
// platform_revenue row the canonical writers already record (keyed by expertId + sourceId ==
// referenceId, e.g. storage.ts:3717-3746) is reachable — otherwise left unrecorded (null), never
// guessed. ===
async function loadExpertEvents(userId: string): Promise<LedgerEvent[]> {
  const [earnings, payouts] = await Promise.all([
    storage.getExpertEarnings(userId),
    storage.getExpertPayouts(userId),
  ]);

  const refIds = Array.from(new Set(earnings.filter((e) => e.referenceId).map((e) => e.referenceId as string)));
  const revenueBySource = new Map<string, typeof platformRevenue.$inferSelect>();
  if (refIds.length > 0) {
    const rows = await db.select().from(platformRevenue).where(inArray(platformRevenue.sourceId, refIds));
    for (const r of rows) {
      if (r.expertId === userId && r.sourceId) revenueBySource.set(r.sourceId, r);
    }
  }

  const earningEvents: LedgerEvent[] = earnings
    .filter((e) => e.createdAt)
    .map((e) => {
      const rev = e.referenceId ? revenueBySource.get(e.referenceId) : undefined;
      return {
        date: new Date(e.createdAt as any),
        type: e.type,
        bookingRef: e.referenceId || "",
        serviceName: e.description || e.referenceType || "",
        gross: rev ? num(rev.grossAmount) : null,
        fees: rev ? num(rev.platformFee) : null,
        net: num(e.amount) ?? 0,
        isBookingEarning: e.referenceType === "booking" || e.type === "service_booking",
      };
    });

  const payoutEvents: LedgerEvent[] = payouts
    .filter((p) => p.requestedAt)
    .map((p) => ({
      date: new Date(p.requestedAt as any),
      type: "payout",
      bookingRef: p.transactionId || p.id,
      serviceName: `Payout (${p.status})`,
      gross: null,
      fees: null,
      net: num(p.amount) ?? 0,
      isBookingEarning: false,
    }));

  return [...earningEvents, ...payoutEvents];
}

/**
 * Identity is ALWAYS from the session (§14) — `userId` never comes from the request. Returns null
 * only when the session user record itself can't be found (treated as unauthenticated by the
 * caller); a non-earner role gets an honest empty ledger, not an error.
 */
async function loadEventsForSessionUser(userId: string): Promise<LedgerEvent[] | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;
  if (isProviderRole(user.role)) return loadProviderEvents(userId);
  if (isExpertRole(user.role)) return loadExpertEvents(userId);
  return [];
}

router.get("/api/me/statements", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const events = await loadEventsForSessionUser(userId);
    if (events === null) return res.status(401).json({ message: "Not authenticated" });

    const byMonth = new Map<string, { bookings: number; gross: number; net: number }>();
    for (const ev of events) {
      const key = monthKey(ev.date);
      if (!key) continue;
      const agg = byMonth.get(key) || { bookings: 0, gross: 0, net: 0 };
      if (ev.isBookingEarning) {
        agg.bookings += 1;
        agg.gross += ev.gross ?? 0;
      }
      // `net` is EARNINGS only — a payout is a later cash movement of an amount already counted
      // in the month it was earned, not a second earning event; folding it in here would double
      // it (earned $105 in June, paid out that same $105 in June -> a naive sum reads $210).
      if (ev.type !== "payout") {
        agg.net += ev.net;
      }
      byMonth.set(key, agg);
    }

    // §13: months with zero activity never appear — the Map above only ever gains an entry from a
    // real event, so there is nothing to filter out.
    const months = Array.from(byMonth.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, agg]) => ({
        month,
        bookings: agg.bookings,
        gross: Math.round(agg.gross * 100) / 100,
        net: Math.round(agg.net * 100) / 100,
      }));

    res.json(months);
  } catch (error: any) {
    console.error("Statements months error:", error);
    res.status(500).json({ message: "Failed to load statements", error: error.message });
  }
});

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Route pattern `:month.csv` — Express's bundled path-to-regexp matches `:month` non-greedily up to
// the literal `.csv` suffix, so `/api/me/statements/2026-07.csv` captures `month = "2026-07"`.
router.get("/api/me/statements/:month.csv", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const month = req.params.month;
    if (!MONTH_RE.test(month)) {
      return res.status(400).json({ message: "month must be formatted YYYY-MM" });
    }

    const events = await loadEventsForSessionUser(userId);
    if (events === null) return res.status(401).json({ message: "Not authenticated" });

    const rows = events
      .filter((ev) => monthKey(ev.date) === month)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (rows.length === 0) {
      return res.status(404).json({ message: "No statement activity for that month" });
    }

    const header = ["date", "type", "booking_ref", "service_name", "gross", "fees", "net"];
    const lines = [header.join(",")];
    for (const ev of rows) {
      lines.push(
        [
          ev.date.toISOString().slice(0, 10),
          ev.type,
          ev.bookingRef,
          ev.serviceName,
          ev.gross != null ? ev.gross.toFixed(2) : "",
          ev.fees != null ? ev.fees.toFixed(2) : "",
          ev.net.toFixed(2),
        ]
          .map((v) => csvField(String(v)))
          .join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="statement-${month}.csv"`);
    res.send(lines.join("\n"));
  } catch (error: any) {
    console.error("Statement CSV error:", error);
    res.status(500).json({ message: "Failed to generate statement", error: error.message });
  }
});

export default router;
