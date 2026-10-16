// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the traveler sign-up switch. While the platform is in
// waitlist mode, a first-time TRAVELER sign-up is refused on every path and the person is sent to the launch
// market's waitlist; SUPPLY sign-up (people offering services), existing-account sign-in, QA-tagged accounts and
// admins are never refused. ONE spelling of the mode set, the intent set and the refusal, read by the server's
// gates and by the client (§18 rule 1).

/** platform_settings key; seeded 'waitlist' by migration 381. Leon flips it in admin (audited). */
export const TRAVELER_SIGNUP_MODE_SETTING = "traveler_signup_mode";
/** platform_settings key; seeded 'kyoto' by migration 381. The market the waitlist is for — never a literal. */
export const LAUNCH_MARKET_SLUG_SETTING = "launch_market_slug";

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

export type TravelerSignupDecision = { allowed: true } | { allowed: false; code: typeof TRAVELER_WAITLIST };

/**
 * The ONE decision for a first-time account: open mode, supply intent or a QA sign-up (a QA-domain address AND the
 * right code — `qaSignupAllowed`) passes.
 */
export function decideFirstTimeSignup(input: {
  mode: TravelerSignupMode;
  intent: SignupIntent;
  qaCodeValid: boolean;
}): TravelerSignupDecision {
  if (input.mode === "open") return { allowed: true };
  if (input.intent === "supply") return { allowed: true };
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
