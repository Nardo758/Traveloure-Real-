import { getTravelpayoutsToken, tpFetch } from "./travelpayouts-client";

export interface TravelpayoutsBalance {
  balance: number;
  currency: string;
}

export interface TravelpayoutsPayment {
  id: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  type: string;
}

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

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "last_month") {
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(firstOfLastMonth), to: fmt(lastOfLastMonth) };
  }

  if (period === "last_90_days") {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { from: fmt(ninetyDaysAgo), to: fmt(now) };
  }

  // Default: this_month
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(firstOfMonth), to: fmt(now) };
}

function getLastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: fmt(firstOfLastMonth), to: fmt(lastOfLastMonth) };
}

function getThisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(firstOfMonth), to: fmt(now) };
}

async function fetchStatisticsForRange(from: string, to: string): Promise<number> {
  try {
    const data = await tpFetch("/v1/statistics/payments", { from, to });
    if (!data || !Array.isArray(data)) return 0;
    return data.reduce((sum: number, p: any) => {
      const amount = typeof p.amount === "number" ? p.amount : parseFloat(p.amount || "0");
      return sum + (isNaN(amount) ? 0 : amount);
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

async function fetchPartnerBreakdown(from: string, to: string): Promise<PartnerCommission[]> {
  try {
    const data = await tpFetch("/v1/statistics/payments", { from, to });
    if (!data || !Array.isArray(data)) return [];

    const byPartner: Record<string, number> = {};
    for (const payment of data) {
      const partner = (payment.partner || payment.program || "other").toLowerCase().replace(/\s+/g, "_");
      const amount = typeof payment.amount === "number" ? payment.amount : parseFloat(payment.amount || "0");
      byPartner[partner] = (byPartner[partner] || 0) + (isNaN(amount) ? 0 : amount);
    }

    return Object.entries(byPartner).map(([partner, total]) => ({
      partner,
      partnerLabel: PARTNER_LABELS[partner] || partner.charAt(0).toUpperCase() + partner.slice(1),
      thisMonth: total,
      lastMonth: 0,
      total,
      currency: "USD",
    }));
  } catch {
    return [];
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
  const selectedRange = getDateRange(period);

  const [thisMonthTotal, lastMonthTotal, balanceData, byPartner] = await Promise.all([
    fetchStatisticsForRange(thisRange.from, thisRange.to),
    fetchStatisticsForRange(lastRange.from, lastRange.to),
    fetchBalanceData(),
    fetchPartnerBreakdown(selectedRange.from, selectedRange.to),
  ]);

  const selectedTotal = period === "this_month" ? thisMonthTotal
    : period === "last_month" ? lastMonthTotal
    : thisMonthTotal + lastMonthTotal;

  return {
    configured: true,
    thisMonth: thisMonthTotal,
    lastMonth: lastMonthTotal,
    total: selectedTotal,
    currency: balanceData.currency,
    balance: balanceData.balance,
    byPartner,
  };
}
