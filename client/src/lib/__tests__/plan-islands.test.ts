/**
 * PLAN ISLANDS — the three pure rules behind the surfaces this lane connects.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md Locked Decisions 28/29/37, §13, §14, §19.
 *
 * Pure: no DB, no server, no network, no DOM. Run:
 *   npx tsx --test client/src/lib/__tests__/plan-islands.test.ts
 *
 * The three modules under test are the parts of each island that a browser test could only
 * observe indirectly:
 *
 *   T — the TRAVELING-PARTY body (`traveling-party.ts`). The money family must be unreachable
 *       from this surface, and a blank field must CLEAR rather than be dropped.
 *   O — the ORGANIZE-INTO-EVENTS predicate (`organize-events.ts`). It must be false for an
 *       unresolved or plain occasion, false once the plan has events, and idempotent by title.
 *   C — the CONTRACT-BOARD mapping (`vendor-contract-board.ts`). Amounts pass through untouched,
 *       every absence stays an absence, and overdue is the server's answer, never a client clock.
 *
 * NEGATIVE SPACE (§18d): these are the RULES, not the rendering. Whether the section is mounted,
 * whether the endpoints refuse an anonymous caller, and whether the route exists are browser
 * questions — `playwright/tests/plan-guests.spec.ts` carries those. Nothing here proves the
 * SERVER's allowlist either; that is asserted over the real artifact by
 * `server/__tests__/participant-write-rail.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_TRAVELING_PARTY_FORM,
  formatAccessibilityNeeds,
  isSubmittableTravelingParty,
  parseAccessibilityNeeds,
  travelingPartyBody,
  travelingPartyBodyKeys,
} from "../traveling-party";
import { canOrganizeIntoEvents, eventsNotYetCreated } from "../organize-events";
import { countPlanEvents } from "../slip-events";
import {
  UNNAMED_VENDOR,
  contractMilestones,
  displayAmount,
  indexOverdue,
  toContractBoardRows,
} from "../vendor-contract-board";

// ── T — the traveling-party body ─────────────────────────────────────────────────────────────

test("T1: the body carries exactly the six stated fields — and no money column", () => {
  const keys = travelingPartyBodyKeys();
  assert.deepEqual(keys, [
    "accessibilityNeeds",
    "arrivalDatetime",
    "departureDatetime",
    "mobilityLevel",
    "name",
    "role",
  ]);
  // §14: amount/identity must be unreachable from this surface, not merely stripped server-side.
  for (const forbidden of [
    "amountOwed",
    "amountPaid",
    "paymentStatus",
    "paymentMethod",
    "paymentNotes",
    "userId",
    "tripId",
    "id",
    "status",
  ]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never be sent from the party surface`);
  }
});

test("T2: a blank field is sent as null (CLEARED), never omitted and never back-filled", () => {
  const body = travelingPartyBody({ ...EMPTY_TRAVELING_PARTY_FORM, name: "  Ada  " });
  assert.equal(body.name, "Ada");
  assert.equal(body.role, null);
  assert.equal(body.arrivalDatetime, null);
  assert.equal(body.departureDatetime, null);
  assert.equal(body.mobilityLevel, null);
  assert.deepEqual(body.accessibilityNeeds, []);
  // Every key is PRESENT — an omitted key would leave a stale value standing on a PATCH.
  assert.equal(Object.keys(body).length, 6);
});

test("T3: accessibility needs split on commas, trim, drop blanks, collapse duplicates", () => {
  assert.deepEqual(parseAccessibilityNeeds(" wheelchair , step-free ,, Wheelchair "), [
    "wheelchair",
    "step-free",
  ]);
  assert.deepEqual(parseAccessibilityNeeds(""), []);
  assert.deepEqual(parseAccessibilityNeeds(null), []);
  assert.deepEqual(parseAccessibilityNeeds("   "), []);
});

test("T3b: the array round-trips back into the field for an edit", () => {
  assert.equal(formatAccessibilityNeeds(["wheelchair", " step-free "]), "wheelchair, step-free");
  // A jsonb column can hold anything; a non-array is not rendered as one.
  assert.equal(formatAccessibilityNeeds(null), "");
  assert.equal(formatAccessibilityNeeds("wheelchair"), "");
  assert.equal(formatAccessibilityNeeds([1, "", "ok"]), "ok");
});

test("T4: only the name is required — every other answer may honestly be absent", () => {
  assert.equal(isSubmittableTravelingParty(EMPTY_TRAVELING_PARTY_FORM), false);
  assert.equal(isSubmittableTravelingParty({ ...EMPTY_TRAVELING_PARTY_FORM, name: "   " }), false);
  assert.equal(isSubmittableTravelingParty({ ...EMPTY_TRAVELING_PARTY_FORM, name: "Ada" }), true);
  // A form with a role but no name is still not submittable — the row's NOT NULL is the rule.
  assert.equal(
    isSubmittableTravelingParty({ ...EMPTY_TRAVELING_PARTY_FORM, role: "organizer" }),
    false,
  );
});

// ── O — organize into events ─────────────────────────────────────────────────────────────────

test("O1: the offer needs BOTH a scheduled occasion and zero events", () => {
  const scheduled = { defaultSchedule: true };
  assert.equal(canOrganizeIntoEvents(scheduled, 0), true);
  assert.equal(canOrganizeIntoEvents(scheduled, 1), false);
  assert.equal(canOrganizeIntoEvents(scheduled, 7), false);
});

test("O2: NULL/absent/unresolved default_schedule ⇒ NO offer (§13, the plain-plan shape)", () => {
  assert.equal(canOrganizeIntoEvents(null, 0), false);
  assert.equal(canOrganizeIntoEvents(undefined, 0), false);
  assert.equal(canOrganizeIntoEvents({}, 0), false);
  assert.equal(canOrganizeIntoEvents({ defaultSchedule: null }, 0), false);
  assert.equal(canOrganizeIntoEvents({ defaultSchedule: false }, 0), false);
  // The switch reader treats an unrecognised value exactly like NULL.
  assert.equal(canOrganizeIntoEvents({ defaultSchedule: "yes" } as any, 0), false);
});

test("O3: an uncountable event list is not an empty one", () => {
  const scheduled = { defaultSchedule: true };
  assert.equal(canOrganizeIntoEvents(scheduled, Number.NaN), false);
  assert.equal(canOrganizeIntoEvents(scheduled, -1), false);
  assert.equal(canOrganizeIntoEvents(scheduled, Number.POSITIVE_INFINITY), false);
});

test("O4: creation is idempotent by title, case-insensitively", () => {
  const drafts = [{ title: "Ceremony" }, { title: "Reception" }, { title: "Brunch" }];
  assert.deepEqual(
    eventsNotYetCreated(drafts, ["ceremony", "  BRUNCH  "]).map((d) => d.title),
    ["Reception"],
  );
  assert.deepEqual(eventsNotYetCreated(drafts, []).map((d) => d.title), [
    "Ceremony",
    "Reception",
    "Brunch",
  ]);
  // A null/blank stored title cannot match anything and never swallows a draft.
  assert.deepEqual(
    eventsNotYetCreated(drafts, [null, undefined, "   "]).map((d) => d.title),
    ["Ceremony", "Reception", "Brunch"],
  );
});

// ── C — the contract board ───────────────────────────────────────────────────────────────────

test("C1: amounts pass through as the server returned them — no parsing, no rounding", () => {
  const [row] = toContractBoardRows(
    [
      {
        id: "c1",
        vendorName: "Villa Rosa",
        totalAmount: "12000.00",
        paidAmount: "3000.00",
        remainingBalance: "9000.00",
        currency: "EUR",
      },
    ],
    [],
  );
  assert.equal(row.totalAmount, "12000.00");
  assert.equal(row.paidAmount, "3000.00");
  assert.equal(row.remainingBalance, "9000.00");
  assert.equal(displayAmount(row.totalAmount, row.currency), "EUR 12000.00");
});

test("C2: NULL remainingBalance is OMITTED, never rendered as 0 (§13)", () => {
  const [row] = toContractBoardRows(
    [{ id: "c1", vendorName: "Villa Rosa", totalAmount: "100.00", remainingBalance: null }],
    [],
  );
  assert.equal("remainingBalance" in row, false);
  assert.equal(displayAmount(row.remainingBalance, row.currency), undefined);
});

test("C3: NULL status is omitted (never 'draft'); NULL currency renders the amount bare", () => {
  const [row] = toContractBoardRows(
    [{ id: "c1", vendorName: "Villa Rosa", contractStatus: null, currency: null, totalAmount: "50" }],
    [],
  );
  assert.equal("status" in row, false);
  assert.equal("currency" in row, false);
  assert.equal(displayAmount(row.totalAmount, row.currency), "50");
});

test("C4: a missing vendor name says the column is empty, it does not invent one", () => {
  const [row] = toContractBoardRows([{ id: "c1", vendorName: null }], []);
  assert.equal(row.vendorName, UNNAMED_VENDOR);
  // And a row with no id at all cannot be addressed, so it is dropped rather than keyed on "".
  assert.equal(toContractBoardRows([{ id: "" } as any], []).length, 0);
});

test("C5: an empty or malformed schedule yields no milestones, never a blank obligation", () => {
  assert.deepEqual(contractMilestones("c1", [], new Map()), []);
  assert.deepEqual(contractMilestones("c1", null, new Map()), []);
  assert.deepEqual(contractMilestones("c1", "not-an-array", new Map()), []);
  // Entries with no name are dropped; the named one survives with its absences intact.
  const out = contractMilestones(
    "c1",
    [{ amount: "500" }, null, "x", { name: "Deposit" }],
    new Map(),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Deposit");
  assert.equal("amount" in out[0], false);
  assert.equal("dueDate" in out[0], false);
  assert.equal("daysOverdue" in out[0], false);
});

test("C6: milestones keep the STORED order — the board never re-sorts the owner's schedule", () => {
  const out = contractMilestones(
    "c1",
    [
      { name: "Final", dueDate: "2026-01-01" },
      { name: "Deposit", dueDate: "2025-01-01" },
    ],
    new Map(),
  );
  assert.deepEqual(out.map((m) => m.name), ["Final", "Deposit"]);
});

test("C7: overdue is the SERVER's answer, matched by contract + milestone name", () => {
  const overdue = [
    { contract: { id: "c1" }, milestone: { name: "Deposit" }, daysOverdue: 12 },
    // Unmatchable rows are skipped rather than attached to the whole contract.
    { contract: { id: "c1" }, milestone: { name: "" }, daysOverdue: 3 },
    { contract: null, milestone: { name: "Final" }, daysOverdue: 4 },
  ];
  const rows = toContractBoardRows(
    [
      {
        id: "c1",
        vendorName: "Villa Rosa",
        paymentSchedule: [
          { name: "Deposit", dueDate: "2025-01-01" },
          { name: "Final", dueDate: "2026-01-01" },
        ],
      },
    ],
    overdue,
  );
  const [deposit, final] = rows[0].milestones;
  assert.equal(deposit.daysOverdue, 12);
  // A milestone the endpoint did not name is NOT flagged — and is not thereby called on time.
  assert.equal("daysOverdue" in final, false);
  assert.equal(rows[0].hasOverdue, true);
});

test("C7b: matching is case-insensitive on the name and never re-derived from dueDate", () => {
  const index = indexOverdue([
    { contract: { id: "c1" }, milestone: { name: "DEPOSIT" }, daysOverdue: 5 },
  ]);
  const out = contractMilestones("c1", [{ name: "deposit", dueDate: "1999-01-01" }], index);
  assert.equal(out[0].daysOverdue, 5);
  // A long-past due date the server did NOT report is not flagged by a client clock.
  const none = contractMilestones("c1", [{ name: "other", dueDate: "1999-01-01" }], index);
  assert.equal("daysOverdue" in none[0], false);
});

test("C8: a contract with no overdue milestones reports hasOverdue false", () => {
  const [row] = toContractBoardRows(
    [{ id: "c1", vendorName: "Villa Rosa", paymentSchedule: [{ name: "Deposit" }] }],
    [],
  );
  assert.equal(row.hasOverdue, false);
});

// ── O5/O6 — the count the offer reads comes from the PLANCARD, and only from there ────────────
// Ledger `2026-09-05-slip-events-first-render`. The offer used to count events off
// `/api/user-experiences` — a USER-scoped list the slip fetches for the guest manager — while the
// slip HEADER counted the plancard's own `events` array. On a fresh account that list was already
// cached as `[]` from before the plan existed and nothing on the mint path invalidated it, so a
// plan minted WITH four events showed "Organize into events" directly under a header reading
// "4 events". Two sources for one fact is how they disagreed (§18 rule 1); there is now one.

test("O5: the plancard's own events array is what the offer counts", () => {
  const scheduled = { defaultSchedule: true };
  const plancardEvents = [{ id: "ev-1" }, { id: "ev-2" }, { id: "ev-3" }, { id: "ev-4" }];
  // The freshly minted wedding: four events on the plancard ⇒ no offer, whatever any other
  // list happens to be holding.
  assert.equal(canOrganizeIntoEvents(scheduled, countPlanEvents(plancardEvents)), false);
  // The ready-made buyer's clone — items, genuinely no events — still gets the offer.
  assert.equal(canOrganizeIntoEvents(scheduled, countPlanEvents([])), true);
});

test("O6: an absent plancard events array counts as ZERO, not as unknown", () => {
  // `countPlanEvents` already answers this for the header (re-audit A16) and the offer now shares
  // it: the plancard route returns `[]` for a plan with no `user_experiences` row, so absent and
  // empty are the same fact — the plan has only its ONE implicit unnamed event.
  const scheduled = { defaultSchedule: true };
  assert.equal(countPlanEvents(null), 0);
  assert.equal(countPlanEvents(undefined), 0);
  assert.equal(canOrganizeIntoEvents(scheduled, countPlanEvents(undefined)), true);
  // And a hidden or unresolved occasion is still refused, whatever the count says — the two halves
  // of the gate are independent (Locked Decision 28).
  assert.equal(canOrganizeIntoEvents(null, countPlanEvents([])), false);
});
