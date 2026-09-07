#!/usr/bin/env node
/**
 * trip-card-honesty guard — lane L4 of the Console & AI Concierge brief (ledger
 * `2026-09-07-trip-card-honesty`). Three text predicates over client/src:
 *
 *   1. NO NULL-ISLAND DEFAULT. No `lat: 0, lng: 0` (any spacing) outside test files — a map
 *      that opens on 0,0 is a map of nowhere wearing the plan's name (§13). The MapControlCenter
 *      now mounts a canvas only when an honest center exists (a located stop, else the
 *      server-geocoded destination).
 *   2. NO ITINERARYCARD. The renderer was deleted as dead in Phase 3b and the type-only remnant
 *      file is deleted in L4 — no import of it anywhere, and the file itself is gone. The diff
 *      types live in `client/src/lib/itinerary-diff.ts`.
 *   3. ONE MAPS HANDOFF. A string literal containing a Google Maps search/dir URL or an Apple
 *      `maps://` scheme may exist ONLY in the canonical libs (`lib/maps.ts`, `lib/maps-platform.ts`,
 *      `lib/navigate.ts`, `lib/itinerary-diff.ts` is not one). Pages used to hand-roll these
 *      inline, bypassing the platform preference, the Waze arm and the Apple multi-waypoint
 *      escape hatch `lib/navigate.ts` owns.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *   • Text, not behaviour: it cannot see whether a map CENTERS right at runtime, whether a page
 *     hands `navigate.ts` a good place name, or whether the typographic hero looks right.
 *   • Test files are EXEMPT (`__tests__`, `.test.`, `.spec.`) — fixtures legitimately use 0,0
 *     coordinates (a Prime Meridian stop is a real place).
 *   • Predicate 3 matches STRING LITERALS only; a URL assembled from fragments, or one mentioned
 *     in a comment, is invisible (the lane reworded its own comments for exactly this reason).
 *   • The hero's null-on-no-match is pinned by `plancard/__tests__/hero-photo-honesty.test.ts`,
 *     not here — this guard does not re-check it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CLIENT_SRC = path.join(ROOT, "client", "src");

/** The ONLY files a Maps URL string literal may live in (predicate 3). */
const MAPS_URL_ALLOWLIST = new Set([
  "client/src/lib/maps.ts",
  "client/src/lib/maps-platform.ts",
  "client/src/lib/navigate.ts",
]);

const NULL_ISLAND_RE = /lat:\s*0\s*,\s*lng:\s*0/;
const ITINERARY_CARD_IMPORT_RE = /from\s+["'][^"']*ItineraryCard["']/;
// A URL inside a string literal: quote/backtick … pattern … (line-local; URLs never span lines).
const MAPS_URL_LITERAL_RE = /["'`][^"'`\n]*(?:google\.com\/maps\/(?:search|dir)|maps:\/\/maps\.apple\.com)/;

function isTestFile(rel) {
  return rel.includes("__tests__") || /\.(test|spec)\.[tj]sx?$/.test(rel);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.[tj]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relOf(full) {
  return path.relative(ROOT, full).split(path.sep).join("/");
}

function check(files) {
  const errors = [];
  for (const [rel, src] of Object.entries(files)) {
    if (!isTestFile(rel) && NULL_ISLAND_RE.test(src)) {
      errors.push(
        `${rel} contains a lat:0 / lng:0 default — a Null Island map center is a map of nowhere (§13). ` +
          `Mount the canvas only with an honest center (located stop or the geocoded destination).`,
      );
    }
    if (ITINERARY_CARD_IMPORT_RE.test(src)) {
      errors.push(
        `${rel} imports ItineraryCard — the renderer was deleted as dead (Phase 3b) and the file is gone (L4). ` +
          `The diff types live in @/lib/itinerary-diff.`,
      );
    }
    if (!MAPS_URL_ALLOWLIST.has(rel) && MAPS_URL_LITERAL_RE.test(src)) {
      errors.push(
        `${rel} builds a Maps URL in a string literal outside the canonical handoff (lib/navigate.ts / lib/maps.ts). ` +
          `One handoff owns the platform preference, the Waze arm, and the Apple multi-waypoint escape hatch.`,
      );
    }
  }
  return errors;
}

function checkItineraryCardFileGone(fileExists) {
  return fileExists
    ? ["client/src/components/itinerary/ItineraryCard.tsx still exists — L4 deleted it; the diff types moved to client/src/lib/itinerary-diff.ts."]
    : [];
}

// ── committed self-test fixtures (§18d) ────────────────────────────────────────────────────────
function selfTest() {
  const clean = "export const x = 1;";
  const cases = [
    ["a clean file passes", () => check({ "client/src/pages/x.tsx": clean }).length === 0],
    [
      "a Null Island default center fails",
      () =>
        check({ "client/src/components/plancard/MapControlCenter.tsx": "defaultCenter={{ lat: 0, lng: 0 }}" })
          .some((e) => e.includes("Null Island")),
    ],
    [
      "spacing variants of Null Island fail",
      () => check({ "client/src/pages/y.tsx": "const c = {lat:0,lng:0};" }).length === 1,
    ],
    [
      "a 0,0 fixture in a TEST file is exempt",
      () => check({ "client/src/lib/__tests__/geo.test.ts": "assert(isLocated({ lat: 0, lng: 0 }))" }).length === 0,
    ],
    [
      "an ItineraryCard import fails",
      () =>
        check({ "client/src/pages/itinerary.tsx": 'import type { ActivityDiff } from "@/components/itinerary/ItineraryCard";' })
          .some((e) => e.includes("ItineraryCard")),
    ],
    [
      "a hand-rolled Google dir URL in a page fails",
      () =>
        check({ "client/src/pages/p.tsx": 'window.open(`https://www.google.com/maps/dir/?api=1&origin=${o}`)' })
          .some((e) => e.includes("canonical handoff")),
    ],
    [
      "a hand-rolled Apple scheme in a component fails",
      () =>
        check({ "client/src/components/c.tsx": 'const u = `maps://maps.apple.com/?q=${q}`;' }).length === 1,
    ],
    [
      "the canonical builder is allowlisted",
      () => check({ "client/src/lib/maps.ts": 'const base = "https://www.google.com/maps/dir/?api=1";' }).length === 0,
    ],
    [
      "a URL mentioned in a COMMENT is invisible (text-over-source, stated negative space)",
      () => check({ "client/src/pages/z.tsx": "// used to open google.com/maps/dir inline" }).length === 0,
    ],
    [
      "the surviving ItineraryCard FILE fails loudly",
      () => checkItineraryCardFileGone(true).some((e) => e.includes("still exists")),
    ],
    [
      "the deleted ItineraryCard file passes",
      () => checkItineraryCardFileGone(false).length === 0,
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch { ok = false; }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`\ntrip-card-honesty guard SELF-TEST FAILED — ${failed} fixture case(s). Fix the predicate before trusting a green run.`);
    process.exit(1);
  }
  console.log(`\ntrip-card-honesty guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = {};
  for (const full of walk(CLIENT_SRC)) files[relOf(full)] = fs.readFileSync(full, "utf8");
  const errors = [
    ...check(files),
    ...checkItineraryCardFileGone(fs.existsSync(path.join(CLIENT_SRC, "components", "itinerary", "ItineraryCard.tsx"))),
  ];
  if (errors.length > 0) {
    console.error("trip-card-honesty guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  console.log(
    `trip-card-honesty guard: OK — ${Object.keys(files).length} client files, no Null Island default, ` +
      `no ItineraryCard, one maps handoff.`,
  );
}

main();
