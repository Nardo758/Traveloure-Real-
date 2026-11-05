/**
 * Round 3, lane R3-1 — the guest save rail, client half (ledger `2026-11-05-r3-guest-save`).
 *
 *   C1  R3-4: the party panel opens at two adults when the plan states none (Save is ready); a stated party is kept.
 *   C2  R3-1: a save makes the plan only through the get-or-create POST and re-reads the plan on every answer, so the
 *       list follows the server without a reload.
 *   C3  R3-5: the Trip Slip is drawn in place on the guest plan page; `/plans/new` is one route.
 *
 * Run: npx tsx --test client/src/components/__tests__/r3-guest-save.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineWhoPanel } from "../plan/SlipAnchorPanels";
import { DEFAULT_ADULTS } from "@shared/plan-vocabulary";

(globalThis as any).React = React;
const render = (current: { adults: number | null; kids: number | null }) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <InlineWhoPanel tripId="t1" current={current as any} submit={async () => {}} />
    </QueryClientProvider>,
  );

describe("Round 3 guest save rail (client)", () => {
  it("C1 the party panel opens at two adults", () => {
    assert.equal(DEFAULT_ADULTS, 2);
    assert.match(render({ adults: null, kids: null }), /value="2"/);
    assert.match(render({ adults: 1, kids: null }), /value="1"/);
  });

  it("C2 a save uses get-or-create only and always re-reads the plan", () => {
    const src = fs.readFileSync("client/src/lib/waitlist-guest-plan.ts", "utf8");
    const save = src.slice(src.indexOf("export async function saveToGuestPlan"), src.indexOf("export function guestSavedMessage"));
    assert.match(save, /await createGuestPlan\(/, "the plan is made by the get-or-create POST");
    assert.doesNotMatch(save, /fetchGuestPlan\(|apiRequest\("GET"/, "never a GET first");
    assert.match(save, /\} finally \{\s*\/\/[^\n]*\n[^\n]*\n\s*await queryClient\.invalidateQueries\(\{ queryKey: GUEST_PLAN_QUERY_KEY \}\);/);
  });

  it("C3 the Trip Slip is drawn in place on the guest plan page", () => {
    assert.match(fs.readFileSync("client/src/pages/guest-plan-map.tsx", "utf8"), /<GuestPlanSlip view=\{view\} \/>/);
    const app = fs.readFileSync("client/src/App.tsx", "utf8");
    assert.equal((app.match(/<Route path="\/plans\/new[^"]*">/g) ?? []).length, 1, "one /plans/new route");
  });
});
