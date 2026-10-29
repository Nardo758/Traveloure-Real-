/**
 * The planned waitlist "we're open" mail (ledger `2026-10-20-marketing-email-footer`).
 * The render is the only body for that mail. market_opened enqueues it; this module
 * does not call sendEmail. A missing footer value, city, or unsubscribe link skips
 * the enqueue and logs the reason.
 */

import {
  marketingCitySkipReason,
  marketingUnsubscribeSkipReason,
  type MarketingEmailFooter,
} from "@shared/marketing-email-footer";
import { escHtml } from "../utils/email-escape";
import { applyMarketingEmailFooter, logMarketingEmailSkip, readMarketingEmailFooter } from "./marketing-email-footer";

export const WAITLIST_OPEN_EMAIL_TYPE = "waitlist_open";

export function buildWaitlistOpenEmail(input: {
  cityName: string;
  unsubscribeUrl: string;
  footer: MarketingEmailFooter;
}): { subject: string; html: string; text: string; unsubscribeUrl: string } | null {
  const city = input.cityName.trim();
  const unsubscribeUrl = input.unsubscribeUrl.trim();
  if (!city || !unsubscribeUrl) return null;
  const subject = `We're open in ${city}`;
  const line = `Traveloure is open in ${city}.`;
  const html =
    `<p>${escHtml(line)}</p>` +
    `<p><a href="${escHtml(unsubscribeUrl)}">Unsubscribe from waitlist emails</a></p>`;
  const text = `${line}\n\nUnsubscribe: ${unsubscribeUrl}`;
  return applyMarketingEmailFooter({ subject, html, text, unsubscribeUrl }, input.footer);
}

/**
 * Reads the marketing footer and renders the open mail. Does not send.
 * A missing footer, city, or unsubscribe link returns the skip reason.
 */
export async function composeWaitlistOpenEmail(input: {
  cityName: string;
  unsubscribeUrl: string;
}): Promise<{ ok: true; subject: string; html: string; text: string } | { ok: false; reason: string }> {
  const identity = await readMarketingEmailFooter();
  if (!identity.ok) {
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, identity.reason);
    return { ok: false, reason: identity.reason };
  }
  const city = input.cityName.trim();
  if (!city) {
    const reason = marketingCitySkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { ok: false, reason };
  }
  const unsubscribeUrl = input.unsubscribeUrl.trim();
  if (!unsubscribeUrl) {
    const reason = marketingUnsubscribeSkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { ok: false, reason };
  }
  const message = buildWaitlistOpenEmail({ cityName: city, unsubscribeUrl, footer: identity.footer });
  if (!message) {
    const reason = marketingUnsubscribeSkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { ok: false, reason };
  }
  return { ok: true, subject: message.subject, html: message.html, text: message.text };
}
