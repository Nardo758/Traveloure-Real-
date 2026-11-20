/**
 * F2 (Leon, Nov 19, 2026): an event's own add sits beside "Plan around it" on the /events calendar rows and the
 * landing strip, as it already does on the /experiences cards. One component, one wording, one add path.
 *
 *   E1 an event that names a `city_events` row draws the add, in the approved words
 *   E2 an event with no source id, or a partner-catalog event, draws nothing (it names no row of ours)
 *   E3 the three surfaces mount the ONE component, each with its own test-id prefix; "Plan around it" stays
 *   E4 the component writes no label of its own and adds through the one runner
 *
 * Run: npx tsx --test client/src/lib/__tests__/f2-event-add.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { ADD_COPY } from "../add-to-plan";
import { EventAddButton } from "../../components/events/EventAddButton";
import { SignInModalProvider } from "../../contexts/SignInModalContext";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function render(node: React.ReactNode, mode: "waitlist" | "open"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode });
  qc.setQueryData(["/api/auth/user"], null);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/events">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}
const EVENT: any = { id: "ev1", sourceId: "gion-matsuri-2027", city: "Kyoto", startsAt: "2027-07-17T00:00:00.000Z", endsAt: null, title: "Gion Matsuri" };

describe("F2 - an event's add beside Plan around it", () => {
  it("E1 an event that names its row draws the add", () => {
    for (const mode of ["waitlist", "open"] as const) {
      const html = render(<EventAddButton event={EVENT} testIdPrefix="events-add" />, mode);
      assert.match(html, /data-testid="events-add-ev1"/, mode);
      assert.ok(html.includes(ADD_COPY.addToPlan), `${mode}: the approved add wording`);
    }
    assert.match(render(<EventAddButton event={EVENT} />, "open"), /data-testid="plan-entry-event-add-ev1"/, "the /experiences cards keep their test id");
  });

  it("E2 an event that names no row of ours draws nothing", () => {
    assert.equal(render(<EventAddButton event={{ ...EVENT, sourceId: undefined }} />, "open"), "");
    assert.equal(render(<EventAddButton event={{ ...EVENT, partner: true }} />, "open"), "", "a partner-catalog event has no city_events row");
  });

  it("E3 the three surfaces mount the one component", () => {
    const whatsOn = read("client/src/components/events/WhatsOn.tsx");
    assert.match(whatsOn, /<PlanButton event=\{event\}[^>]*\/>[\s\S]{0,260}<EventAddButton event=\{event\} testIdPrefix="events-add"/, "the calendar row: Plan around it, then the add");
    const strip = read("client/src/components/landing/events-strip.tsx");
    assert.match(strip, /Plan around it\s*<\/Link>[\s\S]{0,200}<EventAddButton\s+event=\{event\}\s+testIdPrefix="city-event-add"/, "the landing strip: Plan around it, then the add");
    assert.match(read("client/src/components/plan/PlanEntry.tsx"), /<EventAddButton event=\{e\} \/>/, "the /experiences cards are unchanged");
    for (const f of ["client/src/components/events/WhatsOn.tsx", "client/src/components/landing/events-strip.tsx", "client/src/components/plan/PlanEntry.tsx"]) {
      assert.doesNotMatch(code(read(f)), /function EventAddButton/, `${f}: no second copy`);
    }
  });

  it("E4 no label of its own, and the one add runner", () => {
    const src = code(read("client/src/components/events/EventAddButton.tsx"));
    assert.doesNotMatch(src, /Add to|Added|Save to/, "the words are AddToPlanButton's");
    assert.match(src, /useDirectPlanAdd\(\)/);
    assert.match(src, /onClick=\{\(\) => add\(\{ ref, city: event\.city \}\)\}/);
  });
});
