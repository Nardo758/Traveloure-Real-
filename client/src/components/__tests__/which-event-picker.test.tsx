/**
 * "WHICH EVENT?" — what the picker actually PUTS ON SCREEN.
 * Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * The pure module (`client/src/lib/__tests__/which-event.test.ts`) pins the decisions. This pins
 * the render, because the two failures this lane exists to prevent are both things a component
 * can add on its own after the module has done everything right: a clock time hardcoded into the
 * row, and a "suggested" badge on one of them. Neither breaks anything visible on happy-path data.
 *
 * What these hold:
 *   R1  NOTHING is pre-selected — every row renders `aria-checked="false"` and the confirm is
 *       disabled, so the dialog cannot commit an answer the traveler never gave.
 *   R2  NO CLOCK TIME anywhere in the rendered markup, for any event shape.
 *   R3  NO suggestion/recommendation marking on any row (there is no category→event mapping in
 *       this codebase to base one on — `experience_types.roles_needed` is absent and HELD).
 *   R4  A bare event (no title, no date, no place) renders as a bare, still-selectable row —
 *       never "Untitled event", never a fabricated date.
 *   R5  The implicit choice is offered and reads as a choice, not a failure state.
 *
 * Harness: react-dom/server renderToString, the DB-free / no-jsdom posture of
 * trip-strip-lead.test.tsx. `WhichEventPicker` is the modal's BODY, exported precisely so this
 * render needs no portal.
 *
 * Run: npx tsx --test client/src/components/__tests__/which-event-picker.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { WhichEventPicker } from "../trip/which-event-dialog";
import { IMPLICIT_EVENT_CHOICE_LABEL, type PlanEvent } from "@/lib/which-event";

// tsconfig sets `jsx: "preserve"`, so under `tsx --test` JSX compiles to the CLASSIC
// `React.createElement` transform and every rendered component file needs React in scope.
(globalThis as any).React = React;

const EVENTS: PlanEvent[] = [
  { id: "ev-rehearsal", title: "Rehearsal dinner", eventDate: "2026-10-01", location: null },
  { id: "ev-ceremony", title: "Ceremony", eventDate: "2026-10-02", location: "Nanzen-ji" },
  { id: "ev-reception", title: "Reception", eventDate: "2026-10-02", location: null },
  { id: "ev-bare", title: null, eventDate: null, location: null },
];

/** Anything that looks like a wall-clock reading. */
const CLOCK_RE = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*(?:am|pm)\b/i;

function render(events: PlanEvent[] = EVENTS): string {
  return renderToString(
    <WhichEventPicker
      subject={{ title: "Hanamizuki Florals", meta: "Kyoto · from $420" }}
      events={events}
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
}

describe("R1 — the picker commits nothing the traveler did not choose", () => {
  it("R1a: no row is checked on open", () => {
    const html = render();
    assert.equal(html.includes('aria-checked="true"'), false, "a row was pre-selected");
    // One radio per event plus the implicit choice.
    assert.equal(html.split('aria-checked="false"').length - 1, EVENTS.length + 1);
  });

  it("R1b: the confirm is disabled until a row is chosen, and names no event", () => {
    const html = render();
    // The ATTRIBUTE, not the `disabled:` utility classes that sit in the same className.
    assert.match(html, /disabled=""\s+data-testid="which-event-confirm"/);
    // With nothing chosen the CTA falls back to the platform's universal action label — it must
    // not name an event, because naming one is what a pre-selection would look like.
    assert.match(html, /data-testid="which-event-confirm">Add to Plan</);
  });
});

describe("R2 — no clock time reaches the screen", () => {
  it("R2a: the rendered markup carries no wall-clock reading", () => {
    // Strip the style/class noise that legitimately contains digits and separators.
    const text = render([
      ...EVENTS,
      { id: "ev-ts", title: "Welcome drinks", eventDate: "2026-10-01T19:00:00.000Z", location: "Pontocho" },
    ])
      .replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, CLOCK_RE, `rendered text reads as a clock time: ${text}`);
    // The mock's literal times, spelled out, must not appear.
    for (const stamp of ["19:00", "15:00", "10:30"]) {
      assert.equal(text.includes(stamp), false, `the mock's fabricated time ${stamp} was rendered`);
    }
  });

  it("R2b: a dated event still shows its calendar day", () => {
    const text = render().replace(/<[^>]*>/g, " ");
    assert.match(text, /Fri, Oct 2 · Nanzen-ji/);
  });
});

describe("R3 — nothing is suggested, because nothing knows", () => {
  it("R3a: no row carries a suggestion, recommendation or role hint", () => {
    const text = render().replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, /suggest|recommend|best for|for florists/i);
  });
});

describe("R4/R5 — the honest rows", () => {
  it("R4a: a bare event renders selectable, with no invented name or date", () => {
    const html = render();
    assert.match(html, /data-testid="which-event-option-ev-bare"/);
    assert.equal(html.includes('data-testid="which-event-meta-ev-bare"'), false);
    assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /untitled|unnamed event|tbd/i);
  });

  it("R5a: the implicit choice is offered, and reads as a choice", () => {
    const text = render().replace(/<[^>]*>/g, " ");
    assert.match(text, new RegExp(IMPLICIT_EVENT_CHOICE_LABEL));
    assert.doesNotMatch(text, /unassigned|ungrouped/i);
  });

  it("R5b: the footnote states the skip rule the module enforces", () => {
    assert.match(render().replace(/<[^>]*>/g, " "), /A plan with one event skips this question\./);
  });
});
