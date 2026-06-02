import { getTravelpayoutsToken, tpFetch } from "./travelpayouts-client";

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

const PARTNER_LABELS: Record<string, string> = {
  agoda: "Agoda",
  klook: "Klook",
  aviasales: "Aviasales",
  getyourguide: "GetYourGuide",
  kiwi: "Kiwi.com",
  booking: "Booking.com (feed)",
  viator: "Viator (feed)",
  hotellook: "Hotellook",
  rentalcars: "Rental Cars",
  busbud: "BusBud",
  omio: "Omio",
  discovercars: "DiscoverCars",
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

async function fetchAmountForRange(from: string, to: string): Promise<number> {
  try {
    const data = await tpFetch("/v1/statistics/payments", { from, to });
    if (!Array.isArray(data)) return 0;
    return data.reduce((sum: number, p: any) => {
      const n = typeof p.amount === "number" ? p.amount : parseFloat(p.amount || "0");
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  } catch {
    return 0;
  }
}

async function fetchBalanceData(): Promise<{ balance: number; currency: string }> {
  try {
    const data = await tpFetch("/v1/statistics/balance");
    return {
      balance: typeof data?.balance === "number" ? data.balance : parseFloat(data?.balance || "0"),
      currency: data?.currency || "USD",
    };
  } catch {
    return { balance: 0, currency: "USD" };
  }
}

/**
 * Fetch payments for a date range and group the totals by partner/program key.
 */
async function fetchPartnerAmounts(from: string, to: string): Promise<Record<string, number>> {
  try {
    const data = await tpFetch("/v1/statistics/payments", { from, to });
    if (!Array.isArray(data)) return {};
    const byPartner: Record<string, number> = {};
    for (const payment of data) {
      const partner = (payment.partner || payment.program || "other")
        .toLowerCase()
        .replace(/\s+/g, "_");
      const n =
        typeof payment.amount === "number"
          ? payment.amount
          : parseFloat(payment.amount || "0");
      byPartner[partner] = (byPartner[partner] || 0) + (isNaN(n) ? 0 : n);
    }
    return byPartner;
  } catch {
    return {};
  }
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

  // Always fetch this-month and last-month amounts separately (for MoM display).
  // For the selected period total: use the exact range so 90-day isn't approximated.
  // For partner breakdown: fetch all three ranges to populate all three columns accurately.
  const needsThirdFetch = period === "last_90_days";

  const fetches: Promise<any>[] = [
    fetchAmountForRange(thisRange.from, thisRange.to),      // 0: this month total
    fetchAmountForRange(lastRange.from, lastRange.to),      // 1: last month total
    fetchBalanceData(),                                      // 2: balance
    fetchPartnerAmounts(thisRange.from, thisRange.to),      // 3: this month per-partner
    fetchPartnerAmounts(lastRange.from, lastRange.to),      // 4: last month per-partner
  ];

  if (needsThirdFetch) {
    // 5: actual 90-day total
    fetches.push(fetchAmountForRange(selectedRange.from, selectedRange.to));
    // 6: actual 90-day per-partner breakdown
    fetches.push(fetchPartnerAmounts(selectedRange.from, selectedRange.to));
  }

  const results = await Promise.all(fetches);

  const thisMonthTotal = results[0] as number;
  const lastMonthTotal = results[1] as number;
  const balanceData = results[2] as { balance: number; currency: string };
  const thisMonthPartners = results[3] as Record<string, number>;
  const lastMonthPartners = results[4] as Record<string, number>;

  let total: number;
  let selectedRangePartners: Record<string, number>;

  if (period === "this_month") {
    total = thisMonthTotal;
    selectedRangePartners = thisMonthPartners;
  } else if (period === "last_month") {
    total = lastMonthTotal;
    selectedRangePartners = lastMonthPartners;
  } else {
    // last_90_days: use actual fetched values — no approximation
    total = results[5] as number;
    selectedRangePartners = results[6] as Record<string, number>;
  }

  // Build partner breakdown: union of partners seen in any range.
  // thisMonth / lastMonth columns always reflect calendar-month actuals.
  // total column reflects the selected period exactly.
  const allPartners = new Set([
    ...Object.keys(thisMonthPartners),
    ...Object.keys(lastMonthPartners),
    ...Object.keys(selectedRangePartners),
  ]);

  const byPartner: PartnerCommission[] = Array.from(allPartners).map((partner) => ({
    partner,
    partnerLabel:
      PARTNER_LABELS[partner] || partner.charAt(0).toUpperCase() + partner.slice(1),
    thisMonth: thisMonthPartners[partner] || 0,
    lastMonth: lastMonthPartners[partner] || 0,
    total: selectedRangePartners[partner] || 0,
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
