/**
 * NO REIMBURSABLE-EXPENSE PROMISE — no surface offers to pay back, bill on or reconcile a
 * seller's out-of-pocket spend, because no machinery exists that could. Decision-maker ruling
 * 2026-09-15 (punchlist **D-7**, the SPLIT — completion = option A, expenses = option B for
 * now); ledger `2026-09-15-d7-completion-split`; brief
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` §8.10; CLAUDE.md §13, §14, §18 rule 1.
 *
 * THE RULING. There is NO reimbursable-expense object on this platform: no table, no column,
 * no quote, no approval, no evidence store and no refund route for a cost an expert, provider
 * or coordinator incurs on a traveler's behalf. Option B is *not yet* — the target shape is
 * recorded in the brief (quoted and approved by the traveler BEFORE it is incurred or it is
 * not reimbursable, ever; charged through platform rails so §14/§15 govern it; evidence
 * attached to the approved quote; refunded by the same route; never reconciled after the fact
 * from receipts nobody agreed to). Until that is built and ruled, **no surface may promise
 * it**. Nothing was built for this lane; its whole job is that no surface says otherwise.
 *
 * WHY A PIN, AND WHY AN ABSENCE ONE. A promise a page can make and the platform cannot keep is
 * invisible to every other kind of test — no rail goes red when a page offers to pay back money
 * no code path moves. This lane's hand sweep found the client surface already CLEAN, which is
 * the best moment to pin it: the pin costs nothing today and refuses the first sentence that
 * would have made it true. It is the D-5 shape (`no-milestone-billing.test.ts`) one question
 * over — that pin forbids a billing SCHEDULE for planning work, this one forbids a
 * REIMBURSEMENT for a seller's spend. They are deliberately separate files because they answer
 * different halves of D-7's sibling rulings and neither predicate belongs inside the other.
 *
 * WHAT IS DELIBERATELY NOT IN THE PREDICATE, because this vocabulary is REAL and stays:
 *   • `transactionTypeEnum`'s `"expense"` and the whole `trip_transactions` cost-split family
 *     (`server/services/budget.service.ts`, `components/logistics/budget-intelligence.tsx`) —
 *     the TRAVELER's own group budget, money the travellers spend on themselves. Nothing bills
 *     a seller through it and it is not a platform reimbursement.
 *   • the EA console's "Expense Report" (`pages/ea/reports.tsx`) — a report of the EXECUTIVE's
 *     own spend, on an assistant's surface. It names no payer but the executive.
 *   • payment RECEIPTS for a traveler's own purchase ("Download Receipt", "Email Receipt",
 *     "your receipt shows the exact amount charged") — the record of a charge that happened,
 *     the opposite of a claim for one that has not.
 *   • the Terms' indemnification clause, whose "costs or expenses" run FROM the user TO the
 *     platform.
 * E4 asserts these survive, so the sweep can never be satisfied by deleting real vocabulary.
 *
 * NEGATIVE SPACE, stated because green here is green-within-bounds. This reads CLIENT source
 * text only, over the derived set below. It checks THE PHRASES IT NAMES — not every possible
 * wording, and it cannot see a form of the promise nobody has written down yet. It says nothing
 * about server copy, emails, locales or seed rows (all swept by hand in this lane; the two
 * `reimburs`/`expense` hits found — a reunion template's "Travel Reimbursement Info" filter tag
 * and a demo listing's description of its author's own travel budget — are the traveler's own
 * vocabulary and were left alone), and nothing about whether a rail exists: it is an ABSENCE
 * pin over words. A file outside the walk is unchecked, not exonerated.
 *
 * Pure static source pins: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/no-expense-reimbursement.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");

/**
 * Strip comments before a word grep. The ruling is EXPLAINED in comments (this file included,
 * and in any surface that later has to say why it does not offer reimbursement), so a naive
 * `includes()` over raw text would be satisfied by the explanation and the absence pin would
 * pass on a page that had put the promise back. The pin has to read the CODE.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * THE FILE SET IS DERIVED BY WALKING THE CLIENT TREE, never a hand list — and unlike D-5's
 * rail-marker subset it is deliberately the WHOLE traveler- and earner-facing surface. That is
 * affordable here precisely BECAUSE the phrases below name a claim shape this codebase does not
 * otherwise use: the hand sweep found zero hits platform-wide, so a narrow set would buy
 * nothing and would leave /earn, the FAQ, the Terms and the application wizard unchecked — the
 * four places a reimbursement promise is most likely to be written.
 */
