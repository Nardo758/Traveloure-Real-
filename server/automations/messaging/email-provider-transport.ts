import type { AutomationContext, AutomationDefinition } from "../contract";

export const emailProviderTransportAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.email-provider-transport",
  name: "Submit email through configured Resend client",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["email.provider_send"] },
  condition: {
    description: "Run only around the existing send call on the configured cached provider client.",
    evaluate: (context) => context.providerConfigured === true,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing caller owns message content, business decisions, key/no-op handling and error contracts; this node observes only the real provider transport call.",
  action: { kind: "call_external_api", detail: "Submit unchanged arguments to the existing Resend emails.send method; a provider response or acceptance is not proof of recipient delivery." },
  actionOutcome: (result) =>
    typeof result === "object" && result !== null &&
    "error" in result && (result as { error?: unknown }).error != null
      ? "failure"
      : "success",
  retryPolicy: "No automation retry; the existing caller and provider behavior remain authoritative.",
  failureBehavior: "Provider response values and thrown errors pass through unchanged to the original caller.",
  enabled: true,
};