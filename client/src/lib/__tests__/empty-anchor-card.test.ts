/**
 * Item 1 (ledger `2026-10-10-empty-anchor-card`): the empty board's "Where are you staying?" card follows
 * the server's surface decision ALONE — the same `anchorSurfaces` the tray's chooser reads — and is no
 * longer also gated on a resolved Trips occasion.
 *
 *   EA1 pure: an undismissed `no_draft` ⇒ the slip's empty card; dismissed ⇒ none; eligible ⇒ drafted;
 *       a stay already on the plan ⇒ none (the tray's change form instead)
 *   EA2 source: no slip render of the empty card is gated on `tripsAnchor`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchorSurfaces } from "@shared/where-to-stay";

const view = (p: Record<string, unknown>) => ({ eligible: false, city: "Kyoto", neighborhoods: [], ...p }) as any;

test("EA1 the empty card is the server's undismissed no_draft, nothing else", () => {
  assert.equal(anchorSurfaces(view({ reason: "no_draft" }), false).slip, "empty");
  assert.equal(anchorSurfaces(view({ reason: "no_draft" }), false).trayChooser, true);
  assert.equal(anchorSurfaces(view({ reason: "no_draft", dismissed: true }), false).slip, null);
  assert.equal(anchorSurfaces(view({ eligible: true }), false).slip, "drafted");
  assert.equal(anchorSurfaces(view({ reason: "no_draft" }), true).slip, null);
  assert.equal(anchorSurfaces(view({ reason: "single_day" }), false).slip, null);
});

test("EA2 SlipView never gates the empty card on a resolved Trips occasion", () => {
  const src = readFileSync(new URL("../../components/plancard/SlipView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /tripsAnchor\s*&&\s*anchorPanelEmpty/);
  assert.doesNotMatch(src, /!!tripsAnchor\s*&&\s*anchorPanelEmpty/);
  assert.match(src, /\{anchorPanelEmpty \? renderAnchorPanel\("empty"\) : null\}/);
});
