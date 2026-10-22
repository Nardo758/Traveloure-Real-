/**
 * The order a new account finishes signing up.
 *
 * Verify the email first. R611's saved-method signup screen is a later lane: it
 * passes `paymentMethodRequired: true` and this function then returns
 * `payment_method`. This lane does not collect a card, talk to Stripe, or render
 * a payment step. The payment step stays unreachable until the email step has
 * cleared, because this function returns `verify_email` first.
 */
export const SIGNUP_STEP_VERIFY_EMAIL = "verify_email" as const;
export const SIGNUP_STEP_PAYMENT_METHOD = "payment_method" as const;

export type SignupStep = typeof SIGNUP_STEP_VERIFY_EMAIL | typeof SIGNUP_STEP_PAYMENT_METHOD;

export function nextSignupStep(input: {
  emailVerificationRequired: boolean;
  /** The payment-method lane sets this. Left unset, the step is not offered. */
  paymentMethodRequired?: boolean;
}): SignupStep | null {
  if (input.emailVerificationRequired) return SIGNUP_STEP_VERIFY_EMAIL;
  if (input.paymentMethodRequired === true) return SIGNUP_STEP_PAYMENT_METHOD;
  return null;
}
