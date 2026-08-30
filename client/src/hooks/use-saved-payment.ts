/**
 * useSavedPayment — FP-2: shared read hook over FP-1's `/api/me/payment-methods`.
 *
 * Exposes the session user's vaulted default card (brand/last4) so one-click "Pay with
 * saved card" buttons can render without every call site re-implementing the fetch/shape.
 * Gated on the caller telling us the user is signed in (`enabled`) — the endpoint 401s for
 * guests, and callers here (cart optimize, my-events pay) already gate their own actions on
 * `user` from useAuth, so we ask for that same signal rather than importing useAuth here.
 *
 * Honest states only (§13): no card / Stripe unavailable both resolve to hasDefault=false,
 * never a fabricated placeholder.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface PaymentMethodsResponse {
  available: boolean;
  defaultPaymentMethodId: string | null;
  methods: SavedCard[];
}

const QUERY_KEY = ["/api/me/payment-methods"];

export function useSavedPayment(enabled: boolean = true) {
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaymentMethodsResponse>({
    queryKey: QUERY_KEY,
    enabled,
  });

  const methods = data?.methods ?? [];
  const defaultCard =
    (data?.defaultPaymentMethodId && methods.find((m) => m.id === data.defaultPaymentMethodId)) ||
    methods[0] ||
    null;

  return {
    available: data?.available ?? false,
    hasDefault: !!defaultCard,
    defaultCard,
    defaultPaymentMethodId: data?.defaultPaymentMethodId ?? null,
    methods,
    isLoading: enabled && isLoading,
    isFetching,
    refresh: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  };
}

/** "Visa ••4242" — the label the one-click buttons show. */
export function formatCardLabel(card: SavedCard | null): string {
  if (!card) return "";
  const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  return `${brand} ••${card.last4}`;
}
