/**
 * FeedbackTap render (ledger `2026-10-04-feedback-phase-a`).
 *
 *   T1 one line: "Does this draft fit?", a chip per post_draft code with the smoke selectors
 *      `feedback-tap-<moment>` and `feedback-chip-<code>`, a dismiss control; no stars, no modal
 *   T2 chip copy that refers to time uses the group's unit (days / hours / run of show)
 *   T3 answered ⇒ a thank-you line with Undo, no chips
 *   T4 the slip mounts it under the optimizer card for post_draft
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/feedback-tap.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { FeedbackTapView } from "../../plan/FeedbackTap";
import { FEEDBACK_CODES, feedbackChipLabel } from "@shared/feedback";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const view = (p: Partial<React.ComponentProps<typeof FeedbackTapView>> = {}) =>
  renderToString(
    React.createElement(FeedbackTapView, {
      moment: "post_draft",
      codes: FEEDBACK_CODES.post_draft,
      timeUnit: "days",
      onAnswer: () => {},
      onDismiss: () => {},
      ...p,
    }),
  );

test("T1 one line, the codes as chips, a dismiss — no stars, no modal", () => {
  const html = view();
  assert.match(html, /data-testid="feedback-tap-post_draft"/);
  assert.match(text(html), /Does this draft fit\?/);
  for (const code of ["fits", "too_packed", "too_light", "wrong_areas", "wrong_stops", "other"]) {
    assert.match(html, new RegExp(`data-testid="feedback-chip-${code}"`), code);
  }
  assert.match(html, /data-testid="feedback-dismiss"/);
  assert.doesNotMatch(html, /role="dialog"|★|rate us/i);
  assert.doesNotMatch(html, /feedback-text/, "the text field opens only with Something else");
});

test("T2 the group's own time unit", () => {
  assert.match(text(view({ timeUnit: "days" })), /Days too packed/);
  assert.match(text(view({ timeUnit: "hours" })), /Hours too packed/);
  assert.equal(feedbackChipLabel("too_light", "one day, hours"), "Hours too light");
  assert.equal(feedbackChipLabel("too_packed", "run of show"), "Run of show too packed");
  assert.equal(feedbackChipLabel("too_packed", null), "Days too packed");
});

test("T3 answered ⇒ thanks and Undo", () => {
  const html = view({ answered: "fits", onUndo: () => {} });
  assert.match(text(html), /Thanks/);
  assert.match(html, /data-testid="feedback-undo"/);
  assert.doesNotMatch(html, /feedback-chip-/);
});

test("T4 the slip mounts it under the optimizer card", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rail = readFileSync(path.resolve(here, "../SlipRail.tsx"), "utf8");
  const lead = rail.indexOf("<OptimizerLead");
  const tap = rail.indexOf('<FeedbackTap tripId={tripId} moment="post_draft" codes={FEEDBACK_CODES.post_draft} />');
  assert.ok(lead > 0 && tap > lead, "the tap follows the optimizer card");
});
