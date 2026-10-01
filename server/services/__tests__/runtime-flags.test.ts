/**
 * runtime-flags.test.ts — the /api/health `flags` block (ledger `2026-09-30-health-flags`).
 *
 *   F1  exactly the four named switches, each a boolean; "1" is on and anything else is off
 *   F2  no env VALUE ever leaves: a secret-looking value in any variable is never in the output
 *   F3  the route wires it on every branch (source pin: the ok answer and both 503 answers)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEALTH_FLAG_NAMES, healthFlags } from "../runtime-flags";

test("F1: the four switches, booleans, '1' is on", () => {
  const f = healthFlags({ PLACE_FACTS_PLACES_ENABLED: "1", AFFILIATE_PAGE_EXTRACT_ENABLED: "true", DMO_INGEST_ENABLED: "0" });
  assert.deepEqual(Object.keys(f), [...HEALTH_FLAG_NAMES]);
  assert.deepEqual(f, { PLACE_FACTS_PLACES_ENABLED: true, AFFILIATE_PAGE_EXTRACT_ENABLED: false, DMO_INGEST_ENABLED: false, E2E_AI_STUB: false });
  for (const v of Object.values(healthFlags({}))) assert.equal(typeof v, "boolean");
});

test("F2: no env value is ever echoed", () => {
  const secret = "sk_live_should_never_appear";
  const out = JSON.stringify(healthFlags({ E2E_AI_STUB: secret, GOOGLE_MAPS_API_KEY: secret, DMO_INGEST_ENABLED: "1" }));
  assert.equal(out.includes(secret), false);
  assert.equal(out.includes("GOOGLE_MAPS_API_KEY"), false, "only the four named switches");
});

test("F3: every /api/health answer carries the flags", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../../routes/content.routes.ts"), "utf8");
  const start = src.indexOf('router.get("/api/health"');
  const block = src.slice(start, src.indexOf('router.get("/api/status"', start));
  assert.equal((block.match(/\bbuild, flags\b/g) ?? []).length, 3);
});
