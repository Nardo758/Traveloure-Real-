/**
 * Cut-list #1 slice B — THE ONE RANGE CALENDAR, rendered (react-dom/server, no jsdom).
 *
 *   C1 the title is "When are you going?"; nothing picked reads "Add dates"
 *   C2 "Skip for now" renders only when the caller passes onSkip
 *   C3 leave before arrive shows the approved refusal and Save is disabled; a same-day range saves. QA round 3
 *      option A: the refused pair is the one the taps produce (`nextRange` — the calendar's own `onDayClick`), from an
 *      arrive day alone and from a prefilled range, and a tap while refused clears it
 *   C4 the slip's dates panel draws the calendar, not two date fields
 *   C5 no prefill when the dates were never chosen; confirmed dates prefill
 *   C6 375px budget: one month, seven 36px cells + 12px padding each side ≤ 343px; the header
 *      popover is bounded by the viewport
 *   C7 the header chip never nests a control inside its link; its dates segment is a popover trigger
 *   C8 PlanEntry and every dates gate use the calendar; no `type="date"` field remains on those surfaces
 *
 * Run: npx tsx --test client/src/components/__tests__/plan-dates-calendar.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import {
  PLAN_DATES_CALENDAR_TITLE,
  PLAN_DATES_EMPTY_LABEL,
  PLAN_DATES_SKIP_LABEL,
  PlanDatesCalendar,
} from "../plan/PlanDatesCalendar";
import { InlineDatesPanel } from "../plan/SlipAnchorPanels";
import { nextRange } from "@/lib/plan-dates-range";

(globalThis as any).React = React;

const html = (node: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <Router ssrPath="/">
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </Router>,
  );
};
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const noop = () => {};

describe("C1 title and empty label", () => {
  it("renders the approved strings", () => {
    assert.equal(PLAN_DATES_CALENDAR_TITLE, "When are you going?");
    assert.equal(PLAN_DATES_EMPTY_LABEL, "Add dates");
    assert.equal(PLAN_DATES_SKIP_LABEL, "Skip for now");
    const out = text(html(<PlanDatesCalendar value={{ start: null, end: null }} onChange={noop} />));
    assert.match(out, /When are you going\?/);
    assert.match(out, /data-testid="plan-dates-calendar-summary"[^>]*>Add dates</);
  });
  it("a picked range replaces the empty label", () => {
    const out = text(html(<PlanDatesCalendar value={{ start: "2026-11-12", end: "2026-11-15" }} onChange={noop} />));
    assert.match(out, /plan-dates-calendar-summary"[^>]*>Nov 12–15</);
    assert.doesNotMatch(out, />Add dates</);
  });
});

describe("C2 Skip for now only with onSkip", () => {
  it("absent without onSkip, present with it", () => {
    assert.doesNotMatch(text(html(<PlanDatesCalendar value={{ start: null, end: null }} onChange={noop} onSave={noop} />)), /Skip for now/);
    const out = text(html(<PlanDatesCalendar value={{ start: null, end: null }} onChange={noop} onSkip={noop} />));
    assert.match(out, /data-testid="plan-dates-calendar-skip"[^>]*>Skip for now</);
  });
});

describe("C3 leave before arrive, and same-day", () => {
  it("an inverted range shows the refusal and disables Save", () => {
    const out = text(html(<PlanDatesCalendar value={{ start: "2026-11-15", end: "2026-11-12" }} onChange={noop} onSave={noop} />));
    assert.match(out, /role="alert"[^>]*>Leave date can't be before your arrive date\.</);
    assert.match(out, /<button[^>]*disabled=""[^>]*data-testid="button-slip-dates-save"/);
  });
  it("option A: the taps themselves produce the refused pair, and a tap while refused clears it", () => {
    const refusal = /role="alert"[^>]*>Leave date can't be before your arrive date\.</;
    const saveOff = /<button[^>]*disabled=""[^>]*data-testid="button-slip-dates-save"/;
    const render = (value: { start: string | null; end: string | null }) =>
      text(html(<PlanDatesCalendar value={value} onChange={noop} onSave={noop} />));
    // The calendar's onDayClick is `onChange(nextRange(value, day))`; drive the same function.
    const fromArrive = nextRange({ start: "2026-11-15", end: null }, "2026-11-12");
    assert.match(render(fromArrive), refusal, "arrive only, earlier tap");
    assert.match(render(fromArrive), saveOff);
    const fromPrefilled = nextRange({ start: "2026-12-01", end: "2026-12-04" }, "2026-11-28");
    assert.match(render(fromPrefilled), refusal, "a prefilled range follows the same rule");
    const cleared = nextRange(fromPrefilled, "2026-12-03");
    assert.doesNotMatch(render(cleared), refusal, "an after-arrive tap while refused clears it");
    assert.doesNotMatch(render(cleared), saveOff);
    const restarted = nextRange(fromPrefilled, "2026-11-28");
    assert.deepEqual(restarted, { start: "2026-11-28", end: null });
    assert.doesNotMatch(render(restarted), refusal);
  });
  it("a same-day range has no refusal and Save is enabled", () => {
    const out = text(html(<PlanDatesCalendar value={{ start: "2026-11-12", end: "2026-11-12" }} onChange={noop} onSave={noop} />));
    assert.doesNotMatch(out, /Leave date can't be before/);
    assert.doesNotMatch(out, /<button[^>]*disabled=""[^>]*data-testid="button-slip-dates-save"/);
    assert.match(out, /plan-dates-calendar-summary"[^>]*>Nov 12</);
  });
});

describe("C4/C5 the slip's dates panel", () => {
  it("draws the calendar and no date fields", () => {
    const out = html(<InlineDatesPanel tripId="t1" startDate="2026-11-12" endDate="2026-11-15" datesConfirmed />);
    assert.match(out, /data-testid="slip-dates-panel-calendar"/);
    assert.doesNotMatch(out, /type="date"/);
    assert.match(text(out), />Save dates</);
  });
  it("unconfirmed dates are not prefilled; confirmed ones are", () => {
    const unconfirmed = text(html(<InlineDatesPanel tripId="t1" startDate="2026-11-11" endDate="2026-11-11" datesConfirmed={false} />));
    assert.match(unconfirmed, /slip-dates-panel-calendar-summary"[^>]*>Add dates</);
    const confirmed = text(html(<InlineDatesPanel tripId="t1" startDate="2026-11-12" endDate="2026-11-15" datesConfirmed />));
    assert.match(confirmed, /slip-dates-panel-calendar-summary"[^>]*>Nov 12–15</);
  });
  it("Skip for now reaches the panel only through onSkip", () => {
    assert.doesNotMatch(text(html(<InlineDatesPanel tripId="t1" datesConfirmed={false} />)), /Skip for now/);
    assert.match(text(html(<InlineDatesPanel tripId="t1" datesConfirmed={false} onSkip={noop} />)), /Skip for now/);
  });
});

describe("C6 375px layout budget", () => {
  it("one month of seven 36px cells plus padding fits a 343px phone column", () => {
    const cal = readFileSync("client/src/components/ui/calendar.tsx", "utf8");
    assert.match(cal, /cell: "h-9 w-9/, "day cells are 36px (h-9 w-9)");
    assert.match(cal, /className=\{cn\("p-3"/, "12px padding each side");
    const comp = readFileSync("client/src/components/plan/PlanDatesCalendar.tsx", "utf8");
    assert.match(comp, /numberOfMonths=\{1\}/, "one month at every width");
    const width = 7 * 36 + 2 * 12 + 2; // cells + padding + border
    assert.ok(width <= 375 - 2 * 16, `calendar ${width}px must fit inside 343px`);
  });
  it("the header popover is bounded by the viewport", () => {
    const pop = readFileSync("client/src/components/HeaderDatesPopover.tsx", "utf8");
    assert.match(pop, /max-w-\[calc\(100vw-2rem\)\]/);
  });
});

describe("C7 the strip's dates segment (header fix v2: the chip lives in the Trip Strip)", () => {
  it("the strip's Add dates is a HeaderDatesPopover trigger beside the label link", () => {
    const strip = readFileSync("client/src/components/trip/trip-strip.tsx", "utf8");
    assert.match(strip, /<HeaderDatesPopover target=\{datesTarget\} variant="desktop">/);
    assert.match(strip, /data-testid="trip-strip-plan-dates"/);
    assert.match(strip, /headerDatesLine\(planState\)/, "the one dates line formatter");
    assert.doesNotMatch(strip, /<Calendar\b.*mode=|<PlanDatesCalendar/, "no second picker in the strip");
    // Render-level proofs live in trip-strip-plan-surface.test.tsx (V3).
  });
});

describe("C8 one calendar on every dates surface", () => {
  it("PlanEntry and the slip panel draw no date fields", () => {
    for (const f of ["client/src/components/plan/PlanEntry.tsx", "client/src/components/plan/SlipAnchorPanels.tsx"]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /type="date"/, f);
      assert.match(src, /<PlanDatesCalendar/, f);
    }
    assert.doesNotMatch(readFileSync("client/src/components/plan/SlipAnchorPanels.tsx", "utf8"), /The end date can't be before the start date/);
  });
  it("the header opens the existing panel, not a second picker", () => {
    const pop = readFileSync("client/src/components/HeaderDatesPopover.tsx", "utf8");
    assert.match(pop, /<InlineDatesPanel/);
    assert.doesNotMatch(pop, /<Calendar\b|<PlanDatesCalendar/);
  });
});
