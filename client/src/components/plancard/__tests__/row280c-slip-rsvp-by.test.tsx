/**
 * Row 280c (ledger `2026-10-30-row280c-slip-rsvp-by`): the slip's item row draws "RSVP by {date}" from the
 * activity's `rsvpBy`, with the approved guest-side copy and the same calendar-day reading as the landing.
 *
 *   C1  both row looks draw the line for an item carrying rsvpBy, from GUEST_LANDING_COPY.rsvpBy
 *   C2  an item without rsvpBy draws nothing
 *   C3  the row adds no literal: the words come only from the shared copy
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ItemRow } from "../../plan/ItemRow";
import { PlanRowLookProvider } from "../../plan/row-look";
import { GUEST_LANDING_COPY } from "@/lib/guest-landing-copy";
import { landingDay, slipRsvpByLine } from "@/lib/guest-landing";

(globalThis as any).React = React;

function render(item: Record<string, unknown>, look: "plain" | "board") {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <PlanRowLookProvider look={look}>
        <ItemRow item={{ id: "i1", name: "Ceremony", time: "18:30", ...item } as any} mode="read" role="traveler" />
      </PlanRowLookProvider>
    </QueryClientProvider>,
  );
}

describe("row 280c rsvp-by on the slip", () => {
  it("C1 both looks draw the approved line", () => {
    const expected = GUEST_LANDING_COPY.rsvpBy(landingDay("2026-11-01")!);
    assert.equal(slipRsvpByLine("2026-11-01"), expected);
    for (const look of ["plain", "board"] as const) {
      const html = render({ rsvpBy: "2026-11-01" }, look);
      assert.ok(html.includes('data-testid="slip-item-rsvp-by-i1"'), look);
      assert.ok(html.includes(expected), look);
    }
  });

  it("C2 no rsvpBy draws nothing", () => {
    assert.equal(slipRsvpByLine(undefined), undefined);
    assert.equal(slipRsvpByLine(""), undefined);
    for (const look of ["plain", "board"] as const) {
      assert.equal(render({}, look).includes("slip-item-rsvp-by"), false, look);
    }
  });

  it("C3 the row carries no RSVP literal", () => {
    const src = readFileSync("client/src/components/plan/ItemRow.tsx", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.equal(/RSVP by/.test(src), false);
  });
});
