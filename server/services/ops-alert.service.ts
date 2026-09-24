/**
 * An operational alert a human must act on (board task #1174, ledger `2026-09-23-phase2-messages`).
 *
 * For state a failed rollback can strand — a claimed credit never released, a claim stuck
 * `pending` so every retry answers 409 — a `console.warn` is not an alert: nobody reads it. This
 * writes an `admin_notifications` row, which the admin notifications list shows and every daily
 * admin digest includes while it is unread, and logs at error level.
 *
 * NEVER THROWS. It runs inside failure handlers; an alert that could throw would replace the error
 * the caller is already propagating. If even the row cannot be written, the error log is the
 * last word, and it says so.
 */
import { db } from "../db";
import { adminNotifications } from "../../shared/schema";
import { logger } from "../infrastructure/logger";

export interface OpsAlert {
  /** Stable machine type, e.g. `coordination_rollback_failed`. */
  type: string;
  /** One sentence an admin can act on: what is stuck, and what to do. */
  message: string;
  /** Short machine reason, e.g. the step that failed. */
  reason: string;
  metadata: Record<string, unknown>;
  error?: unknown;
}

function errorText(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function raiseOpsAlert(alert: OpsAlert): Promise<boolean> {
  const metadata = { ...alert.metadata, error: errorText(alert.error) };
  logger.error({ type: alert.type, reason: alert.reason, ...metadata }, alert.message);
  try {
    await db.insert(adminNotifications).values({
      type: alert.type,
      message: alert.message,
      reason: alert.reason,
      metadata,
    });
    return true;
  } catch (insertErr) {
    logger.error(
      { type: alert.type, reason: alert.reason, insertError: errorText(insertErr) },
      "ops alert could not be recorded in admin_notifications — this log line is the only record",
    );
    return false;
  }
}
