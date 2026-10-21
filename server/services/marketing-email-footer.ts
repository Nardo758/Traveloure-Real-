// The marketing email footer (PR #1599: `readMarketingEmailFooter`, platform_settings key
// `marketing_email_postal_address`). That reader is not on main yet. This is the same name and the same
// key, and it fails closed: no row, a blank value or a failed read returns null, and a caller must not
// send a marketing email without it. The postal address lives only in the setting. This module adds no
// address and no phone of its own. When #1599 lands, keep that fail-closed and use its footer if the
// two readers meet.
import { escHtml } from "../utils/email-escape";
import { readPlatformSetting } from "./platform-flags";

export const MARKETING_EMAIL_POSTAL_ADDRESS_SETTING = "marketing_email_postal_address";

export interface MarketingEmailFooter {
  html: string;
  text: string;
}

export async function readMarketingEmailFooter(): Promise<MarketingEmailFooter | null> {
  const raw = await readPlatformSetting(MARKETING_EMAIL_POSTAL_ADDRESS_SETTING);
  const address = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!address) return null;
  const capped = address.slice(0, 500);
  const htmlAddress = escHtml(capped).replace(/\n/g, "<br>");
  return {
    html: `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${htmlAddress}</p>`,
    text: capped,
  };
}
