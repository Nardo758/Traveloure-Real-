/**
 * A partner row on the events calendar has no city-events page
 * (ledger `2026-10-21-event-card-partner-area`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PARTNER_COMMISSION_NOTE } from "../../lib/browse-supply";

test("PR1: Event details is omitted for a partner row, and the commission sentence is not on the calendar", () => {
  const src = readFileSync(path.join(process.cwd(), "client/src/components/events/WhatsOn.tsx"), "utf8");
  assert.equal(src.includes(PARTNER_COMMISSION_NOTE), false);
  assert.match(src, /events-row-partner-/);
  const uses = src.match(/<DetailsLink event=\{event\} \/>/g) ?? [];
  const gated = src.match(/event\.partner \? null : <DetailsLink event=\{event\} \/>/g) ?? [];
  // SH-1 Launch item 13 (architect, Oct 22, 2026): WhatsOn's two row variants collapsed into the shared EventRow.
  assert.equal(uses.length, 1);
  assert.equal(gated.length, 1);
});
