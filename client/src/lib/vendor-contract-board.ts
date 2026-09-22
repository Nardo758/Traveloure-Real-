/**
 * THE VENDOR-CONTRACT BOARD — `vendor_contracts` rows as the board already holds them.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md §13, §14, §18 rule 1.
 *
 * ── THE ISLAND ──────────────────────────────────────────────────────────────────────────────
 * `vendor_contracts` carries a vendor, a status across eight values (draft → sent → negotiating
 * → signed → active → completed → cancelled → disputed), a total, a paid amount, a remaining
 * balance and a jsonb payment schedule of named milestones with due dates. Four owner-gated read
 * endpoints serve it. The only thing any screen ever rendered was ONE NUMBER — "Contracts: N
 * active" on the logistics dashboard's stat grid. Everything else was reachable only by reading
 * the database.
 *
 * ── NO CLIENT MATH ON MONEY (§14) ───────────────────────────────────────────────────────────
 * Every amount below is passed through as the SERVER returned it. Nothing here adds, subtracts,
 * sums a schedule, or recomputes a balance from a total and a payment: the server owns those
 * derivations (`vendor-management.service.ts` writes `remainingBalance` on every create/update),
 * and a client that recomputes them becomes a second authority that will eventually disagree —
 * the class §18 rule 1 names, applied to money. `decimal` columns arrive as STRINGS and stay
 * strings for exactly that reason; parsing them to a float to "format nicely" is where the
 * disagreement starts.
 *
 * ── §13: EVERY ABSENCE IS AN ABSENCE ────────────────────────────────────────────────────────
 *   · `remainingBalance` NULL ⇒ OMITTED. It is never rendered as 0 — "nothing left to pay" is a
 *     claim, and this column is nullable precisely because a row can predate the derivation.
 *   · `contractStatus` NULL ⇒ OMITTED, never shown as "draft". The DB default supplies draft for
 *     rows born through the service; a NULL here means nobody said.
 *   · `currency` NULL ⇒ the amount renders BARE, with no symbol and no assumed "$". A currency
 *     nobody recorded is not USD.
 *   · An EMPTY payment schedule ⇒ no milestone rows, and the surface says the schedule was not
 *     recorded — never "paid in full" and never "no payments due".
 *   · A malformed schedule entry (no name, or a non-object) is DROPPED rather than rendered as a
 *     blank milestone that looks like a real obligation.
 *
 * ── OVERDUE IS THE SERVER'S ANSWER, NOT A CLIENT CLOCK ──────────────────────────────────────
 * `GET /api/trips/:tripId/contracts/overdue` computes overdue-ness and `daysOverdue` server-side
 * against the server's own clock. This module MATCHES those rows onto the milestones by
 * (contract id, milestone name) and never re-derives the flag from `dueDate` — a browser in a
 * different zone, or with a wrong clock, would otherwise flag a milestone the platform does not
 * consider overdue. A milestone the overdue endpoint did not name is simply NOT FLAGGED; it is
 * not thereby asserted to be on time.
 *
 * READ-ONLY. There is no write path on this surface in this lane: creating or altering a
 * financial/legal artifact on a traveler's plan is owner-only and has its own rails
 * (`POST /api/trips/:tripId/contracts`, `POST /api/contracts/:id/payment`).
 *
 * Pure: no React, no fetch. Tested by `client/src/lib/__tests__/plan-islands.test.ts`.
 */

/** One entry of `vendor_contracts.payment_schedule` (jsonb), as the service documents it. */
export interface ContractMilestoneRow {
  name?: unknown;
  amount?: unknown;
  dueDate?: unknown;
  status?: unknown;
  paidDate?: unknown;
}

/** The subset of a `vendor_contracts` row this board reads. */
export interface VendorContractRow {
  id: string;
  vendorName?: string | null;
  vendorCategory?: string | null;
  contractStatus?: string | null;
  totalAmount?: string | number | null;
  paidAmount?: string | number | null;
  remainingBalance?: string | number | null;
  currency?: string | null;
  paymentSchedule?: unknown;
  startDate?: string | null;
  endDate?: string | null;
}

/** One row of `GET /api/trips/:tripId/contracts/overdue`. */
export interface OverdueMilestoneRow {
  contract?: { id?: string | null } | null;
  milestone?: { name?: unknown } | null;
  daysOverdue?: unknown;
}

/** A milestone as the board renders it. Every field may be absent (§13). */
export interface ContractBoardMilestone {
  name: string;
  /** As the server returned it — string or number, never re-derived. Absent = not recorded. */
  amount?: string;
  /** Absent = no due date recorded; the row still renders, without a date. */
  dueDate?: string;
  /** The schedule's own status word, when it has one. */
  status?: string;
  /** Present ONLY when the server's overdue endpoint named this milestone. */
  daysOverdue?: number;
}

