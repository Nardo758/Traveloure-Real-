/**
 * Affiliate Reconciliation Service
 *
 * Pulls commission reports from partner APIs (Travelpayouts, Viator, Impact/Fever),
 * normalises them, and auto-matches against internal affiliate_earnings records.
 *
 * Out of scope: webhook callbacks, automatic dispute filing.
 */

import { db } from "../db";
import { affiliateEarnings, affiliateClicks, affiliatePartners } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExternalCommission {
  partnerReferenceId: string;
  partner: string; // travelpayouts | viator | fever | booking
  amount: number;
  currency: string;
  reportedAt: string; // ISO date string
  rawData: Record<string, unknown>;
}

export interface ReconciliationSummary {
  totalExpected: number;   // Sum of all internal affiliate_earnings totals
  totalConfirmed: number;  // Sum of matched earnings
  variance: number;        // totalExpected - totalConfirmed
  unmatchedCount: number;  // Internal rows still unmatched
  currency: string;
}

export interface ReconciliationResult {
  summary: ReconciliationSummary;
  internalEarnings: Array<Record<string, unknown>>;
  unmatchedExternal: ExternalCommission[];
}

// ---------------------------------------------------------------------------
// Period helper
// ---------------------------------------------------------------------------

function getPeriodDates(period: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === "last_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  }
  if (period === "last_90_days") {
    return {
      start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      end: now,
    };
  }
  // this_month (default)
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  };
}

// ---------------------------------------------------------------------------
// Partner report fetchers (normalise to ExternalCommission[])
// ---------------------------------------------------------------------------

async function fetchTravelpayoutsCommissions(
  start: Date,
  end: Date
): Promise<ExternalCommission[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) {
    console.warn("[Reconciliation] TRAVELPAYOUTS_TOKEN not set – skipping");
    return [];
  }
  try {
    const params = new URLSearchParams({
      token,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      limit: "200",
    });
    const url = `https://api.travelpayouts.com/v1/statistics/payments?${params}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[Reconciliation] Travelpayouts stats API ${res.status}`);
      return [];
    }
    const json = await res.json();
    const rows: ExternalCommission[] = (json.data || []).map((item: any) => ({
      partnerReferenceId: String(item.id || item.booking_id || item.order_id || ""),
      partner: "travelpayouts",
      amount: parseFloat(item.amount || item.commission || "0"),
      currency: item.currency || "USD",
      reportedAt: item.date || item.created_at || start.toISOString(),
      rawData: item,
    }));
    return rows.filter((r) => r.partnerReferenceId);
  } catch (err) {
    console.error("[Reconciliation] Travelpayouts fetch error:", err);
    return [];
  }
}

async function fetchViatorCommissions(
  start: Date,
  end: Date
): Promise<ExternalCommission[]> {
  const apiKey = process.env.VIATOR_API_KEY;
  if (!apiKey) {
    console.warn("[Reconciliation] VIATOR_API_KEY not set – skipping");
    return [];
  }
  try {
    // Viator Partner API bookings report
    const url = `https://api.viator.com/partner/bookings?startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}&count=200`;
    const res = await fetch(url, {
      headers: {
        "exp-api-key": apiKey,
        Accept: "application/json;version=2.0",
      },
    });
    if (!res.ok) {
      console.warn(`[Reconciliation] Viator bookings API ${res.status}`);
      return [];
    }
    const json = await res.json();
    const rows: ExternalCommission[] = (json.bookings || []).map((item: any) => ({
      partnerReferenceId: String(item.bookingRef || item.itemId || item.bookingId || ""),
      partner: "viator",
      amount: parseFloat(item.netPrice || item.commission || item.partnerTotal || "0"),
      currency: item.currency || "USD",
      reportedAt: item.bookingDate || item.travelDate || start.toISOString(),
      rawData: item,
    }));
    return rows.filter((r) => r.partnerReferenceId);
  } catch (err) {
    console.error("[Reconciliation] Viator fetch error:", err);
    return [];
  }
}

