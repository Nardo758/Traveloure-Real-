import type { AutomationDefinition } from "../contract";

export const applicationBioMirrorAutomation: AutomationDefinition = {
  id: "provider.application-bio-mirror",
  name: "Mirror submitted application biography to the account profile",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["application.bio_mirror"] },
  condition: {
    description: "The existing nonblank-bio helper supplies the authenticated account ID.",
    evaluate: (context) => typeof context.userId === "string" && context.userId.length > 0,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing helper rejects absent/blank biographies and trims the latest submission before its unconditional account-profile overwrite; no fabricated empty value or submission dedupe is added.",
  action: { kind: "mutate_record", detail: "Run the existing post-persistence users.bio mirror for expert creation/resubmission and provider creation, including compatibility aliases." },
  retryPolicy: "No automation retry; the existing separate backfill remains outside this action.",
  failureBehavior: "The original helper catches/logs failures and does not fail the already-persisted application.",
  enabled: true,
};