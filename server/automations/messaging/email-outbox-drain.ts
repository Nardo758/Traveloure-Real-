import type { AutomationContext, AutomationDefinition } from "../contract";

export const emailOutboxDrainAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.email-outbox-drain",
  name: "Drain due transactional email outbox rows",
  domain: "messaging",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "every 5 minutes",
    scheduleId: "email-outbox-drain",
    source: "server/services/email-outbox.service.ts existing scheduler",
  },
  condition: {
    description: "Run only for the existing email outbox drain schedule.",
    evaluate: (context) => context.scheduleId === "email-outbox-drain",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing atomic FOR UPDATE SKIP LOCKED claim, due-status filter, stale 10-minute lease recovery, and conditional status updates remain authoritative.",
  action: { kind: "send_message", detail: "Claim and attempt up to 50 due or lease-expired email outbox rows" },
  retryPolicy: "No registry retry. Each row uses its existing maximum of six attempts and 5/15/45/120/360-minute retry schedule; the sixth failed attempt becomes dead.",
  failureBehavior: "The existing drain result reports claimed row count and claim errors. Individual delivery failures are recorded on rows and logged; a successful drain result does not mean every email was delivered.",
  enabled: true,
};