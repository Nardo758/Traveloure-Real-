// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the launch-market ticker. ONE home for the
// item rules, read by the server's one writer (server/services/ticker.service.ts), the admin page and the ribbon
// (§18 rule 1). Table: migration 384 (`ticker_items`).
import { z } from "zod";
import { CLIENT_ROUTES } from "./client-routes.generated";
import { OPERATING_MARKETS } from "./operating-markets";

export const TICKER_TEXT_MAX = 90;
/**
 * Admin help text — the content rule (Part A item 11, amended by LW-1f-b, issue #1486), enforced by people, so it is
 * said where they edit. Product Bot's wording, word for word.
 */
export const TICKER_CONTENT_RULE =
  "Only things that are true today. Call a city 'in beta' only if it's on the beta list. Other operating cities " +
  "may be named as next or, once their waitlist is live, as waitlist open. No counts, no \"verified\", \"live\" " +
  "or \"daily\", and no exact spots, times or routes. Those belong in paid plans.";

/** Marketing's labels (F4), word for word. */
export const TICKER_WAITLIST_BUTTON = (cityName: string) => `Join the ${cityName} waitlist`;
export const TICKER_OPEN_BUTTON = "Start planning";

/**
 * LW-1f-b (ledger `2026-10-16-lw1f-b-beta-cities`, issue #1486): the cities that may be called "in beta". A MANUAL
 * setting Leon switches per city in admin — never worked out from listings, supply or counts. Stored in
 * `platform_settings.beta_market_slugs` as a JSON array of `OPERATING_MARKETS` keys. Absent, unreadable or empty ⇒
 * the launch market alone, so Kyoto is beta today with no row and no migration.
 */
export const BETA_MARKET_SLUGS_SETTING = "beta_market_slugs";
export const BETA_MARKET_SLUGS_HELP = "Switch a city on by hand, only once it has experts or providers live.";

/** The refusal for a value an admin tries to save, or null when it is a valid list. */
export function betaMarketSlugsRefusal(value: unknown): string | null {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    return `${BETA_MARKET_SLUGS_SETTING} must be a JSON array of market keys`;
  }
  if (!Array.isArray(parsed)) return `${BETA_MARKET_SLUGS_SETTING} must be a JSON array of market keys`;
  const seen = new Set<string>();
  for (const key of parsed) {
    if (typeof key !== "string" || !OPERATING_MARKETS.some((m) => m.marketKey === key)) {
      return `unknown market: ${String(key)}`;
    }
    if (seen.has(key)) return `duplicate market: ${key}`;
    seen.add(key);
  }
  return null;
}

/**
 * The beta market keys, in the stored order: the stored list when it is a valid non-empty list, else the launch
 * market alone (else nothing, when the launch market names no operating market). Unknown keys in a stored value are
 * dropped rather than shown (§13).
 */
export function betaMarketSlugs(stored: string | null | undefined, launchMarketSlug: string | null | undefined): string[] {
  let keys: string[] = [];
  if (typeof stored === "string") {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        keys = parsed.filter((k, i): k is string =>
          typeof k === "string" && parsed.indexOf(k) === i && OPERATING_MARKETS.some((m) => m.marketKey === k));
      }
    } catch {
      keys = [];
    }
  }
  if (keys.length > 0) return keys;
  return launchMarketSlug && OPERATING_MARKETS.some((m) => m.marketKey === launchMarketSlug) ? [launchMarketSlug] : [];
}

/** City names for the beta keys, in order. */
export function betaCityNames(slugs: readonly string[]): string[] {
  return slugs.map((k) => OPERATING_MARKETS.find((m) => m.marketKey === k)?.cityName).filter((n): n is string => !!n);
}

/**
 * THE ONE beta label (the ribbon now; the CP-2 hero pill later): "Now in beta in Kyoto", "Now in beta in Kyoto and
 * Goa", "Now in beta in Kyoto, Goa and Porto". The cities are named, never counted. An empty list falls back to the
 * launch city; with neither there is no label (null).
 */
