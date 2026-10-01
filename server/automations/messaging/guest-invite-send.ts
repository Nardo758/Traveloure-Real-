import type { AutomationContext, AutomationDefinition } from "../contract";

export const guestInviteSendAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.guest-invite-send",
  name: "Enqueue guest invitation emails",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["guest_invite.send"] },
  condition: { description: "Run for the existing organizer guest-invite send request.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing organizer ownership, hidden-occasion refusal, invite row claim/debounce, and release-on-enqueue-failure guards remain authoritative.",
  action: { kind: "enqueue_job", detail: "Claim eligible invitation rows and enqueue accepted guest messages via the existing outbox; enqueued is not delivered." },
  retryPolicy: "No automation retry; the existing per-invite debounce and outbox retry behavior remain authoritative.",
  failureBehavior: "Existing whole-request refusal and per-invite enqueue outcomes are returned unchanged.",
  enabled: true,
};