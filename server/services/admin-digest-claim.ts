/**
 * Once-per-UTC-date claim for the admin daily digest.
 *
 * `platform_settings` already exists (no migration). The claim is the statement:
 * insert the date, or update it only when the stored value is a different day.
 * A second instance, or a restart the same day, updates zero rows and does not send.
 * An empty value (claim released after a send failure) is distinct from the date,
 * so a later attempt the same day can still send. A crash between claim and send
 * consumes the day — a missed digest is recovered the next day, not by sending
 * the same one again on every boot.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { ADMIN_DIGEST_SENT_ON_KEY } from "./admin-digest-shape";

export { ADMIN_DIGEST_SENT_ON_KEY };

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(dateKey: string): void {
  if (!DATE_KEY_RE.test(dateKey)) {
    throw new Error("admin digest date key must be YYYY-MM-DD");
  }
}

/** True when this caller won the claim for `dateKey`. */
export async function claimAdminDigestSend(dateKey: string): Promise<boolean> {
  assertDateKey(dateKey);
  const result = await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
    VALUES (
      ${ADMIN_DIGEST_SENT_ON_KEY},
      ${dateKey},
      ${"UTC date the admin daily digest email was claimed. Empty means the claim was released after a send failure."},
      NOW()
    )
    ON CONFLICT (setting_key) DO UPDATE
      SET setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      WHERE platform_settings.setting_value IS DISTINCT FROM EXCLUDED.setting_value
    RETURNING setting_key
  `);
  return ((result as { rows?: unknown[] }).rows ?? []).length > 0;
}

/** Clears a claim only when it is still this date, so a newer claim is left alone. */
export async function releaseAdminDigestClaim(dateKey: string): Promise<void> {
  assertDateKey(dateKey);
  await db.execute(sql`
    UPDATE platform_settings
    SET setting_value = '', updated_at = NOW()
    WHERE setting_key = ${ADMIN_DIGEST_SENT_ON_KEY}
      AND setting_value = ${dateKey}
  `);
}
