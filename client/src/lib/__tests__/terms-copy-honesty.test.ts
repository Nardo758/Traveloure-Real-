/**
 * THE TERMS PUBLISH NO FEE RATE AND SELL NO RETIRED PRODUCT — a static pin over
 * `client/src/pages/terms.tsx`, the document every account must accept (`client/src/App.tsx`
 * routes `/terms`, and a signed-in user with no `termsAcceptedAt` is redirected to
 * `/accept-terms`). Decision-maker ruling 2026-09-15, punchlist **V-21** = option A; ledger
 * `2026-09-15-v21-terms-copy`; CLAUDE.md **§8**, **§13**, **§18d**, **Locked Decision 43(b)**.
 *
 * THE TWO RULINGS THIS PINS.
 *   (a) **The retired product.** The credits/wallet system is RETIRED (LD 43(b)); all four
 *       wallet/credit endpoints answer **410 Gone**. §7.2 "Platform Credit System" promised a
 *       purchase-in-advance balance and an inactivity fee, and 16.3 promised forfeiture of it —
 *       a contract the platform cannot perform in either direction, on the one page whose whole
 *       job is to be true (§13). Both are deleted; the sub-sections renumbered with no gap.
 *   (b) **The rate literals.** §8 forbids a fee/commission/margin literal outside
 *       `fee_bands`/config. Four were PUBLISHED here as legal promises — a referral share, an
 *       expert commission rate, a local-expert split and a provider commission — and an admin
 *       band edit moves the charge and can never move this page. Each is replaced by a sentence
 *       that names no number and points at Traveloure's published fee schedule.
 *
 * WHY A TEXT PIN, AND WHY IT IS THE ONLY LAYER. A number in prose is invisible to every other
 * gate: `scripts/phase2-fee-gate.sh` scans `client`, but Pass A/C match a FIXED value list these
 * numbers are not on and Pass B needs the number on the SAME LINE as a fee-ish identifier
 * followed by `:` or `=`, which prose never is. All three predicates returned zero on this file
 * while it published four rates. That is the gate's **stated negative space** (§18d — green is
 * green-within-stated-bounds), NOT a predicate to widen: widening a fee grep to catch prose
 * would flag every refund percentage and every legal sentence in the repo. This file is the
 * layer instead.
 *
 * WHAT IS DELIBERATELY **NOT** IN THE PREDICATE, because it is real legal content the ruling
 * forbids this lane from touching — T5 asserts each survives, so the sweep can never be
 * satisfied by deleting it:
 *   • **Stripe's own processing rate** ("2.9% + $0.30 per transaction (Stripe fees)"). That is a
 *     third-party processor's published pass-through rate, not a Traveloure commission or
 *     margin. The punchlist row named four literals and this was not one of them.
 *   • **The cancellation/refund percentages** ("50% refund", "100% of what you paid"). A refund
 *     is a share of what the traveler already paid under a named policy — the opposite of a fee
 *     rate, and out of scope by the ruling's own words.
 *   • **"credit card numbers"** in the Stripe clause. The retired product is *platform credits*;
 *     the word "credit" in "credit card" is untouched.
 * So T1 is pinned as *no percentage RANGE anywhere* plus *no commission or revenue share stated
 * as a percentage*, and NOT as a blanket "no `\d+%` in the file" — a blanket rule would fail on
 * the three items above, which this lane is not permitted to change.
 *
 * FURTHER NEGATIVE SPACE. This reads ONE file's source text. It says nothing about the Privacy
 * Policy, the FAQ, `/pricing`, `/earn`, email templates, locale bundles or seed rows, and
 * nothing about whether the fee schedule it now points at is itself published anywhere — it is
 * an ABSENCE pin over words in one document. A rate written in a different page is unchecked,
 * not exonerated.
 *
 * Pure static source pin: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/terms-copy-honesty.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TERMS = join(HERE, "..", "..", "pages", "terms.tsx");

/**
 * Strip comments before the greps. The ruling is EXPLAINED in comments (this file, and any
 * future note in `terms.tsx` saying why it names no rate), so a raw-text grep would be satisfied
 * by the explanation — or tripped by it. The pin has to read the COPY. The `[^:]` guard keeps
 * `https://` out of the line-comment rule, as the sibling static pins do.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const termsCopy = (): string => stripComments(readFileSync(TERMS, "utf8"));

/** A percentage RANGE — the exact shape all four published rates took. */
const PERCENT_RANGE = /\d+(?:\.\d+)?\s*(?:[-–—]|\bto\b)\s*\d+(?:\.\d+)?\s*%/;

