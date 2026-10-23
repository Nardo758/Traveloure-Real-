/**
 * Ops gap 8: bookings refunded in Stripe outside the platform. Each links to its booking detail; Clear takes a
 * required note and records a refund already paid. It never moves money (`clearOutOfBandRefund`).
 */
import React from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ADMIN_OPS_COPY as T,
  outOfBandBookingHref,
  outOfBandNoteReady,
  outOfBandRefundedLabel,
} from "@/lib/admin-ops";

export const OUT_OF_BAND_LIST_URL = "/api/admin/bookings/out-of-band-refunds";

export interface OutOfBandRow {
  id: string;
  status: string;
  service_name: string | null;
  marker: { amountCents?: number; chargeAmountCents?: number | null; lastSeenAt?: string } | null;
}

export function OutOfBandRefundsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<{ bookings: OutOfBandRow[]; count: number }>({ queryKey: [OUT_OF_BAND_LIST_URL] });
  const [clearing, setClearing] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  const clear = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      (await apiRequest("POST", `/api/admin/bookings/${encodeURIComponent(id)}/out-of-band-refund/clear`, { note: note.trim() })).json(),
    onSuccess: () => {
      toast({ title: T.refundsCleared });
      setClearing(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: [OUT_OF_BAND_LIST_URL] });
    },
    onError: () => toast({ title: T.refundsClearFailed, variant: "destructive" }),
  });

  const rows = data?.bookings ?? [];
  return (
    <Card data-testid="ops-out-of-band">
      <CardHeader>
        <CardTitle>{T.refundsTitle}</CardTitle>
        <CardDescription>{T.refundsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{T.refundsClearExplainer}</p>
        {error ? (
          <p className="text-sm text-red-600">{T.refundsLoadFailed}</p>
        ) : isLoading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="ops-out-of-band-empty">{T.refundsEmpty}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const refunded = outOfBandRefundedLabel(r.marker);
              return (
                <div key={r.id} className="rounded-md border p-3 space-y-2" data-testid={`ops-out-of-band-row-${r.id}`}>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{r.service_name ?? r.id}</span>
                    <Badge variant="outline">{r.status}</Badge>
                    {refunded ? <span>{T.refundsColRefunded}: {refunded}</span> : null}
                    {r.marker?.lastSeenAt ? (
                      <span className="text-muted-foreground">{T.refundsColSeen}: {new Date(r.marker.lastSeenAt).toLocaleString()}</span>
                    ) : null}
                    <Link href={outOfBandBookingHref(r.id)} className="text-blue-600 underline" data-testid={`ops-out-of-band-open-${r.id}`}>
                      {T.refundsOpen}
                    </Link>
                    {clearing !== r.id ? (
                      <Button size="sm" variant="outline" data-testid={`ops-out-of-band-clear-${r.id}`} onClick={() => { setClearing(r.id); setNote(""); }}>
                        {T.refundsClear}
                      </Button>
                    ) : null}
                  </div>
                  {clearing === r.id ? (
                    <div className="space-y-2">
                      <Label htmlFor={`ops-oob-note-${r.id}`}>{T.refundsNoteLabel}</Label>
                      <Textarea id={`ops-oob-note-${r.id}`} data-testid="ops-out-of-band-note" value={note} onChange={(e) => setNote(e.target.value)} />
                      <p className="text-xs text-muted-foreground">{T.refundsNoteHint}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          data-testid="ops-out-of-band-confirm"
                          disabled={!outOfBandNoteReady(note) || clear.isPending}
                          onClick={() => clear.mutate({ id: r.id, note })}
                        >
                          {T.refundsConfirm}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setClearing(null)}>{T.refundsCancel}</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
