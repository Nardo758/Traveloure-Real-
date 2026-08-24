import { getTravelpayoutsToken, tpPartnerFetch } from "./travelpayouts-client";

/**
 * Travelpayouts commission statistics.
 *
 * Uses the real partner APIs (verified live against the account token):
 *   • POST /statistics/v1/execute_query  — raw action rows (campaign_id, profits, state, sub_id).
 *     Auth via X-Access-Token header. The legacy /v1/statistics/payments endpoint does NOT
 *     exist (404) — it must not be used.
 *   • GET /finance/v2/get_user_balance   — current balance per currency.
 *
 * All programs on the account are covered because execute_query is queried without a
 * campaign filter — this includes WeGoTrip (Travelpayouts program/campaign #150), whose
 * bookings are attributed via the ?sub_id=<marker> link parameter and show up here as
 * action rows with campaign_id=150.
 */

export interface PartnerCommission {
  partner: string;
  partnerLabel: string;
  thisMonth: number;
  lastMonth: number;
  total: number;
  currency: string;
}

export interface TravelpayoutsStatistics {
  configured: boolean;
  thisMonth: number;
  lastMonth: number;
  total: number;
  currency: string;
  balance: number;
  byPartner: PartnerCommission[];
}

/** Friendly labels by Travelpayouts campaign (program) id. */
const CAMPAIGN_LABELS: Record<number, string> = {
  84: "Booking.com",
  100: "Aviasales",
  101: "Hotellook",
  110: "GetYourGuide",
  115: "Klook",
  121: "Agoda",
  125: "Rental Cars",
  150: "WeGoTrip",
};

/** Fallback labels when only a campaign name string is available. */
const NAME_LABELS: Record<string, string> = {
  agoda: "Agoda",
  klook: "Klook",
  aviasales: "Aviasales",
  getyourguide: "GetYourGuide",
  kiwi: "Kiwi.com",
  booking: "Booking.com",
  "booking.com": "Booking.com",
  viator: "Viator",
  hotellook: "Hotellook",
  rentalcars: "Rental Cars",
  busbud: "BusBud",
  omio: "Omio",
  discovercars: "DiscoverCars",
  wegotrip: "WeGoTrip",
};

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getThisMonthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function getLastMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

function getPeriodRange(period: string): { from: string; to: string } {
  const now = new Date();
  if (period === "last_month") return getLastMonthRange();
  if (period === "last_90_days") {
    return { from: fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)), to: fmt(now) };
  }
  return getThisMonthRange();
}

export interface TpActionRow {
  campaign_id: number;
  campaign_name_en: string | null;
  action_id: string;
  created_at_day: string;
  sub_id: string | null;
  // Full-length sub_id counterpart. The 2026-08-01 live probe of execute_query's schema showed
  // both fields; long_sub_id is presumed to preserve the complete `marker.token` value where
  // sub_id may hold a shortened form — the F-5 matcher checks both.
  long_sub_id?: string | null;
  state: string;
  type: string;
  paid_profit_usd: string | number;
  processing_profit_usd: string | number;
  price_usd: string | number;
}

const QUERY_PAGE_LIMIT = 300;

/**
 * Fetch raw action rows (bookings + referral actions) for a date range across ALL
 * campaigns on the account, paginating until total_rows is exhausted.
 * Exported so the reconciliation service can reuse the same verified query.
 */
export async function fetchTravelpayoutsActions(from: string, to: string): Promise<TpActionRow[]> {
  const rows: TpActionRow[] = [];
  let offset = 0;
  for (;;) {
    const data = await tpPartnerFetch("/statistics/v1/execute_query", {
      method: "POST",
      body: {
        fields: [
          "campaign_id",
          "campaign_name_en",
          "action_id",
          "created_at_day",
          "sub_id",
          "long_sub_id",
          "state",
          "type",
          "paid_profit_usd",
          "processing_profit_usd",
          "price_usd",
        ],
        filters: [
          { field: "date", op: "ge", value: from },
          { field: "date", op: "le", value: to },
          { field: "type", op: "in", value: ["action", "referral"] },
        ],
        offset,
        limit: QUERY_PAGE_LIMIT,
      },
    });
    const page: TpActionRow[] = Array.isArray(data?.results) ? data.results : [];
    rows.push(...page);
    const totalRows = typeof data?.total_rows === "number" ? data.total_rows : rows.length;
    offset += page.length;
    if (page.length === 0 || offset >= totalRows) break;
  }
  return rows;
}

function num(v: string | number | undefined | null): number {
  const n = typeof v === "number" ? v : parseFloat(v || "0");
  return isNaN(n) ? 0 : n;
}

