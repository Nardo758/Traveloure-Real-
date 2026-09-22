import {
  parseAffiliateAmount,
  type AffiliateCommissionReport,
} from "./affiliate-commission-report";

export interface FeverCommissions extends AffiliateCommissionReport {}

interface ImpactReportRow {
  Revenue?: string | number;
  Commissions?: string | number;
  Amount?: string | number;
  [key: string]: any;
}

function getDateRange(period: string): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "last_month") {
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(firstOfLastMonth), end: fmt(lastOfLastMonth) };
  }

  if (period === "last_90_days") {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start: fmt(ninetyDaysAgo), end: fmt(now) };
  }

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: fmt(firstOfMonth), end: fmt(now) };
}

function getThisMonthRange(): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
}

function getLastMonthRange(): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    end: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

function getAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function fetchImpactCommissions(
  accountSid: string,
  authToken: string,
  start: string,
  end: string
): Promise<number | null> {
  try {
    const url = new URL(
      `https://api.impact.com/Mediapartners/${accountSid}/Reports/adv_performance`
    );
    url.searchParams.set("StartDate", start);
    url.searchParams.set("EndDate", end);
    url.searchParams.set("CampaignName", "Fever");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: getAuthHeader(accountSid, authToken),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[FeverCommissions] Impact API ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const rows = data?.Rows ?? data?.rows;
    if (!Array.isArray(rows)) return null;

    // A readable row with no commission field genuinely reports zero. Only a transport
    // failure or a wholly unparseable payload is unknown.
    let invalidAmount = false;
    const total = (rows as ImpactReportRow[]).reduce((sum, row) => {
      const val = row.Commissions ?? row.Revenue ?? row.Amount;
      if (val === undefined || val === null) return sum;
      const n = parseAffiliateAmount(val);
      if (n === null) {
        invalidAmount = true;
        return sum;
      }
      return sum + n;
    }, 0);
    return invalidAmount ? null : total;
  } catch (err: any) {
    console.warn(`[FeverCommissions] Fetch error:`, err?.message || err);
    return null;
  }
}

export async function getFeverCommissions(period: string): Promise<FeverCommissions> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" };
  }

  const thisRange = getThisMonthRange();
  const lastRange = getLastMonthRange();

  const [thisMonth, lastMonth] = await Promise.all([
    fetchImpactCommissions(accountSid, authToken, thisRange.start, thisRange.end),
    fetchImpactCommissions(accountSid, authToken, lastRange.start, lastRange.end),
  ]);

  const selectedRange = getDateRange(period);
  let total: number | null;
  if (period === "this_month") total = thisMonth;
  else if (period === "last_month") total = lastMonth;
  else {
    const ninetyTotal = await fetchImpactCommissions(
      accountSid,
      authToken,
      selectedRange.start,
      selectedRange.end
    );
    total = ninetyTotal;
  }

  return { configured: true, thisMonth, lastMonth, total, currency: "USD" };
}
