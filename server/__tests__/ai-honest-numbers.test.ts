/**
 * ai-honest-numbers.test.ts — ledger `2026-09-30-ai-task-honest-numbers`.
 *
 * H1–H3: expert AI-task rows carry no invented numbers (the two Math.random() writers are gone,
 * every read projects the historic random values as null, the stats never average them or print
 * "0.0"). H4–H6: the one draft generator writes its own `ai_cost_tracking` row through the shared
 * `trackAnthropicResponse`, every caller must attribute it, and the free-draft route no longer
 * writes a second row for the same call.
 *
 * STATED NEGATIVE SPACE (§18d): static source pins. They do not execute a model call or a DB insert
 * (the writer itself is proven by ai-cost-attribution.db.test.ts); they cannot see a NEW random
 * writer that names these columns through a different variable.
 *
 * Run: npx tsx --test server/__tests__/ai-honest-numbers.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const routes = read("server/routes.ts");
const aiTasks = routes.slice(routes.indexOf("// === EXPERT AI TASKS ROUTES ==="), routes.indexOf('app.get("/api/expert/ai-stats"') + 3000);

test("H1: no expert AI-task writer stamps a random confidence or quality score", () => {
  assert.equal(/Math\.random\(\)\s*\*/.test(aiTasks.replace(/^\s*\/\/.*$/gm, "")), false);
  assert.equal(/\bconfidence,\s*\n\s*qualityScore,/.test(aiTasks), false, "the two score columns must not be written");
});

test("H2: every AI-task response projects both scores as null", () => {
  const jsonSends = aiTasks.match(/res\.json\((?:tasks|updatedTask)\)/g) ?? [];
  assert.deepEqual(jsonSends, [], `unprojected task response(s): ${jsonSends.join(", ")}`);
  assert.match(aiTasks, /res\.json\(tasks\.map\(withoutUnmeasuredScores\)\)/);
  assert.equal((aiTasks.match(/withoutUnmeasuredScores\(updatedTask\)/g) ?? []).length, 4);
});

test("H3: the stats never report an average quality (null, not 0.0) and the client hides the row", () => {
  assert.match(aiTasks, /avgQualityScore: null,/);
  const client = read("client/src/pages/expert/ai-assistant.tsx");
  assert.equal(client.includes('avgQualityScore ?? "0.0"'), false);
  assert.match(client, /aiStats\?\.avgQualityScore != null &&/);
});

test("H4: the draft generator requires attribution and writes the cost row itself", () => {
  const gen = read("server/services/ai-generation.service.ts");
  assert.match(gen, /attribution: \{ sourceType: string; userId: string \| null \}/);
  assert.match(gen, /await trackAnthropicResponse\(anthropicResponse, attribution\);/);
});

test("H5: occasion drafts and trip optimization attribute their generations", () => {
  assert.match(read("server/services/occasion-drafts.service.ts"), /\{ sourceType: "ai_occasion_draft", userId: input\.userId \}/);
  const opt = read("server/services/trip-optimization.service.ts");
  assert.match(opt, /sourceType: "ai_trip_optimization", userId: actorUserId/);
  assert.equal((opt.match(/\}, attribution\)/g) ?? []).length, 3);
});

test("H6: the free-draft route no longer writes a second cost row for the same call", () => {
  const content = read("server/routes/content.routes.ts");
  assert.equal(/trackAICost\(/.test(content), false);
  assert.match(content, /\}, \{ sourceType: "ai_itinerary", userId \}\)/);
});
