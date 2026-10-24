// S-22: the one confirmation email for a provider who joins the waitlist of a live city.
// The sentences live in shared/waitlist-apply-invite.ts. This file builds the message and sends it.
// The footer is the shared marketing footer (ledger 2026-10-20-marketing-email-footer). This file
// writes no address and no phone. A missing required footer value does not send (fail closed).
// A repeat sign-up does not send again.
import { escHtml, stripCrLf } from "../utils/email-escape";
import { logger } from "../infrastructure/logger";
import { normalizeWaitlistEmail } from "@shared/launch-waitlist";
import {
  WAITLIST_APPLY_INVITE_EMAIL_TYPE,
  shouldSendWaitlistApplyInvite,
  waitlistProviderApplyInvite,
  type WaitlistApplyMail,
} from "@shared/waitlist-apply-invite";
import { getAppBaseUrl } from "./email.service";
import { enqueueEmail } from "./email-outbox.service";
import { logMarketingEmailSkip, readMarketingEmailFooter, renderMarketingEmailFooter } from "./marketing-email-footer";
import { getBetaMarketSlugs } from "./platform-flags";

export function buildWaitlistApplyInviteMessage(input: {
  mail: WaitlistApplyMail;
  applyUrl: string;
  footerHtml: string;
  footerText: string;
}): { subject: string; html: string; text: string } {
  if (!/^https?:\/\//i.test(input.applyUrl)) {
    throw new Error("waitlist apply url must be absolute");
  }
  const paragraphs = input.mail.body.split("\n\n").map((part) => {
    const inner = escHtml(part).replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#111827;">${inner}</p>`;
  }).join("");
  const href = escHtml(input.applyUrl);
  const cta = escHtml(input.mail.cta);
  const preheader = escHtml(input.mail.preheader);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(input.mail.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
<tr>
<td align="center" style="padding:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">
<tr>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827;">
${paragraphs}
<a href="${href}" style="display:block;width:100%;max-width:100%;box-sizing:border-box;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:14px 16px;border-radius:6px;font-weight:600;">${cta}</a>
${input.footerHtml}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
  const text = `${input.mail.body}\n\n${input.mail.cta}\n${input.applyUrl}\n\n${input.footerText}`;
  return { subject: stripCrLf(input.mail.subject), html, text };
}

/**
 * Sends the apply invite when this sign-up born a provider row in a live city and the marketing
 * footer is set. Delivery goes through the outbox, so EMAIL_SENDS_ENABLED holds the row and the
 * provider is not called when that gate is off (R631). Never throws: a failure is logged without
 * the address and the join still stands.
 */
export async function notifyWaitlistProviderApply(input: {
  inserted: boolean;
  role: string;
  marketSlug: string;
  email: string;
  contactName: string | null;
  businessName: string | null;
  serviceType: string | null;
}): Promise<"sent" | "skipped"> {
  if (input.role !== "provider" || input.inserted !== true) return "skipped";
  try {
    const liveMarketKeys = await getBetaMarketSlugs();
    const invite = waitlistProviderApplyInvite({
      marketKey: input.marketSlug,
      liveMarketKeys,
      email: input.email,
      contactName: input.contactName,
      businessName: input.businessName,
      serviceType: input.serviceType,
    });
    if (!invite) return "skipped";
    const identity = await readMarketingEmailFooter();
    if (!identity.ok) {
      logMarketingEmailSkip(WAITLIST_APPLY_INVITE_EMAIL_TYPE, identity.reason);
      return "skipped";
    }
    if (!shouldSendWaitlistApplyInvite({ inserted: true, role: "provider", invite, footerPresent: true })) {
      return "skipped";
    }
    // The shared renderer owns the footer words. It is placed inside this document; appending it
    // after the document would land outside </html>. The unsubscribe link is the configured
    // opt-out address: this sign-up has no user, and launch_waitlist.unsubscribed_at has no writer.
    const foot = renderMarketingEmailFooter(identity.footer, `mailto:${identity.footer.optOutAddress}`);
    const message = buildWaitlistApplyInviteMessage({
      mail: invite.mail,
      applyUrl: `${getAppBaseUrl()}${invite.path}`,
      footerHtml: foot.html,
      footerText: foot.text,
    });
    await enqueueEmail({
      to: normalizeWaitlistEmail(input.email),
      subject: message.subject,
      html: message.html,
      text: message.text,
      emailType: WAITLIST_APPLY_INVITE_EMAIL_TYPE,
      metadata: { marketSlug: input.marketSlug },
    });
    return "sent";
  } catch (err: any) {
    logger.error(`[waitlist] apply invite failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return "skipped";
  }
}
