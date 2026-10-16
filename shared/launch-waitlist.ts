// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist. ONE spelling of the body the public
// forms may send, the value sets, the source scheme and the consent wording, read by the server's one writer and
// the client page (§18 rule 1). Table and columns: migration 381 (`launch_waitlist`, `consent_texts`), whose
// column names are the hand-off's Part B "Field names". The visible words are Marketing's F1 copy, word for word.
import { z } from "zod";

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
/** F1's consent line, word for word (both forms), and the privacy link beside it. */
export const WAITLIST_CONSENT_LINE = "Email me when Traveloure opens for Kyoto.";
export const WAITLIST_CONSENT_PRIVACY_LINK = { before: "See our ", label: "Privacy Policy", href: "/privacy", after: "." } as const;
/** The exact text a person saw beside the tick, as stored in `consent_texts.body`. */
export const WAITLIST_CONSENT_TEXT = `${WAITLIST_CONSENT_LINE} See our Privacy Policy (/privacy).`;
