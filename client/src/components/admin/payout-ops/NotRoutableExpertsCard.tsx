/** Gap 9: experts the routing predicate refuses, with each check's status and a Remind button. No email. */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYOUT_OPS_COPY as T } from "@/lib/payout-ops";
import { RemindStripeButton } from "./RemindStripeButton";

export const NOT_ROUTABLE_URL = "/api/admin/experts/not-routable";

export interface NotRoutableRow {
  userId: string;
  role: string | null;
  firstName: string | null;
  lastName: string | null;
  applicationStatus: string | null;
  identityVerificationStatus: string | null;
  stripeConnectStatus: string | null;
  reminderCooldownEndsAt: string | null;
}

const PASSING = { applicationStatus: "approved", identityVerificationStatus: "verified", stripeConnectStatus: "complete" } as const;

export function NotRoutableExpertsCard() {
  const { data, isLoading, error } = useQuery<{ count: number; experts: NotRoutableRow[] }>({ queryKey: [NOT_ROUTABLE_URL] });
  const rows = data?.experts ?? [];
  const cell = (v: string | null) => v ?? T.notRecorded;
  return (
    <Card data-testid="not-routable-experts">
      <CardHeader>
        <CardTitle>{T.notRoutableTitle}</CardTitle>
        <CardDescription>{T.notRoutableDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">{T.notRoutableLoadFailed}</p>
        ) : isLoading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T.notRoutableEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">{T.colExpert}</th>
                  <th className="py-2 pr-3">{T.colApplication}</th>
                  <th className="py-2 pr-3">{T.colIdentity}</th>
                  <th className="py-2 pr-3">{T.colStripe}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // A display note only: every column already shows the status the server sent.
                  const allPass = r.applicationStatus === PASSING.applicationStatus
                    && r.identityVerificationStatus === PASSING.identityVerificationStatus
                    && r.stripeConnectStatus === PASSING.stripeConnectStatus;
                  return (
                    <tr key={r.userId} className="border-t align-top" data-testid={`not-routable-row-${r.userId}`}>
                      <td className="py-2 pr-3">
                        {[r.firstName, r.lastName].filter(Boolean).join(" ") || T.unnamed}
                        {allPass ? <p className="text-xs text-muted-foreground">{T.allChecksPassedNote}</p> : null}
                      </td>
                      <td className="py-2 pr-3">{cell(r.applicationStatus)}</td>
                      <td className="py-2 pr-3">{cell(r.identityVerificationStatus)}</td>
                      <td className="py-2 pr-3">{cell(r.stripeConnectStatus)}</td>
                      <td className="py-2 text-right">
                        <RemindStripeButton kind="expert" userId={r.userId} cooldownEndsAt={r.reminderCooldownEndsAt} listQueryKey={[NOT_ROUTABLE_URL]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
