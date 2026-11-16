/**
 * E9 (option A, narrow) - the party ask actually REACHES the panel.
 *
 * Why this file exists: #2020 shipped with `occasion` permanently null and its suite was green because
 * every assertion grepped the panel's own source (`partyFields(occasion)` is present) and never asked who
 * passes a row. So: no source greps here. Each case RENDERS the panel and reads the field it drew.
 *
 * `React` is bound globally for the render because `SlipAnchorPanels.tsx` relies on the bundler's JSX
 * runtime; under `tsx` + `renderToString` nothing injects it into that module. That is a harness detail and
 * was the cause of two red tests in the first draft of this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineWhoPanel } from "../../plan/SlipAnchorPanels";

(globalThis as any).React = React;

const ATTENDEES = { id: "et1", slug: "corporate-retreat", vocabulary: "attendees" } as any;
const WEDDING = { id: "et2", slug: "wedding", vocabulary: "guests" } as any;

function renderPanel(occasion: any, current: any = { adults: 12, kids: null }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(InlineWhoPanel, { tripId: "t1", current, occasion, onSaved: () => {}, onCancel: () => {} }),
    ),
  );
}

/** The count fields the panel actually drew, in order. The panel names them by `id`, not testid. */
const fields = (html: string) => [...html.matchAll(/id="slip-who-(adults|kids)"/g)].map((m) => m[1]);

test("an attendees occasion draws ONE Attendees field and no Kids field", () => {
  const html = renderPanel(ATTENDEES);
  assert.match(html, /Attendees/, "the label is the occasion\'s own word");
  assert.deepEqual(fields(html), ["adults"], "one count field, and no kids field");
  assert.doesNotMatch(html, /id="slip-who-kids"/, "no kids field for an attendees plan");
  assert.doesNotMatch(html, /<label[^>]*>\s*Kids\s*</i, "and no Kids label");
});

test("the same row arriving as a GUEST plan\'s partyOccasion draws the same panel", () => {
  // The guest path hands the row down as `guest.partyOccasion`; the panel cannot tell the difference,
  // which is exactly the property that makes option A narrow.
  const guestRow = ATTENDEES;
  const html = renderPanel(guestRow, { adults: 40, kids: null });
  assert.match(html, /Attendees/);
  assert.deepEqual(fields(html), ["adults"]);
});

test("no row (loading, unreadable, or unresolved) keeps Adults + Kids and the panel still draws", () => {
  const html = renderPanel(null);
  assert.match(html, /Adults/);
  assert.match(html, /Kids/);
  assert.deepEqual(fields(html), ["adults", "kids"], "today\'s two fields, never a blocked panel");
});

test("a guests occasion keeps both fields (the rule is the vocabulary, not a hard-coded one)", () => {
  const html = renderPanel(WEDDING);
  assert.match(html, /Guests|Adults/);
  assert.deepEqual(fields(html), ["adults", "kids"]);
});
