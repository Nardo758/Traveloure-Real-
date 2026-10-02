import type { AutomationDefinition, AutomationContext } from "../contract";

export const partnerizeCampaignSyncAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.partnerize-campaign-sync",
  name: "Conditional Partnerize campaign sync",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "every 12 hours only after the existing credential gate",
    scheduleId: "partnerize-campaign-sync",
    source: "cacheSchedulerService credential-conditional warm timer; no external runner route",
  },
  condition: {
    description: "Partnerize credentials must already have resolved in the current scheduler path.",
    evaluate: (context) => context.credentialsConfigured === true,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing Partnerize sync upserts its catalog; the registry does not enable credentials or invent an API key.",
  action: {
    kind: "call_external_api",
    detail: "partnerizeSyncService.syncCampaigns remains conditional and local-only",
  },
  retryPolicy: "Existing runBackgroundJob handling and service behavior; no cron retry channel was found.",
  failureBehavior: "The integration remains unvalidated credential-gated scaffolding and absent from external cron.",
  enabled: true,
};