/** A contract as the board renders it. */
export interface ContractBoardRow {
  id: string;
  vendorName: string;
  /** Absent = no category recorded. Never guessed from the vendor's name. */
  category?: string;
  /** Absent = no status recorded. Never defaulted to "draft". */
  status?: string;
  /** ISO currency code as stored. Absent = none recorded ⇒ amounts render bare. */
  currency?: string;
  totalAmount?: string;
  paidAmount?: string;
  /** Absent = the column is NULL. NEVER rendered as 0 (§13). */
  remainingBalance?: string;
  milestones: ContractBoardMilestone[];
  /** True when at least one milestone was named by the server's overdue endpoint. */
  hasOverdue: boolean;
}

/** The vendor name a row with none renders under. It says the column is empty — it does not
 *  invent a vendor, and it is deliberately not "Unknown vendor", which reads like a fact. */
export const UNNAMED_VENDOR = "Vendor not named";

function text(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  }
  return undefined;
}

/**
 * An amount as a DISPLAY STRING, passed through. A number is stringified (that is a rendering,
 * not arithmetic); anything else is absent. No rounding, no padding, no locale grouping — the
 * server's own value, because a "prettier" number that disagrees with an invoice is worse than a
 * plain one that matches it.
 */
function amount(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Key for matching an overdue row onto a milestone: contract id + the milestone's own name. */
function overdueKey(contractId: string, milestoneName: string): string {
  return `${contractId}\u0000${milestoneName.toLowerCase()}`;
}

/**
 * Index the overdue endpoint's answer. A row missing either half of the key is skipped — it
 * cannot be attached to a milestone honestly, and attaching it to the whole contract would
 * over-report. The LOWEST index wins nothing: the first occurrence of a (contract, milestone)
 * pair stands, since the endpoint emits one row per overdue milestone.
 */
export function indexOverdue(rows: readonly OverdueMilestoneRow[] | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    const contractId = text(row?.contract?.id);
    const name = text(row?.milestone?.name);
    if (!contractId || !name) continue;
    const key = overdueKey(contractId, name);
    if (out.has(key)) continue;
    const days = row?.daysOverdue;
    out.set(key, typeof days === "number" && Number.isFinite(days) ? days : 0);
  }
  return out;
}

/**
 * `payment_schedule` → the milestones the board renders. Order is the STORED order: the schedule
 * is a list the owner authored, and re-sorting it by due date would silently reorder their own
 * plan (and would have to invent a position for an entry with no date).
 */
export function contractMilestones(
  contractId: string,
  schedule: unknown,
  overdue: Map<string, number>,
): ContractBoardMilestone[] {
  if (!Array.isArray(schedule)) return [];
  const out: ContractBoardMilestone[] = [];
  for (const raw of schedule) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as ContractMilestoneRow;
    const name = text(entry.name);
    // A milestone with no name cannot be shown, matched to an overdue row, or referred to.
    // Dropping it is honest; rendering a nameless obligation is not.
    if (!name) continue;
    const milestone: ContractBoardMilestone = { name };
    const value = amount(entry.amount);
    if (value !== undefined) milestone.amount = value;
    const due = text(entry.dueDate);
    if (due !== undefined) milestone.dueDate = due;
    const status = text(entry.status);
    if (status !== undefined) milestone.status = status;
    const days = overdue.get(overdueKey(contractId, name));
    if (days !== undefined) milestone.daysOverdue = days;
    out.push(milestone);
  }
  return out;
}

/**
 * THE ONE MAPPING. Contracts (as the owner-gated list endpoint returned them) plus the overdue
 * endpoint's answer, into the rows the board renders. Contract ORDER is the endpoint's own
 * (`created_at DESC`) and is never restated here (§18 rule 1).
 */
export function toContractBoardRows(
  contracts: readonly VendorContractRow[] | null | undefined,
  overdueRows: readonly OverdueMilestoneRow[] | null | undefined,
): ContractBoardRow[] {
  const overdue = indexOverdue(overdueRows);
  const out: ContractBoardRow[] = [];
  for (const c of contracts ?? []) {
    const id = text(c?.id);
    if (!id) continue;
    const milestones = contractMilestones(id, c.paymentSchedule, overdue);
    const row: ContractBoardRow = {
      id,
      vendorName: text(c.vendorName) ?? UNNAMED_VENDOR,
      milestones,
      hasOverdue: milestones.some((m) => m.daysOverdue !== undefined),
    };
    const category = text(c.vendorCategory);
    if (category !== undefined) row.category = category;
    const status = text(c.contractStatus);
    if (status !== undefined) row.status = status;
    const currency = text(c.currency);
    if (currency !== undefined) row.currency = currency;
    const total = amount(c.totalAmount);
    if (total !== undefined) row.totalAmount = total;
    const paid = amount(c.paidAmount);
    if (paid !== undefined) row.paidAmount = paid;
    const remaining = amount(c.remainingBalance);
    if (remaining !== undefined) row.remainingBalance = remaining;
    out.push(row);
  }
  return out;
}

/**
 * An amount for display, with its currency CODE when one was recorded and bare when none was.
 * Deliberately a code ("USD <amount>") and not a symbol: a symbol has to be looked up from the
 * code, and a wrong symbol is a wrong claim about the money. `undefined` in ⇒ `undefined` out —
 * the caller omits the line rather than printing a placeholder.
 */
export function displayAmount(value: string | undefined, currency: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return currency ? `${currency} ${value}` : value;
}
