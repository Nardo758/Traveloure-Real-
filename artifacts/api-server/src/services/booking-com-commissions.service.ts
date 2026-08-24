export interface BookingComCommissions {
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

async function fetchBookingComCommissions(
  affiliateId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    const url = new URL("https://distribution-xml.booking.com/json/reporting.stats");
    url.searchParams.set("affiliate_id", affiliateId);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);

    const authHeader = `Basic ${Buffer.from(`${affiliateId}:${apiKey}`).toString("base64")}`;

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[BookingComCommissions] API ${res.status}: ${text.slice(0, 200)}`);
      return 0;
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      return data.reduce((sum: number, row: any) => {
        const val = row.commission ?? row.commissions ?? row.revenue ?? 0;
        const n = typeof val === "number" ? val : parseFloat(String(val));
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
    }

    const val = data?.commission ?? data?.total_commission ?? data?.revenue ?? 0;
    return typeof val === "number" ? val : parseFloat(String(val)) || 0;
  } catch (err: any) {
    console.warn(`[BookingComCommissions] Fetch error:`, err?.message || err);
    return 0;
  }
}

export async function getBookingComCommissions(period: string): Promise<BookingComCommissions> {
  const affiliateId = process.env.BOOKING_COM_AFFILIATE_ID;
  const apiKey = process.env.BOOKING_COM_API_KEY;

  if (!affiliateId || !apiKey) {
    return { configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" };
  }

  const thisRange = getThisMonthRange();
  const lastRange = getLastMonthRange();

  const [thisMonth, lastMonth] = await Promise.all([
    fetchBookingComCommissions(affiliateId, apiKey, thisRange.startDate, thisRange.endDate),
    fetchBookingComCommissions(affiliateId, apiKey, lastRange.startDate, lastRange.endDate),
  ]);

  let total: number;
  if (period === "this_month") {
    total = thisMonth;
  } else if (period === "last_month") {
    total = lastMonth;
  } else {
    const range = getDateRange(period);
    total = await fetchBookingComCommissions(affiliateId, apiKey, range.startDate, range.endDate);
  }

  return { configured: true, thisMonth, lastMonth, total, currency: "USD" };
}
