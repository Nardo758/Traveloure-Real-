/**
 * Step 5 (migration 343): a version stop names the plan item it keeps (ledger
 * `2026-10-04-surface-step5-map-versions`).
 *
 *   S1 reconciliation: an id match is decisive; a listing/title match fills the missing id; a
 *      baseline stop the model omitted is carried through WITH its plan item id
 *   S2 the optimizer writes the id on the baseline copy and on every version stop, and the prompt
 *      asks for the [S#] tag (plan item ids never enter the prompt)
 *
 * Run: npx tsx --test server/utils/__tests__/optimizer-source-item.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSameOptimizerItem, reconcileVariantWithBaseline } from "../../services/optimizer-variant-reconciliation.service";

test("S1 ids decide; name matches fill the id; carried stops keep it", () => {
  const baseline = [
    { id: "cart1", planItemId: "plan-1", name: "Kinkaku-ji", dayNumber: 1 },
    { id: "cart2", planItemId: "plan-2", name: "Ryoan-ji", dayNumber: 1 },
    { id: "cart3", planItemId: "plan-3", name: "Gion", dayNumber: 2 },
  ] as any[];
  assert.equal(isSameOptimizerItem(baseline[0], { name: "Something else", sourceItemId: "plan-1" } as any), true);
  assert.equal(isSameOptimizerItem(baseline[0], { name: "Kinkaku-ji", sourceItemId: "plan-2" } as any), false, "an id that says otherwise wins over a title");
  const emitted = [
    { name: "Ryoan-ji", dayNumber: 2, serviceType: "activity" },
    { name: "Gion", dayNumber: 2, serviceType: "activity", sourceItemId: "plan-3" },
  ] as any[];
  const { items, carriedThrough } = reconcileVariantWithBaseline(emitted, baseline);
  assert.equal(carriedThrough, 1);
  assert.equal(items.find((i: any) => i.name === "Ryoan-ji")?.sourceItemId, "plan-2", "a title match fills the id");
  assert.equal(items.find((i: any) => i.name === "Gion")?.sourceItemId, "plan-3");
  assert.equal(items.find((i: any) => i.name === "Kinkaku-ji")?.sourceItemId, "plan-1", "a carried stop keeps its id");
});

test("S2 the optimizer writes the id on both sides and prompts with [S#] tags", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.resolve(here, "../../itinerary-optimizer.ts"), "utf8");
  assert.match(src, /sourceItemId: item\.planItemId \?\? null,/, "baseline copy");
  assert.match(src, /sourceItemId: item\.sourceItemId \?\? null,/, "version stops");
  assert.match(src, /\[S\$\{i \+ 1\}\] /);
  assert.match(src, /set "sourceRef" to that item's \[S#\] tag/);
  const loader = readFileSync(path.resolve(here, "../../services/optimizer-baseline.service.ts"), "utf8");
  assert.match(loader, /planItemId: item\.id,/);
});
