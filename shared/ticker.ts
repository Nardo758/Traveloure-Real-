// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the launch-market ticker. ONE home for the
// item rules, read by the server's one writer (server/services/ticker.service.ts), the admin page and the ribbon
// (§18 rule 1). Table: migration 384 (`ticker_items`).
import { z } from "zod";
import { CLIENT_ROUTES } from "./client-routes.generated";
import { OPERATING_MARKETS } from "./operating-markets";

export const TICKER_TEXT_MAX = 90;
/** Admin help text — the content rule (Part A item 11), enforced by people, so it is said where they edit. */
export const TICKER_CONTENT_RULE =
  "Only things that are true today, for this city. No other cities, no counts, no \"verified\", \"live\" or " +
  "\"daily\", and no exact spots, times or routes — those belong in paid plans.";

/** Marketing's labels (F4), word for word. */
export const TICKER_WAITLIST_BUTTON = (cityName: string) => `Join the ${cityName} waitlist`;
export const TICKER_OPEN_BUTTON = "Start planning";
export const TICKER_LEFT_LABEL = (cityName: string) => `Now in beta in ${cityName}`;

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
