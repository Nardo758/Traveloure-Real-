/**
 * Step 9c (ledger `2026-10-07-step9c-leg-options`; architect rulings D2–D5, D8): the leg sheet and the
 * rows between stops.
 *   C1 the sheet: three options max, the default (current) first, a pick control on the others only
 *   C2 the owner books: "Find a driver" = the private_transportation browse for this plan; "Book this
 *      for me" = the handoff chooser for the leg's two END ITEMS (an airport end is not an item)
 *   C3 a delegate picks but never books; a reader sees the options and neither
 *   C4 a confirmed host pickup renders the host line and NO Book (D8 fixture — no column exists yet)
 *   C5 a routed leg opens its sheet only for someone who may change the plan's items
 *   C6 a shown leg with no routed facts draws minutes-only between its stops (D5) — no cost, no source
 *   C7 no prices in rows (R-h): neither leg row ever carries a dollar figure
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/step9c-leg-sheet.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { LegSheetBody } from "../../plan/LegSheet";
import { LegRow } from "../../plan/LegRow";
import { useSlipLegs } from "../../plan/useSlipLegs";
import { LEG_HOST_PICKUP_LINE, legHandoffItemIds, legSheetActions } from "@/lib/leg-sheet";
import { slipLegBetween } from "@/lib/slip-legs";
import { servicesBrowseHref } from "@/lib/services-browse";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const prov = (src = "stub") => ({ source: src, checkedAt: "2026-10-04T05:00:00Z" });
const OPTIONS = [
  { mode: "transit" as const, current: true, route: { durationMin: 24, distanceM: 3600, line: "Keihan Main Line", fare: { amount: 220, currency: "JPY" }, provenance: prov("google_routes") } },
  { mode: "drive" as const, current: false, route: { durationMin: 12, distanceM: 4100, line: null, fare: null, provenance: prov("google_routes") } },
  { mode: "walk" as const, current: false, route: { durationMin: 48, distanceM: 3500, line: null, fare: null, provenance: prov("google_routes") } },
];

function body(over: { canEditItems?: boolean; isOwner?: boolean; hostPickupConfirmed?: boolean; options?: typeof OPTIONS } = {}) {
  const actions = legSheetActions({ canEditItems: over.canEditItems ?? true, isOwner: over.isOwner ?? true, hostPickupConfirmed: over.hostPickupConfirmed ?? false });
  return renderToString(
    <Router ssrPath="/">
    <LegSheetBody
      legId="ab"
      options={over.options ?? OPTIONS}
      timeZone="Asia/Tokyo"
      actions={actions}
      picking={false}
      onPick={() => {}}
      asking={false}
      paused={false}
      unavailable={false}
      findDriverHref={servicesBrowseHref("private_transportation", "t1")}
      onBookForMe={() => {}}
    />
    </Router>,
  );
}

describe("step 9c leg sheet", () => {
  it("C1 three options max, the default first, a pick on the others only", () => {
    const html = body();
    const order = Array.from(html.matchAll(/data-testid="leg-sheet-option-ab-([a-z]+)"/g)).map((m) => m[1]);
    assert.deepEqual(order, ["transit", "drive", "walk"]);
    assert.match(html, /leg-sheet-option-current-ab/);
    assert.ok(!html.includes("leg-sheet-pick-ab-transit"), "the current mode has no pick");
    assert.match(html, /leg-sheet-pick-ab-drive/);
    assert.ok(text(html).includes("24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct"));
  });

  it("C2 the owner's two booking actions are the existing rails", () => {
    const html = body();
    assert.match(html, new RegExp(`data-testid="leg-sheet-find-driver-ab"`));
    assert.ok(html.includes(`href="${servicesBrowseHref("private_transportation", "t1").replace(/&/g, "&amp;")}"`));
    assert.match(html, /leg-sheet-book-for-me-ab/);
    assert.deepEqual(legHandoffItemIds("a", "b"), ["a", "b"]);
    assert.deepEqual(legHandoffItemIds("anchor:f1", "stay"), ["stay"], "an airport end is not an item");
  });

  it("C3 a delegate picks but never books; a reader sees options and neither", () => {
    const delegate = body({ isOwner: false, canEditItems: true });
    assert.match(delegate, /leg-sheet-pick-ab-drive/);
    assert.ok(!delegate.includes("leg-sheet-find-driver") && !delegate.includes("leg-sheet-book-for-me"));
    const reader = body({ isOwner: false, canEditItems: false });
    assert.ok(!reader.includes("leg-sheet-pick-"));
    assert.ok(!reader.includes("leg-sheet-book-for-me"));
    assert.equal(Array.from(reader.matchAll(/leg-sheet-option-ab-/g)).length, 3);
  });

  it("C4 a confirmed host pickup renders the host line and no Book", () => {
    const html = body({ hostPickupConfirmed: true });
    assert.ok(text(html).includes(LEG_HOST_PICKUP_LINE));
    assert.ok(!html.includes("leg-sheet-find-driver") && !html.includes("leg-sheet-book-for-me"));
    assert.ok(!body().includes("leg-sheet-host-pickup"), "no confirmed pickup ⇒ no host line (D8: none exists today)");
  });

  it("C5 a routed leg opens its sheet only for someone who may change the items", () => {
    const days = [{ dayNumber: 1, activities: [{ id: "a" }, { id: "b" }], transports: [{ id: "ab", fromActivityId: "a", toActivityId: "b", recommendedMode: "transit", estimatedDurationMinutes: 24, routed: { line: "Keihan Main Line", fare: null, provenance: prov() }, routedOptions: OPTIONS, routedOptionsChecked: true }] }];
    function Probe({ role }: { role: string }) {
      const render = useSlipLegs({ days, tripRole: role, trip: { timezone: "Asia/Tokyo" } }, "t1");
      return <div>{render({ id: "a" }, { id: "b" }, 0)}</div>;
    }
    assert.match(renderToString(<Probe role="owner" />), /<button[^>]*data-testid="slip-leg-routed-ab"/);
    assert.match(renderToString(<Probe role="delegate" />), /<button[^>]*data-testid="slip-leg-routed-ab"/);
    assert.match(renderToString(<Probe role="expert" />), /<p[^>]*data-testid="slip-leg-routed-ab"/);
    const v = slipLegBetween(days as any, "a", "b");
    assert.equal(v?.kind, "routed");
    assert.equal((v as any).options.length, 3);
    assert.equal((v as any).optionsChecked, true);
  });

  it("C6 + C7 a leg with no routed facts draws minutes-only; no row carries a price", () => {
    const days = [{ dayNumber: 1, transports: [{ id: "bc", fromActivityId: "b", toActivityId: "c", recommendedMode: "walking", estimatedDurationMinutes: 15, estimatedCostUsd: 12, cost: 12, proposalStatus: "confirmed" }] }];
    const v = slipLegBetween(days, "b", "c");
    assert.deepEqual(v, { kind: "unrouted", legId: "bc", mode: "walk", minutes: 15 });
    const html = renderToString(<LegRow kind="unrouted" legId="bc" mode="walk" minutes={15} />);
    assert.equal(text(html), "15 min · walk");
    assert.ok(!html.includes("$") && !html.includes("checked"));
    const routed = renderToString(<LegRow kind="routed" legId="x" mode="drive" route={OPTIONS[1].route} timeZone="Asia/Tokyo" />);
    assert.ok(!routed.includes("$"), "a routed row shows only the source's own fare, never a dollar estimate");
    assert.equal(slipLegBetween(days, "b", "x"), null);
  });
});
