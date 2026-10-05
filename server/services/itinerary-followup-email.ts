import { escHtml } from "../utils/email-escape";

export const ITINERARY_FOLLOWUPS = [
  { kind: "itinerary_nudge_2h", hours: 2, automationId: "messaging.itinerary-nudge-2h" },
  { kind: "itinerary_followup_24h", hours: 24, automationId: "messaging.itinerary-followup-24h" },
  { kind: "itinerary_reengagement_5d", hours: 120, automationId: "messaging.itinerary-reengagement-5d" },
] as const;
export type ItineraryFollowupKind = typeof ITINERARY_FOLLOWUPS[number]["kind"];
export const isItineraryFollowup = (kind: string): kind is ItineraryFollowupKind =>
  ITINERARY_FOLLOWUPS.some((entry) => entry.kind === kind);

export interface MarketingPreferences {
  enabled: boolean;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
}

/** No inferred consent, timezone, or quiet-hours policy. The traveler explicitly supplies these. */
export function marketingPreferences(value: unknown): MarketingPreferences | null {
  const input = (value as { itineraryMarketing?: Partial<MarketingPreferences> } | null)?.itineraryMarketing;
  if (!input || input.enabled !== true || typeof input.timeZone !== "string" ||
      !/^\d{2}:\d{2}$/.test(input.quietStart ?? "") || !/^\d{2}:\d{2}$/.test(input.quietEnd ?? "")) return null;
  if ([input.quietStart!, input.quietEnd!].some((time) => Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59)) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(); } catch { return null; }
  return input as MarketingPreferences;
}

export function localMarketingClock(now: Date, preferences: MarketingPreferences) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: preferences.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = toMinutes(preferences.quietStart), end = toMinutes(preferences.quietEnd);
  const quiet = start === end ? false : start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, quiet };
}

/** Uses wall-clock formatting at every step, so DST and non-whole-hour zones are respected. */
export function nextMarketingWindow(now: Date, preferences: MarketingPreferences, blockedDay?: string) {
  for (let minutes = 5; minutes <= 48 * 60; minutes += 5) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const clock = localMarketingClock(candidate, preferences);
    if (!clock.quiet && clock.day !== blockedDay) return candidate;
  }
  throw new Error("No marketing delivery window within 48 hours");
}

export function buildItineraryFollowupEmail(input: {
  kind: ItineraryFollowupKind; itineraryId: string; firstName?: string | null;
  destination?: string | null; expertName?: string | null; bookable: boolean;
  baseUrl: string; unsubscribeToken: string;
}) {
  if (input.kind === "itinerary_reengagement_5d" && !input.bookable) return null;
  const planUrl = new URL(`/itinerary-comparison/${encodeURIComponent(input.itineraryId)}`, input.baseUrl).href;
  const unsubscribeUrl = new URL(`/email-preferences/unsubscribe/${encodeURIComponent(input.unsubscribeToken)}`, input.baseUrl).href;
  const subject = input.kind === "itinerary_nudge_2h" ? "Ready to take the next step with your itinerary?"
    : input.kind === "itinerary_followup_24h" ? "A next step for your itinerary" : "Your itinerary still has bookable experiences";
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hello,";
  const intro = input.destination ? `Your ${input.destination} itinerary is ready to revisit.` : "Your itinerary is ready to revisit.";
  const suggestion = input.kind === "itinerary_followup_24h"
    ? input.expertName ? `Ask ${input.expertName}, a local expert, for help with your next step.` : "Explore a top-rated activity as your next step."
    : "Review your plan and choose the experience that works for you.";
  // No urgency outside the positively checked bookable-items reengagement branch.
  const urgency = input.kind === "itinerary_reengagement_5d" ? "Prices may change; check current prices and availability before booking." : "";
  const expertsUrl = new URL("/experts", input.baseUrl);
  if (input.destination) expertsUrl.searchParams.set("destination", input.destination);
  const html = `<p>${escHtml(greeting)}</p><p>${escHtml(intro)}</p><p>${escHtml(suggestion)}</p>` +
    (urgency ? `<p>${escHtml(urgency)}</p>` : "") +
    `<p><a href="${escHtml(planUrl)}">Revisit your itinerary</a></p>` +
    (input.kind === "itinerary_followup_24h" && input.expertName ? `<p><a href="${escHtml(expertsUrl.href)}">Find a local expert</a></p>` : "") +
    `<p><a href="${escHtml(unsubscribeUrl)}">Unsubscribe from itinerary follow-up emails</a></p>`;
  const text = [greeting, intro, suggestion, urgency, `Revisit your itinerary: ${planUrl}`,
    input.kind === "itinerary_followup_24h" && input.expertName ? `Find a local expert: ${expertsUrl.href}` : "",
    `Unsubscribe: ${unsubscribeUrl}`].filter(Boolean).join("\n\n");
  return { subject, html, text };
}