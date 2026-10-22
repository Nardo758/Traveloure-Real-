/**
 * Ops gap 8: the booking auto-cancel config and a "run now" behind a confirm step. The confirm step shows the
 * count from `POST …/auto-cancel/run?dryRun=1`, which acts on nothing.
 */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_OPS_COPY as T, autoCancelConfirmLine, autoCancelRanLine, parseThresholdHours } from "@/lib/admin-ops";

export const AUTO_CANCEL_CONFIG_URL = "/api/admin/bookings/auto-cancel/config";
const RUN_URL = "/api/admin/bookings/auto-cancel/run";

export interface AutoCancelConfigPayload {
  config: { staleThresholdHours: number };
  lastRun: { cancelledCount: number; ranAt: string } | null;
  isRunning: boolean;
}

export function AutoCancelTab({ initialConfirmCount = null }: { initialConfirmCount?: number | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, error } = useQuery<AutoCancelConfigPayload>({ queryKey: [AUTO_CANCEL_CONFIG_URL] });
  const hours = data?.config.staleThresholdHours ?? null;
  const [draft, setDraft] = React.useState<string | null>(null);
  const [confirmCount, setConfirmCount] = React.useState<number | null>(initialConfirmCount);
  const value = draft ?? (hours != null ? String(hours) : "");
  const parsed = parseThresholdHours(value);

  const save = useMutation({
    mutationFn: async (h: number) => (await apiRequest("PATCH", AUTO_CANCEL_CONFIG_URL, { staleThresholdHours: h })).json(),
    onSuccess: () => {
      toast({ title: T.autoSaved });
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: [AUTO_CANCEL_CONFIG_URL] });
    },
    onError: () => toast({ title: T.autoSaveFailed, variant: "destructive" }),
  });
  const count = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${RUN_URL}?dryRun=1`)).json() as Promise<{ count: number }>,
    onSuccess: (r) => setConfirmCount(r.count),
    onError: () => toast({ title: T.autoRunFailed, variant: "destructive" }),
  });
  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", RUN_URL)).json() as Promise<{ stats: { cancelledCount: number } }>,
    onSuccess: (r) => {
      toast({ title: T.autoRan, description: autoCancelRanLine(r.stats.cancelledCount) });
      setConfirmCount(null);
      queryClient.invalidateQueries({ queryKey: [AUTO_CANCEL_CONFIG_URL] });
    },
    onError: () => toast({ title: T.autoRunFailed, variant: "destructive" }),
  });

  return (
    <Card data-testid="ops-auto-cancel">
      <CardHeader>
        <CardTitle>{T.autoTitle}</CardTitle>
        <CardDescription>{T.autoDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600">{T.autoLoadFailed}</p> : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ops-auto-cancel-hours">{T.autoThreshold}</Label>
            <Input id="ops-auto-cancel-hours" data-testid="ops-auto-cancel-hours" className="w-32" inputMode="decimal" value={value} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <Button
            data-testid="ops-auto-cancel-save"
            disabled={parsed == null || parsed === hours || save.isPending}
            onClick={() => parsed != null && save.mutate(parsed)}
          >
            {T.autoSave}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{T.autoThresholdHint}</p>
        <p className="text-sm" data-testid="ops-auto-cancel-last-run">
          {T.autoLastRun}:{" "}
          {data?.isRunning
            ? T.autoRunning
            : data?.lastRun
              ? `${new Date(data.lastRun.ranAt).toLocaleString()} · ${autoCancelRanLine(data.lastRun.cancelledCount)}`
              : T.autoNeverRun}
        </p>
        {confirmCount == null ? (
          <Button variant="outline" data-testid="ops-auto-cancel-run" disabled={count.isPending || !!data?.isRunning || hours == null} onClick={() => count.mutate()}>
            {count.isPending ? T.autoCounting : T.autoRunNow}
          </Button>
        ) : (
          <div className="rounded-md border p-3 space-y-2" data-testid="ops-auto-cancel-confirm">
            <p className="font-medium">{T.autoConfirmTitle}</p>
            <p className="text-sm" data-testid="ops-auto-cancel-confirm-line">{autoCancelConfirmLine(confirmCount, hours ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{T.autoConfirmNotices}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" data-testid="ops-auto-cancel-confirm-run" disabled={run.isPending} onClick={() => run.mutate()}>
                {confirmCount === 0 ? T.autoConfirmNone : T.autoConfirmRun}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmCount(null)}>{T.autoConfirmCancel}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
