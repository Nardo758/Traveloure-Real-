// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist. ONE spelling of the body the public
// forms may send, the value sets, the source scheme and the consent wording, read by the server's one writer and
// the client page (§18 rule 1). Table and columns: migration 381 (`launch_waitlist`, `consent_texts`), whose
// column names are the hand-off's Part B "Field names". The visible words are Marketing's F1 copy, word for word.
import { z } from "zod";
import { OPERATING_MARKETS } from "./operating-markets";

/** Who a row is for. Provider rows are never counted as travelers. */
export const WAITLIST_ROLES = ["traveler", "provider"] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number];

/** "What's the trip for?" — stored key → F1 label. */
export const WAITLIST_TRIP_TYPES = [
  { key: "proposal", label: "Proposal" },
  { key: "wedding", label: "Wedding" },
  { key: "foliage", label: "Autumn foliage" },
  { key: "other", label: "Other" },
] as const;
export type WaitlistTripType = (typeof WAITLIST_TRIP_TYPES)[number]["key"];
const TRIP_TYPE_KEYS = WAITLIST_TRIP_TYPES.map((t) => t.key) as [WaitlistTripType, ...WaitlistTripType[]];

/** The provider form's "Type of service" — stored key → F1 label. */
export const WAITLIST_SERVICE_TYPES = [
  { key: "guide_planner", label: "Local guide / trip planner" },
  { key: "transport", label: "Driver / transport" },
  { key: "experience", label: "Experience or activity" },
  { key: "wedding_proposal", label: "Wedding / proposal services" },
  { key: "accommodation", label: "Accommodation" },
  { key: "other", label: "Other" },
] as const;
export type WaitlistServiceType = (typeof WAITLIST_SERVICE_TYPES)[number]["key"];
const SERVICE_TYPE_KEYS = WAITLIST_SERVICE_TYPES.map((t) => t.key) as [WaitlistServiceType, ...WaitlistServiceType[]];

export const WAITLIST_WORRY_MAX = 500;

/**
 * The source scheme (hand-off "Field names"): `<market>_waitlist_page` or `<market>_blog_cta:<post-slug>`, where
 * `<market>` is the launch market's slug with `-` as `_` (Kyoto: `kyoto_waitlist_page`). The market comes from the
 * `launch_market_slug` setting, never a literal. Anything that does not match is stored as the page's own value.
 */
function marketSourcePrefix(marketSlug: string): string {
  return marketSlug.trim().toLowerCase().replace(/-/g, "_");
}
export function waitlistPageSource(marketSlug: string): string {
  return `${marketSourcePrefix(marketSlug)}_waitlist_page`;
}
export function blogCtaSource(marketSlug: string, postSlug: string): string | null {
  const slug = typeof postSlug === "string" ? postSlug.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,150}$/.test(slug)) return null;
  return `${marketSourcePrefix(marketSlug)}_blog_cta:${slug}`;
}
export function normalizeWaitlistSource(value: unknown, marketSlug: string): string {
  const page = waitlistPageSource(marketSlug);
  if (typeof value !== "string") return page;
  const v = value.trim().toLowerCase();
  if (v === page) return page;
  const prefix = `${marketSourcePrefix(marketSlug)}_blog_cta:`;
  if (v.startsWith(prefix)) return blogCtaSource(marketSlug, v.slice(prefix.length)) ?? page;
  return page;
}

/** The source a sign-up credited to an expert's short link carries (LW-1d). Set by the server, never by the body. */
export const WAITLIST_EXPERT_LINK_SOURCE = "expert_link";

/** Trimmed, lower-cased — the identity the UNIQUE (email, market_slug) index keys on. */
export function normalizeWaitlistEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** F1's email error, the one message the form shows for a refused body. */
export const WAITLIST_EMAIL_ERROR = "Please enter a valid email address.";

