/**
 * Ledger `2026-09-27-evidence-scorer-cost` (R179; Lane C ruling 11): the evidence scorer's Anthropic
 * calls are cost-tracked. FAILS ON main: `anthropicScorerModel` does not exist there and the scorer's
 * model call wrote no `ai_cost_tracking` row. Pure — a fake client and a fake tracker; no network, no DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anthropicScorerModel, type ScorerClient } from "../services/evidence-scorer.service";

function fakeClient(resp: any, throws = false): ScorerClient {
  return { messages: { create: async () => { if (throws) throw new Error("boom"); return resp; } } };
}

test("E1 a scorer call records its usage once, attributed to the claim's expert and keyed by claim@version", async () => {
  const calls: any[] = [];
  const model = anthropicScorerModel(
    fakeClient({ content: [{ type: "text", text: " {\"ok\":1} " }], usage: { input_tokens: 1200, output_tokens: 300 }, model: "claude-x" }),
    (async (resp: any, opts: any) => { calls.push({ resp, opts }); }) as any,
  );
  const text = await model({ system: "s", user: "u", attribution: { actorId: "expert-1", requestId: "claim-9@v2" } });
  assert.equal(text, "{\"ok\":1}");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].opts, { sourceType: "ai_evidence_scorer", userId: "expert-1", requestId: "claim-9@v2" });
  assert.equal(calls[0].resp.usage.input_tokens, 1200);
});

test("E2 a malformed answer is still recorded as spend (tracking happens before parsing)", async () => {
  const calls: any[] = [];
  const model = anthropicScorerModel(
    fakeClient({ content: [{ type: "text", text: "not json" }], usage: { input_tokens: 10, output_tokens: 5 } }),
    (async (_r: any, o: any) => { calls.push(o); }) as any,
  );
  await model({ system: "s", user: "u" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, null, "no attribution given ⇒ no actor invented");
});

test("E3 a call that throws records nothing and rethrows", async () => {
  const calls: any[] = [];
  const model = anthropicScorerModel(fakeClient(null, true), (async (_r: any, o: any) => { calls.push(o); }) as any);
  await assert.rejects(model({ system: "s", user: "u" }), /boom/);
  assert.equal(calls.length, 0);
});

test("E4 the scorer passes the claim's expert and claim@version to the model", () => {
  const src = readFileSync(new URL("../services/evidence-scorer.service.ts", import.meta.url), "utf8");
  assert.match(src, /attribution: \{ actorId: row\.expertId \?\? null, requestId: `\$\{row\.id\}@v\$\{version\}` \}/);
});
