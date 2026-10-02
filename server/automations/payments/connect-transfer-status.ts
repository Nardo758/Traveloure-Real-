import type { AutomationDefinition, AutomationContext } from "../contract";

export function supportedConnectTransfer(context: AutomationContext): boolean {
  if (context.signatureVerified !== true || !context.payload || typeof context.payload !== "object") return false;
  const event = context.payload as {
    data?: { object?: { metadata?: { payoutId?: unknown; requesterType?: unknown } } };
  };
  const metadata = event.data?.object?.metadata;
  return !!metadata?.payoutId && (metadata.requesterType === "expert" || metadata.requesterType === "provider");
}

export const connectTransferStatusAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.connect-transfer-status",
  name: "Connected-account transfer status callback",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["transfer.created", "transfer.paid"] },
  condition: {
    description: "A signature-verified transfer event with the existing payout/requester metadata is required.",
    evaluate: supportedConnectTransfer,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing payout-row status writers store the transfer ID; the webhook receipt remains the event ledger. No transfer is initiated here.",
  action: {
    kind: "mutate_record",
    detail: "Connect webhook marks the named expert/provider payout completed for transfer.created or transfer.paid",
  },
  retryPolicy: "Existing receipt error/HTTP retry semantics apply to storage failures.",
  failureBehavior: "Missing or unsupported payout metadata remains the existing acknowledged no-op, not a fabricated status transition.",
  enabled: true,
};