import type { CoreMessage, MessageValues } from "./_core-definition";
import { MARKETING_KINDS, safeName } from "./_core-policy";
import { localizedCopy } from "./_core-locales";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
export function renderCoreEmail(message: CoreMessage, values: MessageValues, link?: string, unsubscribe?: string) {
  const { copy, language } = localizedCopy(message, { ...values, name: safeName(values.name) });
  const subject = copy.subject.replace(/[\r\n]/g, " ");
  const body = escapeHtml(copy.body);
  const marketing = MARKETING_KINDS.has(message.kind);
  if (marketing && !unsubscribe) throw new Error("Marketing requires a signed unsubscribe link");
  const button = copy.button && link ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#5b2a6e" style="border-radius:4px;padding:14px 22px"><a href="${escapeHtml(link)}" style="color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(copy.button)}</a></td></tr></table>` : "";
  const footer = marketing ? `<p><a href="${escapeHtml(unsubscribe!)}">Unsubscribe from marketing emails</a></p>` : "";
  const html = `<!doctype html><html lang="${language}"><body style="margin:0;background:#f5f3f6;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="24" cellspacing="0" style="max-width:100%;background:#ffffff"><tr><td bgcolor="#5b2a6e" style="color:#ffffff;font-size:24px">Traveloure</td></tr><tr><td><p style="line-height:1.6">${body}</p>${button}</td></tr><tr><td style="color:#666666;font-size:12px">Traveloure${footer}</td></tr></table></td></tr></table></body></html>`;
  const text = `${copy.body}${copy.button && link ? `\n\n${copy.button}: ${link}` : ""}${marketing ? `\n\nUnsubscribe: ${unsubscribe}` : ""}`;
  return { subject, html, text, ...(marketing ? { headers: {
    "List-Unsubscribe": `<${unsubscribe}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } } : {}) };
}