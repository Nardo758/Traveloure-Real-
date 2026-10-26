/**
 * Row 223: the slip's expert doors draw only while the plan's city has an expert to hand to — the
 * Finalize chooser's rule (`chooserHasExperts` behind `expert_hook_cities`), read through
 * `useExpertAvailability`. Nothing replaces a hidden door.
 *
 *   ED1  empty slip: no "Hand it to a local" door on a "no" (or no answer); shown on a "yes".
 *   ED2  drafted slip: the optimizer card's "Local expert" draws only with a handler; SlipRail passes one
 *        only on "hire" AND a "yes"; Optimize then has the row to itself.
 *   ED3  the Finalize chooser is untouched by this row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SlipEmptyStart } from "../plan/SlipEmptyStart";
import { OptimizerLead } from "../plan/OptimizerLead";
import { expertAvailabilityUrl } from "@/lib/expert-availability";

(globalThis as any).React = React;

const TRIP_ID = "trip-223";
const TRIP = { id: TRIP_ID, destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03", datesConfirmed: true } as any;

function renderEmpty(answer: { available: boolean } | undefined): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } });
  const url = expertAvailabilityUrl({ city: TRIP.destination })!;
  if (answer) client.setQueryData([url], answer);
  client.setQueryData([`/api/trips/${TRIP_ID}/expert-help`], { levels: [{ expertCount: 1 }] });
  return renderToString(
    <QueryClientProvider client={client}>
      <SlipEmptyStart tripId={TRIP_ID} trip={TRIP} onBrowse={() => {}} />
    </QueryClientProvider>,
  );
}

test("ED1 · the empty slip's handoff door is hidden with no expert and shown with one", () => {
  for (const answer of [undefined, { available: false }]) {
    const html = renderEmpty(answer);
    assert.ok(html.includes('data-testid="slip-empty-browse"'), "the Browse door stays");
    assert.ok(!html.includes('data-testid="slip-empty-handoff"'), `no handoff door for ${JSON.stringify(answer)}`);
    assert.ok(!html.includes("Hand it to a"), "nothing fills the gap with its words");
  }
  const yes = renderEmpty({ available: true });
  assert.ok(yes.includes('data-testid="slip-empty-handoff"'));
  assert.ok(yes.includes("Hand it to a Kyoto local"));
});

test("ED2 · the drafted slip's Local expert draws only when SlipRail passes a handler", () => {
  const props = { tone: "board", findings: [], hasPricedItems: false, fee: null, onClick: () => {}, localExpertTestId: "slip-action-hire-expert", drafted: true } as any;
  const client = new QueryClient();
  const render = (onLocalExpert: (() => void) | null) =>
    renderToString(<QueryClientProvider client={client}><OptimizerLead {...props} onLocalExpert={onLocalExpert} /></QueryClientProvider>);
  assert.ok(!render(null).includes('data-testid="slip-action-hire-expert"'), "no door without a handler");
  assert.ok(render(() => {}).includes('data-testid="slip-action-hire-expert"'), "the door with one");

  const rail = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");
  assert.match(rail, /const expertsAvailable = useExpertAvailability\(\{ city: trip\.destination \}\);/);
  assert.match(rail, /onLocalExpert=\{expertState\.kind === "hire" && expertsAvailable \? openLocalExpert : null\}/);
  // The one other door on the slip is gated by the same reading.
  const empty = fs.readFileSync("client/src/components/plan/SlipEmptyStart.tsx", "utf8");
  assert.match(empty, /const expertsAvailable = useExpertAvailability\(\{ city: trip\.destination \}\);/);
  assert.match(empty, /\{expertsAvailable \? \(\s*<button[\s\S]{0,400}data-testid="slip-empty-handoff"/);
});

test("ED3 · the Finalize chooser is not part of this row", () => {
  const rail = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");
  // The gate is applied to the two doors only; no other expertsAvailable reader is added.
  assert.equal((rail.match(/expertsAvailable/g) ?? []).length, 2);
});
