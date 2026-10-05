import { escHtml } from "../utils/email-escape";

export const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
export type GenerationOutcome = "ready" | "failed";
export type GenerationFailureReason = "error" | "timeout";

/** Never send new development notices to copied user records or a literal inbox placeholder. */
export function canQueueGenerationNotice(
  email: string,
  environment = process.env.NODE_ENV,
  approvedInbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL,
): boolean {
  if (environment === "production") return true;
  return Boolean(approvedInbox && /^[^\s@<>\[\]]+@[^\s@<>\[\]]+\.[^\s@<>\[\]]+$/.test(approvedInbox) &&
    email.toLowerCase() === approvedInbox.toLowerCase());
}

export function resolveGenerationOutcome(
  requested: GenerationOutcome, startedAt: Date, now: Date,
): { outcome: GenerationOutcome; reason?: GenerationFailureReason } {
  if (now.getTime() - startedAt.getTime() > GENERATION_TIMEOUT_MS) {
    return { outcome: "failed", reason: "timeout" };
  }
  return requested === "failed" ? { outcome: "failed", reason: "error" } : { outcome: "ready" };
}

/** Ready is per itinerary, never per traveler/day. Failures are per distinct attempt. */
export function generationNoticeKey(id: string, outcome: GenerationOutcome, startedAt: Date): string {
  return outcome === "ready" ? `itinerary-ready:${id}` : `itinerary-failed:${id}:${startedAt.toISOString()}`;
}

/** Pure rendering: no provider calls, invented credit balance, free-retry promise, or raw exception text. */
export function buildItineraryOutcomeEmail(input: {
  comparisonId: string;
  outcome: GenerationOutcome;
  reason?: GenerationFailureReason;
  firstName?: string | null;
  destination?: string | null;
  baseUrl: string;
}) {
  const url = new URL(`/itinerary-comparison/${encodeURIComponent(input.comparisonId)}`, input.baseUrl).href;
  const subject = input.outcome === "ready" ? "Your itinerary is ready" : "We couldn't finish your itinerary";
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  const destination = input.destination ? ` for ${input.destination}` : "";
  const message = input.outcome === "ready"
    ? `Your itinerary${destination} is ready to view.`
    : input.reason === "timeout"
      ? `Your itinerary${destination} took too long to generate. Open your itinerary to try again.`
      : `We couldn't finish generating your itinerary${destination}. Open your itinerary to try again.`;
  const cta = input.outcome === "ready" ? "View your itinerary" : "Open your itinerary";
  return {
    subject,
    text: `${subject}\n\n${greeting}\n\n${message}\n\n${cta}: ${url}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
<h2 style="color:#FF385C">${escHtml(subject)}</h2><p>${escHtml(greeting)}</p>
<p>${escHtml(message)}</p><p><a href="${escHtml(url)}" style="background:#FF385C;color:#fff;padding:12px 24px;border-radius:6px;display:inline-block">${escHtml(cta)}</a></p>
<p style="color:#6b7280;font-size:12px">An update about your Traveloure itinerary.</p></div>`,
  };
}