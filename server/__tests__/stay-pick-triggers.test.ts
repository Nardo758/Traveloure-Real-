/**
 * S1 — the four compute triggers, and nothing on read (ledger `2026-10-09-s1-one-stay`, ruling 3).
 *
 *   ST1  Optimize finish (both monolith entry points), Trip Pass grant, handoff accept and the post-debounce
 *        stops recompute each schedule the stay pick
 *   ST2  the where-to-stay read imports no Maps fetch and never calls the writer
 *   ST3  `trips.stay_pick` has one writer: no file under server/ but the service sets it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

test("ST1 the four triggers schedule the stay pick", () => {
  const routes = read("server/routes.ts");
  assert.equal((routes.match(/\.then\(\(\) => scheduleStayPickLazy\(/g) ?? []).length, 2, "both Optimize entry points");
  assert.match(read("server/services/trip-entitlement.service.ts"), /scheduleStayPick\(input\.tripId\)/, "Trip Pass grant");
  assert.match(read("server/services/handoff.service.ts"), /scheduleStayPick\(row\.tripId\)/, "handoff accept");
  assert.match(read("server/services/routing/plan-legs-queue.ts"), /scheduleStayPick\(tripId\)/, "post-debounce stops recompute");
});

test("ST2 the read never computes", () => {
  const src = read("server/services/where-to-stay.service.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /stay-pick\.service|computeStayPick|scheduleStayPick|gatedRouteMatrixFetch|googleRouteMatrixFetch/);
});

test("ST3 one writer of trips.stay_pick", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "migrations" || e.name === "node_modules") continue;
        walk(rel);
      } else if (rel.endsWith(".ts") && rel !== path.join("server", "services", "stay-pick.service.ts")) {
        const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        // A WRITE: `.set({ … stayPick …` or SQL `stay_pick =`. A select (`stayPick: trips.stayPick`) is a read.
        if (/\.set\(\{[^)]*\bstayPick\b/.test(code) || /\bstay_pick\s*=/.test(code)) offenders.push(rel);
      }
    }
  };
  walk("server");
  assert.deepEqual(offenders, []);
  // storage.updateTrip names it only to STRIP it (§19 layer 2).
  assert.match(read("server/storage.ts"), /stayPick: _clientSuppliedStayPick/);
});
