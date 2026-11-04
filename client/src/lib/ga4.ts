/**
 * TG-1 (ledger `2026-11-03-tg1-ga4-tag`): the GA4 tag. Env-gated, Consent Mode v2 region-scoped, manual
 * sanitised page views on traveler surfaces only, and a closed list of three events.
 *
 * This is NOT `lib/analytics.ts` — that file is the in-house tracking (sendBeacon to our own API) and is
 * untouched. Nothing here reads `document.title`, the full URL, a query string, a user id, an email, a
 * price or any plan content; invite and shared-trip tokens never leave the browser.
 *
 * TG-1b: gtag fills `page_location` (the `dl` hit parameter) from the raw `document.location` unless told
 * otherwise, so the config call and every page view and event set it to origin + sanitizePath(pathname) —
 * no query, no hash, no token. `page_referrer` (`dr`) gets the same treatment when the referrer is on our own
 * origin; a referrer from another site is passed through unchanged.
 *
 * `VITE_GA_MEASUREMENT_ID` unset or malformed ⇒ no script tag, no dataLayer write, no `window.gtag`, no network.
 * Consent: every ad_* signal denied everywhere; analytics_storage denied by default in the EEA/UK/CH (plus
 * IS/LI/NO) and granted elsewhere. `grantAnalyticsConsent()` is for the consent banner (CB-1); nothing calls it yet.
 */
import { PLAN_DOORS } from "@shared/slip-funnel-events";
import { OCCASION_GROUP_ORDER } from "@shared/experience-group";

export const GA4_ID_SHAPE = /^G-[A-Z0-9]{6,12}$/;
export const GA4_SCRIPT_HOST = "https://www.googletagmanager.com";

/** EEA 27 + GB, CH, IS, LI, NO: analytics_storage denied by default here. */
export const GA4_DENIED_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH", "IS", "LI", "NO",
] as const;

const ADS_DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" } as const;

// ── Pure: paths, titles, surfaces ──────────────────────────────────────────────────────────────

