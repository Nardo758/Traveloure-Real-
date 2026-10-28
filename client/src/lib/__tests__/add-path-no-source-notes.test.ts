/**
 * ROW 262: the client add path writes no provenance text into `notes`.
 * Ledger `2026-10-27-no-source-in-notes`.
 *
 * The city-feed dialog wrote `Added from <city>` and the Discover add wrote `Source: <provider>`
 * into `itinerary_items.notes`. Both writes are gone: the `notes` key is absent from both bodies,
 * so the server stores NULL. Rows already written keep their text (no backfill, no read-side fix),
 * and the `Billboard gem id: <id>` idempotency marker is untouched.
 *
 *   AN1  the Discover builder at runtime sends no `notes` key, whatever the source
 *   AN2  the builder's source names no `notes` write and no `Source:`; its body type has no `notes`
 *   AN3  the dialog's source names no `notes` and no `Added from`; its one builder is still used
 *        by both ways in
 *   AN4  no client source writes `notes: "Added from …"` or `notes: "Source: …"`
 *   AN5  the billboard gem marker still exists and is still compared
 *
 * Static and pure: files are read with node:fs; no git, no ref, no database, no network.
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/add-path-no-source-notes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDiscoverAddBody, type DiscoverAddSourceItem } from "../discover-add-body";
import { pendingPlanItemMarker } from "../../../../shared/pending-plan-items";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function item(source: string): DiscoverAddSourceItem {
  return {
    title: "Fushimi Inari night walk",
    description: "A guided evening walk through the gates.",
    contentCategory: "experience",
    price: "45.00",
    source,
    tracking: { productId: "prod-123" },
  };
}

test("AN1: the Discover builder sends no notes key, whatever the source", () => {
  for (const source of ["Viator", "Klook", "", "Source: x"]) {
    const body = buildDiscoverAddBody(item(source), "trip-1");
    assert.equal("notes" in body, false, `source ${JSON.stringify(source)}`);
    assert.equal(body.affiliateProductId, "prod-123");
    assert.equal(body.title, "Fushimi Inari night walk");
    assert.equal(body.description, "A guided evening walk through the gates.");
    assert.equal(body.itemType, "experience");
    assert.equal(body.dayNumber, 1);
    assert.equal(body.status, "planned");
    assert.equal(body.estimatedCost, "45.00");
    assert.equal(body.currency, "USD");
  }
});

test("AN2: the builder's source writes no notes and its body type has no notes field", () => {
  const src = stripComments(read("client/src/lib/discover-add-body.ts"));
  assert.doesNotMatch(src, /\bnotes\b/);
  assert.doesNotMatch(src, /Source:/);
  const iface = src.slice(src.indexOf("export interface DiscoverAddBody"));
  assert.ok(iface.length > 0, "DiscoverAddBody must be locatable");
  assert.doesNotMatch(iface.slice(0, iface.indexOf("}")), /\bnotes\b/);
});

test("AN3: the dialog writes no notes, and its one builder still serves both ways in", () => {
  const src = stripComments(read("client/src/components/add-to-experience-dialog.tsx"));
  assert.doesNotMatch(src, /\bnotes\b/);
  assert.doesNotMatch(src, /Added from/);
  assert.match(src, /const feedItemBody/);
  assert.match(src, /\.\.\.\(item\?\.scheduledDate \? \{ scheduledDate: item\.scheduledDate \} : \{\}\)/);
  assert.match(src, /startPlanThenAdd\(feedItemBody\(null\)\)/);
  assert.match(src, /JSON\.stringify\(feedItemBody\(plan\.startDate\)\)/);
});

test("AN4: no client source writes Added from or Source: into notes", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) {
        if (/notes\s*:\s*[`"'](Added from|Source:)/.test(stripComments(read(rel)))) hits.push(rel);
      }
    }
  };
  walk("client/src");
  assert.deepEqual(hits, []);
});

test("AN5: the billboard gem marker is untouched and still compared", () => {
  assert.equal(pendingPlanItemMarker("g-1"), "Billboard gem id: g-1");
  const planning = stripComments(read("client/src/lib/billboard-gem-planning.ts"));
  assert.match(planning, /const marker = pendingPlanItemMarker\(item\.id\)/);
  assert.match(planning, /row\.notes === marker/);
});
