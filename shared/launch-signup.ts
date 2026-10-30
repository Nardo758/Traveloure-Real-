// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the traveler sign-up switch. While the platform is in
// waitlist mode, a first-time TRAVELER sign-up is refused on every path and the person is sent to the launch
// market's waitlist; SUPPLY sign-up (people offering services), existing-account sign-in, QA-tagged accounts and
// admins are never refused. ONE spelling of the mode set, the intent set and the refusal, read by the server's
// gates and by the client (§18 rule 1).
import { z } from "zod";
import { WAITLIST_EXPERT_FORM_PATH, WAITLIST_SERVICE_TYPES } from "./launch-waitlist";

/** platform_settings key; seeded 'waitlist' by migration 381. Leon flips it in admin (audited). */
export const TRAVELER_SIGNUP_MODE_SETTING = "traveler_signup_mode";
/** platform_settings key; seeded 'kyoto' by migration 381. The market the waitlist is for — never a literal. */
export const LAUNCH_MARKET_SLUG_SETTING = "launch_market_slug";
/**
 * LW-1h (ledger `2026-10-16-lw1h-waitlist-retention`; Leon, Oct 16, 2026): the instant traveler sign-up FIRST flipped
 * to "open", as an ISO-8601 UTC string. Written ONLY by the server, in the same transaction as that flip, and never
 * overwritten (a later close-and-reopen keeps the first date). No row = sign-up has never opened. It starts the
 * waitlist's retention clock (shared/launch-waitlist.ts).
 */
export const TRAVELER_SIGNUP_OPENED_AT_SETTING = "traveler_signup_opened_at";

/** The stored opened-at instant, or null when it is absent or not a valid ISO-8601 instant. */
export function parseSignupOpenedAt(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value.trim())) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export const TRAVELER_SIGNUP_MODES = ["waitlist", "open"] as const;
export type TravelerSignupMode = (typeof TRAVELER_SIGNUP_MODES)[number];

/**
 * FAIL CLOSED: only the exact stored value "open" opens traveler sign-up. A missing row, an unreadable row or any
 * other value is "waitlist".
 */
export function parseTravelerSignupMode(value: string | null | undefined): TravelerSignupMode {
  return value === "open" ? "open" : "waitlist";
}

export function isTravelerSignupModeValue(value: unknown): value is TravelerSignupMode {
  return typeof value === "string" && (TRAVELER_SIGNUP_MODES as readonly string[]).includes(value);
}

/** What a sign-up says it is for. `supply` is the only non-traveler value; anything else is a traveler. */
export const SIGNUP_INTENTS = ["traveler", "supply"] as const;
export type SignupIntent = (typeof SIGNUP_INTENTS)[number];

export function normalizeSignupIntent(value: unknown): SignupIntent {
  return value === "supply" ? "supply" : "traveler";
}

/** The refusal code a waitlist-mode traveler sign-up (or purchase) is answered with. */
export const TRAVELER_WAITLIST = "TRAVELER_WAITLIST";

/**
 * What a blocked traveler reads, on every blocked path (email 403, Replit bounce, Facebook bounce). Marketing's
 * exact copy (hand-off answer 7), used word for word; ONE spelling for the server and the waitlist page.
 */
export const TRAVELER_WAITLIST_MESSAGE =
  "Traveloure isn't open for traveler sign-ups yet. Join the Kyoto waitlist to be first to book when Kyoto opens.";
export const TRAVELER_WAITLIST_BUTTON = "Join the Kyoto waitlist";

// ── WL-B (ledger `2026-10-30-wlb-provider-signup-gate`): before launch, providers are the one supply role that may
// create an account; an expert is refused and sent to "Apply Now" on the waitlist. ──────────────────────────────

/** Which supply sign-up this is. Absent = a supply door that names no role (refused before launch). */
export const SUPPLY_SIGNUP_ROLES = ["provider", "expert"] as const;
export type SupplySignupRole = (typeof SUPPLY_SIGNUP_ROLES)[number];
export function normalizeSupplyRole(value: unknown): SupplySignupRole | null {
  return value === "provider" || value === "expert" ? value : null;
}

/**
 * WL-B (Leon, Oct 30, 2026: role-less supply doors close): the supply role a door's return path implies, for a door
 * that states none — the expert application ⇒ expert, the provider application ⇒ provider; anything else ⇒ null.
 */
