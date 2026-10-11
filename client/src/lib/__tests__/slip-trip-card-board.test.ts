/**
 * THE TRIP CARD BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-trip-card-board`): the
 * card's days take the slip's board look through the ONE row-look context; nothing else changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const days = readFileSync(new URL("../../components/plancard/TripCardDays.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../../components/plan/ItemRow.tsx", import.meta.url), "utf8");

test("T1: the card's days render under the board look and the slip's tokens", () => {
  assert.match(days, /<PlanRowLookProvider look="board">\s*<div className="slip-surface /);
  assert.match(days, /<\/div>\s*<\/PlanRowLookProvider>\s*\);\s*\}\s*$/);
  // The tokens stylesheet is imported by the PAGE, never by this component (the node test loader
  // cannot load a .css import from a component a test renders).
  assert.doesNotMatch(days, /slip-tokens\.css/);
  assert.match(readFileSync(new URL("../../pages/trip-details.tsx", import.meta.url), "utf8"), /import "@\/styles\/slip-tokens\.css";/);
});

test("T2: the strip keeps its testids, Today first and a ✓ only on a machine-dated past day", () => {
  assert.ok(days.includes("card-day-chip-${d.dayNum}"));
  assert.match(days, /const past = !!\(todayIso && d\.dateIso && d\.dateIso < todayIso\);/);
  assert.match(days, /\{isToday \? "Today" : dayBlockHeading\(/);
});

test("T3: provenance keeps its testid with the line as its first text (the P5 pin)", () => {
  assert.match(days, /data-testid="card-provenance">\s*\{provenance\}/);
});

test("T4: the board facts line is read whole once; the coloured halves are presentation", () => {
  const fn = row.slice(row.indexOf("function BoardFactsText"));
  assert.match(fn, /<span className="sr-only">\{text\}<\/span>/);
  assert.equal((fn.slice(0, 600).match(/aria-hidden="true"/g) ?? []).length, 2);
});
