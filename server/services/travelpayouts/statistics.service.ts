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

async function fetchPartnerAmounts(from: string, to: string): Promise<Record<string, number>> {
  try {
    const data = await tpFetch("/v1/statistics/payments", { from, to });
    if (!Array.isArray(data)) return {};
    const byPartner: Record<string, number> = {};
    for (const payment of data) {
      const partner = (payment.partner || payment.program || "other")
        .toLowerCase()
        .replace(/\s+/g, "_");
      const n = typeof payment.amount === "number" ? payment.amount : parseFloat(payment.amount || "0");
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

  // Always fetch this-month and last-month separately (for MoM display and partner breakdown)
  // Also fetch the selected period total when it differs from this/last month
  const needsSeparateFetch =
    period === "last_90_days" || // 90-day range ≠ this month + last month
    (period === "this_month" && false); // already covered

  const fetchSelectedTotal = period === "last_90_days";

  const [thisMonthTotal, lastMonthTotal, balanceData, thisMonthPartners, lastMonthPartners] =
    await Promise.all([
      fetchAmountForRange(thisRange.from, thisRange.to),
      fetchAmountForRange(lastRange.from, lastRange.to),
      fetchBalanceData(),
      fetchPartnerAmounts(thisRange.from, thisRange.to),
      fetchPartnerAmounts(lastRange.from, lastRange.to),
    ]);

  // For 90-day total, query the actual range; otherwise use already-fetched values
  let total: number;
  if (period === "this_month") {
    total = thisMonthTotal;
  } else if (period === "last_month") {
    total = lastMonthTotal;
  } else {
    // last_90_days: fetch the actual 90-day range total
    total = await fetchAmountForRange(selectedRange.from, selectedRange.to);
  }

  // Build partner breakdown with accurate this-month and last-month columns
  const allPartners = new Set([
    ...Object.keys(thisMonthPartners),
    ...Object.keys(lastMonthPartners),
  ]);

  const byPartner: PartnerCommission[] = Array.from(allPartners).map((partner) => {
    const thisMonthAmt = thisMonthPartners[partner] || 0;
    const lastMonthAmt = lastMonthPartners[partner] || 0;
    const rowTotal =
      period === "this_month"
        ? thisMonthAmt
        : period === "last_month"
        ? lastMonthAmt
        : thisMonthAmt + lastMonthAmt; // approximation for 90-day view

    return {
      partner,
      partnerLabel: PARTNER_LABELS[partner] || partner.charAt(0).toUpperCase() + partner.slice(1),
      thisMonth: thisMonthAmt,
      lastMonth: lastMonthAmt,
      total: rowTotal,
      currency: balanceData.currency,
    };
  });

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
