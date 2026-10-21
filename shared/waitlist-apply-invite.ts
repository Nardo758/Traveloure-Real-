// S-22 (ledger `2026-10-21-s22-waitlist-apply-path`): a provider who joins the waitlist for a LIVE city
// can apply, and that invite is one email. The city name is the operating market's own name for a key on the
// admin live list (`beta_market_slugs`, read by GET /api/public/live-markets). This module names no city.
//
// The confirmation screen and the email share these sentences (§18 rule 1). A city that is not live returns
// no invite: no button and no email. The email is sent only when the waitlist row is born (a repeat updates
// the row and sends nothing) AND the marketing footer setting is present — that gate lives with the sender.
import { OPERATING_MARKETS } from "./operating-markets";
import { WAITLIST_SERVICE_TYPES, type WaitlistServiceType } from "./launch-waitlist";

export const WAITLIST_APPLY_INVITE_EMAIL_TYPE = "waitlist_apply_invite";
export const WAITLIST_APPLY_FIRST_NAME_FALLBACK = "there";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WaitlistApplyScreen {
  heading: string;
  body: string;
  button: string;
}

export interface WaitlistApplyMail {
  subject: string;
  preheader: string;
  body: string;
  cta: string;
}

export interface WaitlistApplyInvite {
  city: string;
  country: string;
  path: string;
  screen: WaitlistApplyScreen;
  mail: WaitlistApplyMail;
}

/** The live list's city name for this market, or null when the market is not on that list. */
export function waitlistApplyCityName(marketKey: string, liveMarketKeys: readonly string[]): string | null {
  const key = marketKey.trim().toLowerCase();
  if (!key) return null;
  const live = new Set(liveMarketKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  if (!live.has(key)) return null;
  return OPERATING_MARKETS.find((m) => m.marketKey === key)?.cityName ?? null;
}

/** The first word of the name they gave, or "there" when they gave none. */
export function waitlistApplyFirstName(contactName: string | null | undefined): string {
  const token = String(contactName ?? "").replace(/[\r\n]+/g, " ").trim().split(/\s+/)[0] ?? "";
  if (!token) return WAITLIST_APPLY_FIRST_NAME_FALLBACK;
  return token.slice(0, 40);
}

export function waitlistApplyScreen(city: string): WaitlistApplyScreen {
  return {
    heading: "You're on the list",
    body: `Thanks for your interest in Traveloure. If you run a business or guide in ${city}, you can apply now. We review each application and get back to you by email.`,
    button: `Apply as a ${city} provider`,
  };
}

export function waitlistApplyMail(city: string, firstName: string): WaitlistApplyMail {
  return {
    subject: "You're on the Traveloure list",
    preheader: `Run a business in ${city}? Apply as a provider.`,
    body: `Hi ${firstName},\n\nThanks for joining the Traveloure list. Traveloure helps travelers plan trips and occasions with local experts and providers.\n\nIf you offer experiences, food, stays or other services in ${city}, you can apply to list them. It's free to apply, and we review every application and reply by email.`,
    cta: `Apply as a ${city} provider`,
  };
}

function knownServiceType(value: string | null | undefined): WaitlistServiceType | null {
  if (!value) return null;
  const found = WAITLIST_SERVICE_TYPES.find((t) => t.key === value);
  return found ? found.key : null;
}

/** The application path, prefilled with the details the form can hold. */
export function providerApplyPath(input: {
  city: string;
  country: string;
  email: string;
  businessName?: string | null;
  serviceType?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set("city", input.city);
  q.set("country", input.country);
  q.set("email", input.email.trim());
  const business = input.businessName?.trim();
  if (business) q.set("businessName", business.slice(0, 160));
  const serviceType = knownServiceType(input.serviceType);
  if (serviceType) q.set("serviceType", serviceType);
  return `/become-provider?${q.toString()}`;
}

/**
 * The invite for a provider sign-up, or null when the market is not a live city. Null means no button
 * and no email. The city and country come from the operating market the live list named.
 */
export function waitlistProviderApplyInvite(input: {
  marketKey: string;
  liveMarketKeys: readonly string[];
  email: string;
  contactName?: string | null;
  businessName?: string | null;
  serviceType?: string | null;
}): WaitlistApplyInvite | null {
  const key = input.marketKey.trim().toLowerCase();
  const city = waitlistApplyCityName(key, input.liveMarketKeys);
  const market = OPERATING_MARKETS.find((m) => m.marketKey === key);
  if (!city || !market) return null;
  const firstName = waitlistApplyFirstName(input.contactName);
  return {
    city: market.cityName,
    country: market.country,
    path: providerApplyPath({
      city: market.cityName,
      country: market.country,
      email: input.email,
      businessName: input.businessName,
      serviceType: input.serviceType,
    }),
    screen: waitlistApplyScreen(market.cityName),
    mail: waitlistApplyMail(market.cityName, firstName),
  };
}

export interface ProviderApplicationPrefill {
  email: string;
  businessName: string;
  city: string;
  country: string;
  serviceType: WaitlistServiceType | "";
  serviceTypeLabel: string;
}

/** What `/become-provider` may take from a waitlist apply link. An unusable value stays blank. */
export function providerApplicationPrefillFromSearch(search: string): ProviderApplicationPrefill {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const emailRaw = (q.get("email") ?? "").trim();
  const email = emailRaw.length <= 254 && EMAIL_SHAPE.test(emailRaw) ? emailRaw : "";
  const serviceType = knownServiceType((q.get("serviceType") ?? "").trim()) ?? "";
  const serviceTypeLabel = WAITLIST_SERVICE_TYPES.find((t) => t.key === serviceType)?.label ?? "";
  return {
    email,
    businessName: (q.get("businessName") ?? "").trim().slice(0, 160),
    city: (q.get("city") ?? "").trim().slice(0, 80),
    country: (q.get("country") ?? "").trim().slice(0, 80),
    serviceType,
    serviceTypeLabel,
  };
}

/**
 * Whether this sign-up sends the invite. A repeat (`inserted` false), a traveler, a city that is not
 * live (`invite` null) or a missing marketing footer does not send.
 */
export function shouldSendWaitlistApplyInvite(input: {
  inserted: boolean;
  role: string;
  invite: WaitlistApplyInvite | null;
  footerPresent: boolean;
}): boolean {
  return input.inserted === true && input.role === "provider" && input.invite !== null && input.footerPresent === true;
}
