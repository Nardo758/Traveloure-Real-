/**
 * Outbox classes for an address change (row 168, Z-18).
 *
 * Architect, Oct 26 2026: must-have and security rows are re-addressed and
 * re-queued; every other type is cancelled; old-address-by-design notices
 * are exempt. Which concrete type sits in which class is taken from the
 * sender inventory. A type that is not clearly must-have, security, or
 * old-address-by-design is cancelled.
 *
 * NOT_ACCOUNT_BOUND is the exempt seven. Architect, Oct 26 2026, 6:50 PM ET:
 * those types are correct as they stand. They go to an admin inbox, an ops
 * inbox, or a vendor contract address. A match on a user's previous address
 * would be a coincidence.
 *
 * Must-have is 22 types. Cancelled-by-default is 15. earner_no_response stays
 * cancelled. The must-have list is the one table in this module.
 *
 * email_changed_old is named ahead of its sender. Row 172 slice d creates
 * that sender. This module keeps the helper from touching it.
 *
 * CANCELLED_BY_DEFAULT is documentation and tests only. The SQL cancels
 * every claimable row that is not in the other four sets and whose
 * metadata.authCritical is not true.
 *
 * Row 170 imports isDeliveryPriorityEmail. This PR's SQL does not.
 */
import { sql, type SQL } from "drizzle-orm";

export const SECURITY_EMAIL_TYPES = ["password_reset", "email_verification"] as const;

/** Must-have. 22 types. One table. */
export const MUST_HAVE_EMAIL_TYPES = [
  "booking_confirmation",
  "canonical_booking_confirmation",
  "liteapi_stay_voucher",
  "cancellation_refund",
  "payment_failed",
  "late_success_refund",
  "expired_claim",
  "booking_decline",
  "provider_booking_alert",
  "plan_delivered",
  "ready_made_purchase_delivered",
  "itinerary_ready",
  "itinerary_failed",
  "expert_application_approved",
  "expert_application_rejected",
  "provider_application_approved",
  "provider_application_rejected",
  "verification_decision",
  "activity_booking_cancelled",
  "plan_approved",
  "plan_changes_requested",
  "activity_quote_request",
] as const;

/** Named ahead of its sender. Row 172 slice d creates the sender. */
export const OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES = ["email_changed_old"] as const;

/**
 * Not an account address. Cursor-side safety choice: admin, ops, and vendor
 * mail stays where it was queued.
 */
export const NOT_ACCOUNT_BOUND_EMAIL_TYPES = [
  "admin_daily_digest",
  "admin_digest_24h",
  "admin_test_email",
  "ai_upstream_alert",
  "nightly_qa",
  "manual_send_test",
  "vendor_bulk_email",
] as const;

/**
 * Cancelled under the ruling. 15 types. earner_no_response stays cancelled
 * (Architect, Oct 26 2026, 6:50 PM ET).
 */
export const CANCELLED_BY_DEFAULT_EMAIL_TYPES = [
  "itinerary_nudge_2h",
  "itinerary_followup_24h",
  "itinerary_reengagement_5d",
  "signup_welcome",
  "occasion_reminder",
  "new_suggestion",
  "ready_made_revision_requested",
  "earner_no_response",
  "guest_invite",
  "waitlist_apply_invite",
  "waitlist_open",
  "generic",
  "activity_advisor_invite",
  "activity_new_message",
  "activity_review_received",
] as const;

/**
 * Marketing sends the drain cancels when that address has revoked the waitlist
 * notify consent or has unsubscribed. Architect F3, Oct 29, 2026: this list is
 * `waitlist_open` only. Transactional types stay out of it.
 * `waitlist_open` also stays in CANCELLED_BY_DEFAULT for the address-change
 * reclass; this list does not move it.
 */
export const MARKETING_EMAIL_TYPES = ["waitlist_open"] as const;

/** Settled on a marketing row that is not sent because consent was revoked or the address unsubscribed. */
export const WAITLIST_MARKETING_REVOKED_REASON = "waitlist_consent_revoked";