function clientSurfaces(): Array<{ rel: string; code: string }> {
  const out: Array<{ rel: string; code: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      out.push({ rel: relative(CLIENT_SRC, full), code: stripComments(readFileSync(full, "utf8")) });
    }
  };
  walk(CLIENT_SRC);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * The phrases. Each names a REIMBURSEMENT SHAPE the platform cannot perform — a cost somebody
 * else incurs and this platform pays back, bills on, or settles against evidence produced after
 * the money was spent. Every rule is phrase-shaped rather than word-shaped, so the real
 * vocabulary above (an `expense` transaction type, an EA expense report, a payment receipt) is
 * untouched by construction. E3 proves none of them is vacuous.
 */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/reimbursable/i, "a reimbursable anything"],
  [/reimburs[a-z]*[^.\n]{0,48}\b(expenses?|costs?|receipts?|spend|outlay)\b/i, "reimbursing expenses"],
  [/\b(expenses?|costs?|receipts?|outlays?)\b[^.\n]{0,48}reimburs/i, "expenses reimbursed"],
  [/\b(we|traveloure|the platform|your (expert|provider|host|planner))\b[^.\n]{0,48}reimburs/i, "a named party reimbursing"],
  [/out[-\s]of[-\s]pocket/i, "out-of-pocket spend"],
  [/per\s+diem/i, "a per diem"],
  [/mileage\s+(rate|allowance|reimbursement|claim)/i, "a mileage allowance"],
  [/expense\s+(claims?|reimbursements?|advances?|floats?)/i, "an expense claim"],
  [
    /\bexpenses?\b\s+(are|is|will be|get|gets|can be|may be)\s+(reimbursed|covered|paid|refunded|billed|recovered)/i,
    "expenses covered",
  ],
  [
    /\b(cover|covers|covered|covering)\s+(any|all|your|their|the)\s+[^.\n]{0,24}\b(expenses?|out[-\s]of[-\s]pocket)\b/i,
    "covering expenses",
  ],
  [/(submit|upload|attach|itemi[sz]e)\s+(your\s+|the\s+)?receipts?\b/i, "receipt-based reconciliation"],
  [
    /\breceipts?\b[^.\n]{0,32}(for|to)\s+(reimburs|repayment|a refund of (your|their) (costs?|expenses?))/i,
    "receipts for reimbursement",
  ],
  [
    /(bill|billed|billing|charge|charged|invoice|invoiced)[^.\n]{0,32}\b(expert|provider|seller|host|earner)'?s?\b[^.\n]{0,24}\bexpenses?\b/i,
    "billing a seller's expenses",
  ],
  [
    /\bexpenses?\b[^.\n]{0,32}(added|charged|passed)\s+(on\s+)?to\s+(your|the traveler'?s?)\b/i,
    "expenses passed to the traveler",
  ],
];

function offences(code: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(code)).map(([, name]) => name);
}

describe("D-7 — no surface promises that a seller's expenses are reimbursed, billed on or reconciled", () => {
  it("E1 the derived set actually reaches the surfaces such a promise would be written on", () => {
    const rels = clientSurfaces().map((f) => f.rel);
    assert.ok(rels.length >= 200, `expected the whole client surface, got ${rels.length} files`);
    // Where a reimbursement promise would most plausibly land. If the walk stops reaching
    // these, the sweep below has quietly stopped checking the pages the ruling is about.
    for (const expected of [
      "pages/earn.tsx",
      "pages/faq.tsx",
      "pages/terms.tsx",
      "pages/pricing.tsx",
      "pages/ea/reports.tsx",
      "components/logistics/budget-intelligence.tsx",
    ]) {
      assert.ok(rels.includes(expected), `${expected} must be in the derived client set`);
    }
  });

  it("E2 the SWEEP — no client surface's CODE offers to reimburse, cover or reconcile spend", () => {
    const bad: string[] = [];
    for (const { rel, code } of clientSurfaces()) {
      for (const name of offences(code)) bad.push(`${rel}: ${name}`);
    }
    assert.deepEqual(
      bad,
      [],
      `there is no reimbursable-expense object on this platform — no quote, no approval, no ` +
        `evidence store and no refund route (ledger 2026-09-15-d7-completion-split, option B ` +
        `for now). These surfaces say otherwise:\n  ${bad.join("\n  ")}`,
    );
  });

  it("E3 the predicate is not vacuous — every phrase is caught", () => {
    // One fixture per rule: a green E2 means nothing if the regexes match nothing.
    const fixtures = [
      "reimbursable expenses up to $200",
      "we will reimburse your costs",
      "expenses are reimbursed within 7 days",
      "your expert is reimbursed for travel",
      "out-of-pocket costs",
      "a per diem of $50",
      "mileage rate of 0.45 per mile",
      "expense claims are reviewed monthly",
      "expenses will be covered by the platform",
      "we cover any travel expenses",
      "submit your receipts for anything you spend on the day",
      "keep receipts for reimbursement",
      "we bill the provider's expenses to the trip",
      "expenses added to your total at checkout",
    ];
    for (const f of fixtures) {
      assert.ok(offences(f).length > 0, `no rule catches the fixture: ${f}`);
    }
  });

  it("E4 the REAL expense vocabulary the ruling protects is untouched", () => {
    // The sweep must never be satisfiable by deleting the traveler's own cost-split words, the
    // EA console's report of an executive's own spend, or a payment receipt. Each of these is
    // money a named person actually spent or was actually charged — §13's other direction.
    const set = new Map(clientSurfaces().map((f) => [f.rel, f.code]));
    assert.match(
      set.get("components/logistics/budget-intelligence.tsx") ?? "",
      /expense/i,
      "the traveler's own group-budget expense lines are real and stay",
    );
    assert.match(
      set.get("pages/ea/reports.tsx") ?? "",
      /Expense Report/,
      "the EA console reports the EXECUTIVE's own spend and names no other payer",
    );
    assert.match(
      set.get("components/booking/BookingConfirmation.tsx") ?? "",
      /Receipt/,
      "a payment receipt records a charge that happened and is not a claim for one that did not",
    );
  });
});
