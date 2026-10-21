/**
 * The planned waitlist "we're open" mail (ledger `2026-10-20-marketing-email-footer`).
 * Nothing schedules this. It is the only body for that mail: a missing footer value,
 * city, or unsubscribe link skips the send and logs the reason.
 */

import {
  marketingCitySkipReason,
  marketingUnsubscribeSkipReason,
  type MarketingEmailFooter,
} from "@shared/marketing-email-footer";
import { escHtml } from "../utils/email-escape";
import type { SendEmailParams, SendEmailResult } from "./email.service";
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

export async function sendWaitlistOpenEmail(input: {
  to: string;
  cityName: string;
  unsubscribeUrl: string;
  send?: (params: SendEmailParams) => Promise<SendEmailResult>;
}): Promise<{ sent: true; id?: string } | { sent: false; reason: string }> {
  const identity = await readMarketingEmailFooter();
  if (!identity.ok) {
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, identity.reason);
    return { sent: false, reason: identity.reason };
  }
  const city = input.cityName.trim();
  if (!city) {
    const reason = marketingCitySkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { sent: false, reason };
  }
  const unsubscribeUrl = input.unsubscribeUrl.trim();
  if (!unsubscribeUrl) {
    const reason = marketingUnsubscribeSkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { sent: false, reason };
  }
  const message = buildWaitlistOpenEmail({ cityName: city, unsubscribeUrl, footer: identity.footer });
  if (!message) {
    const reason = marketingUnsubscribeSkipReason();
    logMarketingEmailSkip(WAITLIST_OPEN_EMAIL_TYPE, reason);
    return { sent: false, reason };
  }
  const send = input.send ?? (async (params: SendEmailParams) => {
    const { sendEmail } = await import("./email.service");
    return sendEmail(params);
  });
  const result = await send({ to: input.to, subject: message.subject, html: message.html, text: message.text });
  if (!result.ok) return { sent: false, reason: result.error ?? "Provider attempt failed" };
  return { sent: true, id: result.id };
}
