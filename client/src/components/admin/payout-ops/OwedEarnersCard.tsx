/** Gap 9: what each expert and provider is owed, their payouts waiting, and whether a transfer can reach them. */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PAYOUT_OPS_COPY as T, usd } from "@/lib/payout-ops";

export const OWED_URL = "/api/admin/payouts/owed";

export interface OwedRow {
  earnerId: string;
  earnerType: "expert" | "provider";
  owed: number;
  pending: number;
  displayName: string | null;
  canReceiveTransfer: boolean;
  pendingPayoutCount: number;
  pendingPayoutTotal: number;
}

export function OwedEarnersCard() {
  const { data, isLoading, error } = useQuery<{ earners: OwedRow[] }>({ queryKey: [OWED_URL] });
  const rows = data?.earners ?? [];
  return (
    <Card data-testid="owed-earners">
      <CardHeader>
        <CardTitle>{T.owedTitle}</CardTitle>
        <CardDescription>{T.owedDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">{T.owedLoadFailed}</p>
        ) : isLoading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T.owedEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">{T.colEarner}</th>
                  <th className="py-2 pr-3">{T.colType}</th>
                  <th className="py-2 pr-3">{T.colOwed}</th>
                  <th className="py-2 pr-3">{T.colHeld}</th>
                  <th className="py-2 pr-3">{T.colPendingPayouts}</th>
                  <th className="py-2">{T.colTransfer}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.earnerType}-${r.earnerId}`} className="border-t" data-testid={`owed-row-${r.earnerId}`}>
                    <td className="py-2 pr-3">{r.displayName ?? T.unnamed}</td>
                    <td className="py-2 pr-3">{r.earnerType === "expert" ? T.typeExpert : T.typeProvider}</td>
                    <td className="py-2 pr-3 font-medium">{usd(r.owed)}</td>
                    <td className="py-2 pr-3">{usd(r.pending)}</td>
                    <td className="py-2 pr-3">{T.pendingPayouts(r.pendingPayoutCount, usd(r.pendingPayoutTotal))}</td>
                    <td className="py-2" data-testid={`owed-transfer-${r.earnerId}`}>
                      <Badge variant={r.canReceiveTransfer ? "outline" : "destructive"}>{r.canReceiveTransfer ? T.yes : T.no}</Badge>
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
