/**
 * Season bands and the "In season" badge (ledger `2026-10-23-season-band-haswindow-badge`; architect ruling Oct 22).
 *   SB1  hasWindow true: the band renders under "In season all month"
 *   SB2  hasWindow false: the band renders for the whole month with no "In season" badge
 *   SB3  hasWindow missing (an older payload): same as false
 *   SB4  a windowless band is never dropped — from What's on or from the split the month view reads
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { WhatsOn } from "../events/WhatsOn";
import { bandInSeason, splitBandsBySeason } from "@/lib/season-band";

(globalThis as any).React = React;

const band = (id: string, hasWindow?: boolean) => ({
  id,
  title: `Synthetic band ${id}`,
  place: "Japan",
  country: "Japan",
  marketKeys: ["kyoto"],
  months: ["2026-11"],
  span: "November",
  ...(hasWindow === undefined ? {} : { hasWindow }),
}) as any;

function render(bands: any[]) {
  return renderToString(
    <Router ssrPath="/events">
      <WhatsOn kind="month" title="November" rows={[]} nextId={null} bands={bands} monthName="November" cityLabel="Kyoto" showBack={false} onBack={() => {}} jump={null} onPlanAround={() => {}} />
    </Router>,
  );
}
const inSeasonBlock = (html: string) => {
  const i = html.indexOf('data-testid="events-in-season"');
  if (i < 0) return "";
  const j = html.indexOf('data-testid="events-bands-no-window"', i);
  return html.slice(i, j < 0 ? undefined : j);
};

test("SB1 — hasWindow true carries the badge", () => {
  const html = render([band("a", true)]);
  assert.ok(html.includes("In season all month"));
  assert.ok(inSeasonBlock(html).includes('data-testid="events-band-a"'));
});

test("SB2 — hasWindow false: shown, no badge", () => {
  const html = render([band("b", false)]);
  assert.ok(html.includes('data-testid="events-band-b"'), "still shown");
  assert.ok(html.includes("Synthetic band b") && html.includes("November"));
  assert.equal(html.includes("In season"), false, "no badge");
});

test("SB3 — hasWindow missing is the same as false", () => {
  const html = render([band("c")]);
  assert.ok(html.includes('data-testid="events-band-c"'));
  assert.equal(html.includes("In season"), false);
  assert.equal(bandInSeason({}), false);
  assert.equal(bandInSeason({ hasWindow: null }), false);
});

test("SB4 — a windowless band is never dropped", () => {
  const bands = [band("w", true), band("x", false), band("y")];
  const html = render(bands);
  for (const id of ["w", "x", "y"]) assert.ok(html.includes(`data-testid="events-band-${id}"`), id);
  assert.ok(inSeasonBlock(html).includes('data-testid="events-band-w"'));
  assert.equal(inSeasonBlock(html).includes('data-testid="events-band-x"'), false);
  const { inSeason, noWindow } = splitBandsBySeason(bands);
  assert.equal(inSeason.length + noWindow.length, bands.length);
  assert.deepEqual(noWindow.map((b: any) => b.id), ["x", "y"]);
});
