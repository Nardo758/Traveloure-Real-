/**
 * R3 U8a - the ONE wiring for saved-card actions, so the profile card and the R3 Payment methods page cannot drift.
 * Behaviour and copy are exactly what PaymentMethodsCard carried inline before this file existed.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const QUERY_KEY = ["/api/me/payment-methods"];

export function usePaymentMethodActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      setPendingId(paymentMethodId);
      const res = await apiRequest("POST", "/api/me/payment-methods/default", { paymentMethodId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Default payment method updated" });
      void refresh();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update the default payment method", description: err?.message, variant: "destructive" });
    },
    onSettled: () => setPendingId(null),
  });

  const removeMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      setPendingId(paymentMethodId);
      const res = await apiRequest("DELETE", `/api/me/payment-methods/${paymentMethodId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment method removed" });
      void refresh();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't remove this payment method", description: err?.message, variant: "destructive" });
    },
    onSettled: () => setPendingId(null),
  });

  return {
    setDefault: (paymentMethodId: string) => setDefaultMutation.mutate(paymentMethodId),
    remove: (paymentMethodId: string) => removeMutation.mutate(paymentMethodId),
    pendingId,
    removing: removeMutation.isPending,
  };
}
