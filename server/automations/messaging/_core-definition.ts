import type { AutomationDefinition } from "../contract";

export type CoreKind = "verify_email" | "welcome" | "verify_reminder_1h" | "verify_reminder_1d" |
  "verify_reminder_3d" | "already_have_account" | "google_login_added" | "reset_request" |
  "password_changed" | "new_device_login" | "account_locked" | "deletion_confirm" |
  "deletion_complete" | "profile_nudge" | "planner_nudge";
export interface MessageValues {
  name: string; device?: string; place?: string; time?: string;
  missing?: string[]; destination?: string; language?: string;
}
export interface MessageCopy { subject: string; body: string; button?: string; path?: string }
export interface CoreMessage {
  kind: CoreKind;
  node: AutomationDefinition;
  copy: (values: MessageValues) => MessageCopy;
}
export const REMINDER_IDS = [
  "messaging.verify_reminder_1h", "messaging.verify_reminder_1d", "messaging.verify_reminder_3d",
] as const;
export function coreNode(kind: CoreKind, id = `messaging.${kind}`, enabled = true): AutomationDefinition {
  return {
    id, name: kind, domain: "messaging",
    type: kind.endsWith("_nudge") ? "marketing" : "must_have",
    trigger: { kind: "event", events: [`signup_journey.${kind}`] },
    condition: { description: "The durable worker has rechecked account, consent, token and due-time guards.",
      evaluate: (context) => context.coreEligible === true },
    idempotencyKey: `signup-journey:${kind}:{user_id}:{related_id}`,
    delay: null, // Delay is persisted on signup_journey_jobs before dispatch, never slept in-process.
    cancels: kind === "welcome" ? REMINDER_IDS : [],
    actionOutcome: (result) => (result as { queued?: boolean } | null)?.queued ? "success" : "skipped",
    actionGuard: "Claim the durable job and insert exactly one outbox row in the same database transaction.",
    action: { kind: "enqueue_job", detail: "Render the journey template and insert into the existing email_outbox." },
    retryPolicy: "Journey outbox rows only: 1, 5, 30 minute retries; provider idempotency; terminal admin alert.",
    failureBehavior: "Throw on persistence failure; never fall back to a non-durable direct send.",
    enabled,
  };
}