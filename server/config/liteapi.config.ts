/**
 * LITEAPI CONFIG (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`). No rate, fee or margin lives here (§8) —
 * margins are `fee_bands` rows in S1-d-2. Secrets are read BY NAME only.
 *
 *   · `LITEAPI_API_KEY` — the key; unset ⇒ LiteAPI is OFF (the sync skips, nothing is called).
 *   · `LITEAPI_ENV` — `sandbox` | `production`; recorded on every stored row's provenance so sandbox rows
 *     are identifiable and purgeable. Unset or unknown ⇒ OFF: a row is never stored without its env.
 *   · `LITEAPI_DATA_BASE_URL` / `LITEAPI_BOOK_BASE_URL` — two hosts (data+rates, booking); defaults below.
 *     There is no separate sandbox host: a sandbox key on the same hosts answers in sandbox.
 *   · `LITEAPI_MAX_RPS` — the client's request ceiling; default 5 (the sandbox limit).
 *   · `LITEAPI_STALE_AFTER_DAYS` — how long a row stays current after a COMPLETED sync pass confirms it;
 *     default 2 (a daily sync plus a day's slack). A refresh marker, not a retention cap: the terms set
 *     none, and the expiry sweep never deletes a LiteAPI row.
 */
import { LITEAPI_ENVS, type LiteapiEnv } from "@shared/liteapi";

export const LITEAPI_DATA_BASE_URL_DEFAULT = "https://api.liteapi.travel/v3.0";
export const LITEAPI_BOOK_BASE_URL_DEFAULT = "https://book.liteapi.travel/v3.0";
export const LITEAPI_MAX_RPS_DEFAULT = 5;
export const LITEAPI_STALE_AFTER_DAYS_DEFAULT = 2;
/** Page size for `GET /data/hotels` (the API allows up to 5000). */
export const LITEAPI_PAGE_SIZE = 500;
/** How far before the last completed pass an incremental query reaches back (re-reads are idempotent). */
export const LITEAPI_SYNC_OVERLAP_MS = 60 * 60 * 1000;

/** Kyoto only in S1-d-1. Each target names the LiteAPI query and the market city its rows join under. */
export const LITEAPI_SYNC_TARGETS: ReadonlyArray<{ market: string; countryCode: string; cityName: string }> = [
  { market: "kyoto", countryCode: "JP", cityName: "Kyoto" },
];

export interface LiteapiConfig {
  apiKey: string;
  env: LiteapiEnv;
  dataBaseUrl: string;
  bookBaseUrl: string;
  maxRps: number;
  staleAfterDays: number;
}

function urlEnv(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  return /^https:\/\//i.test(v) ? v.replace(/\/+$/, "") : fallback;
}

/** The config, or null when LiteAPI is off (no key, or no known env). */
export function liteapiConfig(env: NodeJS.ProcessEnv = process.env): LiteapiConfig | null {
  const apiKey = (env.LITEAPI_API_KEY ?? "").trim();
  const which = (env.LITEAPI_ENV ?? "").trim().toLowerCase();
  if (!apiKey || !(LITEAPI_ENVS as readonly string[]).includes(which)) return null;
  const rps = Number(env.LITEAPI_MAX_RPS);
  const stale = Number(env.LITEAPI_STALE_AFTER_DAYS);
  return {
    apiKey,
    env: which as LiteapiEnv,
    dataBaseUrl: urlEnv(env.LITEAPI_DATA_BASE_URL, LITEAPI_DATA_BASE_URL_DEFAULT),
    bookBaseUrl: urlEnv(env.LITEAPI_BOOK_BASE_URL, LITEAPI_BOOK_BASE_URL_DEFAULT),
    maxRps: Number.isFinite(rps) && rps > 0 ? rps : LITEAPI_MAX_RPS_DEFAULT,
    staleAfterDays: Number.isFinite(stale) && stale > 0 ? stale : LITEAPI_STALE_AFTER_DAYS_DEFAULT,
  };
}
