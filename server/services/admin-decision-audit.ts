/**
 * One audit write for an admin decision that changes a status.
 *
 * Ops gap 13 (fix queue row 113) records listing status, featured, affinity tags,
 * listing delete, and message-report decisions. Gap 8's admin screens call this
 * same helper. Gap 12 reads `metadata.beforeStatus` and `metadata.afterStatus`
 * (`->>` text). The insert is `recordAdminAudit`: a failed insert raises an
 * `admin_audit_write_failed` alert, never throws, and never undoes the decision.
 *
 * Call it only after the decision's update has committed. A refused body, a
 * missing row, or a failed update must not reach this function, so those
 * attempts leave no audit row.
 */
import { recordAdminAudit, type AccessAuditLogValues } from "./admin-query.service";

export const LISTING_STATUS_ACTION = "provider_service_status";
export const LISTING_FEATURED_ACTION = "provider_service_featured";
export const LISTING_AFFINITY_TAGS_ACTION = "provider_service_affinity_tags";
export const LISTING_DELETE_ACTION = "provider_service_delete";
export const MESSAGE_REPORT_DECISION_ACTION = "message_report_decision";
// Ops gap 8 (ledger `2026-10-22-admin-ops-screens`): the three ops screens on /admin/system.
export const EMAIL_OUTBOX_RETRY_ACTION = "email_outbox_retry";
export const OUT_OF_BAND_REFUND_CLEARED_ACTION = "out_of_band_refund_cleared";
export const AUTO_CANCEL_CONFIG_ACTION = "booking_auto_cancel_config";
export const AUTO_CANCEL_RUN_ACTION = "booking_auto_cancel_run";
// Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the support inbox's three writes.
export const SUPPORT_STATUS_ACTION = "support_submission_status";
export const SUPPORT_ASSIGN_ACTION = "support_submission_assign";
export const SUPPORT_NOTE_ACTION = "support_submission_note";

export const PROVIDER_SERVICE_RESOURCE = "provider_service";
export const MESSAGE_REPORT_RESOURCE = "message_report";
export const EMAIL_OUTBOX_RESOURCE = "email_outbox";
export const SERVICE_BOOKING_RESOURCE = "service_booking";
export const AUTO_CANCEL_RESOURCE = "booking_auto_cancel";
export const CONTACT_SUBMISSION_RESOURCE = "contact_submission";

/** `true` / `false` / null — null stays null so an unset flag is not recorded as unfeatured. */
export function featuredDecisionStatus(value: boolean | null | undefined): string | null {
  if (value === true) return "featured";
  if (value === false) return "unfeatured";
  return null;
}

/**
 * Stored tag order, comma-joined. Canonical tags contain no comma.
 * Null means the column was null; an empty array is an empty string.
 */
export function tagListDecisionStatus(tags: readonly string[] | null | undefined): string | null {
  if (tags == null) return null;
  return tags.join(",");
}

export interface AdminDecisionAuditInput {
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  targetUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Extra context. `beforeStatus` and `afterStatus` always win over keys here. */
  metadata?: Record<string, unknown>;
}

export async function recordAdminDecisionAudit(input: AdminDecisionAuditInput): Promise<string | undefined> {
  const values: AccessAuditLogValues = {
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    targetUserId: input.targetUserId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: {
      ...(input.metadata ?? {}),
      beforeStatus: input.beforeStatus,
      afterStatus: input.afterStatus,
    },
  };
  return recordAdminAudit(values);
}
