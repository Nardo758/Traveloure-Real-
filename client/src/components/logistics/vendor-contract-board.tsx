/**
 * VendorContractBoard — the contract ROWS, where only a count used to be.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md §13, §14, §18 rule 1.
 *
 * ── THE ISLAND ──────────────────────────────────────────────────────────────────────────────
 * `vendor_contracts` holds a vendor, a status across eight values (draft · sent · negotiating ·
 * signed · active · completed · cancelled · disputed), a total, a paid amount, a remaining
 * balance and a jsonb schedule of named payment milestones with due dates. Four owner-gated read
 * endpoints serve it, and the only thing any screen rendered was ONE NUMBER on the logistics
 * dashboard's stat grid: "Contracts: N active". This is the list behind it.
 *
 * ── READ-ONLY IN THIS LANE ──────────────────────────────────────────────────────────────────
 * No create, no edit, no payment. Creating or altering a financial/legal artifact on a
 * traveler's plan is owner-only and has its own rails (`POST /api/trips/:tripId/contracts`,
 * `POST /api/contracts/:id/payment`, `PATCH /api/contracts/:id`). A board that could write would
 * be a second author of money state beside them.
 *
 * ── THE TWO ENDPOINTS, AND WHY BOTH ─────────────────────────────────────────────────────────
 *   GET /api/trips/:tripId/contracts          — the rows. Gated `authorizeTripLogistics`
 *                                               (owner ‖ assigned expert ‖ author ‖ admin):
 *                                               vendor coordination is the assigned expert's
 *                                               real job, which is why the READ tier is broader
 *                                               than the owner-only WRITE tier.
 *   GET /api/trips/:tripId/contracts/overdue  — which milestones are overdue, and by how many
 *                                               days, computed against the SERVER's clock.
 * The overdue flag is never re-derived here from a due date: a browser in another zone, or with
 * a wrong clock, would otherwise contradict the platform. A milestone the endpoint did not name
 * is simply NOT FLAGGED — it is not thereby asserted to be on time.
 *
 * ── NO CLIENT MATH ON MONEY (§14) ───────────────────────────────────────────────────────────
 * Every amount is rendered exactly as the server returned it. Nothing sums a schedule, subtracts
 * a payment or recomputes a balance — the server owns those derivations, and a second one here
 * is the class §18 rule 1 names applied to money. The mapping is
 * `client/src/lib/vendor-contract-board.ts`, whose pass-through and §13 absences are proved by
 * unit tests.
 *
 * ── §13 ─────────────────────────────────────────────────────────────────────────────────────
 * A NULL balance is omitted, never 0. A NULL status is omitted, never "draft". A NULL currency
 * renders the amount BARE — no assumed "$". An empty schedule says the schedule was not
 * recorded, never "paid in full". No contracts at all says exactly that, and does not imply the
 * plan needs none.
 *
 * SIDE FINDING, recorded not fixed (it is one of the repo's 138 baseline tsc errors, and fixing
 * it would move that count): `getContractStats` reads `c.status`, a column `vendor_contracts`
 * does not have — the column is `contract_status`. So the dashboard's "N active" is ALWAYS 0.
 * This board reads `contractStatus` directly and therefore shows the real status per row.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  displayAmount,
  toContractBoardRows,
  type OverdueMilestoneRow,
  type VendorContractRow,
} from "@/lib/vendor-contract-board";

/** Statuses that read as trouble. Presentation only — it colours a badge and decides nothing. */
const ALARMING_STATUSES = new Set(["disputed", "cancelled"]);

export function VendorContractBoard({ tripId }: { tripId: string }) {
  const { data: contracts, isLoading } = useQuery<VendorContractRow[]>({
    queryKey: [`/api/trips/${tripId}/contracts`],
    enabled: !!tripId,
  });
  const { data: overdue } = useQuery<OverdueMilestoneRow[]>({
    queryKey: [`/api/trips/${tripId}/contracts/overdue`],
    enabled: !!tripId,
  });

  const rows = useMemo(() => toContractBoardRows(contracts, overdue), [contracts, overdue]);

  return (
    <Card data-testid="vendor-contract-board">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-500" />
          Vendor contracts
        </CardTitle>
        <CardDescription>
          Every contract on this plan, with its status and payment milestones. Amounts are shown
          as they are recorded; payments and edits happen on the contract itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : rows.length === 0 ? (
          // §13: "none recorded" is the honest statement. It does not say the plan needs none.
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="contract-board-empty">
            No vendor contracts recorded on this plan.
          </div>
        ) : (
          <ul className="space-y-3" data-testid="contract-board-list">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border p-3" data-testid={`contract-row-${row.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{row.vendorName}</span>
                      {/* Each badge is OMITTED when its column is NULL (§13) — never defaulted. */}
                      {row.status ? (
                        <Badge
                          variant={ALARMING_STATUSES.has(row.status) ? "destructive" : "outline"}
                          className="text-[10px]"
                          data-testid={`contract-status-${row.id}`}
                        >
                          {row.status}
                        </Badge>
                      ) : null}
                      {row.category ? (
                        <Badge variant="outline" className="text-[10px]">
                          {row.category}
                        </Badge>
                      ) : null}
                      {row.hasOverdue ? (
                        <Badge variant="destructive" className="text-[10px]" data-testid={`contract-overdue-${row.id}`}>
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          overdue
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                      {row.totalAmount ? <span>Total {displayAmount(row.totalAmount, row.currency)}</span> : null}
                      {row.paidAmount ? <span>Paid {displayAmount(row.paidAmount, row.currency)}</span> : null}
                      {/* A NULL balance shows NOTHING here — never a 0 the row never claimed. */}
                      {row.remainingBalance ? (
                        <span>Remaining {displayAmount(row.remainingBalance, row.currency)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {row.milestones.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2" data-testid={`contract-no-schedule-${row.id}`}>
                    No payment schedule recorded.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1" data-testid={`contract-milestones-${row.id}`}>
                    {row.milestones.map((m, i) => (
                      <li
                        key={`${m.name}-${i}`}
                        className="flex items-center justify-between gap-2 text-xs border-t pt-1 first:border-t-0 first:pt-0"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{m.name}</span>
                          {m.status ? (
                            <span className="text-muted-foreground shrink-0">({m.status})</span>
                          ) : null}
                          {m.daysOverdue !== undefined ? (
                            <span className="text-destructive shrink-0">
                              {m.daysOverdue} day{m.daysOverdue === 1 ? "" : "s"} overdue
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {/* Both halves are omitted when unrecorded — a milestone with no date
                              still renders, without inventing one. */}
                          {m.amount ? displayAmount(m.amount, row.currency) : null}
                          {m.amount && m.dueDate ? " · " : null}
                          {m.dueDate ? `due ${m.dueDate}` : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
