const BASE_URL = "https://api.travelpayouts.com";
const AVIASALES_DATA_URL = "https://api.travelpayouts.com/data";
const WEGOTRIP_API_URL = "https://wegotrip.com/api/v2";
const TIQETS_FEED_URL = "https://storage.googleapis.com/tiqets-feeds";

export function getTravelpayoutsToken(): string | null {
  return process.env.TRAVELPAYOUTS_TOKEN || null;
}

/**
 * The Travelpayouts affiliate marker (partner id) — NOT the API token. Used as the
 * attribution parameter on outbound partner links (e.g. WeGoTrip's `?sub_id=<marker>`,
 * hotel widgets' `?marker=<marker>`). Same account marker as booking/agoda services.
 */
export function getTravelpayoutsMarker(): string {
  return process.env.TRAVELPAYOUTS_MARKER || "405110";
}

/**
 * MONEY_MAP F-5 — sub_id-based attribution token.
 *
 * Travelpayouts' `marker.SubID` convention returns a suffixed sub_id verbatim on
 * `execute_query` action rows. Building `<marker>.<token>` lets us stamp a per-booking
 * token (the `affiliate_booking_requests` row id) onto the outbound link so the partner
 * report echoes it back and the reconciliation matcher can adopt the REAL commission on an
 * exact match instead of ever estimating one. See docs/MONEY_MAP.md F-5.
 *
 * DORMANT: nothing calls buildAttributionSubId to rewrite an outbound link yet — that only
 * happens behind the `TP_SUBID_ATTRIBUTION=1` env flag, itself gated on a live echo test
 * confirming Travelpayouts actually returns the suffixed sub_id verbatim.
 */
export function buildAttributionSubId(token: string): string {
  return `${getTravelpayoutsMarker()}.${token}`;
}

/**
 * Inverse of buildAttributionSubId. Splits on the FIRST dot only (a token itself may
 * contain dots — e.g. a UUID never does, but this stays defensive). No dot present (a
 * plain marker or an unrelated sub_id format) → token is null, marker is the whole string.
 */
export function parseAttributionSubId(subId: string): { marker: string; token: string | null } {
  const dotIndex = subId.indexOf(".");
  if (dotIndex === -1) {
    return { marker: subId, token: null };
  }
  return {
    marker: subId.slice(0, dotIndex),
    token: subId.slice(dotIndex + 1) || null,
  };
}

/**
 * MONEY_MAP F-5: rewrite `url`'s `sub_id` query param to the attribution token, but ONLY when
 * `enabled` (the caller passes `TP_SUBID_ATTRIBUTION==='1'` explicitly rather than this function
 * reading process.env itself) and the URL actually carries a `sub_id` param. Pure and directly
 * unit-testable for both flag states without env mutation. `enabled=false` (the default/current
 * behavior) always returns `url` unchanged — byte-identical to pre-F-5 behavior.
 */
export function applyAttributionSubId(url: string, token: string, enabled: boolean): string {
  if (!enabled) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sub_id")) return url;
    parsed.searchParams.set("sub_id", buildAttributionSubId(token));
    return parsed.toString();
  } catch {
    // Malformed URL — never throw over an attribution nicety; return it unchanged.
    return url;
  }
}

export function assertToken(): string {
  const token = getTravelpayoutsToken();
  if (!token) {
    throw new Error("TRAVELPAYOUTS_TOKEN is not configured");
  }
  return token;
}

export async function tpFetch(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  baseUrl = BASE_URL
): Promise<any> {
  const token = assertToken();
  const url = new URL(path, baseUrl);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Travelpayouts API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Authenticated fetch against the Travelpayouts partner APIs that use the
 * `X-Access-Token` header (statistics/v1, finance/v2). The older `?token=`
 * query-param style is NOT accepted by these endpoints.
 */
export async function tpPartnerFetch(
  path: string,
  options: { method?: "GET" | "POST"; params?: Record<string, string | number | undefined>; body?: any } = {}
): Promise<any> {
  const token = assertToken();
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(options.params || {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "X-Access-Token": token,
      "Accept": "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Travelpayouts partner API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function externalFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    throw new Error(`Fetch error ${res.status}: ${url}`);
  }
  return res.json();
}

export { BASE_URL, AVIASALES_DATA_URL, WEGOTRIP_API_URL, TIQETS_FEED_URL };