export function betaLabel(cityNames: readonly string[], launchCityName?: string | null): string | null {
  const names = cityNames.length > 0 ? [...cityNames] : launchCityName ? [launchCityName] : [];
  if (names.length === 0) return null;
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Now in beta in ${joined}`;
}

/** What the public read returns per item: text and href only (Part A item 3). */
export interface PublicTickerItem {
  text: string;
  href: string | null;
}

/**
 * A ticker href is NULL (no link) or a RELATIVE INTERNAL path: one leading `/`, never `//`, no scheme, no
 * backslash, no whitespace. Returns the path part (no query or hash) when it is that shape, else null.
 */
export function internalPathOf(href: string): string | null {
  if (typeof href !== "string") return null;
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  if (/[\s\\]/.test(href) || /^\/[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const pathPart = href.split(/[?#]/, 1)[0];
  if (pathPart.length === 0 || pathPart.length > 300) return null;
  return pathPart;
}

/** True when `pathPart` matches a route in the committed client route list (`:param` = one non-empty segment). */
export function isClientRoutePath(pathPart: string, routes: readonly string[] = CLIENT_ROUTES): boolean {
  const segs = pathPart.replace(/\/+$/, "").split("/");
  if (segs.length === 0) return false;
  return routes.some((route) => {
    const r = route.replace(/\/+$/, "").split("/");
    if (r.length !== segs.length) return false;
    return r.every((part, i) => (part.startsWith(":") ? segs[i].length > 0 : part === segs[i]));
  });
}

/** The post slug when `href` links a blog post (`/blog/<slug>`), else null. */
export function blogSlugOf(href: string | null | undefined): string | null {
  if (!href) return null;
  const pathPart = internalPathOf(href);
  const m = pathPart ? /^\/blog\/([^/]+)$/.exec(pathPart) : null;
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Why an href is refused at save, or null when it is allowed (publication is checked separately). */
export function hrefRefusal(href: string | null, routes: readonly string[] = CLIENT_ROUTES): string | null {
  if (href === null) return null;
  const pathPart = internalPathOf(href);
  if (!pathPart) return "A link must be a path on this site that starts with /, like /kyoto. Outside links are not allowed.";
  if (!isClientRoutePath(pathPart, routes)) return `${pathPart} is not a page on this site.`;
  return null;
}

const nullableDate = z.union([z.string().datetime({ offset: true }), z.null()]);

/** The admin create body — an ALLOWLIST (§19), `.strict()`. Market, order, author and timestamps are the server's. */
export const tickerItemCreateSchema = z
  .object({
    text: z.string().trim().min(1).max(TICKER_TEXT_MAX),
    href: z.union([z.string().trim().min(1).max(300), z.null()]).optional(),
    active: z.boolean().optional(),
    startsAt: nullableDate.optional(),
    endsAt: nullableDate.optional(),
  })
  .strict();
export type TickerItemCreate = z.infer<typeof tickerItemCreateSchema>;

/** The admin edit body: the same fields, every one optional; at least one must be sent. */
export const tickerItemPatchSchema = tickerItemCreateSchema
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change." });
export type TickerItemPatch = z.infer<typeof tickerItemPatchSchema>;

/** The admin reorder body: every item id of the market, in the new order. */
export const tickerReorderSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) }).strict();

/**
 * The launch market's city name, looked up from its slug (platform_settings.launch_market_slug). NULL when the slug
 * names no operating market: the ribbon then shows nothing rather than a made-up name (§13).
 */
export function launchCityName(launchMarketSlug: string | null | undefined): string | null {
  if (!launchMarketSlug) return null;
  return OPERATING_MARKETS.find((m) => m.marketKey === launchMarketSlug)?.cityName ?? null;
}

/**
 * E-7 (ruling, Nov 5, 2026): the ONE launch-market resolver. The first candidate that names an operating market wins
 * (the settings read, then the signup-mode read). With `fallbackToMarquee`, an unresolved setting resolves to the
 * marquee fallback — the first operating market, as `/places` already does (`shared/places-path.ts`) — so a listing
 * surface (the landing strip, the date-step picker) is never emptied by a missing or unreadable setting. Without it,
 * an unresolved setting is null: a surface that CLAIMS something about the market (a "Now live in …" pill) keeps
 * showing nothing rather than a guessed city.
 */
export function resolveLaunchMarket(
  candidates: ReadonlyArray<string | null | undefined>,
  opts: { fallbackToMarquee: boolean },
): { slug: string; cityName: string } | null {
  for (const c of candidates) {
    const slug = c?.trim().toLowerCase() || null;
    const cityName = launchCityName(slug);
    if (slug && cityName) return { slug, cityName };
  }
  if (!opts.fallbackToMarquee) return null;
  const m = OPERATING_MARKETS[0];
  return m ? { slug: m.marketKey, cityName: m.cityName } : null;
}

/**
 * The ribbon's right button follows the traveler sign-up switch (Part A item 6): in `waitlist` mode it goes to the
 * launch market's waitlist page; in `open` mode it starts planning in that city. An unknown mode is waitlist
 * (the switch reads fail-closed).
 */
export type TickerButton =
  | { kind: "waitlist"; label: string; href: string }
  | { kind: "plan"; label: string; city: string };
export function tickerButton(mode: string | null | undefined, launchMarketSlug: string, cityName: string): TickerButton {
  if (mode === "open") return { kind: "plan", label: TICKER_OPEN_BUTTON, city: cityName };
  return { kind: "waitlist", label: TICKER_WAITLIST_BUTTON(cityName), href: `/${launchMarketSlug}` };
}

// ── WAIT-1 (ledger `2026-11-04-wait1-all-markets`): market status from settings ──────────────────────────────
/**
 * Which operating markets are LIVE (`platform_settings.live_market_slugs`, a JSON array of market keys). Absent,
 * unreadable or empty ⇒ none: no market is live until an admin says so. The marquee market is NOT live by being
 * the marquee — it is Beta (above) until listed here.
 */
export const LIVE_MARKET_SLUGS_SETTING = "live_market_slugs";
/** A market's launch month (`platform_settings.market_launch_dates`, a JSON object of market key → "YYYY-MM"). */
export const MARKET_LAUNCH_DATES_SETTING = "market_launch_dates";

/** The refusal for a live list an admin tries to save, or null when valid (same shape as the beta list). */
export function liveMarketSlugsRefusal(value: unknown): string | null {
  const refusal = betaMarketSlugsRefusal(value);
  return refusal ? refusal.replace(BETA_MARKET_SLUGS_SETTING, LIVE_MARKET_SLUGS_SETTING) : null;
}

/** The live market keys, in stored order. Absent, unreadable or empty ⇒ [] (never a guessed market). */
export function liveMarketSlugs(stored: string | null | undefined): string[] {
  if (typeof stored !== "string") return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k, i): k is string =>
      typeof k === "string" && parsed.indexOf(k) === i && OPERATING_MARKETS.some((m) => m.marketKey === k));
  } catch {
    return [];
  }
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The refusal for launch dates an admin tries to save, or null when valid: an object of operating key → "YYYY-MM". */
export function marketLaunchDatesRefusal(value: unknown): string | null {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    return `${MARKET_LAUNCH_DATES_SETTING} must be a JSON object of market key to YYYY-MM`;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return `${MARKET_LAUNCH_DATES_SETTING} must be a JSON object of market key to YYYY-MM`;
  }
  for (const [key, month] of Object.entries(parsed as Record<string, unknown>)) {
    if (!OPERATING_MARKETS.some((m) => m.marketKey === key)) return `unknown market: ${key}`;
    if (typeof month !== "string" || !MONTH_RE.test(month)) return `${key}: the launch date must be YYYY-MM`;
  }
  return null;
}

