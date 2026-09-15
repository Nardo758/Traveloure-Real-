/**
 * NO MILESTONE BILLING FOR PLANNING WORK — no surface promises a billing shape the platform
 * cannot perform. Decision-maker ruling 2026-09-15 (punchlist **D-5**, option A); ledger
 * `2026-09-15-d5-no-milestone-billing`; CLAUDE.md §13, §18 rule 1.
 *
 * THE RULING. There is NO milestone, staged, instalment or deposit-then-balance billing for
 * expert PLANNING work. A large engagement is sold as a listing like any other — ruling 11's
 * rail, landed as `2026-09-15-plan-work-one-rail`: charged ONCE at checkout, advisor access
 * granted on authorization — or not at all. Nothing was built for this lane; its whole job is
 * that no surface says otherwise.
 *
 * WHY A PIN. A promise a surface can make and the platform cannot keep is invisible to every
 * other kind of test: no rail goes red when a page offers a payment schedule no code performs.
 * Two live surfaces did exactly that before this lane — the pricing ladder and the landing
 * price ladder both rendered an "N% deposit" for a done-for-you EVENT, whose engagement fee is
 * quoted server-side and captured ONCE (`coordination_states.fee_payment_status`
 * unpaid|pending|paid, one `fee_payment_intent_id`), and the slip's expert picker rendered an
 * "$X/hr" chip for planning work nothing bills by the hour.
 *
 * WHAT IS DELIBERATELY NOT IN THE PREDICATE, because these rails are REAL and stay:
 *   • §15d's deposit / balance on a `service_bookings` RESERVATION — a per-listing provider
 *     opt-in (`provider_services.deposit_enabled`) with a real balance-payment rail. A plan-work
 *     LISTING is an ordinary listing, so this pin never forbids the word "deposit" on a booking
 *     surface; it forbids a deposit stated as an ENGAGEMENT's or a QUOTE's payment schedule.
 *   • the coordination FEE itself (§8 `coordination_floor` / `coordination_percent`) — one
 *     server-derived charge, which the pricing surfaces may and do name.
 *   • the traveler's own vendor contracts (`vendor-contract-board.tsx`), whose payment
 *     milestones are a third party's schedule the plan RECORDS, never the platform's billing.
 *
 * NEGATIVE SPACE, stated because green here is green-within-bounds. This reads CLIENT source
 * text only, over the file set the rail marker below derives. It checks THE PHRASES IT NAMES —
 * not every possible wording, and it cannot see a new form of the promise nobody has written
 * down yet. It says nothing about server copy or emails (swept by hand in this lane and found
 * clean), nothing about a surface outside the derived set (unchecked, not exonerated — the D13
 * posture), and nothing about whether a rail exists: it is an ABSENCE pin over words.
 *
 * Pure static source pins: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/no-milestone-billing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");

/**
 * Strip comments before a word grep. The ruling is EXPLAINED in comments at each surface it
 * touched — that is how the next reader learns why the deposit line is gone — so a naive
 * `includes()` over the raw file would be satisfied by the explanation and the absence pin
 * would pass on a page that had put the promise back. The pin has to read the CODE.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * THE FILE SET IS DERIVED BY A MARKER THE FILES ALREADY CARRY, never a hand list: every
 * `client/src` `.ts`/`.tsx` whose CODE names one of the paid-planning rails. That is what a
 * planning-commerce surface IS by construction — it prices the ladder, opens or pays a
 * coordination engagement, hires an expert onto a plan, lists the expert offering catalog, or
 * runs the expert application — and it reaches the surfaces this lane changed plus the ones it
 * only read (the Workstation, /earn, My Events, the storefront request, the expert detail page).
 * A file that starts naming one of these rails is swept the day it does.
 */
const PLANNING_RAIL =
  /\/api\/(pricing\b|coordination-states|concierge\/requests|trip-experts|offering-types\/experts|expert-booking-requests|expert\/application-status)|expert-advisor/;

