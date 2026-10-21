import { createHash } from "crypto";

/**
 * Customer-create decisions for `getOrCreateCustomer` (ledger
 * `2026-10-21-saved-method-required`).
 *
 * The key is the user id, so two concurrent creates of the same user ask Stripe
 * for one Customer. A recovery after a deleted Customer must NOT reuse that key:
 * Stripe replays the original response for 24 hours, which would store the
 * deleted id again. The stale id is part of the recovery key for that reason.
 *
 * Stripe's idempotency-key limit is 255 characters
 * (https://docs.stripe.com/api/idempotent_requests). A user id that does not
 * fit, or that is not printable ASCII, is hashed. The hash is still a pure
 * function of the user id (and the stale id, on recovery).
 */
export const STRIPE_IDEMPOTENCY_KEY_MAX = 255;

export function customerCreateIdempotencyKey(userId: string, afterStaleCustomerId?: string): string {
  const raw = afterStaleCustomerId
    ? `customer-create:${userId}:after:${afterStaleCustomerId}`
    : `customer-create:${userId}`;
  if (raw.length <= STRIPE_IDEMPOTENCY_KEY_MAX && /^[\x20-\x7E]+$/.test(raw)) return raw;
  return `customer-create:${createHash("sha256").update(raw).digest("hex")}`;
}

/**
 * Which Customer id the caller may use after a conditional
 * `UPDATE … WHERE stripe_customer_id IS NULL`.
 *
 * The winner's RETURNING row is the id to use. A loser re-reads the stored id
 * and returns THAT, never the Customer this attempt created when the two
 * differ — using the unstored id is how a concurrent create orphans a Customer
 * and then charges it. When nothing was stored (the user row disappeared),
 * the created id is not returned.
 */
export function customerIdAfterCreate(input: {
  createdId: string;
  updateReturnedId: string | null;
  rereadId: string | null;
}): { returnId: string | null; orphanedCreatedId: string | null } {
  if (input.updateReturnedId) {
    return { returnId: input.updateReturnedId, orphanedCreatedId: null };
  }
  if (input.rereadId) {
    return {
      returnId: input.rereadId,
      orphanedCreatedId: input.rereadId === input.createdId ? null : input.createdId,
    };
  }
  return { returnId: null, orphanedCreatedId: input.createdId };
}
