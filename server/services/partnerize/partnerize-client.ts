/**
 * Partnerize API Client
 *
 * Thin fetch wrapper for the Partnerize affiliate network, following the same
 * per-partner client pattern used by server/services/travelpayouts/travelpayouts-client.ts:
 *   - credentials read from env, never hard-coded
 *   - assertCredentials() throws for callers that require them
 *   - a low-level `pzFetch` helper used by higher-level report/campaign functions
 *
 * Auth: HTTP Basic (PARTNERIZE_APPLICATION_KEY : PARTNERIZE_API_KEY), all
 * requests scoped to the publisher via PARTNERIZE_PUBLISHER_ID.
 *
 * Docs (Partnerize Publisher API): https://api.partnerize.com
 */

const BASE_URL = "https://api.partnerize.com";

export interface PartnerizeCredentials {
  applicationKey: string;
  apiKey: string;
  publisherId: string;
}

export function getPartnerizeCredentials(): PartnerizeCredentials | null {
  const applicationKey = process.env.PARTNERIZE_APPLICATION_KEY;
  const apiKey = process.env.PARTNERIZE_API_KEY;
  const publisherId = process.env.PARTNERIZE_PUBLISHER_ID;
  if (!applicationKey || !apiKey || !publisherId) {
    return null;
  }
  return { applicationKey, apiKey, publisherId };
}

export function assertPartnerizeCredentials(): PartnerizeCredentials {
  const creds = getPartnerizeCredentials();
  if (!creds) {
    throw new Error(
      "Partnerize credentials are not configured (PARTNERIZE_APPLICATION_KEY / PARTNERIZE_API_KEY / PARTNERIZE_PUBLISHER_ID)"
    );
  }
  return creds;
}

function authHeader(creds: PartnerizeCredentials): string {
  const token = Buffer.from(`${creds.applicationKey}:${creds.apiKey}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Low-level fetch helper. Throws on non-2xx responses; callers are
 * responsible for catching and gracefully degrading (matching the
 * "warn + skip" pattern used elsewhere in this codebase).
 */
export async function pzFetch(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<any> {
  const creds = assertPartnerizeCredentials();
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(creds),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Partnerize API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface PartnerizeCampaign {
  campaignId: string;
  name: string;
  category?: string;
  status?: string;
  trackingUrl?: string;
  commissionRate?: number;
  logoUrl?: string;
  description?: string;
  websiteUrl?: string;
}

/**
 * List all campaigns the publisher is approved for (or applied to).
 * Returns [] (with a console warning) if credentials are missing or the
 * request fails — callers never need their own try/catch for the "no creds" case.
 */
export async function listCampaigns(): Promise<PartnerizeCampaign[]> {
  const creds = getPartnerizeCredentials();
  if (!creds) {
    console.warn("[Partnerize] Credentials not configured — skipping campaign list");
    return [];
  }
  try {
    const json = await pzFetch(`/publishers/${creds.publisherId}/campaigns.json`, {
      status: "approved",
    });
    const rows: any[] = json?.data ?? json?.campaigns ?? [];
    return rows.map((c: any) => ({
      campaignId: String(c.campaign_id ?? c.id ?? ""),
      name: c.name ?? c.campaign_name ?? "Unknown Campaign",
      category: c.category ?? c.vertical ?? undefined,
      status: c.status ?? undefined,
      trackingUrl: c.tracking_url ?? c.default_tracking_url ?? undefined,
      commissionRate: c.commission_rate !== undefined ? parseFloat(c.commission_rate) : undefined,
      logoUrl: c.logo_url ?? undefined,
      description: c.description ?? undefined,
      websiteUrl: c.website_url ?? c.url ?? undefined,
    })).filter((c) => c.campaignId);
  } catch (err: any) {
    console.warn("[Partnerize] listCampaigns failed:", err?.message ?? err);
    return [];
  }
}

export interface PartnerizeClickReportRow {
  clickId: string;
  campaignId: string;
  clickedAt: string;
  rawData: Record<string, unknown>;
}

/**
 * Pull the publisher's click report for a date range, scoped to the
 * configured publisher id. Returns [] gracefully on missing creds/failure.
 */
export async function getClickReport(start: Date, end: Date): Promise<PartnerizeClickReportRow[]> {
  const creds = getPartnerizeCredentials();
  if (!creds) {
    console.warn("[Partnerize] Credentials not configured — skipping click report");
    return [];
  }
  try {
    const json = await pzFetch(`/publishers/${creds.publisherId}/reports/clicks.json`, {
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    const rows: any[] = json?.data ?? json?.clicks ?? [];
    return rows.map((r: any) => ({
      clickId: String(r.click_id ?? r.id ?? ""),
      campaignId: String(r.campaign_id ?? ""),
      clickedAt: r.click_date ?? r.created_at ?? start.toISOString(),
      rawData: r,
    })).filter((r) => r.clickId);
  } catch (err: any) {
    console.warn("[Partnerize] getClickReport failed:", err?.message ?? err);
    return [];
  }
}

export interface PartnerizeConversionReportRow {
  conversionId: string;
  campaignId: string;
  amount: number;
  commission: number;
  currency: string;
  convertedAt: string;
  rawData: Record<string, unknown>;
}

/**
 * Pull the publisher's conversion (commission) report for a date range.
 * Used by affiliate-reconciliation.service.ts to reconcile Partnerize-sourced
 * bookings against internal affiliate_earnings records.
 */
export async function getConversionReport(start: Date, end: Date): Promise<PartnerizeConversionReportRow[]> {
  const creds = getPartnerizeCredentials();
  if (!creds) {
    console.warn("[Partnerize] Credentials not configured — skipping conversion report");
    return [];
  }
  try {
    const json = await pzFetch(`/publishers/${creds.publisherId}/reports/conversions.json`, {
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    const rows: any[] = json?.data ?? json?.conversions ?? [];
    return rows.map((r: any) => ({
      conversionId: String(r.conversion_id ?? r.id ?? ""),
      campaignId: String(r.campaign_id ?? ""),
      amount: parseFloat(r.sale_amount ?? r.amount ?? "0"),
      commission: parseFloat(r.commission_amount ?? r.commission ?? "0"),
      currency: r.currency ?? "USD",
      convertedAt: r.conversion_date ?? r.created_at ?? start.toISOString(),
      rawData: r,
    })).filter((r) => r.conversionId);
  } catch (err: any) {
    console.warn("[Partnerize] getConversionReport failed:", err?.message ?? err);
    return [];
  }
}

/**
 * Build a tracked Partnerize deep link for a given campaign + destination URL.
 * Partnerize's standard click-tracking format: click.linksynergy/partnerize
 * style redirect with the publisher id and campaign id embedded, and the
 * merchant destination URL passed as `url`.
 */
export function buildPartnerizeTrackingLink(
  campaignId: string,
  destinationUrl: string,
  metadata?: Record<string, string | undefined>
): string | null {
  const creds = getPartnerizeCredentials();
  if (!creds) {
    console.warn("[Partnerize] Credentials not configured — cannot build tracking link");
    return null;
  }
  const params = new URLSearchParams({
    publisher_id: creds.publisherId,
    campaign_id: campaignId,
    url: destinationUrl,
  });
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== undefined) params.set(k, v);
    }
  }
  return `https://clkuk.pz.io/click?${params.toString()}`;
}

export { BASE_URL };
