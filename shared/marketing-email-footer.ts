/**
 * Marketing-email footer identity (ledger `2026-10-20-marketing-email-footer`).
 *
 * The four values live in `platform_settings`. This module names the keys and
 * decides when a set is complete. It does not supply text for a missing value.
 */

export const MARKETING_EMAIL_FOOTER_FIELDS = [
  { key: "marketing_email_sender_name", label: "Sender name", multiline: false },
  { key: "marketing_email_opt_out_address", label: "Opt-out email address", multiline: false },
  { key: "marketing_email_postal_address", label: "Postal address", multiline: true },
  { key: "marketing_email_complaint_contact", label: "Complaint contact", multiline: false },
] as const;

export type MarketingEmailFooterKey = (typeof MARKETING_EMAIL_FOOTER_FIELDS)[number]["key"];

export interface MarketingEmailFooter {
  senderName: string;
  optOutAddress: string;
  postalAddress: string;
  complaintContact: string;
}

const FIELD_BY_KEY: Record<MarketingEmailFooterKey, keyof MarketingEmailFooter> = {
  marketing_email_sender_name: "senderName",
  marketing_email_opt_out_address: "optOutAddress",
  marketing_email_postal_address: "postalAddress",
  marketing_email_complaint_contact: "complaintContact",
};

export function marketingFooterSkipReason(missing: readonly string[]): string {
  return `Skipped marketing email: missing platform_settings ${missing.join(", ")}`;
}

export function marketingUnsubscribeSkipReason(): string {
  return "Skipped marketing email: missing unsubscribe link";
}

export function marketingCitySkipReason(): string {
  return "Skipped marketing email: missing city";
}

/** A blank, whitespace-only, or absent row is missing. No substitute text is invented. */
export function marketingEmailFooterFromValues(
  values: Partial<Record<MarketingEmailFooterKey, string | null | undefined>>,
): { ok: true; footer: MarketingEmailFooter } | { ok: false; missing: MarketingEmailFooterKey[]; reason: string } {
  const missing: MarketingEmailFooterKey[] = [];
  const footer = {} as MarketingEmailFooter;
  for (const field of MARKETING_EMAIL_FOOTER_FIELDS) {
    const raw = values[field.key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) missing.push(field.key);
    else footer[FIELD_BY_KEY[field.key]] = trimmed;
  }
  if (missing.length > 0) return { ok: false, missing, reason: marketingFooterSkipReason(missing) };
  return { ok: true, footer };
}