/** Path segments that carry a token: the token segment becomes ":token". */
export const TOKEN_PATH_RULES: ReadonlyArray<{ prefix: string[]; label: string }> = [
  { prefix: ["invite"], label: ":token" },
  { prefix: ["trips", "shared"], label: ":token" },
  { prefix: ["saved", "shared"], label: ":token" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID = /^[0-9a-f]{16,}$/i;
/** A long opaque segment: 16+ of [A-Za-z0-9_] (no hyphens, so readable slugs survive) with a letter and a digit. */
const OPAQUE_ID = /^(?=[A-Za-z0-9_]*[0-9])(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{16,}$/;

/** Is this path segment an id (uuid, 16+ hex, or a 16+ opaque token)? */
export function isIdSegment(seg: string): boolean {
  return UUID.test(seg) || HEX_ID.test(seg) || OPAQUE_ID.test(seg);
}

/** Pure. The path GA sees: tokens and ids replaced, query and hash dropped. */
export function sanitizePath(pathname: string): string {
  const path = String(pathname ?? "").split(/[?#]/)[0] || "/";
  const segs = path.split("/").filter((s) => s.length > 0);
  for (const rule of TOKEN_PATH_RULES) {
    const n = rule.prefix.length;
    if (segs.length > n && rule.prefix.every((p, i) => segs[i] === p)) segs[n] = rule.label;
  }
  const out = segs.map((s) => (s === ":token" ? s : isIdSegment(s) ? ":id" : s));
  return "/" + out.join("/");
}

/** Static route names — analytics labels, never `document.title`. First match wins. */
export const ROUTE_TITLE_RULES: ReadonlyArray<{ test: RegExp; title: string }> = [
  { test: /^\/$/, title: "Landing" },
  { test: /^\/kyoto$/, title: "Waitlist" },
  { test: /^\/waitlist(\/[^/]+)?$/, title: "Waitlist" },
  { test: /^\/discover(\/|$|-)/, title: "Discover" },
  { test: /^\/plans\/[^/]+\/compare\/[^/]+$/, title: "Versions" },
  { test: /^\/itinerary-comparison\/[^/]+$/, title: "Versions" },
  { test: /^\/plans\/[^/]+$/, title: "Plan" },
  { test: /^\/trip\/[^/]+$/, title: "Trip Card" },
  { test: /^\/invite\/[^/]+$/, title: "Invite" },
  { test: /^\/trips\/shared\/[^/]+$/, title: "Shared trip" },
];

/** Pure. The page title GA sees for a path; "Other" when no rule matches. */
export function routeTitle(pathname: string): string {
  const p = sanitizePath(pathname);
  return ROUTE_TITLE_RULES.find((r) => r.test.test(p))?.title ?? "Other";
}

const CONSOLE_PREFIXES = ["admin", "expert", "provider", "backoffice", "internal", "api"];

/** Pure. False for the console and API prefixes: GA hears nothing from them. */
export function isTravelerSurface(pathname: string): boolean {
  const first = String(pathname ?? "").split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "";
  return !CONSOLE_PREFIXES.includes(first);
}

// ── The closed event list ──────────────────────────────────────────────────────────────────────

export const GA4_EVENTS = {
  waitlist_signup: { market: ["kyoto"] },
  plan_started: { door: PLAN_DOORS, group: OCCASION_GROUP_ORDER },
  quick_draft: {},
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type Ga4EventName = keyof typeof GA4_EVENTS;

/** Pure. The params an event may send: declared keys only, enum values only; everything else is dropped. */
export function allowedParams(name: string, params?: Record<string, unknown>): { ok: boolean; params: Record<string, string>; dropped: string[] } {
  const spec = (GA4_EVENTS as Record<string, Record<string, readonly string[]>>)[name];
  if (!spec) return { ok: false, params: {}, dropped: Object.keys(params ?? {}) };
  const out: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    const allowed = spec[k];
    if (allowed && typeof v === "string" && allowed.includes(v)) out[k] = v;
    else dropped.push(k);
  }
  return { ok: true, params: out, dropped };
}

// ── Browser calls (injectable for tests) ───────────────────────────────────────────────────────

type Ga4Window = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; location?: { origin?: string; pathname?: string } };
type Ga4Document = { createElement: (tag: string) => any; head: { appendChild: (el: any) => unknown }; referrer?: string };

let state: { win: Ga4Window; doc: Ga4Document; id: string } | null = null;

/** Pure. The page_location GA sees: origin + the sanitised path; no query, no hash. */
export function sanitizedLocation(origin: string | undefined, pathname: string): string {
  return `${origin ?? ""}${sanitizePath(pathname)}`;
}

function currentLocation(win: Ga4Window, pathname?: string): string {
  return sanitizedLocation(win.location?.origin, pathname ?? win.location?.pathname ?? "/");
}

/** Pure. A same-origin referrer becomes origin + the sanitised path; any other referrer is unchanged. */
export function sanitizedReferrer(origin: string | undefined, referrer: string): string {
  if (!origin || !referrer) return referrer;
  try {
    const u = new URL(referrer);
    return u.origin === origin ? sanitizedLocation(origin, u.pathname) : referrer;
  } catch {
    return referrer;
  }
}

/** The page fields every hit carries: page_location always, page_referrer only when the browser has one. */
function pageFields(win: Ga4Window, doc: Ga4Document, pathname?: string): Record<string, string> {
  const out: Record<string, string> = { page_location: currentLocation(win, pathname) };
  const ref = doc.referrer ?? "";
  if (ref) out.page_referrer = sanitizedReferrer(win.location?.origin, ref);
  return out;
}
let lastPath: string | null = null;
let warned = false;

function readEnvId(): string | undefined {
  try {
    return (import.meta as any).env?.VITE_GA_MEASUREMENT_ID;
  } catch {
    return undefined;
  }
}

/** Load the tag. A falsy or malformed id is a silent no-op. */
export function initGa4(opts: { id?: string; win?: Ga4Window; doc?: Ga4Document } = {}): boolean {
  const id = opts.id !== undefined ? opts.id : readEnvId();
  if (!id || !GA4_ID_SHAPE.test(id)) return false;
  const win = opts.win ?? (typeof window !== "undefined" ? (window as unknown as Ga4Window) : undefined);
  const doc = opts.doc ?? (typeof document !== "undefined" ? (document as unknown as Ga4Document) : undefined);
  if (!win || !doc) return false;
  win.dataLayer = win.dataLayer ?? [];
  // The standard gtag shim: it pushes the arguments object.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    (win.dataLayer as unknown[]).push(arguments);
  };
  win.gtag("consent", "default", { ...ADS_DENIED, analytics_storage: "denied", region: [...GA4_DENIED_REGIONS], wait_for_update: 500 });
  win.gtag("consent", "default", { ...ADS_DENIED, analytics_storage: "granted" });
  const s = doc.createElement("script");
  s.async = true;
  s.src = `${GA4_SCRIPT_HOST}/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(s);
  win.gtag("js", new Date());
  win.gtag("config", id, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...pageFields(win, doc),
  });
  state = { win, doc, id };
  lastPath = null;
  return true;
}

/** A sanitised page view, traveler surfaces only; consecutive identical paths are sent once. */
export function trackPageView(pathname: string): void {
  if (!state || !isTravelerSurface(pathname)) return;
  const page_path = sanitizePath(pathname);
  if (page_path === lastPath) return;
  lastPath = page_path;
  state.win.gtag?.("event", "page_view", { page_path, page_title: routeTitle(pathname), ...pageFields(state.win, state.doc, pathname) });
}

/** One of the three allowlisted events, with its declared enum params only. */
export function trackEvent(name: Ga4EventName | string, params?: Record<string, unknown>): void {
  const r = allowedParams(name, params);
  if (r.dropped.length && !warned && (import.meta as any).env?.DEV) {
    warned = true;
    console.warn(`[ga4] dropped ${r.ok ? `params ${r.dropped.join(", ")} on ${name}` : `unknown event ${name}`}`);
  }
  if (!state || !r.ok) return;
  state.win.gtag?.("event", name, { ...r.params, ...pageFields(state.win, state.doc) });
}

/** For the consent banner (CB-1). */
export function grantAnalyticsConsent(): void {
  state?.win.gtag?.("consent", "update", { analytics_storage: "granted" });
}

/** For the consent banner (CB-1): the visitor chose No thanks. */
export function denyAnalyticsConsent(): void {
  state?.win.gtag?.("consent", "update", { analytics_storage: "denied" });
}

/** CB-1: is the tag loaded? The banner never shows when it is not. */
export function isGa4Loaded(): boolean {
  return state !== null;
}

/** Tests only: forget the loaded tag. */
export function resetGa4ForTests(): void {
  state = null;
  lastPath = null;
  warned = false;
}
