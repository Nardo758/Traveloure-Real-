/**
 * CONTRACT STATS — the vendor-contract roll-up behind the trip logistics dashboard's stat tiles.
 * Ledger `2026-09-04-contract-stats-column`.
 *
 * WHY THIS IS ITS OWN MODULE. The arithmetic is pure, and it lives apart from
 * `vendor-management.service.ts` for one reason: that file imports `../db`, which throws without a
 * `DATABASE_URL`, so anything importing it cannot be a pure unit test. The bug below survived
 * precisely because the only way to exercise this code was to stand up a trip with contracts.
 * `server/__tests__/contract-stats.test.ts` now drives it directly.
 *
 * ONE IMPLEMENTATION, ONE CALLER: `VendorManagementService.getContractStats` fetches the rows and
 * delegates here. A second copy of this roll-up is the derivation-drift class §18 rule 1 names.
 */

/** A payment milestone inside `vendor_contracts.payment_schedule` (jsonb). */
export interface PaymentMilestone {
  name: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid" | "completed" | "overdue";
  paidDate?: string;
}

export interface ContractStats {
  totalContracts: number;
  activeContracts: number;
  totalValue: number;
  totalPaid: number;
  totalRemaining: number;
  completedPayments: number;
  pendingPayments: number;
  upcomingDeadlines: number;
}

/**
 * A contract row as far as the roll-up is concerned. Structural, not the Drizzle row type, so this
 * module stays free of any schema/DB import — but the field NAMES are the ORM's, deliberately:
 * getting one of them wrong is the whole bug this file records.
 */
export interface ContractStatsInput {
  /** `vendor_contracts.contract_status` — see `contractStatusEnum` in shared/schema.ts. */
  contractStatus: string | null;
  totalAmount: string | number | null;
  paidAmount: string | number | null;
  paymentSchedule: unknown;
}

/** Days ahead that count as an "upcoming" deadline on the dashboard tile. */
const UPCOMING_DEADLINE_DAYS = 7;

/**
 * Roll a trip's vendor contracts up into the dashboard's stat tiles.
 *
 * THE BUG THIS FIXES. The previous version counted active contracts with `c.status === "active"`.
 * `vendor_contracts` has no `status` column — it has `contract_status` (`contractStatus` on the
 * row) — so the comparison was `undefined === "active"` for every row that has ever existed and
 * "N active" always read 0. Nothing threw and nothing logged; the only trace was two
 * `error TS2339` lines sitting inside the frozen tsc baseline, where a down-only ceiling has no
 * way to force an existing error out.
 *
 * The old line's `|| c.status === "in_progress"` disjunct is dropped with it: `in_progress` is not
 * a member of `contractStatusEnum` (draft | sent | negotiating | signed | active | completed |
 * cancelled | disputed) and no writer in the repo produces it. Keeping a comparison against a value
 * the vocabulary does not contain would restate a second, wrong enum here (§18 rule 1).
 *
 * `now` is injected rather than read, so the deadline window is testable and the function stays
 * pure.
 */
export function computeContractStats(
  contracts: ContractStatsInput[],
  now: Date = new Date(),
): ContractStats {
  const windowEnd = new Date(now.getTime() + UPCOMING_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

  let totalValue = 0;
  let paidAmount = 0;
  let pendingPayments = 0;
  let completedPayments = 0;
  let upcomingDeadlines = 0;
  let activeContracts = 0;

  for (const c of contracts) {
    totalValue += parseFloat(String(c.totalAmount || 0));
    paidAmount += parseFloat(String(c.paidAmount || 0));
    if (c.contractStatus === "active") {
      activeContracts++;
    }

    const schedule = (c.paymentSchedule as PaymentMilestone[]) || [];
    for (const m of schedule) {
      if (m.status === "pending") {
        pendingPayments++;
        if (new Date(m.dueDate) <= windowEnd) {
          upcomingDeadlines++;
        }
      } else if (m.status === "paid" || m.status === "completed") {
        completedPayments++;
      }
    }
  }

  return {
    totalContracts: contracts.length,
    activeContracts,
    totalValue,
    totalPaid: paidAmount,
    totalRemaining: totalValue - paidAmount,
    completedPayments,
    pendingPayments,
    upcomingDeadlines,
  };
}
