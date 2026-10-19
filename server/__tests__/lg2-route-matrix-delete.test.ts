/**
 * LG-2 (ledger `2026-10-18-lg2-route-matrix-delete`): no code can call Google's Route Matrix, and the stored cells go.
 *
 *   RM1 the matrix service exports no live Route Matrix call (googleRouteMatrixFetch / gatedRouteMatrixFetch are gone)
 *       and its price config file is deleted
 *   RM2 no server source names the Route Matrix endpoint
 *   RM3 migration 392 is data only: it deletes travel_time_matrix rows and drops, alters or touches nothing else
 *
 * NEGATIVE SPACE (§18d): RM2 scans server/ for the endpoint URL only; a call built from parts would not be seen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("RM1 no live Route Matrix call is exported; the price config is gone", () => {
  const src = fs.readFileSync(path.join(root, "server/services/travel-time-matrix.service.ts"), "utf8");
  assert.doesNotMatch(src, /export function (googleRouteMatrixFetch|gatedRouteMatrixFetch)\b/);
  assert.match(src, /export async function loadEstimateReader\b/, "the estimate reader stays");
  assert.equal(fs.existsSync(path.join(root, "server/config/travel-matrix.config.ts")), false);
});

test("RM2 no server source names the Route Matrix endpoint", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
      } else if (/\.(ts|js)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("distanceMatrix/v2:computeRouteMatrix")) hits.push(path.relative(root, p));
    }
  };
  walk(path.join(root, "server"));
  assert.deepEqual(hits, []);
});

test("RM3 migration 392 deletes the cells and nothing else", () => {
  const sqlText = fs.readFileSync(path.join(root, "server/migrations/392_travel_time_matrix_cells_delete.sql"), "utf8");
  const statements = sqlText.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements, ["DELETE FROM travel_time_matrix"]);
});
