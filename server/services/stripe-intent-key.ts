/**
 * Keep an in-flight PaymentIntent on its existing idempotency key.
 *
 * Adding a field (customer, setup_future_usage, or dropping off_session) makes
 * Stripe reject a retry whose key was first used with the previous body. The
 * key string stays the same. On that rejection, the previous body is sent again
 * under that same key, which returns the original PaymentIntent instead of
 * minting a second one.
 *
 * Ledger `2026-10-21-saved-method-onsession`.
 */

export function isIdempotencyParamMismatch(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string; code?: string; raw?: { type?: string; code?: string } };
  const type = e.type ?? e.raw?.type;
  const code = e.code ?? e.raw?.code;
  return type === "idempotency_error" || code === "idempotency_error";
}

export async function createPaymentIntentPreservingKey<T extends object, R>(
  create: (params: T) => Promise<R>,
  nextParams: T,
  legacyParams: T,
): Promise<R> {
  try {
    return await create(nextParams);
  } catch (err) {
    if (nextParams === legacyParams || !isIdempotencyParamMismatch(err)) throw err;
    return await create(legacyParams);
  }
}
