/**
 * Gap 9: the Stripe Connect Remind button, shared by the not-routable experts list and the provider rows.
 * Disabled while the server's `reminderCooldownEndsAt` is in the future; 409 and 429 are said plainly.
 */
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PAYOUT_OPS_COPY as T, cooldownActive, remindErrorLine } from "@/lib/payout-ops";

export function RemindStripeButton({
  kind,
  userId,
  cooldownEndsAt,
  listQueryKey,
  testId,
}: {
  kind: "expert" | "provider";
  userId: string;
  cooldownEndsAt: string | null | undefined;
  listQueryKey: readonly unknown[];
  testId?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = React.useState<string | null>(null);
  const remind = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/${kind === "expert" ? "experts" : "providers"}/${encodeURIComponent(userId)}/remind-stripe`, {}),
    onSuccess: () => {
      setError(null);
      toast({ title: T.remindSent });
      queryClient.invalidateQueries({ queryKey: [...listQueryKey] });
    },
    onError: (err) => {
      setError(remindErrorLine(err));
      // A 429 means the server has a cooldown this row did not show yet: re-read it.
      queryClient.invalidateQueries({ queryKey: [...listQueryKey] });
    },
  });
  const coolingDown = cooldownActive(cooldownEndsAt);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        title={T.remindTitle}
        data-testid={testId ?? `button-remind-${kind}-${userId}`}
        disabled={remind.isPending || coolingDown}
        onClick={() => remind.mutate()}
      >
        {remind.isPending ? T.remindSending : T.remind}
      </Button>
      {coolingDown && cooldownEndsAt ? (
        <span className="text-xs text-muted-foreground" data-testid={`remind-cooldown-${userId}`}>
          {T.remindCooldown(new Date(cooldownEndsAt).toLocaleString())}
        </span>
      ) : null}
      {error ? <span className="text-xs text-red-600" data-testid={`remind-error-${userId}`}>{error}</span> : null}
    </div>
  );
}
