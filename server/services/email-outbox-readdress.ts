/**
 * Re-address claimable outbox rows when an account address changes (row 168, Z-18).
 *
 * No call site in this PR. Row 172 slice d calls readdressOutboxOnEmailChange
 * from the change path.
 *
 * Three UPDATEs, one transaction. A row in flight (status processing with a
 * live lease) is never touched. Nothing is inserted. users is never written.
 * A failure logs no address and returns zeros.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { OUTBOX_EXPIRED_REASON } from "./email-outbox-expiry";
import { outboxReaddressClassSql } from "./email-outbox-classes";

const READDRESS_REASONS = {
  readdressed: "readdressed",
  addressChanged: "readdressed: address changed",
} as const;

export interface ReaddressOutboxResult {
  readdressed: number;
  cancelled: number;
}

function normalizeAddress(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

function logFailure(err: unknown): void {
  const raw = err instanceof Error ? err.message : "readdress failed";
  logger.error(
    {
      name: err instanceof Error ? err.name : "Error",
      message: raw.replace(/[^\s@]+@[^\s@]+/g, "[redacted]"),
    },
    "[email-outbox] readdress failed",
  );
}

function claimableAddress(oldEmail: string): SQL {
  return sql`lower(btrim(to_email)) = lower(btrim(${oldEmail}))
    AND position(',' in to_email) = 0
    AND (
      status IN ('pending', 'failed', 'held')
      OR (status = 'processing' AND retry_after < NOW() - INTERVAL '1 minute')
    )`;
}

/**
 * Rewrite claimable must-have and security rows onto the new address and
 * re-queue them. Cancel every other claimable row for the old address.
 * Old-address-by-design and not-account-bound rows stay as they are.
 * An in-class row whose window has already passed is cancelled with the
 * expiry reason and is not rewritten.
 */
export async function readdressOutboxOnEmailChange(input: {
  oldEmail: string;
  newEmail: string;
  now?: Date;
}): Promise<ReaddressOutboxResult> {
  const zeros: ReaddressOutboxResult = { readdressed: 0, cancelled: 0 };
  try {
    const oldEmail = input?.oldEmail;
    const newEmail = input?.newEmail;
    const oldNorm = normalizeAddress(oldEmail);
    const newNorm = normalizeAddress(newEmail);
    if (oldNorm === "" || newNorm === "" || oldNorm === newNorm) return zeros;

    const at =
      input.now instanceof Date && Number.isFinite(input.now.getTime())
        ? input.now.toISOString()
        : new Date().toISOString();

    return await db.transaction(async (tx) => {
      const open = outboxReaddressClassSql();
      const readdressed = await tx.execute(sql`
        UPDATE email_outbox
        SET to_email = lower(btrim(${newEmail})),
            status = 'pending',
            retry_after = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'readdressedFrom', lower(btrim(${oldEmail})),
              'readdressedAt', ${at}::text,
              'readdressReason', ${READDRESS_REASONS.readdressed}::text
            ),
            updated_at = NOW()
        WHERE ${claimableAddress(oldEmail)}
          AND (expires_at IS NULL OR expires_at > NOW())
          AND ${open.readdressable}
        RETURNING id
      `);

      const closed = outboxReaddressClassSql();
      const expired = await tx.execute(sql`
        UPDATE email_outbox
        SET status = 'cancelled',
            last_error = ${OUTBOX_EXPIRED_REASON},
            retry_after = NULL,
            updated_at = NOW()
        WHERE ${claimableAddress(oldEmail)}
          AND expires_at <= NOW()
          AND ${closed.readdressable}
        RETURNING id
      `);

      const rest = outboxReaddressClassSql();
      const cancelled = await tx.execute(sql`
        UPDATE email_outbox
        SET status = 'cancelled',
            retry_after = NULL,
            last_error = ${READDRESS_REASONS.addressChanged},
            updated_at = NOW()
        WHERE ${claimableAddress(oldEmail)}
          AND ${rest.cancelRest}
        RETURNING id
      `);

      return {
        readdressed: rowCount(readdressed),
        cancelled: rowCount(expired) + rowCount(cancelled),
      };
    });
  } catch (err: unknown) {
    logFailure(err);
    return zeros;
  }
}