/** The launch months by market key. Absent, unreadable or not an object ⇒ {}; a bad entry is dropped, not guessed. */
export function marketLaunchDates(stored: string | null | undefined): Record<string, string> {
  if (typeof stored !== "string") return {};
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, month] of Object.entries(parsed as Record<string, unknown>)) {
      if (OPERATING_MARKETS.some((m) => m.marketKey === key) && typeof month === "string" && MONTH_RE.test(month)) out[key] = month;
    }
    return out;
  } catch {
    return {};
  }
}

export type MarketStatus = "live" | "beta" | "opening" | "waitlist";

export interface MarketStatusSettings {
  /** The marquee market (`launch_market_slug`), or null. */
  launch: string | null;
  live: readonly string[];
  beta: readonly string[];
  dates: Readonly<Record<string, string>>;
}

/** ONE answer to "what is this market's status": live, else beta, else opening (a launch month is set), else waitlist. */
export function marketStatus(slug: string, s: MarketStatusSettings): MarketStatus {
  if (s.live.includes(slug)) return "live";
  if (s.beta.includes(slug)) return "beta";
  if (s.dates[slug]) return "opening";
  return "waitlist";
}

/**
 * The status labels (Marketing row 14). HELD for "Wording approved — Leon". Never the word "coming"; a launch
 * month is shown only when an admin set one.
 */