/**
 * The public forms' body — an ALLOWLIST (§19), `.strict()` so an unknown key is refused, never silently kept.
 * `homepage` is the honeypot (not `website`, which is a provider column): a person never sees or fills it; a
 * non-empty value is answered like a success and nothing is written. No market, referrer, role default or
 * consent timestamp is ever taken from anywhere but here and the server.
 * A traveler may answer `tripType`, `roughMonth` (YYYY-MM) and `worry`; a provider must give `contactName` and
 * `serviceType` and may give `businessName`. The other role's fields are refused, never stored.
 * `ref` (LW-1d) is the RAW short-link code the visitor arrived with, nothing more: the server resolves it against
 * `short_links` and credits the link's owner only when they authored the linked Ready-Made Trip. A referrer id is
 * never accepted from the body.
 * `market` (LW-2) is the ONE city the person picked, as an `OPERATING_MARKETS` key; absent means the launch market.
 * A key outside that list is refused 400 `UNKNOWN_MARKET` by the route (`resolveWaitlistMarket`).
 */
export const waitlistJoinBodySchema = z
  .object({
    role: z.enum(WAITLIST_ROLES).optional(),
    email: z.string().trim().email().max(254),
    consent: z.boolean().optional(),
    source: z.string().max(200).optional(),
    tripType: z.enum(TRIP_TYPE_KEYS).optional(),
    roughMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    worry: z.string().max(WAITLIST_WORRY_MAX).optional(),
    contactName: z.string().trim().min(1).max(120).optional(),
    businessName: z.string().trim().max(160).optional(),
    serviceType: z.enum(SERVICE_TYPE_KEYS).optional(),
    ref: z.string().max(40).optional(),
    market: z.string().trim().toLowerCase().max(64).optional(),
    // LC-1b: the optional free-text answer to "Planning somewhere else? Tell us where." Stored on `area`.
    otherCity: z.string().trim().max(120).optional(),
    homepage: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const role = b.role ?? "traveler";
    if (role === "provider") {
      if (!b.contactName) ctx.addIssue({ code: "custom", path: ["contactName"], message: "required" });
      if (!b.serviceType) ctx.addIssue({ code: "custom", path: ["serviceType"], message: "required" });
      for (const k of ["tripType", "roughMonth", "worry"] as const) {
        if (b[k] !== undefined) ctx.addIssue({ code: "custom", path: [k], message: "traveler field" });
      }
    } else {
      for (const k of ["contactName", "businessName", "serviceType"] as const) {
        if (b[k] !== undefined) ctx.addIssue({ code: "custom", path: [k], message: "provider field" });
      }
    }
  });
export type WaitlistJoinBody = z.infer<typeof waitlistJoinBodySchema>;

/** The consent wording's key and version. A wording change is a new version, never an edit (migration 381). */
export const WAITLIST_CONSENT_KEY = "launch_waitlist_updates";
export const WAITLIST_CONSENT_VERSION = "f1-2026-10-15";
/** Kyoto's consent line (LC-1b). A wording change is a new version, never an edit of `f1-2026-10-15`. */
export const WAITLIST_CONSENT_LINE = "Join the Kyoto list";
/** The version stored when someone ticks the Kyoto line. Other markets keep `f1-2026-10-15:<market>`. */
export const WAITLIST_KYOTO_CONSENT_VERSION = "lc1b-2026-10-20:kyoto";
export const WAITLIST_CONSENT_PRIVACY_LINK = { before: "See our ", label: "Privacy Policy", href: "/privacy", after: "." } as const;
/** The exact text a person saw beside the tick, as stored in `consent_texts.body`. */
export const WAITLIST_CONSENT_TEXT = `${WAITLIST_CONSENT_LINE} See our Privacy Policy (/privacy).`;

/**
 * LW-1e (ledger `2026-10-16-lw1e-waitlist-admin`): a row whose address is on the QA domain is a QA row — flagged
 * `is_qa`, left out of the admin counts and of the default export. Until a migration gives the table a stored
 * `is_qa` column, the flag is COMPUTED from the address by this one rule (and its SQL twin in the service), so a row
 * is QA from the moment it is inserted.
 */
export const WAITLIST_QA_EMAIL_DOMAIN = "traveloure-qa.test";
export function isWaitlistQaEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && normalizeWaitlistEmail(email).endsWith(`@${WAITLIST_QA_EMAIL_DOMAIN}`);
}

/** Admin search: at least this many characters, at most this many rows back. */
/**
 * LW-1h (ledger `2026-10-16-lw1h-waitlist-retention`; Leon, Oct 16, 2026): a waitlist row that never became an
 * account is deleted once 12 months have passed since traveler sign-up first opened (`traveler_signup_opened_at`)
 * AND 12 months have passed since the row was created — whichever is later (LW-1f-b per-row floor, issue #1486).
 * Before sign-up opens there is no clock and nothing is deleted.
 */
