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
import { getConversionReport, getPartnerizeCredentials } from "./partnerize/partnerize-client";
import { fetchTravelpayoutsActions } from "./travelpayouts/statistics.service";

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

export interface MatchedPair {
  internal: Record<string, unknown>;
  external: ExternalCommission;
}

export interface ReconciliationResult {
  summary: ReconciliationSummary;
  matchedPairs: MatchedPair[];
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
  if (period === "last_35_days") {
    // Rolling window used by background polls: wide enough to span a month
    // boundary so commissions reported in the first days of a new month still
    // match internal earnings created near the end of the previous month.
    return {
      start: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
      end: now,
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

export async function fetchTravelpayoutsCommissions(
  start: Date,
  end: Date
): Promise<ExternalCommission[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) {
    console.warn("[Reconciliation] TRAVELPAYOUTS_TOKEN not set – skipping");
    return [];
  }
  try {
    // Raw action rows across ALL Travelpayouts campaigns on the account (incl.
    // WeGoTrip, campaign #150) via the real statistics API. The legacy
    // /v1/statistics/payments endpoint returns 404 and must not be used.
    const rows = await fetchTravelpayoutsActions(
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10)
    );
    return rows
      .map((item) => {
        const paid = parseFloat(String(item.paid_profit_usd || "0")) || 0;
        const processing = parseFloat(String(item.processing_profit_usd || "0")) || 0;
        return {
          partnerReferenceId: String(item.action_id || ""),
          partner: "travelpayouts",
          amount: paid + processing,
          currency: "USD",
          reportedAt: item.created_at_day || start.toISOString(),
          rawData: item as unknown as Record<string, unknown>,
        } as ExternalCommission;
      })
      .filter((r) => r.partnerReferenceId);
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

async function fetchPartnerizeCommissions(
  start: Date,
  end: Date
): Promise<ExternalCommission[]> {
  if (!getPartnerizeCredentials()) {
    console.warn("[Reconciliation] Partnerize credentials not set – skipping");
    return [];
  }
  try {
    const conversions = await getConversionReport(start, end);
    return conversions.map((c) => ({
      partnerReferenceId: c.conversionId,
      partner: "partnerize",
      amount: c.commission || c.amount,
      currency: c.currency || "USD",
      reportedAt: c.convertedAt,
      rawData: c.rawData,
    })).filter((r) => r.partnerReferenceId);
  } catch (err) {
    console.error("[Reconciliation] Partnerize fetch error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pure matching helper (exported for deterministic tests)
// ---------------------------------------------------------------------------

export const DEFAULT_MATCH_TOLERANCE_DAYS = 3;

// Late-reporting tolerance used by the background polls: a booking made near
// the end of a month can be reported by the partner in the first days of the
// next month, so the created_at ↔ reportedAt delta can exceed the default
// ±3 days. This is deliberately independent of the retrieval window
// ("last_35_days") — the window controls which rows are considered, this
// controls how far apart the two dates may be and still count as a match.
export const LATE_REPORT_TOLERANCE_DAYS = 10;

/**
 * Pick the best internal candidate for one external commission row.
 * Criteria: same resolved partner (when resolvable), date delta within
 * toleranceDays, amount within 5%. Returns the candidate with the smallest
 * absolute date delta, or null.
 */
export function selectMatchCandidate(
  ext: ExternalCommission,
  internalRows: Array<Record<string, any>>,
  resolvedPartnerId: string | undefined,
  consumed: Set<string>,
  toleranceDays: number = DEFAULT_MATCH_TOLERANCE_DAYS
): Record<string, any> | null {
  const extDate = new Date(ext.reportedAt).getTime();
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;

  const candidates = internalRows.filter((row) => {
    if (consumed.has(row.id)) return false;
    if (row.reconciliation_status === "matched") return false;

    // Strict partner match: when we can resolve the external partner to an
    // internal partner_id, both sides MUST agree. Rows with a null partner_id
    // are excluded to prevent cross-partner false positives.
    if (resolvedPartnerId) {
      if (!row.partner_id || row.partner_id !== resolvedPartnerId) return false;
    }

    // Date within tolerance
    const rowDate = new Date(row.created_at).getTime();
    if (Math.abs(rowDate - extDate) > toleranceMs) return false;

    // Amount within 5% tolerance
    const internalAmt = parseFloat(row.total_commission);
    if (internalAmt === 0) return false;
    const tolerance = internalAmt * 0.05;
    return Math.abs(internalAmt - ext.amount) <= tolerance;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const da = Math.abs(new Date(a.created_at).getTime() - extDate);
    const db2 = Math.abs(new Date(b.created_at).getTime() - extDate);
    return da - db2;
  });
  return candidates[0];
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
    if (!partner || partner === "partnerize") {
      fetchers.push(fetchPartnerizeCommissions(start, end));
    }

    const results = await Promise.all(fetchers);
    return results.flat();
  }

  /**
   * Auto-match external commission rows against internal affiliate_earnings.
   * Matching criteria (all must be satisfied):
   *   1. Same partnerId — looked up by matching the external `partner` key
   *      against affiliate_partners.name (case-insensitive prefix)
   *   2. createdAt within ±3 days of the partner-reported date
   *   3. total_commission within 5% of the external amount
   *
   * When multiple candidates pass all filters we pick the one with the
   * smallest absolute date delta (closest match first).
   *
   * Matched rows are updated in place; already-matched rows are skipped.
   */
  async matchRecords(
    period: string,
    partner?: string,
    options?: { dateToleranceDays?: number }
  ): Promise<void> {
    const { start, end } = getPeriodDates(period);
    const toleranceDays = options?.dateToleranceDays ?? DEFAULT_MATCH_TOLERANCE_DAYS;

    // Build a lookup: external partner key → internal partner_id
    const partnerMapResult = await db.execute(sql`
      SELECT id, LOWER(name) AS name_lower FROM affiliate_partners
    `);
    const partnerKeyToId: Record<string, string> = {};
    for (const row of partnerMapResult.rows as any[]) {
      // Map common external keys to partner rows by prefix match
      // e.g. 'travelpayouts', 'viator', 'fever', 'booking'
      partnerKeyToId[row.name_lower] = row.id;
      // Also index by first word (handles "Booking.com" → "booking")
      const firstWord = row.name_lower.split(/[\s.]/)[0];
      if (firstWord && !partnerKeyToId[firstWord]) {
        partnerKeyToId[firstWord] = row.id;
      }
    }

    // Fetch all unmatched internal earnings for the period
    const internal = await db.execute(sql`
      SELECT ae.*, ap.name AS partner_name
      FROM affiliate_earnings ae
      LEFT JOIN affiliate_partners ap ON ae.partner_id = ap.id
      WHERE ae.created_at >= ${start.toISOString()}
        AND ae.created_at <= ${end.toISOString()}
        AND ae.reconciliation_status = 'unmatched'
      ORDER BY ae.created_at
    `);
    const internalRows = internal.rows as any[];

    // Fetch external reports
    const external = await this.fetchExternalReports(period, partner);

    // Track which internal rows have been consumed in this pass
    const consumed = new Set<string>();

    for (const ext of external) {
      // Resolve the internal partner_id for this external partner key
      const resolvedPartnerId = partnerKeyToId[ext.partner.toLowerCase()] ??
        partnerKeyToId[ext.partner.toLowerCase().split(/[\s.]/)[0]];

      const best = selectMatchCandidate(ext, internalRows, resolvedPartnerId, consumed, toleranceDays);
      if (!best) continue;

      // Mark as matched in memory and in DB
      best.reconciliation_status = "matched";
      consumed.add(best.id);

      // Look up content_tracking_number from the affiliate_products row linked via the click
      let contentTrackingNumber: string | null = null;
      try {
        const clickRow = await db.execute(sql`
          SELECT ap.tracking_number
          FROM affiliate_clicks ac
          JOIN affiliate_products ap ON ac.product_id = ap.id
          WHERE ac.id = ${best.click_id}
          LIMIT 1
        `);
        contentTrackingNumber = (clickRow.rows[0] as any)?.tracking_number ?? null;
      } catch (_) {}

      await db.execute(sql`
        UPDATE affiliate_earnings
        SET reconciliation_status    = 'matched',
            partner_reference_id     = ${ext.partnerReferenceId},
            reconciled_at            = NOW(),
            external_report_data     = ${JSON.stringify(ext.rawData)}::jsonb,
            content_tracking_number  = ${contentTrackingNumber}
        WHERE id = ${best.id}
      `);
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

    // Build a lookup: partnerReferenceId → external commission row
    const externalByRefId = new Map<string, ExternalCommission>(
      external.map((e) => [e.partnerReferenceId, e])
    );

    // Identify unmatched external rows (those whose partnerReferenceId isn't stored internally)
    const matchedRefIds = new Set(
      internalRows
        .filter((r) => r.reconciliation_status === "matched" && r.partner_reference_id)
        .map((r) => r.partner_reference_id)
    );
    const unmatchedExternal = external.filter(
      (e) => !matchedRefIds.has(e.partnerReferenceId)
    );

    // Build explicit matched pairs: each matched internal row paired with its external record
    const matchedPairs: MatchedPair[] = internalRows
      .filter((r) => r.reconciliation_status === "matched" && r.partner_reference_id)
      .map((r) => {
        const ext = externalByRefId.get(r.partner_reference_id as string);
        return ext ? { internal: r, external: ext } : null;
      })
      .filter((pair): pair is MatchedPair => pair !== null);

    // Compute summary.
    // totalExpected = sum of all internal commission records for the period.
    // totalConfirmed = sum of PARTNER-REPORTED amounts for matched pairs,
    //   not internal amounts — this is "confirmed by partners" semantics.
    // variance = expected − confirmed (partner amounts are ground truth).
    const totalExpected = internalRows.reduce(
      (sum, r) => sum + parseFloat(r.total_commission || "0"),
      0
    );
    const totalConfirmed = matchedPairs.reduce(
      (sum, pair) => sum + pair.external.amount,
      0
    );
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
      matchedPairs,
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