export const MARKET_STATUS_COPY = {
  live: "Live",
  beta: "Beta",
  opening: (monthYear: string) => `Opening ${monthYear}`,
  waitlist: "Join the waitlist",
} as const;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2027-03" → "March 2027"; anything else ⇒ null. */
export function monthYearLabel(month: string | null | undefined): string | null {
  const m = MONTH_RE.exec(month ?? "");
  if (!m) return null;
  return `${MONTH_NAMES[Number(month!.slice(5, 7)) - 1]} ${month!.slice(0, 4)}`;
}

/** The label for a market's status. */
export function marketStatusLabel(slug: string, s: MarketStatusSettings): string {
  const status = marketStatus(slug, s);
  if (status === "opening") {
    const label = monthYearLabel(s.dates[slug]);
    return label ? MARKET_STATUS_COPY.opening(label) : MARKET_STATUS_COPY.waitlist;
  }
  return MARKET_STATUS_COPY[status];
}

/**
 * CITY-1 (ledger `2026-11-04-city1-marquee-defaults`; Leon, Nov 3: "only the marquee market runs the full planner"):
 * a market is OPEN — it runs the full planner — when it is the marquee (`launch`) or an admin listed it as live. Beta
 * alone does not open a market. ONE predicate, read by the server's trip-mint refusal and every picker (§18 rule 1).
 */
export function marketIsOpen(slug: string | null | undefined, s: MarketStatusSettings): boolean {
  if (!slug) return false;
  return s.launch === slug || s.live.includes(slug);
}

/**
 * CITY-1: the order every city picker shows: the marquee first, then live and beta markets, then the rest, each group
 * in `OPERATING_MARKETS` order. Only operating markets are returned.
 */
export function marketPickerOrder(s: MarketStatusSettings): string[] {
  const keys = OPERATING_MARKETS.map((m) => m.marketKey);
  const rank = (k: string) => (k === s.launch ? 0 : s.live.includes(k) || s.beta.includes(k) ? 1 : 2);
  return keys
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map(({ k }) => k);
}

/**
 * The hero pill for the marquee market (HELD): "Now live in {city}" when it is live, else "Now in beta in {city}".
 * No marquee market ⇒ no pill (null).
 */
export const HERO_PILL_COPY = {
  live: (city: string) => `Now live in ${city}`,
  beta: (city: string) => `Now in beta in ${city}`,
  elsewhere: "Planning a trip somewhere else? See all markets",
} as const;

export function heroMarketPill(s: MarketStatusSettings): string | null {
  const city = launchCityName(s.launch);
  if (!city || !s.launch) return null;
  return s.live.includes(s.launch) ? HERO_PILL_COPY.live(city) : HERO_PILL_COPY.beta(city);
}