export function isMarketingEmailType(emailType: string | null | undefined): boolean {
  return typeof emailType === "string" && (MARKETING_EMAIL_TYPES as readonly string[]).includes(emailType);
}

export type OutboxEmailClass =
  | "security"
  | "must_have"
  | "old_address_by_design"
  | "not_account_bound"
  | "cancelled_by_default";

const SECURITY = new Set<string>(SECURITY_EMAIL_TYPES);
const MUST_HAVE = new Set<string>(MUST_HAVE_EMAIL_TYPES);
const OLD_ADDRESS = new Set<string>(OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES);
const NOT_ACCOUNT_BOUND = new Set<string>(NOT_ACCOUNT_BOUND_EMAIL_TYPES);

function authCriticalFlag(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as { authCritical?: unknown }).authCritical === true;
}

/**
 * Exempt sets first, then security (type or metadata.authCritical === true),
 * then must-have, otherwise cancelled.
 */
export function classifyOutboxEmail(emailType: string, metadata: unknown): OutboxEmailClass {
  if (OLD_ADDRESS.has(emailType)) return "old_address_by_design";
  if (NOT_ACCOUNT_BOUND.has(emailType)) return "not_account_bound";
  if (SECURITY.has(emailType) || authCriticalFlag(metadata)) return "security";
  if (MUST_HAVE.has(emailType)) return "must_have";
  return "cancelled_by_default";
}

/**
 * Security, must-have, and old-address-by-design. A security notice aimed at
 * the previous address is still a security notice. Row 170's 15-minute target
 * reads this. The re-address SQL does not.
 */
export function isDeliveryPriorityEmail(emailType: string, metadata: unknown): boolean {
  const klass = classifyOutboxEmail(emailType, metadata);
  return klass === "security" || klass === "must_have" || klass === "old_address_by_design";
}

function textArray(names: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    names.map((name) => sql`${name}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * Boolean SQL fragments built from the same sets classifyOutboxEmail uses.
 * readdressable: security or must-have, or authCritical true, and not exempt.
 * cancelRest: not in those sets and authCritical is not true.
 */
export function outboxReaddressClassSql(): { readdressable: SQL; cancelRest: SQL } {
  const exempt = [...OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES, ...NOT_ACCOUNT_BOUND_EMAIL_TYPES];
  const readdressTypes = [...SECURITY_EMAIL_TYPES, ...MUST_HAVE_EMAIL_TYPES];
  const kept = [...readdressTypes, ...exempt];
  const authCritical = sql`(metadata->'authCritical') = 'true'::jsonb`;
  const notAuthCritical = sql`(metadata->'authCritical') IS DISTINCT FROM 'true'::jsonb`;
  return {
    readdressable: sql`(
      email_type <> ALL(${textArray(exempt)})
      AND (
        email_type = ANY(${textArray(readdressTypes)})
        OR ${authCritical}
      )
    )`,
    cancelRest: sql`(
      email_type <> ALL(${textArray(kept)})
      AND ${notAuthCritical}
    )`,
  };
}

/**
 * Delivery-priority predicate (row 170). Security, must-have, and
 * old-address-by-design, plus metadata.authCritical on any type
 * classifyOutboxEmail would call security. Not-account-bound stays out:
 * classify returns that class before the authCritical arm, and
 * isDeliveryPriorityEmail follows it.
 *
 * The type lists ride in one bound object. A claim-text stub stringifies
 * query chunks, and a printed type name would look like an allowlist entry.
 */
export function outboxDeliveryPrioritySql(): SQL {
  const payload = {
    types: [
      ...SECURITY_EMAIL_TYPES,
      ...MUST_HAVE_EMAIL_TYPES,
      ...OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES,
    ],
    exempt: [...NOT_ACCOUNT_BOUND_EMAIL_TYPES],
  };
  return sql`(
    email_type = ANY (
      ARRAY(SELECT jsonb_array_elements_text((${payload}::jsonb) -> 'types'))
    )
    OR (
      metadata->>'authCritical' = 'true'
      AND email_type <> ALL (
        ARRAY(SELECT jsonb_array_elements_text((${payload}::jsonb) -> 'exempt'))
      )
    )
  )`;
}
