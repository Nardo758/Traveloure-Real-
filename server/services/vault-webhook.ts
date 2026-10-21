/**
 * Platform webhook events that record a saved payment method and do nothing else
 * (ledger `2026-10-21-saved-method-required`).
 *
 * The route signature-checks the delivery before `handleWebhook` runs. These
 * three types then take the same claim as every other platform event and write
 * no fulfillment: no booking, no membership, no PaymentIntent, no local card
 * row. The saved-method list is still read live from Stripe.
 */
export const VAULT_RECORD_EVENT_TYPES = [
  "setup_intent.succeeded",
  "payment_method.attached",
  "payment_method.detached",
] as const;

export type VaultRecordEventType = (typeof VAULT_RECORD_EVENT_TYPES)[number];

export function vaultWebhookDisposition(eventType: string): "record_only" | null {
  return (VAULT_RECORD_EVENT_TYPES as readonly string[]).includes(eventType) ? "record_only" : null;
}

/** Operator log line. Event type only — no payment-method payload, no key. */
export function vaultRecordLogLine(eventType: string): string {
  return `[stripe-webhook] ${eventType} recorded; no fulfillment and no local payment-method row`;
}
