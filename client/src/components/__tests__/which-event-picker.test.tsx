/**
 * "WHICH EVENT?" — what the picker actually PUTS ON SCREEN.
 * Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * The pure module (`client/src/lib/__tests__/which-event.test.ts`) pins the decisions. This pins
 * the render, because the failures this lane exists to prevent are things a component can add on
 * its own after the module has done everything right: a clock time hardcoded into the row, or a
 * "suggested" badge put on a row the module never marked. Neither breaks anything visible on
 * happy-path data.
 *
 * The hint itself is now REAL (ledger `2026-09-04-which-event-hint`; migration 280) — the picker
 * marks an event whose occasion's `roles_needed` names the listing's `category_key`. So R3 no
 * longer asserts its absence; it asserts the component draws EXACTLY what `hintForEvent` returns,
 * on exactly the rows it returns it for, and that a marked row is still not a chosen one.
 *
 * What these hold:
 *   R1  NOTHING is pre-selected — every row renders `aria-checked="false"` and the confirm is
 *       disabled, so the dialog cannot commit an answer the traveler never gave.
 *   R2  NO CLOCK TIME anywhere in the rendered markup, for any event shape.
 *   R3  The role hint renders ONLY where the module put one: no listing category ⇒ no hint
 *       anywhere; a match ⇒ that ONE row marked and every other row silent; and the marked row is
 *       still unchecked with the confirm still disabled.
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

// `rolesNeeded` is the occasion's own list as the SERVER sends it on the row — never derived here.
// Two of these rows deliberately have none, which is the ordinary shape: NULL (never set) and the
// key simply absent from the payload.
const EVENTS: PlanEvent[] = [
  { id: "ev-rehearsal", title: "Rehearsal dinner", eventDate: "2026-10-01", location: null },
  {
    id: "ev-ceremony",
    title: "Ceremony",
    eventDate: "2026-10-02",
    location: "Nanzen-ji",
    rolesNeeded: ["event_coordinator", "florist", "photography"],
  },
  { id: "ev-reception", title: "Reception", eventDate: "2026-10-02", location: null, rolesNeeded: null },
  { id: "ev-bare", title: null, eventDate: null, location: null },
];

/** Anything that looks like a wall-clock reading. */
const CLOCK_RE = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*(?:am|pm)\b/i;

/**
 * @param serviceCategoryKey the listing's `category_key`. DEFAULT `undefined` — the shape of every
 *        add before this lane, and of any listing whose category predates the key column. Passing
 *        it is what turns the hint on, so every assertion below states which case it is testing.
 */
function render(events: PlanEvent[] = EVENTS, serviceCategoryKey?: string | null): string {
  return renderToString(
    <WhichEventPicker
      subject={{ title: "Hanamizuki Florals", meta: "Kyoto · from $420" }}
      events={events}
      serviceCategoryKey={serviceCategoryKey}
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

describe("R3 — the hint marks exactly what the module marked, and nothing else", () => {
  it("R3a: a listing with NO category_key marks nothing at all", () => {
    // The pre-lane shape, and the shape of any listing whose category predates the key column.
    // Nothing to compare ⇒ nothing said, on every row (§13).
    const html = render();
    assert.equal(html.includes("which-event-hint-"), false, "a row was marked with no listing category");
    assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /suggest|recommend|best for/i);
  });

  it("R3b: a matching listing marks THAT row, in the artboard's words, and no other", () => {
    const html = render(EVENTS, "florist");
    // Exactly one mark, on the occasion whose own roles_needed names the key.
    assert.match(html, /data-testid="which-event-hint-ev-ceremony"/);
    assert.equal(html.split("which-event-hint-").length - 1, 1, "more than one row was marked");
    assert.match(html.replace(/<[^>]*>/g, " "), /suggested for florists/);
    // The rows the module did not mark say nothing — no "not suggested" counterpart exists.
    for (const id of ["ev-rehearsal", "ev-reception", "ev-bare", "__implicit_event__"]) {
      assert.equal(html.includes(`which-event-hint-${id}`), false, `${id} was marked`);
    }
  });

  it("R3c: a listing in a discipline nobody asked for marks nothing", () => {
    const html = render(EVENTS, "accommodation");
    assert.equal(html.includes("which-event-hint-"), false);
  });

  it("R3d: a MARKED row is still not a CHOSEN row", () => {
    // The whole risk of adding a mark: it becomes a default. Nothing is checked, the confirm is
    // still disabled, and the CTA still names no event.
    const html = render(EVENTS, "florist");
    assert.equal(html.includes('aria-checked="true"'), false, "the marked row was pre-selected");
    assert.match(html, /disabled=""\s+data-testid="which-event-confirm"/);
    assert.match(html, /data-testid="which-event-confirm">Add to Plan</);
  });

  it("R3e: the mark never becomes a bare row's name", () => {
    // An event with no title, no date and no place whose occasion DOES want the discipline: the
    // hint renders, but the row is still described as a control, never named by its hint.
    const bareButWanted: PlanEvent[] = [
      EVENTS[0],
      { id: "ev-bare", title: null, eventDate: null, location: null, rolesNeeded: ["florist"] },
    ];
    const html = render(bareButWanted, "florist");
    assert.match(html, /data-testid="which-event-hint-ev-bare"/);
    assert.match(html, /aria-label="An event on this plan"/);
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
