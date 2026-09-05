/**
 * CONTRACT STATS — the vendor-contract roll-up reads the column that exists.
 * Ledger `2026-09-04-contract-stats-column`.
 *
 * WHY THIS EXISTS. `getContractStats` counted "active" contracts with `c.status === "active"`.
 * `vendor_contracts` has no `status` column — it has `contract_status` (`contractStatus` on the
 * ORM row) — so the comparison was `undefined === "active"` for every row that ever existed and
 * the logistics dashboard's "N active" tile has always read 0. Nothing failed, nothing logged;
 * the only trace was two `error TS2339` lines sitting quietly inside the frozen tsc baseline.
 *
 * That is exactly the shape a type baseline hides: the compiler DID know, and a ceiling that
 * only forbids the number going UP let the two errors live indefinitely. So the fix comes with a
 * proof that does not depend on tsc — a pure test over the mapping itself.
 *
 * Pure unit: no DB, no clock of its own (the roll-up takes `now`), no HTTP. It imports
 * `server/services/contract-stats.ts` and NOT `vendor-management.service.ts`, whose `../db` import
 * throws without a DATABASE_URL — that import is exactly why this arithmetic had no unit test and
 * why the bug lived. `computeContractStats` is the ONE implementation;
 * `VendorManagementService.getContractStats` is its only caller.
 *
 * Run: npx tsx --test server/__tests__/contract-stats.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeContractStats, type ContractStatsInput } from "../services/contract-stats";

const NOW = new Date("2026-09-04T00:00:00.000Z");
const IN_THREE_DAYS = "2026-09-07T00:00:00.000Z";
const IN_THREE_MONTHS = "2026-12-04T00:00:00.000Z";

function contract(over: Partial<ContractStatsInput> = {}): ContractStatsInput {
  return {
    contractStatus: "draft",
    totalAmount: "0",
    paidAmount: "0",
    paymentSchedule: [],
    ...over,
  } as ContractStatsInput;
}

describe("computeContractStats — active count", () => {
  it("THE BUG: an active contract is counted (it read `status`, a column that does not exist)", () => {
    const stats = computeContractStats([contract({ contractStatus: "active" })], NOW);
    assert.equal(stats.activeContracts, 1);
  });

  it("THE BUG, from the other side: a row carrying a bogus `status` field is still not counted", () => {
    // Simulates the pre-fix read surviving somewhere: a row whose `status` says active but whose
    // real column says draft must count as draft. The COLUMN is the fact, never a lookalike field.
    const row = { ...contract({ contractStatus: "draft" }), status: "active" } as ContractStatsInput;
    assert.equal(computeContractStats([row], NOW).activeContracts, 0);
  });

  it("only `active` counts — every other contractStatusEnum member does not", () => {
    const others: Array<ContractStatsInput["contractStatus"]> = [
      "draft",
      "sent",
      "negotiating",
      "signed",
      "completed",
      "cancelled",
      "disputed",
    ];
    const stats = computeContractStats(
      others.map((s) => contract({ contractStatus: s })),
      NOW,
    );
    assert.equal(stats.activeContracts, 0);
    assert.equal(stats.totalContracts, others.length);
  });

  it("counts across a mixed set", () => {
    const stats = computeContractStats(
      [
        contract({ contractStatus: "active" }),
        contract({ contractStatus: "active" }),
        contract({ contractStatus: "completed" }),
        contract({ contractStatus: null }),
      ],
      NOW,
    );
    assert.equal(stats.activeContracts, 2);
    assert.equal(stats.totalContracts, 4);
  });
});

describe("computeContractStats — money and milestones", () => {
  it("totals, paid and remaining come off the rows, and decimal strings parse", () => {
    const stats = computeContractStats(
      [
        contract({ contractStatus: "active", totalAmount: "1000.50", paidAmount: "250.25" }),
        contract({ contractStatus: "signed", totalAmount: "500.00", paidAmount: "0" }),
      ],
      NOW,
    );
    assert.equal(stats.totalValue, 1500.5);
    assert.equal(stats.totalPaid, 250.25);
    assert.equal(stats.totalRemaining, 1250.25);
  });

  it("pending vs completed milestones, and the one-week deadline window", () => {
    const stats = computeContractStats(
      [
        contract({
          contractStatus: "active",
          paymentSchedule: [
            { name: "deposit", amount: 100, dueDate: IN_THREE_DAYS, status: "pending" },
            { name: "balance", amount: 400, dueDate: IN_THREE_MONTHS, status: "pending" },
            { name: "booking", amount: 50, dueDate: IN_THREE_DAYS, status: "paid" },
            { name: "extras", amount: 25, dueDate: IN_THREE_DAYS, status: "completed" },
          ],
        }),
      ],
      NOW,
    );
    assert.equal(stats.pendingPayments, 2);
    assert.equal(stats.completedPayments, 2);
    assert.equal(stats.upcomingDeadlines, 1, "only the milestone inside the 7-day window");
  });

  it("an empty trip rolls up to zeros, not to NaN", () => {
    const stats = computeContractStats([], NOW);
    assert.deepEqual(stats, {
      totalContracts: 0,
      activeContracts: 0,
      totalValue: 0,
      totalPaid: 0,
      totalRemaining: 0,
      completedPayments: 0,
      pendingPayments: 0,
      upcomingDeadlines: 0,
    });
  });
});
