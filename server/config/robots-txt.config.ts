/**
 * robots.txt enforcement — config home for the honest crawl identity and the
 * per-origin robots.txt cache lifetime.
 *
 * Ruling `2026-09-18-scraper-robots` (business plan v1.4 §4 promised "robots.txt
 * enforcement built"): the affiliate scraper (`affiliate-scraper.service.ts`)
 * fetched partner pages with a spoofed desktop-Chrome User-Agent and never
 * consulted robots.txt at all, and `DMOSourceRegistry`'s per-source
 * `respectRobotsTxt` flag existed and was read by nothing
 * (`server/content/providers/DMOSourceRegistry.ts`). `server/utils/robots-txt.ts`
 * is the ONE parser/consult module (§18 rule 1); this file is its config home so
 * neither the crawl identity nor the cache TTL is a bare literal at a call site —
 * the same posture `ready-made-announce.config.ts` and `trailhead.config.ts` use.
 * §8 is untouched: nothing here is a fee, rate, margin or multiplier.
 */

function envString(key: string, dflt: string): string {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : dflt;
}

function envMinutes(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

/**
 * The crawl identity every guarded content fetch presents. Honest by ruling: a
 * spoofed desktop-Chrome UA is how the scraper could never be named in a site's
 * own robots.txt groups in the first place — an operator wanting to block or
 * specially permit us had no token to write against. Env-overridable so a real
 * bot-info URL or a future dedicated subdomain can replace the default without a
 * code change.
 */
export const ROBOTS_TXT_USER_AGENT = envString(
  "ROBOTS_TXT_USER_AGENT",
  "TraveloureBot/1.0 (+https://traveloure.com/bots)",
);

/**
 * The product token robots.txt group-selection matches against — the part of
 * `ROBOTS_TXT_USER_AGENT` before its first "/". DERIVED, never stated a second
 * time, so overriding the UA string can never leave group matching pointed at
 * the old name (§18 rule 1).
 */
export const ROBOTS_TXT_USER_AGENT_TOKEN = ROBOTS_TXT_USER_AGENT.trim().split("/")[0]!.trim();

/**
 * How long a fetched (or unreachable/not-found) robots.txt answer is trusted
 * before the next scrape of that origin re-fetches it. Per-origin, in-process
 * only — there is no cross-process or persisted cache, so a restart always
 * re-fetches. Default 60 minutes; env-overridable for an operator who wants a
 * tighter or looser window without a deploy.
 */
export const ROBOTS_TXT_CACHE_TTL_MINUTES = envMinutes("ROBOTS_TXT_CACHE_TTL_MINUTES", 60);
export const ROBOTS_TXT_CACHE_TTL_MS = ROBOTS_TXT_CACHE_TTL_MINUTES * 60 * 1000;

/**
 * Per-hop timeout for the robots.txt fetch itself. Deliberately independent of
 * the page-fetch timeout (`EGRESS_TIMEOUT_MS` in `egress-guard.ts`) — a
 * robots.txt should answer fast or not at all, and a slow robots.txt must not
 * hold up a scrape for as long as a slow page would be allowed to.
 */
export const ROBOTS_TXT_FETCH_TIMEOUT_MS = 8_000;

/**
 * RFC 9309 §2.5: a crawler SHOULD parse at least the first 500 KiB of a
 * robots.txt file. We cap reads there rather than trusting the peer's
 * Content-Length.
 */
export const ROBOTS_TXT_MAX_BYTES = 500 * 1024;