export function supplyRoleFromPath(path: string | null | undefined): SupplySignupRole | null {
  if (typeof path !== "string") return null;
  const p = path.split(/[?#]/, 1)[0];
  if (p === "/become-expert") return "expert";
  if (p === "/become-provider") return "provider";
  return null;
}

export const EXPERT_APPLY_NOW = "expert_apply_now";
export const PROVIDER_FIELDS_REQUIRED = "provider_fields_required";
/** HELD FOR LEON (FOUNDER WORDING REVIEW on the PR): the refused expert's sentence, carried in the refusal. */
export const EXPERT_APPLY_NOW_MESSAGE = "Expert accounts open at launch. Apply now to join as a local expert.";

const PROVIDER_CATEGORY_KEYS = WAITLIST_SERVICE_TYPES.map((t) => t.key) as [string, ...string[]];
/**
 * WL-B, option (c) (Leon, Oct 30, 2026): a provider sign-up's light fields. Required: business name, category, city
 * (the email is the account's own). Optional: website, languages. Stored on the launch-market waitlist row; the full
 * provider profile is completed later at /become-provider.
 */
export const providerSignupFieldsSchema = z
  .object({
    businessName: z.string().trim().min(1).max(160),
    category: z.enum(PROVIDER_CATEGORY_KEYS),
    city: z.string().trim().min(1).max(120),
    website: z.string().trim().url().max(500).optional(),
    languages: z.string().trim().max(200).optional(),
  })
  .strict();
export type ProviderSignupFields = z.infer<typeof providerSignupFieldsSchema>;

/**
 * WL-B: a social sign-in cannot carry a provider's fields, so a provider who starts one is sent to the email sign-up
 * with its role kept (the screen asks the fields there). The reason rides in the query; no email is in the URL.
 */
export const PROVIDER_EMAIL_SIGNUP_PATH = `/signup?intent=supply&supplyRole=provider&error=${PROVIDER_FIELDS_REQUIRED}`;

/** Where a social sign-in refused by a WL-B reason is sent. */
export function supplyRefusalRedirect(reason: typeof EXPERT_APPLY_NOW | typeof PROVIDER_FIELDS_REQUIRED): string {
  return reason === EXPERT_APPLY_NOW ? WAITLIST_EXPERT_FORM_PATH : PROVIDER_EMAIL_SIGNUP_PATH;
}

export type TravelerSignupDecision =
  | { allowed: true }
  | { allowed: false; code: typeof TRAVELER_WAITLIST }
  | { allowed: false; reason: typeof EXPERT_APPLY_NOW; message: string; applyPath: string }
  | { allowed: false; reason: typeof PROVIDER_FIELDS_REQUIRED };

/**
 * The ONE decision for a first-time account: open mode, supply intent or a QA sign-up (a QA-domain address AND the
 * right code — `qaSignupAllowed`) passes. WL-B: in waitlist mode a supply sign-up is decided by its role — an expert
 * is refused with `expert_apply_now`, a provider passes only with its fields, and a sign-up that names no role is
 * refused `provider_fields_required` (Leon, Oct 30, 2026: the role-less supply doors close).
 */
export function decideFirstTimeSignup(input: {
  mode: TravelerSignupMode;
  intent: SignupIntent;
  qaCodeValid: boolean;
  supplyRole?: SupplySignupRole | null;
  providerFieldsValid?: boolean;
}): TravelerSignupDecision {
  if (input.mode === "open") return { allowed: true };
  if (input.intent === "supply") {
    if (input.qaCodeValid) return { allowed: true };
    if (input.supplyRole === "expert") {
      return { allowed: false, reason: EXPERT_APPLY_NOW, message: EXPERT_APPLY_NOW_MESSAGE, applyPath: WAITLIST_EXPERT_FORM_PATH };
    }
    // A provider passes only with its fields; a supply sign-up that names no role is sent to the provider email path.
    if (input.supplyRole === "provider" && input.providerFieldsValid) return { allowed: true };
    return { allowed: false, reason: PROVIDER_FIELDS_REQUIRED };
  }
  if (input.qaCodeValid) return { allowed: true };
  return { allowed: false, code: TRAVELER_WAITLIST };
}

/**
 * Where a blocked traveler is sent: the launch market's waitlist page with `?blocked=1`. Never carries the email
 * (no address in a URL, no prefill). With no launch market stated, the home page — never a guessed city.
 */
export function waitlistBlockedPath(launchMarketSlug: string | null | undefined): string {
  const slug = typeof launchMarketSlug === "string" ? launchMarketSlug.trim().toLowerCase() : "";
  return /^[a-z0-9-]{1,64}$/.test(slug) ? `/${slug}?blocked=1` : "/";
}
