/**
 * LITEAPI CLIENT (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`). Static content only in this lane:
 * `GET /data/hotels`. Rates, prebook and book are S1-d-2.
 *
 *   · Auth is the `X-API-Key` header; the key is read by name (`LITEAPI_API_KEY`) through the config.
 *   · Paced to `maxRps` (5/s in sandbox) and backs off on 429 (or body code 4290): three retries,
 *     exponential from 1 s — the vendor SDK's own posture. Any other failure throws; nothing is guessed.
 *   · `fetch` and `sleep` are injected so the pacing and back-off are provable without a network.
 */
import type { LiteapiConfig } from "../config/liteapi.config";

/** One hotel row of `GET /data/hotels`, the fields this lane reads. Reviews are never read (S1-d-1). */
export interface LiteapiHotel {
  id: string;
  name: string;
  hotelDescription?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  zip?: string;
  main_photo?: string;
  stars?: number;
  hotelTypeId?: number;
  chainId?: number;
  chain?: string;
  rating?: number;
  deletedAt?: string | null;
}

export interface LiteapiHotelsPage {
  data: LiteapiHotel[];
  total: number | null;
}

export class LiteapiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface LiteapiClientDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const LITEAPI_RETRIES = 3;
export const LITEAPI_BACKOFF_START_MS = 1000;

export function createLiteapiClient(cfg: LiteapiConfig, deps: LiteapiClientDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const minGapMs = 1000 / cfg.maxRps;
  let lastAt = -Infinity;

  async function pace(): Promise<void> {
    const wait = lastAt + minGapMs - now();
    if (wait > 0) await sleep(wait);
    lastAt = now();
  }

  async function getJson(path: string, query: Record<string, string | number | undefined>): Promise<any> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const url = `${cfg.dataBaseUrl}${path}?${qs.toString()}`;
    for (let attempt = 0; ; attempt++) {
      await pace();
      const res = await doFetch(url, { headers: { "X-API-Key": cfg.apiKey, accept: "application/json" } });
      const body: any = await res.json().catch(() => null);
      const limited = res.status === 429 || body?.error?.code === 4290;
      if (limited && attempt < LITEAPI_RETRIES) {
        await sleep(LITEAPI_BACKOFF_START_MS * 2 ** attempt);
        continue;
      }
      if (!res.ok || limited) {
        throw new LiteapiError(res.status, `LiteAPI ${path} answered ${res.status}${limited ? " (rate limited)" : ""}`);
      }
      return body;
    }
  }

  return {
    /** One page of `GET /data/hotels`. `lastUpdatedAt` (RFC3339) asks only for hotels changed since. */
    async listHotels(q: { countryCode: string; cityName: string; offset: number; limit: number; lastUpdatedAt?: string }): Promise<LiteapiHotelsPage> {
      const body = await getJson("/data/hotels", q);
      const data = Array.isArray(body?.data) ? (body.data as LiteapiHotel[]) : [];
      return { data, total: Number.isInteger(body?.total) ? body.total : null };
    },
  };
}
export type LiteapiClient = ReturnType<typeof createLiteapiClient>;