export const WAITLIST_RETENTION_MONTHS = 12;

/** The instant retention deletion becomes due: the opening instant plus the retention months (UTC calendar months). */
export function waitlistRetentionDueAt(openedAt: Date): Date {
  const due = new Date(openedAt.getTime());
  const day = due.getUTCDate();
  due.setUTCDate(1);
  due.setUTCMonth(due.getUTCMonth() + WAITLIST_RETENTION_MONTHS);
  const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
  due.setUTCDate(Math.min(day, lastDay));
  return due;
}

export const WAITLIST_SEARCH_MIN_CHARS = 3;
export const WAITLIST_SEARCH_LIMIT = 50;

// ── LW-2 (ledger `2026-10-16-lw2-all-markets-waitlist`; Leon, Oct 16, 2026: "the waitlist needs to cover all the
// markets"). Kyoto stays the launch market and the headline; this is a waitlist only, not a launch. ──────────────

/** The refusal code for a `market` that is not an operating market. */
export const WAITLIST_UNKNOWN_MARKET = "UNKNOWN_MARKET";

/** The cities a person may pick: `OPERATING_MARKETS`, in its own order — never a second list (§18 rule 1). */
export const WAITLIST_MARKET_OPTIONS: readonly { key: string; city: string }[] = OPERATING_MARKETS.map((m) => ({
  key: m.marketKey,
  city: m.cityName,
}));

export function waitlistCityName(marketKey: string): string | null {
  return WAITLIST_MARKET_OPTIONS.find((m) => m.key === marketKey)?.city ?? null;
}

/**
 * The market a submission is for: absent ⇒ the launch market; an operating-market key ⇒ that market; anything else
 * ⇒ `unknown` (the route answers 400 UNKNOWN_MARKET). One city per submission.
 */
export function resolveWaitlistMarket(
  raw: string | undefined,
  launchMarketSlug: string,
): { ok: true; market: string } | { ok: false; code: typeof WAITLIST_UNKNOWN_MARKET } {
  if (raw === undefined || raw === "") return { ok: true, market: launchMarketSlug };
  return waitlistCityName(raw) ? { ok: true, market: raw } : { ok: false, code: WAITLIST_UNKNOWN_MARKET };
}

/**
 * Consent is per city: the tick covers only the city shown beside it. Each market has its own `consent_texts` row,
 * version `f1-2026-10-15:<market>`, and a waitlist row names the version it was shown. The F1 copy was written for
 * Kyoto, so Kyoto keeps F1's line word for word; every other city reads "Email me when Traveloure opens in <city>."
 * (Rows that consented before LW-2 keep the bare `f1-2026-10-15`, the Kyoto wording they saw.)
 */
const F1_COPY_MARKET = "kyoto";
export function waitlistConsentVersion(marketKey: string): string {
  if (marketKey === F1_COPY_MARKET) return WAITLIST_KYOTO_CONSENT_VERSION;
  return `${WAITLIST_CONSENT_VERSION}:${marketKey}`;
}
export function waitlistConsentLine(marketKey: string): string {
  if (marketKey === F1_COPY_MARKET) return WAITLIST_CONSENT_LINE;
  return `Email me when Traveloure opens in ${waitlistCityName(marketKey) ?? marketKey}.`;
}
export function waitlistConsentText(marketKey: string): string {
  return `${waitlistConsentLine(marketKey)} See our Privacy Policy (/privacy).`;
}

/** The page's words for a city other than Kyoto. Never "be first to book", no dates, no experts or providers. */
export const WAITLIST_OTHER_CITY_PROMPT = "Planning somewhere else? Tell us where.";
export function waitlistOtherCityJoinButton(city: string): string {
  return `Join the ${city} waitlist`;
}
export function waitlistOtherCityDone(city: string, consented: boolean): string {
  return consented ? `We'll email you when Traveloure opens in ${city}.` : `You're on the ${city} waitlist.`;
}
export function waitlistOtherCityProviderLine(city: string): string {
  return `Know ${city}? Send us your details and we'll be in touch when we open there.`;
}
export function waitlistOtherCityProviderDone(city: string): string {
  return `Thanks, we've got your details. We'll be in touch when we open in ${city}.`;
}
