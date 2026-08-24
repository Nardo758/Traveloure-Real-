export interface ViatorCommissions {
  configured: boolean;
  thisMonth: number;
  lastMonth: number;
  total: number;
  currency: string;
}

function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "last_month") {
    return {
      startDate: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }

  if (period === "last_90_days") {
    return {
      startDate: fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)),
      endDate: fmt(now),
    };
  }

  return {
    startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: fmt(now),
  };
}

function getThisMonthRange() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: fmt(now),
  };
}

function getLastMonthRange() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startDate: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    endDate: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

async function fetchViatorCommissions(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    const url = new URL("https://api.viator.com/partner/v1/affiliate/reporting");
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("currency", "USD");

    const res = await fetch(url.toString(), {
      headers: {
        "exp-api-key": apiKey,
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ViatorCommissions] API ${res.status}: ${text.slice(0, 200)}`);
      return 0;
    }

    const data = await res.json();
    if (Array.isArray(data?.commissions)) {
      return data.commissions.reduce((sum: number, row: any) => {
        const val = row.totalCommission ?? row.commission ?? row.amount ?? 0;
        const n = typeof val === "number" ? val : parseFloat(String(val));
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
    }

    const val =
      data?.totalCommission ??
      data?.commission ??
      data?.totalEarnings ??
      data?.earnings ??
      0;
    return typeof val === "number" ? val : parseFloat(String(val)) || 0;
  } catch (err: any) {
    console.warn(`[ViatorCommissions] Fetch error:`, err?.message || err);
    return 0;
  }
}

export async function getViatorCommissions(period: string): Promise<ViatorCommissions> {
  const apiKey = process.env.VIATOR_API_KEY;

  if (!apiKey) {
    return { configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" };
  }

  const thisRange = getThisMonthRange();
  const lastRange = getLastMonthRange();

  const [thisMonth, lastMonth] = await Promise.all([
    fetchViatorCommissions(apiKey, thisRange.startDate, thisRange.endDate),
    fetchViatorCommissions(apiKey, lastRange.startDate, lastRange.endDate),
  ]);

  let total: number;
  if (period === "this_month") {
    total = thisMonth;
  } else if (period === "last_month") {
    total = lastMonth;
  } else {
    const range = getDateRange(period);
    total = await fetchViatorCommissions(apiKey, range.startDate, range.endDate);
  }

  return { configured: true, thisMonth, lastMonth, total, currency: "USD" };
}
