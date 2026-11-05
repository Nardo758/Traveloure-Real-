/**
 * Row P-6 — the banned-word sweep and the never-say ratchet (ledger `2026-11-02-p6-banned-word-sweep`; Leon, Nov 2 §7).
 *
 *   T1 siteNeverSayHits flags each new pattern and passes "Recommended · <reason>" and "as soon as".
 *   T2 every planning-surface file the brief names (§4b) carries zero never-say hits in its copy.
 *   T3 the slip shows no traveler fee line; the fee lines at payment stay (checkout, confirmation, quote).
 *   T4 the versions board labels a version only when the server marked it, and the label states the reason.
 *   T5 the baseline only shrank or held from the count pinned at this PR (134 entries, 344 hits).
 *   T6 PayPal appears in no traveler page or component copy; only earner payout files may name it, and no traveler
 *      page imports them.
 *
 * Copy is read the way the CI scan reads it (`scanCode` — literals and JSX text, never comments or identifiers).
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-p6-banned-words.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { siteNeverSayHits } from "@shared/banned-copy";
import { scanCode } from "../../../../../scripts/check-never-say-copy";
import { versionRecommendedLabel, VERSION_RECOMMENDED_LABEL } from "../../../lib/versions-board";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PLANNING_SURFACES = [
  "client/src/lib/versions-board.ts",
  "client/src/components/plancard/VersionsBoard.tsx",
  "client/src/components/plancard/ProposalColumn.tsx",
  "client/src/components/city-feed-card.tsx",
  "client/src/lib/feed-composition.ts",
  "client/src/components/city-feed-card-recommendation.tsx",
  "client/src/components/UpsellSlot.tsx",
  "client/src/components/itinerary/TransportLeg.tsx",
  "client/src/pages/discover.tsx",
  "client/src/pages/service-providers.tsx",
  "client/src/pages/discover-location.tsx",
  "client/src/pages/experts.tsx",
  "shared/where-to-stay.ts",
  "client/src/components/plan/AnchorPanel.tsx",
  "client/src/components/plancard/SlipRail.tsx",
  "client/src/components/neighborhood-card.tsx",
  "client/src/components/plancard/PlanCard.tsx",
  "client/src/components/landing/experiences-rail.tsx",
  "client/src/components/ui/marketplace-card.tsx",
  "client/src/components/plancard/TripCardRail.tsx",
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${e}`;
    if (e === "__tests__" || e === "node_modules") continue;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...tsFiles(rel));
    else if (/\.tsx?$/.test(e)) out.push(rel);
  }
  return out;
}

describe("P-6 — banned words", () => {
  it("T1 each new pattern is flagged; the reasoned label and 'as soon as' pass", () => {
    const cases: Array<[string, string]> = [
      ["A popular spot", "popular"],
      ["The best time to go", "best"],
      ["Top-rated guides", "top pick/rated"],
      ["Our most popular tour", "most <superlative>"],
      ["The #1 tour in town", "#1"],
      ["A founding member", "founding"],
      ["Pay with PayPal", "paypal"],
      ["Unlimited tasks", "unlimited"],
      ["Hotels ranked by distance", "ranked by"],
      ["Traveler service fee", "traveler fee"],
      ["Recommended", "recommended"],
      ["Opening soon", "soon"],
      ["Fewer crowds in spring", "crowd"],
      ["A busy street", "busy"],
      ["Go at a quiet time", "quiet time"],
      ["A packed square", "packed"],
    ];
    for (const [text, words] of cases) assert.ok(siteNeverSayHits(text).includes(words), `${text} ⇒ ${words}`);
    assert.deepEqual(siteNeverSayHits(VERSION_RECOMMENDED_LABEL), []);
    assert.deepEqual(siteNeverSayHits("We'll get back to you as soon as we can"), []);
    assert.deepEqual(siteNeverSayHits("A quiet lane near the river"), []);
  });

  it("T2 every planning surface the brief names carries zero never-say hits", () => {
    for (const f of PLANNING_SURFACES) assert.deepEqual(scanCode(f, read(f)).map((h) => `${h.words}: ${h.text}`), [], f);
  });

  it("T3 the slip has no fee line; the fee lines at payment stay", () => {
    assert.ok(!read("client/src/components/plancard/SlipRail.tsx").includes("slip-traveler-fee-preview"));
    assert.ok(read("client/src/pages/cart.tsx").includes(">Service fee<"), "checkout fee line");
    assert.ok(read("client/src/components/booking/BookingConfirmation.tsx").includes("traveler service fee"), "confirmation fee line");
    assert.ok(read("client/src/lib/quote-copy.ts").includes("traveler service fee, charged with this payment."), "quote fee line");
  });

  it("T4 a version is labelled only when the server marked it, with its reason", () => {
    assert.equal(versionRecommendedLabel({ recommended: true }), "Recommended · shortest distance between stops");
    assert.equal(versionRecommendedLabel({ recommended: false }), null);
    assert.equal(versionRecommendedLabel({}), null);
    assert.equal(versionRecommendedLabel(null), null);
    const board = read("client/src/components/plancard/VersionsBoard.tsx");
    assert.match(board, /const recommendedLabel = versionRecommendedLabel\(v\);/);
    assert.match(board, /\{recommendedLabel\}/);
    assert.ok(!read("client/src/components/plancard/ProposalColumn.tsx").includes(">Recommended<"));
  });

  it("T5 the baseline only shrank or held (134 entries, 344 hits at this PR)", () => {
    const b = JSON.parse(read("scripts/never-say-baseline.json")) as Record<string, Record<string, number>>;
    // Lane 5 (K-8): "perfect" joined the list later; its recorded debt is pinned in row-p8 T5, apart from this ratchet.
    const older = Object.values(b).map((by) => Object.entries(by).filter(([w]) => w !== "perfect"));
    const entries = older.reduce((n, by) => n + by.length, 0);
    const hits = older.reduce((n, by) => n + by.reduce((a, [, c]) => a + c, 0), 0);
    assert.ok(entries <= 134, `entries ${entries}`);
    assert.ok(hits <= 344, `hits ${hits}`);
    for (const by of Object.values(b)) assert.ok(!("founding" in by), "founding has no baseline entry");
  });

  it("T6 PayPal appears only in earner payout files, and no traveler page imports them", () => {
    const offenders: string[] = [];
    for (const dir of ["client/src/pages", "client/src/components"]) {
      for (const f of tsFiles(dir)) if (scanCode(f, read(f)).some((h) => h.words === "paypal")) offenders.push(f);
    }
    assert.deepEqual(offenders, []);
    const earner = /^client\/src\/(pages\/(admin|provider|expert|ea)\/|components\/(payouts?|admin)\/)/;
    const importers: string[] = [];
    for (const dir of ["client/src/pages", "client/src/components"]) {
      for (const f of tsFiles(dir)) {
        if (/from "@\/lib\/payout-(setup|ops)"|from "@\/components\/payouts?\//.test(read(f)) && !earner.test(f)) importers.push(f);
      }
    }
    // The shared profile page mounts the payout card for an earner only (Row 115) — a traveler never sees it.
    assert.deepEqual(importers, ["client/src/pages/profile.tsx"]);
    assert.ok(read("client/src/pages/profile.tsx").includes("{isEarner ? <PayoutDetailsCard /> : null}"));
  });
});