async function fetchFeverCommissions(
  start: Date,
  end: Date
): Promise<ExternalCommission[]> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn("[Reconciliation] IMPACT credentials not set – skipping Fever");
    return [];
  }
  try {
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams({
      StartDate: start.toISOString().slice(0, 10),
      EndDate: end.toISOString().slice(0, 10),
      PageSize: "200",
    });
    const url = `https://api.impact.com/Mediapartners/${accountSid}/Conversions?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${creds}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[Reconciliation] Impact/Fever conversions API ${res.status}`);
      return [];
    }
    const json = await res.json();
    const rows: ExternalCommission[] = (json.Conversions || []).map((item: any) => ({
      partnerReferenceId: String(item.Id || item.OrderId || ""),
      partner: "fever",
      amount: parseFloat(item.PubCommission || item.SaleAmount || "0"),
      currency: item.Currency || "USD",
      reportedAt: item.EventDate || item.CreatedDate || start.toISOString(),
      rawData: item,
    }));
    return rows.filter((r) => r.partnerReferenceId);
  } catch (err) {
    console.error("[Reconciliation] Impact/Fever fetch error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reconciliation service
// ---------------------------------------------------------------------------

class AffiliateReconciliationService {
  /**
   * Pull external commission reports for all configured partners.
   */
  async fetchExternalReports(
    period: string,
    partner?: string
  ): Promise<ExternalCommission[]> {
    const { start, end } = getPeriodDates(period);
    const fetchers: Promise<ExternalCommission[]>[] = [];

    if (!partner || partner === "travelpayouts") {
      fetchers.push(fetchTravelpayoutsCommissions(start, end));
    }
    if (!partner || partner === "viator") {
      fetchers.push(fetchViatorCommissions(start, end));
    }
    if (!partner || partner === "fever") {
      fetchers.push(fetchFeverCommissions(start, end));
    }

    const results = await Promise.all(fetchers);
    return results.flat();
  }

  /**
   * Auto-match external commission rows against internal affiliate_earnings.
   * Matching criteria:
   *   - Same partner (loosely matched via partner name substring)
   *   - createdAt within ±3 days
   *   - Amount within 5% tolerance
   *
   * Marks matched rows and persists partnerReferenceId.
   */
  async matchRecords(period: string, partner?: string): Promise<void> {
    const { start, end } = getPeriodDates(period);

    // Fetch all internal earnings for the period
    const internal = await db.execute(sql`
      SELECT ae.*, ap.name as partner_name
      FROM affiliate_earnings ae
      LEFT JOIN affiliate_partners ap ON ae.partner_id = ap.id
      WHERE ae.created_at >= ${start.toISOString()}
        AND ae.created_at <= ${end.toISOString()}
        AND ae.reconciliation_status IN ('unmatched')
      ORDER BY ae.created_at
    `);
    const internalRows = internal.rows as any[];

    // Fetch external reports
    const external = await this.fetchExternalReports(period, partner);

    for (const ext of external) {
      const extDate = new Date(ext.reportedAt).getTime();
      const threeDays = 3 * 24 * 60 * 60 * 1000;

      // Find best matching internal row
      const match = internalRows.find((row) => {
        if (row.reconciliation_status === "matched") return false;

        // Partner match (loose)
        const partnerName = (row.partner_name || "").toLowerCase();
        if (!partnerName.includes(ext.partner) && !ext.partner.includes(partnerName.split(" ")[0])) {
          // Try by partner key
          const partnerKey = ext.partner.toLowerCase();
          if (!partnerName.includes(partnerKey)) return false;
        }

        // Date within ±3 days
        const rowDate = new Date(row.created_at).getTime();
        if (Math.abs(rowDate - extDate) > threeDays) return false;

        // Amount within 5%
        const internalAmt = parseFloat(row.total_commission);
        const tolerance = internalAmt * 0.05;
        return Math.abs(internalAmt - ext.amount) <= tolerance;
      });

      if (match) {
        // Mark as matched
        match.reconciliation_status = "matched";
        await db.execute(sql`
          UPDATE affiliate_earnings
          SET reconciliation_status = 'matched',
              partner_reference_id = ${ext.partnerReferenceId},
              reconciled_at = NOW(),
              external_report_data = ${JSON.stringify(ext.rawData)}::jsonb
          WHERE id = ${match.id}
        `);
      }
    }
  }

  /**
   * Return the full reconciliation view for the admin dashboard.
   */
  async getReconciliationView(
    period: string,
    partner?: string
  ): Promise<ReconciliationResult> {
    const { start, end } = getPeriodDates(period);

    // Run auto-match first (idempotent)
    await this.matchRecords(period, partner);

    // Fetch internal earnings
    const partnerFilter = partner && partner !== "all"
      ? sql`AND ap.name ILIKE ${"%" + partner + "%"}`
      : sql``;

    const internalResult = await db.execute(sql`
      SELECT ae.*, ap.name as partner_name
      FROM affiliate_earnings ae
      LEFT JOIN affiliate_partners ap ON ae.partner_id = ap.id
      WHERE ae.created_at >= ${start.toISOString()}
        AND ae.created_at <= ${end.toISOString()}
        ${partnerFilter}
      ORDER BY ae.created_at DESC
    `);
    const internalRows = internalResult.rows as any[];

    // Fetch external commissions again for the "unmatched external" list
    const external = await this.fetchExternalReports(period, partner && partner !== "all" ? partner : undefined);

    // Identify unmatched external rows (those whose partnerReferenceId isn't stored internally)
    const matchedRefIds = new Set(
      internalRows
        .filter((r) => r.reconciliation_status === "matched" && r.partner_reference_id)
        .map((r) => r.partner_reference_id)
    );
    const unmatchedExternal = external.filter(
      (e) => !matchedRefIds.has(e.partnerReferenceId)
    );

    // Compute summary
    const totalExpected = internalRows.reduce(
      (sum, r) => sum + parseFloat(r.total_commission || "0"),
      0
    );
    const totalConfirmed = internalRows
      .filter((r) => r.reconciliation_status === "matched")
      .reduce((sum, r) => sum + parseFloat(r.total_commission || "0"), 0);
    const unmatchedCount = internalRows.filter(
      (r) => r.reconciliation_status === "unmatched"
    ).length;

    return {
      summary: {
        totalExpected: Math.round(totalExpected * 100) / 100,
        totalConfirmed: Math.round(totalConfirmed * 100) / 100,
        variance: Math.round((totalExpected - totalConfirmed) * 100) / 100,
        unmatchedCount,
        currency: "USD",
      },
      internalEarnings: internalRows,
      unmatchedExternal,
    };
  }

  /**
   * Manually update reconciliation status for an earnings row.
   */
  async updateReconciliationStatus(
    earningId: string,
    status: "unmatched" | "matched" | "disputed" | "written_off",
    notes?: string,
    partnerReferenceId?: string
  ): Promise<void> {
    await db.execute(sql`
      UPDATE affiliate_earnings
      SET reconciliation_status = ${status},
          reconciliation_notes = ${notes ?? null},
          partner_reference_id = COALESCE(${partnerReferenceId ?? null}, partner_reference_id),
          reconciled_at = CASE WHEN ${status} = 'matched' THEN NOW() ELSE reconciled_at END
      WHERE id = ${earningId}
    `);
  }

  /**
   * Get total confirmed affiliate revenue (matched only) for unified revenue dashboard.
   */
  async getConfirmedAffiliateTotal(start: Date, end: Date): Promise<number> {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(total_commission::numeric), 0) as total
      FROM affiliate_earnings
      WHERE reconciliation_status = 'matched'
        AND created_at >= ${start.toISOString()}
        AND created_at <= ${end.toISOString()}
    `);
    return parseFloat((result.rows[0] as any)?.total || "0");
  }
}

export const affiliateReconciliationService = new AffiliateReconciliationService();