/**
 * A commission or revenue share stated as a percentage. Forward-only and `<`-bounded: the match
 * stops at the next tag, so it reads within one sentence of running copy and cannot reach across
 * a list item into the refund clause. The refund sentences name no commission or share, so they
 * are outside this predicate by construction rather than by exemption.
 */
const COMMISSION_PERCENT: Array<[RegExp, string]> = [
  [/commission[^<]{0,120}?\d+(?:\.\d+)?\s*%/i, "a commission stated as a percentage"],
  [/\d+(?:\.\d+)?\s*%[^<]{0,120}?\bcommission\b/i, "a percentage named as commission"],
  [/(?:revenue share|revenue-share|platform's share|our share)[^<]{0,120}?\d+(?:\.\d+)?\s*%/i, "a revenue share stated as a percentage"],
  [/(?:retains?|retained|withholds?)\s+(?:up to\s+)?\d+(?:\.\d+)?\s*%/i, "the platform retaining a stated percentage"],
  [/\bExperts?\s+receives?\s+(?:up to\s+)?\d+(?:\.\d+)?\s*%/i, "an expert receiving a stated percentage"],
];

/** The retired product's vocabulary. "credit card" is deliberately not matched — see the header. */
const RETIRED_CREDITS: Array<[RegExp, string]> = [
  [/platform credits?\b/i, "the retired platform-credit product"],
  [/\bcredits\b/i, "plural credits as a balance"],
  [/\bcredit\b(?!\s+card)/i, "credit as a product noun"],
  [/purchase[^<]{0,40}\bcredit/i, "buying credits"],
  [/\bwallet\b/i, "a platform wallet"],
];

function rateOffences(copy: string): string[] {
  const found: string[] = [];
  if (PERCENT_RANGE.test(copy)) found.push("a percentage range");
  for (const [re, name] of COMMISSION_PERCENT) if (re.test(copy)) found.push(name);
  return found;
}

function creditOffences(copy: string): string[] {
  return RETIRED_CREDITS.filter(([re]) => re.test(copy)).map(([, name]) => name);
}

describe("V-21 — the Terms name no fee rate and sell no retired credits product", () => {
  it("T0 the pin reads the real document", () => {
    const copy = termsCopy();
    assert.ok(copy.length > 20_000, `terms.tsx looks truncated (${copy.length} chars)`);
    assert.match(copy, /Terms and Conditions/, "this must be the Terms page");
    assert.match(copy, /7\. Payment Terms/, "the Payment Terms section must still exist");
  });

  it("T1 no published rate — no percentage range, and no commission or share stated as a percentage (§8)", () => {
    const found = rateOffences(termsCopy());
    assert.deepEqual(
      found,
      [],
      "A rate belongs to `fee_bands`/config, never to a page an admin band edit cannot move " +
        "(CLAUDE.md §8). The Terms state:\n  " +
        found.join("\n  "),
    );
  });

  it("T2 no retired credits product — the wallet/credit rails answer 410 Gone (LD 43(b))", () => {
    const found = creditOffences(termsCopy());
    assert.deepEqual(
      found,
      [],
      "The credits/wallet system is RETIRED; the Terms may not promise a balance the platform " +
        "can neither sell nor honour (§13). The Terms state:\n  " +
        found.join("\n  "),
    );
  });

  it("T3 the fee-schedule sentence is present, and points at the schedule rather than a number", () => {
    const copy = termsCopy();
    assert.match(
      copy,
      /published fee schedule/,
      "each replaced rate must point at Traveloure's published fee schedule",
    );
    // Every occurrence anchors the fee to the time of the booking; a bare mention of a schedule
    // with no "in effect at" clause would be a weaker promise than the sentence that was ruled.
    const mentions = copy.match(/published fee schedule[^<]{0,80}/g) ?? [];
    assert.ok(mentions.length >= 4, `expected one per replaced rate, found ${mentions.length}`);
    for (const m of mentions) {
      assert.match(m, /in effect at the time of the booking/, `weak fee-schedule clause: ${m}`);
    }
  });

  it("T4 no invented tier system — the replacement describes no scheme the platform does not run", () => {
    const copy = termsCopy();
    for (const [re, name] of [
      [/tier-based/i, "a tier-based rate"],
      [/\bExpert tier\b/i, "an expert tier"],
      [/partnership level/i, "a partnership level"],
      [/inactivity fee/i, "an inactivity fee on a balance"],
    ] as Array<[RegExp, string]>) {
      assert.ok(!re.test(copy), `the Terms still describe ${name}, which no code path implements`);
    }
  });

  it("T5 section 7 is renumbered with no gap — no '7.2 reserved' hole", () => {
    const copy = termsCopy();
    const subs = [...copy.matchAll(/>7\.(\d+) ([^<]+)</g)].map((m) => Number(m[1]));
    assert.ok(subs.length >= 3, `expected section 7 sub-sections, found ${subs.length}`);
    assert.deepEqual(
      subs,
      subs.map((_, i) => i + 1),
      `section 7 sub-sections must run 1..n with no gap, got ${subs.join(", ")}`,
    );
    assert.ok(!/reserved/i.test(copy), "a deleted sub-section is removed, never left as 'reserved'");
  });

  it("T6 the predicates are not vacuous — every rule catches the copy that was removed", () => {
    // The exact sentences that stood in this file before the fix. A green T1/T2/T4 means nothing
    // if the regexes match nothing.
    const wasThere: Array<[string, (c: string) => string[]]> = [
      ["<strong>Referral Commission:</strong> 5-15% of booking value for referred travelers", rateOffences],
      ["<strong>Commission Rate:</strong> 15-20% of service fees (tier-based on volume)", rateOffences],
      ["Experts receive 75-85% of consultation fees; Traveloure retains 15-25% as platform fee.", rateOffences],
      ["<strong>Service Provider Commissions:</strong> Standard commission of 4-12% of booking value.", rateOffences],
      ["Traveloure retains 20% as platform fee", rateOffences],
      ["Experts receive 80% of consultation fees", rateOffences],
      ["a revenue share of 12% applies", rateOffences],
      ["<li>Users purchase platform credits in advance</li>", creditOffences],
      ["<li>Credits are non-refundable except as required by law</li>", creditOffences],
      ["unused platform credits may be forfeited (subject to applicable law)", creditOffences],
      ["add credits to your wallet", creditOffences],
    ];
    for (const [fixture, predicate] of wasThere) {
      assert.ok(predicate(fixture).length > 0, `no rule catches the removed copy: ${fixture}`);
    }
  });

  it("T7 the REAL legal content the ruling protects is untouched", () => {
    // The sweep must never be satisfiable by deleting a third-party pass-through rate, the
    // cancellation policy, or the Stripe card clause. §13's other direction: each of these is a
    // fact the platform CAN perform, and each carries a number for a good reason.
    const copy = termsCopy();
    assert.match(
      copy,
      /2\.9% \+ \$0\.30 per transaction \(Stripe fees\)/,
      "Stripe's own published processing rate is a pass-through fact, not a Traveloure margin",
    );
    assert.match(
      copy,
      /50% refund at least 48 hours before/,
      "the cancellation policy's refund percentages are a policy, not a fee rate",
    );
    assert.match(
      copy,
      /you receive 100% of what you paid/,
      "the full-refund promise is a policy the refund rail performs",
    );
    assert.match(
      copy,
      /does not store complete credit card numbers/,
      "the Stripe card clause survives — the retired product is platform CREDITS, not credit cards",
    );
    assert.match(
      copy,
      /Minimum payout threshold: \$25/,
      "payout thresholds are amounts the payout rail enforces, not commission rates",
    );
  });
});
