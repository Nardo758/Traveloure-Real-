/**
 * FB-1 step 5d (ledger `2026-10-19-fb1-busy-bus`) — the rendered day line.
 *   BL1 an open DayBlock with `busyBus` draws Marketing's line under its testid, in both looks' markup
 *   BL2 no `busyBus`, or a closed day, draws nothing
 *   BL3 the slip, the Trip Card and the Workstation all pass the server's `busyBus` through
 *
 * Run: npx tsx --test client/src/components/__tests__/fb1-busy-bus-line.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "../plan/DayBlock";
import { busyBusDayLine } from "@shared/busy-bus";

(globalThis as any).React = React;
const day = (extra: Record<string, unknown>) =>
  renderToString(<DayBlock dayKey="2" heading="Sun · Mar 21" stats={null} open {...extra}><span>stops</span></DayBlock>);

describe("the busy-bus day line", () => {
  it("BL1 drawn on an open day", () => {
    const html = day({ busyBus: { reason: "national holiday", cityName: "Kyoto" } });
    assert.ok(html.includes('data-testid="slip-day-busy-bus-2"'));
    assert.ok(html.includes(busyBusDayLine({ reason: "national holiday", cityName: "Kyoto" })));
  });
  it("BL2 absent or closed ⇒ nothing", () => {
    assert.ok(!day({}).includes("slip-day-busy-bus-2"));
    assert.ok(!day({ busyBus: null }).includes("slip-day-busy-bus-2"));
    assert.ok(!day({ busyBus: { reason: "Obon", cityName: "Kyoto" }, open: false }).includes("slip-day-busy-bus-2"));
  });
  it("BL3 every day surface passes it", () => {
    for (const f of ["../plancard/SlipView.tsx", "../plancard/TripCardDays.tsx", "../plan/WorkstationDays.tsx"]) {
      const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
      assert.match(src, /busyBus=\{(day\?|d)\.busyBus \?\? null\}/, f);
    }
  });
});