/** Commission earned for a row: paid profit plus profit still processing. */
function rowProfit(r: TpActionRow): number {
  return num(r.paid_profit_usd) + num(r.processing_profit_usd);
}

function partnerKey(r: TpActionRow): string {
  const name = (r.campaign_name_en || "").trim();
  if (name) return name.toLowerCase().replace(/\s+/g, "_");
  return r.campaign_id ? `campaign_${r.campaign_id}` : "other";
}

function partnerLabel(r: TpActionRow): string {
  if (r.campaign_id && CAMPAIGN_LABELS[r.campaign_id]) return CAMPAIGN_LABELS[r.campaign_id];
  const name = (r.campaign_name_en || "").trim();
  if (name) return NAME_LABELS[name.toLowerCase()] || name;
  return r.campaign_id ? `Program #${r.campaign_id}` : "Other";
}

async function safeFetchActions(from: string, to: string): Promise<TpActionRow[]> {
  try {
    return await fetchTravelpayoutsActions(from, to);
  } catch (err) {
    console.warn("[TP Statistics] execute_query failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchBalanceData(): Promise<{ balance: number; currency: string }> {
  try {
    const data = await tpPartnerFetch("/finance/v2/get_user_balance");
    return { balance: num(data?.balance?.usd), currency: "USD" };
  } catch (err) {
    console.warn("[TP Statistics] balance fetch failed:", err instanceof Error ? err.message : err);
    return { balance: 0, currency: "USD" };
  }
}

function sumProfits(rows: TpActionRow[]): number {
  return rows.reduce((s, r) => s + rowProfit(r), 0);
}

function groupByPartner(rows: TpActionRow[]): Map<string, { label: string; amount: number }> {
  const map = new Map<string, { label: string; amount: number }>();
  for (const r of rows) {
    const key = partnerKey(r);
    const entry = map.get(key) || { label: partnerLabel(r), amount: 0 };
    entry.amount += rowProfit(r);
    map.set(key, entry);
  }
  return map;
}

export async function getTravelpayoutsStatistics(period: string): Promise<TravelpayoutsStatistics> {
  const token = getTravelpayoutsToken();

  if (!token) {
    return {
      configured: false,
      thisMonth: 0,
      lastMonth: 0,
      total: 0,
      currency: "USD",
      balance: 0,
      byPartner: [],
    };
  }

  const thisRange = getThisMonthRange();
  const lastRange = getLastMonthRange();
  const selectedRange = getPeriodRange(period);

  const needsThirdFetch = period === "last_90_days";

  const [thisRows, lastRows, balanceData, selectedRows] = await Promise.all([
    safeFetchActions(thisRange.from, thisRange.to),
    safeFetchActions(lastRange.from, lastRange.to),
    fetchBalanceData(),
    needsThirdFetch ? safeFetchActions(selectedRange.from, selectedRange.to) : Promise.resolve(null),
  ]);

  const thisMonthTotal = sumProfits(thisRows);
  const lastMonthTotal = sumProfits(lastRows);

  let total: number;
  let selectedPartners: Map<string, { label: string; amount: number }>;
  const thisMonthPartners = groupByPartner(thisRows);
  const lastMonthPartners = groupByPartner(lastRows);

  if (period === "last_month") {
    total = lastMonthTotal;
    selectedPartners = lastMonthPartners;
  } else if (needsThirdFetch && selectedRows) {
    total = sumProfits(selectedRows);
    selectedPartners = groupByPartner(selectedRows);
  } else {
    total = thisMonthTotal;
    selectedPartners = thisMonthPartners;
  }

  const allPartners = new Set([
    ...Array.from(thisMonthPartners.keys()),
    ...Array.from(lastMonthPartners.keys()),
    ...Array.from(selectedPartners.keys()),
  ]);

  const byPartner: PartnerCommission[] = Array.from(allPartners).map((partner) => ({
    partner,
    partnerLabel:
      selectedPartners.get(partner)?.label ||
      thisMonthPartners.get(partner)?.label ||
      lastMonthPartners.get(partner)?.label ||
      partner,
    thisMonth: thisMonthPartners.get(partner)?.amount || 0,
    lastMonth: lastMonthPartners.get(partner)?.amount || 0,
    total: selectedPartners.get(partner)?.amount || 0,
    currency: balanceData.currency,
  }));

  byPartner.sort((a, b) => b.total - a.total);

  return {
    configured: true,
    thisMonth: thisMonthTotal,
    lastMonth: lastMonthTotal,
    total,
    currency: balanceData.currency,
    balance: balanceData.balance,
    byPartner,
  };
}
