/** Ops gap 8: the email outbox tab on /admin/system — filter by status, read the last error, retry one. */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_OPS_COPY as T, OUTBOX_STATUSES, emailCountLabel, outboxListUrl, outboxRetryable } from "@/lib/admin-ops";

export interface OutboxRow {
  id: number;
  email_type: string | null;
  status: string;
  attempt_count: number | null;
  max_attempts: number | null;
  last_error: string | null;
  created_at: string;
}
export interface OutboxList {
  rows: OutboxRow[];
  total: number;
}

export function EmailOutboxTab({ initialStatus = "" }: { initialStatus?: string }) {
  const [status, setStatus] = React.useState(initialStatus);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const url = outboxListUrl(status);
  const { data, isLoading, error } = useQuery<OutboxList>({ queryKey: [url] });
  const { data: summary } = useQuery<Record<string, number>>({ queryKey: ["/api/admin/email-outbox/summary"] });

  const retry = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/admin/email-outbox/${id}/retry`)).json(),
    onSuccess: () => {
      toast({ title: T.outboxRetried });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/email-outbox") });
    },
    onError: () => toast({ title: T.outboxRetryFailed, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  return (
    <Card data-testid="ops-email-outbox">
      <CardHeader>
        <CardTitle>{T.outboxTitle}</CardTitle>
        <CardDescription>{T.outboxDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ops-outbox-status">{T.outboxFilter}</Label>
            <select
              id="ops-outbox-status"
              data-testid="ops-outbox-status"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{T.outboxFilterAll}</option>
              {OUTBOX_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                  {summary && typeof summary[s] === "number" ? ` (${summary[s]})` : ""}
                </option>
              ))}
            </select>
          </div>
          {data ? <span className="text-sm text-muted-foreground" data-testid="ops-outbox-total">{emailCountLabel(data.total)}</span> : null}
        </div>
        {error ? (
          <p className="text-sm text-red-600">{T.outboxLoadFailed}</p>
        ) : isLoading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="ops-outbox-empty">{status ? T.outboxEmptyFiltered : T.outboxEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">{T.outboxColCreated}</th>
                  <th className="py-2 pr-3">{T.outboxColType}</th>
                  <th className="py-2 pr-3">{T.outboxColStatus}</th>
                  <th className="py-2 pr-3">{T.outboxColAttempts}</th>
                  <th className="py-2 pr-3">{T.outboxColLastError}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top" data-testid={`ops-outbox-row-${r.id}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{r.email_type ?? "—"}</td>
                    <td className="py-2 pr-3"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="py-2 pr-3">{r.attempt_count ?? 0}{r.max_attempts ? ` / ${r.max_attempts}` : ""}</td>
                    <td className="py-2 pr-3 max-w-md break-words text-xs">{r.last_error || T.outboxNoError}</td>
                    <td className="py-2 text-right">
                      {outboxRetryable(r.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`ops-outbox-retry-${r.id}`}
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(r.id)}
                        >
                          {T.outboxRetry}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
