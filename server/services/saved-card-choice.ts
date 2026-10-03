/**
 * Which vaulted card a one-click charge may name.
 *
 * The traveler's default, or a card they named on this request after the server has
 * checked it is one of theirs. The most recently added card is not a choice — charging
 * it because no default existed billed a card the traveler had not picked (payments QA
 * bug 6). A requested id that is not in their vault charges nothing on this path; the
 * caller falls through to the card form rather than substituting a different card.
 */
export function resolveSavedCardChargeId(
  methods: ReadonlyArray<{ id: string }>,
  defaultPaymentMethodId: string | null,
  requestedId?: string | null,
): string | null {
  if (requestedId) {
    return methods.some((method) => method.id === requestedId) ? requestedId : null;
  }
  if (defaultPaymentMethodId && methods.some((method) => method.id === defaultPaymentMethodId)) {
    return defaultPaymentMethodId;
  }
  return null;
}
