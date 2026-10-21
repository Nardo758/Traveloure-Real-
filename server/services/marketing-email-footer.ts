/**
 * Renders and loads the marketing-email footer (ledger `2026-10-20-marketing-email-footer`).
 * The words come from `platform_settings`. A missing value is a skip, never a stand-in sentence.
 */

import { sql } from "drizzle-orm";
import {
  MARKETING_EMAIL_FOOTER_FIELDS,
  marketingEmailFooterFromValues,
  type MarketingEmailFooter,
  type MarketingEmailFooterKey,
} from "@shared/marketing-email-footer";
import { db } from "../db";
import { escHtml, stripCrLf } from "../utils/email-escape";

/** How long a follow-up waits before the drain tries again after a missing footer. */
export const MARKETING_FOOTER_RETRY_MS = 15 * 60 * 1000;

type SettingReader = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }>;
};

export async function readMarketingEmailFooter(executor: SettingReader = db) {
  const result = await executor.execute(sql`
    SELECT setting_key, setting_value
    FROM platform_settings
    WHERE setting_key IN (${sql.join(MARKETING_EMAIL_FOOTER_FIELDS.map((field) => sql`${field.key}`), sql`, `)})
  `);
  const values: Partial<Record<MarketingEmailFooterKey, string | null>> = {};
  for (const row of result.rows ?? []) {
    const record = row as { setting_key?: string; setting_value?: string | null };
    if (record.setting_key) values[record.setting_key as MarketingEmailFooterKey] = record.setting_value ?? null;
  }
  return marketingEmailFooterFromValues(values);
}

export function logMarketingEmailSkip(kind: string, reason: string, outboxId?: number): void {
  const where = outboxId == null ? kind : `${kind} outbox=${outboxId}`;
  console.warn(`[marketing-email] skipped ${where} — ${reason}`);
}

/** Body lines for the four identity values plus the unsubscribe link the message already carries. */
export function renderMarketingEmailFooter(footer: MarketingEmailFooter, unsubscribeUrl: string): { html: string; text: string } {
  const sender = escHtml(stripCrLf(footer.senderName));
  const optOut = escHtml(stripCrLf(footer.optOutAddress));
  const postal = escHtml(footer.postalAddress).replace(/\r\n|\r|\n/g, "<br>");
  const complaint = escHtml(stripCrLf(footer.complaintContact));
  const unsub = escHtml(stripCrLf(unsubscribeUrl));
  const html =
    `<p>Sender: ${sender}</p>` +
    `<p>Opt out by email: <a href="mailto:${optOut}">${optOut}</a></p>` +
    `<p>${postal}</p>` +
    `<p>Complaints: ${complaint}</p>` +
    `<p><a href="${unsub}">Unsubscribe</a></p>`;
  const text = [
    `Sender: ${stripCrLf(footer.senderName)}`,
    `Opt out by email: ${stripCrLf(footer.optOutAddress)}`,
    footer.postalAddress.trim(),
    `Complaints: ${stripCrLf(footer.complaintContact)}`,
    `Unsubscribe: ${stripCrLf(unsubscribeUrl)}`,
  ].join("\n\n");
  return { html, text };
}

export function applyMarketingEmailFooter<T extends { html: string; text: string; unsubscribeUrl: string }>(
  message: T,
  footer: MarketingEmailFooter,
): T | null {
  const unsubscribeUrl = message.unsubscribeUrl.trim();
  if (!unsubscribeUrl) return null;
  const foot = renderMarketingEmailFooter(footer, unsubscribeUrl);
  return {
    ...message,
    unsubscribeUrl,
    html: `${message.html}${foot.html}`,
    text: `${message.text}\n\n${foot.text}`,
  };
}
