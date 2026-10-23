/**
 * Stripe Connect reminder policy, shared by the manual admin routes and the scheduler.
 *
 * One cooldown. Reminders are notification rows only — this module does not import
 * the email sender or the generation-notice gate.
 */
import { isExpertRole, isProviderRole } from "@shared/roles";

/** 72 hours. Manual reminders and the scheduled batch both read this constant. */
export const STRIPE_CONNECT_REMINDER_COOLDOWN_MS = 72 * 60 * 60 * 1000;

export const STRIPE_CONNECT_REMINDER_TYPE = "stripe_connect_reminder";

export const STRIPE_CONNECT_REMINDER_AUDIT_ACTION = "stripe_connect_reminder";

/** Existing provider-route copy, reused for the expert manual reminder. */
export const MANUAL_STRIPE_REMINDER_TITLE = "Complete Your Payout Setup";
export const MANUAL_STRIPE_REMINDER_MESSAGE =
  "An admin has sent you a reminder to complete your Stripe Connect setup so you can receive payouts. Visit your Money page to get started.";

/** Existing scheduler copy. */
export const SCHEDULED_STRIPE_REMINDER_TITLE = "Set up payouts to get paid";
export const SCHEDULED_STRIPE_REMINDER_MESSAGE =
  "You have been approved but haven't connected your Stripe account yet. Complete Stripe Connect setup so you can receive payouts for your bookings.";

const CONNECT_DONE = new Set(["complete", "active"]);

export function connectStatusSatisfied(status: string | null | undefined): boolean {
  return CONNECT_DONE.has(String(status ?? "").trim().toLowerCase());
}

/**
 * An expert is reminded only when Connect itself is still open.
 * Connect status is `local_expert_forms.stripe_connect_status`.
 * `users.stripe_account_status` is not an input: the account.updated webhook writes the
 * form column on every event, and the users column only when metadata.userId is present.
 *
 * Identity-only: Connect is already satisfied and Identity is not. That expert is skipped.
 * Connect still open is a reminder whether or not Identity is verified.
 */
export function expertNeedsStripeConnectReminder(input: {
  stripeConnectStatus: string | null | undefined;
  identityVerificationStatus: string | null | undefined;
}): boolean {
  // Connect already satisfied → no reminder. That includes the Identity-only gap
  // (Connect complete, Identity not verified) and a fully finished Connect + Identity pair.
  if (connectStatusSatisfied(input.stripeConnectStatus)) return false;
  // Connect is still open. Identity may be verified or not; the reminder is about Connect.
  void input.identityVerificationStatus;
  return true;
}

/**
 * Providers have no expert form. Their Connect status stays on the users columns.
 */
export function providerNeedsStripeConnectReminder(input: {
  stripeAccountId: string | null | undefined;
  stripeAccountStatus: string | null | undefined;
}): boolean {
  if (!input.stripeAccountId) return true;
  if (!String(input.stripeAccountStatus ?? "").trim()) return true;
  return !connectStatusSatisfied(input.stripeAccountStatus);
}

export function candidateNeedsStripeConnectReminder(row: {
  role: string | null | undefined;
  stripeAccountId?: string | null;
  stripeAccountStatus?: string | null;
  formStripeConnectStatus?: string | null;
  identityVerificationStatus?: string | null;
}): boolean {
  if (isExpertRole(row.role)) {
    return expertNeedsStripeConnectReminder({
      stripeConnectStatus: row.formStripeConnectStatus,
      identityVerificationStatus: row.identityVerificationStatus,
    });
  }
  if (isProviderRole(row.role)) {
    return providerNeedsStripeConnectReminder({
      stripeAccountId: row.stripeAccountId,
      stripeAccountStatus: row.stripeAccountStatus,
    });
  }
  return false;
}

/** Expert-family roles go to the expert Money page. Every other reminded role is a provider. */
export function stripeConnectReminderLink(role: string | null | undefined): "/expert/money" | "/provider/money" {
  return isExpertRole(role) ? "/expert/money" : "/provider/money";
}

export function reminderCooldownCutoff(now = Date.now()): Date {
  return new Date(now - STRIPE_CONNECT_REMINDER_COOLDOWN_MS);
}
