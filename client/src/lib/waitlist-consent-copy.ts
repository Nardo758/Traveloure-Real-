// 291b (ledger `2026-10-29-waitlist-consent-screens`): every new word on the unsubscribe page and the admin
// "market opened" card. ONE object. WORDING HELD FOR LEON: do not merge until "Wording approved — Leon" is on the PR.
// The news box's own words live beside the first box's in shared/launch-waitlist.ts (WAITLIST_MARKETING_CONSENT_LINE).
// Admin copy says "queued", never that an email went out: the route only enqueues.

export const WAITLIST_CONSENT_COPY = {
  unsubConfirmHeading: "Unsubscribe from waitlist emails?",
  unsubConfirmBodyCity: "You'll stop getting emails about Traveloure opening in {city}.",
  unsubConfirmBody: "You'll stop getting waitlist emails from Traveloure.",
  unsubButton: "Unsubscribe",
  unsubDoneHeading: "You're unsubscribed",
  unsubDoneBody: "We won't email you about the waitlist again.",
  unsubInvalid: "This unsubscribe link isn't valid. Please use the link from your most recent email.",
  unsubError: "Something went wrong. Please try again.",
  adminCardTitle: "Market opened email",
  adminButton: "Queue \"we're open\" email",
  adminConfirm: "Queue the \"we're open\" email for {role}s on the {city} waitlist?",
  adminResult: "{enqueued} queued, {skipped} skipped",
  adminError: "Could not queue the email.",
} as const;

/** Fill `{name}` slots. A slot with no value is left as written, so a missing value is visible, never blank. */
export function fillWaitlistCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
  );
}
