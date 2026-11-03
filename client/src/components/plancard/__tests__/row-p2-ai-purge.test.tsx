/**
 * Row P-2 (ledger `2026-11-02-p2-ai-purge-round-2`): the planning surfaces and the nav carry no
 * traveler-visible "AI"; the free draft is a "Quick draft".
 *
 *   T1  each swept file, comments stripped, holds no "AI" and no "Claude"
 *   T2  the copy objects and headings: no "AI", nothing on the never-say list
 *   T3  nav.json (en, ja): aiPlanPlanner has no "AI"; planFinish.ai is gone
 *   T4  DRAFT_ACTION is "Quick draft"; the empty slip says "Quick draft · free" when idle
 *   T5  the "ai" origin chip reads "Quick draft"
 *   T6  round-3 ratchet: "AI" in client/src/pages + components (swept files excluded) may only go down
 *
 * Harness: source read with fs, pure helpers. No git, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DRAFT_ACTION } from "@/components/plan/useSlipFreeDraft";
import { ASK_AI_COPY, askAiBarLabel } from "@/lib/ask-ai-drawer";
import { PLAN_ASSISTANT_COPY } from "@/lib/plan-assistant-copy";
import { itemOriginChip } from "@/lib/item-origin";
import { emptyActionLabel } from "@/lib/expert-door";
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";
import { aiTaskCheckoutHeading } from "@/lib/checkout-headings";
import { siteNeverSayHits } from "@shared/banned-copy";

const stripComments = (src: string) =>
  src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const SWEPT = [
  "client/src/components/plan/useSlipFreeDraft.tsx",
  "client/src/components/plancard/SlipRail.tsx",
  "client/src/components/plan/SlipEmptyStart.tsx",
  "client/src/components/EnhancedPlanningModal.tsx",
  "client/src/components/plancard/SlipView.tsx",
  "client/src/lib/item-origin.ts",
  "client/src/lib/ai-draft-refusal.ts",
  "client/src/lib/expert-door.ts",
  "client/src/lib/ask-ai-drawer.ts",
  "client/src/components/plancard/AskAiDrawer.tsx",
  "client/src/pages/discover.tsx",
  "client/src/pages/itinerary-comparison.tsx",
  "client/src/lib/checkout-headings.ts",
  "client/src/pages/ai-assistant.tsx",
  "client/src/lib/nav-config.ts",
  "client/src/lib/plan-assistant-copy.ts",
  "client/src/components/dashboard-sidebar.tsx",
  "client/src/pages/dashboard.tsx",
  "client/src/components/layout.tsx",
];

/** Pinned at PR time (Nov 2, 2026; lowered 159 → 115 by P-8, Nov 3). Lower it when a round-3 row removes hits; never raise it. */
const ROUND3_AI_CEILING = 115;

describe("P-2 AI purge, round 2", () => {
  it("T1 the swept files carry no AI and no Claude outside comments", () => {
    for (const f of SWEPT) {
      const code = stripComments(fs.readFileSync(f, "utf8"));
      const hits = code.split("\n").filter((l) => /\bAI\b|Claude/.test(l));
      assert.deepEqual(hits, [], f);
    }
  });

  it("T2 the copy objects and headings", () => {
    const values: string[] = [
      ...(Object.values(ASK_AI_COPY) as unknown[]).filter((v): v is string => typeof v === "string"),
      ...Object.values(PLAN_ASSISTANT_COPY),
      askAiBarLabel({ kind: "priced", amount: "$2.99" } as any),
      askAiBarLabel({ kind: "covered" } as any),
      askAiBarLabel({ kind: "unknown" } as any),
      emptyActionLabel("Kyoto"),
      emptyActionLabel(null),
      readSlipHasItemsRefusal(409, { error: "slip_has_items" })!.message,
      aiTaskCheckoutHeading(null),
      aiTaskCheckoutHeading("Kyoto"),
    ];
    for (const v of values) {
      assert.doesNotMatch(v, /\bAI\b/, v);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
    assert.equal(aiTaskCheckoutHeading(null).startsWith("Pay for this task"), true);
    assert.equal(emptyActionLabel(null), "Start with a free Quick draft. We record your interest so a local expert can pick it up.");
  });

  it("T3 nav.json: aiPlanPlanner has no AI; planFinish.ai is gone", () => {
    for (const lang of ["en", "ja"]) {
      const nav = JSON.parse(fs.readFileSync(`client/src/locales/${lang}/nav.json`, "utf8"));
      assert.doesNotMatch(nav.links.aiPlanPlanner, /AI/, lang);
      assert.equal(nav.planFinish?.ai, undefined, lang);
      assert.doesNotMatch(JSON.stringify(nav.planFinish), /AI/, lang);
    }
  });

  it("T4 Quick draft", () => {
    assert.equal(DRAFT_ACTION, "Quick draft");
    const empty = fs.readFileSync("client/src/components/plan/SlipEmptyStart.tsx", "utf8");
    assert.match(empty, /\{draft\.isPending \? "Drafting…" : "Quick draft · free"\}/);
    const rail = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");
    assert.match(rail, /<DatesGate trip=\{trip\} action="Quick draft"/);
  });

  it("T5 the ai origin chip", () => {
    assert.equal(itemOriginChip("ai")?.label, "Quick draft");
  });

  it("T6 round-3 ratchet", () => {
    const excluded = new Set(SWEPT.map((f) => path.normalize(f)));
    let n = 0;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(p);
        } else if (/\.(tsx?|jsx?)$/.test(e.name) && !excluded.has(path.normalize(p))) {
          n += (stripComments(fs.readFileSync(p, "utf8")).match(/\bAI\b/g) ?? []).length;
        }
      }
    };
    walk("client/src/pages");
    walk("client/src/components");
    assert.ok(n <= ROUND3_AI_CEILING, `"AI" in pages/components rose to ${n} (ceiling ${ROUND3_AI_CEILING})`);
  });
});