function planningCommerceSurfaces(): Array<{ rel: string; code: string }> {
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
      const code = stripComments(readFileSync(full, "utf8"));
      if (PLANNING_RAIL.test(code)) out.push({ rel: relative(CLIENT_SRC, full), code });
    }
  };
  walk(CLIENT_SRC);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * The phrases. Each names a billing SHAPE the platform does not perform for planning work, in
 * both the form a page renders and the form the source carries — the pre-fix pricing line
 * interpolated its percentage (`${pct(pricing.doneForYouDepositPct)} deposit`), so a
 * digits-and-a-percent-sign regex would have looked straight past it. M3 proves none of these
 * is vacuous.
 */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/instal?lments?/i, "instalment billing"],
  [/milestone\s+(billing|payments?|schedule)/i, "milestone billing"],
  [/(pay|paid|payable|billed|charged?)[^.\n]{0,24}\bmilestones?\b/i, "payment against milestones"],
  [/\bretainer\b/i, "retainer"],
  [/(staged|phased)\s+(billing|payments?)/i, "staged payments"],
  [/pay\s+(in|over)\s+(stages|phases|instal)/i, "paying in stages"],
  [/pay[-\s]as[-\s]you[-\s]go/i, "pay-as-you-go planning"],
  [/progress\s+payments?/i, "progress payments"],
  [/payment\s+plan/i, "a payment plan"],
  [/%\s*deposit/i, "a percentage deposit"],
  [/\bdoneForYouDepositPct\b/, "the done-for-you deposit percentage (display-only band, no rail)"],
  [/deposit\s*(\+|and|then)\s*balance/i, "deposit-then-balance on an engagement"],
  [/\bdeposits?\b[^.\n]{0,40}\b(coordination|engagement|planning|quote)\b/i, "a deposit on an engagement/quote"],
  [/\b(coordination|engagement|planning|quote)\b[^.\n]{0,40}\bdeposits?\b/i, "an engagement/quote with a deposit"],
  [/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?\s*(?:\/|per\s+)(?:hrs?|hours?)\b/i, "a money-shaped hourly rate"],
  [/\/hr\b/, "an hourly-rate suffix"],
  [/(billed|charged)\s+(by the hour|hourly|weekly|monthly)/i, "hourly or periodic billing"],
];

function offences(code: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(code)).map(([, name]) => name);
}

describe("D-5 — no surface promises milestone, staged, instalment or hourly billing for planning work", () => {
  it("M1 the derived set actually reaches the planning-commerce surfaces", () => {
    const rels = planningCommerceSurfaces().map((f) => f.rel);
    assert.ok(rels.length >= 10, `expected a real set of planning-commerce surfaces, got ${rels.length}`);
    // The four this lane changed, plus two it only read — if the marker stops reaching these,
    // the sweep below has quietly stopped checking the pages the ruling was about.
    for (const expected of [
      "pages/pricing.tsx",
      "components/landing/how-it-works.tsx",
      "components/plancard/AssignExpertDialog.tsx",
      "pages/travel-experts.tsx",
      "pages/my-events.tsx",
      "pages/expert/workspace.tsx",
    ]) {
      assert.ok(rels.includes(expected), `${expected} must be in the derived planning-commerce set`);
    }
  });

  it("M2 the SWEEP — no planning-commerce surface's CODE promises a payment schedule", () => {
    const bad: string[] = [];
    for (const { rel, code } of planningCommerceSurfaces()) {
      for (const name of offences(code)) bad.push(`${rel}: ${name}`);
    }
    assert.deepEqual(
      bad,
      [],
      `planning work is sold as a listing at its listed price, charged once at checkout ` +
        `(ledger 2026-09-15-plan-work-one-rail). These surfaces say otherwise:\n  ${bad.join("\n  ")}`,
    );
  });

  it("M3 the predicate is not vacuous — every phrase, and the pre-fix source, is caught", () => {
    // One fixture per rule: a green M2 means nothing if the regexes match nothing.
    const fixtures = [
      "paid in 3 monthly installments",
      "milestone billing for large engagements",
      "you are billed at each milestone",
      "a retainer is required",
      "staged payments across the engagement",
      "pay in stages as the plan comes together",
      "pay-as-you-go planning",
      "progress payments during the build",
      "ask about a payment plan",
      "50% deposit",
      "pricing.doneForYouDepositPct",
      "deposit + balance",
      "a deposit on your coordination engagement",
      "your quote is confirmed with a deposit",
      "$50-150/hour depending on experience",
      "${expert.hourly_rate}/hr",
      "billed by the hour",
    ];
    for (const f of fixtures) {
      assert.ok(offences(f).length > 0, `no rule catches the fixture: ${f}`);
    }
    // The two live lines this lane removed, VERBATIM as they stood in source — the pin must
    // fail on the code it replaced, or it is not a pin on this change.
    const prefixPricing = "`Events: custom quote · ${pct(pricing.doneForYouDepositPct)} deposit`";
    const prefixLanding = "`${pricing.doneForYouDepositPct}% deposit`";
    const prefixPicker = "{expert.hourly_rate && <span>${expert.hourly_rate}/hr</span>}";
    const prefixApplication = "Average expert rates: $50-150/hour depending on experience";
    for (const line of [prefixPricing, prefixLanding, prefixPicker, prefixApplication]) {
      assert.ok(offences(line).length > 0, `the pre-fix line is not caught: ${line}`);
    }
  });

  it("M4 the price ladder still names what a done-for-you event actually costs", () => {
    // Loose on purpose — the sentence stays free to be reworded in each surface's voice. What
    // it may not do is go back to describing a schedule (M2), or say nothing at all about the
    // one charge that exists (§13: the engagement's fee is a real, server-quoted fact).
    const set = new Map(planningCommerceSurfaces().map((f) => [f.rel, f.code]));
    for (const rel of ["pages/pricing.tsx", "components/landing/how-it-works.tsx"]) {
      assert.match(
        set.get(rel) ?? "",
        /coordination fee/i,
        `${rel} prices the done-for-you engagement and must name its one coordination fee`,
      );
    }
  });
});
