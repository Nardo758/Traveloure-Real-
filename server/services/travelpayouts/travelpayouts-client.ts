const BASE_URL = "https://api.travelpayouts.com";
const AVIASALES_DATA_URL = "https://api.travelpayouts.com/data";
const WEGOTRIP_API_URL = "https://wegotrip.com/api/v2";
const TIQETS_FEED_URL = "https://storage.googleapis.com/tiqets-feeds";

export function getTravelpayoutsToken(): string | null {
  return process.env.TRAVELPAYOUTS_TOKEN || null;
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

export async function externalFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    throw new Error(`Fetch error ${res.status}: ${url}`);
  }
  return res.json();
}

export { BASE_URL, AVIASALES_DATA_URL, WEGOTRIP_API_URL, TIQETS_FEED_URL };
