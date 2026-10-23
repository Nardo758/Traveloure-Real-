/**
 * Earner payout details (fix-queue row 115). Leads the earner's settings; never a gate — earning never waits on it.
 * Stripe Connect first (the existing onboard route), PayPal or another method as the alternative. No bank fields.
 */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  PAYOUT_HANDLE_MAX,
  PAYOUT_METHOD_LABELS,
  PAYOUT_SETUP_COPY as T,
  PAYOUT_SETUP_URL,
  handleReady,
  payoutCardState,
  payoutSetupBody,
  serverError,
  type PayoutMethodType,
  type PayoutSetup,
} from "@/lib/payout-setup";

export function PayoutDetailsCard({ initialEditing = false }: { initialEditing?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<PayoutSetup>({ queryKey: [PAYOUT_SETUP_URL], retry: false });
  const [editing, setEditing] = React.useState(initialEditing);
  const [method, setMethod] = React.useState<Exclude<PayoutMethodType, "stripe_connect">>("paypal");
  const [handle, setHandle] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (m: PayoutMethodType) => (await apiRequest("PUT", PAYOUT_SETUP_URL, payoutSetupBody(m, handle))).json(),
    onSuccess: (next: PayoutSetup) => {
      setSaveError(null);
      setEditing(false);
      queryClient.setQueryData([PAYOUT_SETUP_URL], next);
      toast({ title: T.saved });
    },
    onError: (err) => setSaveError(serverError(err).message ?? T.saveFailed),
  });
  const connect = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/stripe/connect/onboard")).json() as Promise<{ url?: string }>,
    onSuccess: (r) => { if (r?.url) window.location.href = r.url; },
    onError: (err) => toast({ title: T.stripeFailed, description: serverError(err).message ?? undefined, variant: "destructive" }),
  });

  // Not an earner (403) or not signed in: nothing to show.
  if (error) {
    const s = serverError(error).status;
    if (s === 401 || s === 403) return null;
  }
  if (isLoading) return null;

  const state = data ? payoutCardState(data) : null;
  const usingHandle = data?.payoutMethodType === "paypal" || data?.payoutMethodType === "other";
  return (
    <Card data-testid="card-payout-details">
      <CardHeader>
        <CardTitle>{T.cardTitle}</CardTitle>
        <CardDescription>{T.cardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error || !data ? (
          <p className="text-sm text-red-600">{T.loadFailed}</p>
        ) : (
          <>
            <p className="text-sm" data-testid={`payout-state-${state}`}>
              {state === "complete_stripe"
                ? T.completeStripe
                : state === "complete_handle"
                  ? T.completeHandle(PAYOUT_METHOD_LABELS[data.payoutMethodType!], data.payoutHandle ?? "")
                  : state === "connect_in_progress"
                    ? T.connectInProgress
                    : T.incomplete}
            </p>
            {!data.setupComplete ? <p className="text-xs text-muted-foreground">{T.noSavedCardNeeded}</p> : null}

            {!editing ? (
              <div className="flex flex-wrap gap-2">
                {!data.setupComplete && !usingHandle ? (
                  <Button data-testid="button-payout-stripe" disabled={connect.isPending} onClick={() => connect.mutate()}>
                    {connect.isPending ? T.stripeOpening : state === "connect_in_progress" ? T.stripeContinue : T.stripePrimary}
                  </Button>
                ) : null}
                {usingHandle && !data.setupComplete ? (
                  <Button data-testid="button-payout-stripe" disabled={connect.isPending} onClick={() => connect.mutate()}>
                    {connect.isPending ? T.stripeOpening : T.stripePrimary}
                  </Button>
                ) : null}
                {data.setupComplete ? (
                  <Button variant="outline" data-testid="button-payout-change" onClick={() => setEditing(true)}>{T.change}</Button>
                ) : (
                  <Button variant="outline" data-testid="button-payout-alternative" onClick={() => setEditing(true)}>{T.useAlternative}</Button>
                )}
              </div>
            ) : (
              <div className="space-y-3" data-testid="payout-handle-form">
                <div className="space-y-1">
                  <Label htmlFor="payout-method">{T.fieldMethod}</Label>
                  <select id="payout-method" data-testid="payout-method" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as "paypal" | "other")}>
                    <option value="paypal">{PAYOUT_METHOD_LABELS.paypal}</option>
                    <option value="other">{PAYOUT_METHOD_LABELS.other}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="payout-handle">{method === "paypal" ? T.fieldHandlePaypal : T.fieldHandleOther}</Label>
                  <Input id="payout-handle" data-testid="payout-handle" maxLength={PAYOUT_HANDLE_MAX} autoComplete="off" value={handle} onChange={(e) => { setHandle(e.target.value); setSaveError(null); }} />
                  <p className="text-xs text-muted-foreground">{method === "paypal" ? T.handleHintPaypal : T.handleHintOther}</p>
                </div>
                {saveError ? <p className="text-sm text-red-600" data-testid="payout-save-error">{saveError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="button-payout-save" disabled={save.isPending || !handleReady(method, handle)} onClick={() => save.mutate(method)}>
                    {save.isPending ? T.saving : T.save}
                  </Button>
                  <Button variant="outline" data-testid="button-payout-use-stripe" disabled={save.isPending} onClick={() => save.mutate("stripe_connect")}>
                    {T.useStripeInstead}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
