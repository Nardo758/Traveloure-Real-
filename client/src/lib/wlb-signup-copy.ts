/**
 * WL-B screen (ledger `2026-10-30-wlb-provider-signup-screen`): every word the provider sign-up, the expert refusal and
 * the waitlist's expert form show, in ONE object so a wording approval changes one file. FOUNDER WORDING REVIEW on the
 * PR: everything here is HELD FOR LEON except the three APPROVED lines marked below. Keep rates come from
 * `GET /api/fee-policies/keep-rates` (admin config), never a typed number (§8); an unreadable rate omits its line.
 */
import { platformTakePercent, type PublicKeepRates } from "./fee-keep-copy";
import { EXPERT_APPLY_NOW } from "@shared/launch-signup";
import { WAITLIST_EXPERT_FORM_PATH } from "@shared/launch-waitlist";

export const WLB_SIGNUP_COPY = {
  // Provider sign-up (HELD FOR LEON).
  businessName: "Business name",
  email: "Email",
  category: "Category",
  city: "City",
  website: "Website (optional)",
  languages: "Languages (optional)",
  providerKeep: (pct: number) => `Providers keep ${pct}%. Paid through Stripe.`,
  finishProfileLater: "Finish your provider profile when you're ready.",
  // Expert refusal: the message is the server's (HELD); the button is APPROVED (Leon, Oct 30, 2026).
  applyNow: "Apply Now",
  // Waitlist expert form (HELD FOR LEON), except the two APPROVED sentences.
  expertHeading: "Local experts — apply now",
  expertSublineLead: (city: string) => `Know ${city} like few people do? Help travelers plan trips and events around what you know.`,
  expertKeep: (pct: number) => `You keep ${pct}% of what you earn.`, // APPROVED (Leon, Oct 30, 2026)
  expertName: "Your name",
  expertEmail: "Email",
  expertCity: "City you know best",
  expertLanguages: "Languages (optional)",
  expertLink: "Link to your work (optional)",
  expertSubmit: "Send application",
  expertDoneHeading: "Application received",
  expertDoneBody: (name: string, email: string) =>
    `Thanks, ${name}. We review every application by hand and will email you at ${email} with next steps.`,
  expertPayouts: "Payouts go to your bank through Stripe.", // APPROVED (Leon, Oct 30, 2026)
} as const;

/** The share an earner keeps, from the platform rate the server serves; null when the rate cannot be read. */
export function keepPercent(platformRate: number | null | undefined): number | null {
  const take = platformTakePercent(platformRate);
  return take === null ? null : 100 - take;
}
export function providerKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const pct = keepPercent(rates?.providerPlatformRate);
  return pct === null ? null : WLB_SIGNUP_COPY.providerKeep(pct);
}
export function expertKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const pct = keepPercent(rates?.expertPlatformRate);
  return pct === null ? null : WLB_SIGNUP_COPY.expertKeep(pct);
}

export interface ProviderSignupDraft {
  businessName: string;
  category: string;
  city: string;
  website: string;
  languages: string;
}
export const EMPTY_PROVIDER_DRAFT: ProviderSignupDraft = { businessName: "", category: "", city: "", website: "", languages: "" };

/** The four required answers are in (business name, category, city, and the account's email). */
export function providerSignupReady(draft: ProviderSignupDraft, email: string): boolean {
  return Boolean(draft.businessName.trim() && draft.category && draft.city.trim() && email.trim());
}

/** The `provider` object the register body carries, under the WL-B server contract's names. Empty optionals are left out. */
export function providerSignupBody(draft: ProviderSignupDraft): Record<string, string> {
  return {
    businessName: draft.businessName.trim(),
    category: draft.category,
    city: draft.city.trim(),
    ...(draft.website.trim() ? { website: draft.website.trim() } : {}),
    ...(draft.languages.trim() ? { languages: draft.languages.trim() } : {}),
  };
}

/** The refusal to draw, from the server's own answer; null for any other answer. The button target is never empty. */
export function expertRefusalFrom(status: number, data: unknown): { message: string; applyPath: string } | null {
  const d = data as { reason?: unknown; message?: unknown; applyPath?: unknown } | null;
  if (status !== 403 || !d || d.reason !== EXPERT_APPLY_NOW) return null;
  const message = typeof d.message === "string" ? d.message : null;
  const applyPath = typeof d.applyPath === "string" && d.applyPath.startsWith("/") ? d.applyPath : WAITLIST_EXPERT_FORM_PATH;
  return message ? { message, applyPath } : null;
}

export interface ExpertApplicationDraft {
  contactName: string;
  email: string;
  expertCity: string;
  languages: string;
  link: string;
}
export const EMPTY_EXPERT_DRAFT: ExpertApplicationDraft = { contactName: "", email: "", expertCity: "", languages: "", link: "" };

export function expertApplicationReady(d: ExpertApplicationDraft): boolean {
  return Boolean(d.contactName.trim() && d.email.trim() && d.expertCity.trim());
}

/** The `/api/waitlist` body for an expert application. Empty optionals are left out. */
export function expertApplicationBody(d: ExpertApplicationDraft): Record<string, string> {
  return {
    role: "expert",
    contactName: d.contactName.trim(),
    email: d.email.trim(),
    expertCity: d.expertCity.trim(),
    ...(d.languages.trim() ? { languages: d.languages.trim() } : {}),
    ...(d.link.trim() ? { link: d.link.trim() } : {}),
  };
}
