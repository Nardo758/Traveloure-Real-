/**
 * OPTIMIZER RUN RECORDS — Track A step A9, ledger `2026-09-30-a9-run-records` (product map §N2–§N4;
 * migration 336). Against the running server with OPTIMIZER_RUN_RECORDS_ENABLED=1 (and the A7 flag).
 *
 *   R1  a whole-version adopt appends `adopted_whole` and one `option_chosen` for the set it decided.
 *   R2  adopt-stops appends ONE `adopted_part` per version, naming the variant items it added.
 *   R3  "Your optimized plans" lists the run with its basis label, versions and outcomes — and NO
 *       input snapshot, prompt hash or PaymentIntent reaches the client (allowlist projection).
 *   R4  another traveler cannot read the runs; nothing is copied to their plan.
 *   R5  a paid run OUTLIVES its plan: deleting the trip nulls `trip_id` and the run row stays (§N4).
 *   R6  the one writer exposes no UPDATE or DELETE of optimizer_runs (source pin — insert-only).
 *
 * STATED NEGATIVE SPACE (§18d): the generator's own record-before-model-call is not exercised (no
 * model key in CI); the run row is written here through the SAME `recordOptimizerRun` the generator
 * calls. `booking_created` has no writer yet and is not tested.
 *
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/optimizer-run-records.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryItems, optimizerRuns, optimizerRunOutcomes } from "@shared/schema";
import { recordOptimizerRun } from "../services/optimizer-runs.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[optimizer-run-records] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerTraveler(label: string): Promise<Actor> {
  const email = `orr-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "AD", lastName: label, userType: "user" }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const body = await res.json();
  return { id: body.user.id as string, email, cookie };
}

async function createTrip(actor: Actor): Promise<string> {
  const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
  const res = await fetch(`${BASE_URL}/api/trips`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: JSON.stringify({ title: "Kyoto trip", destination: "Kyoto, Japan", startDate: start, endDate: end }),
  });
  if (res.status >= 300) assert.fail(`create trip failed (${res.status}): ${await res.text()}`);
  return (await res.json()).id as string;
}


async function post(actor: Actor, path: string, body: unknown) {
  return fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: actor.cookie }, body: JSON.stringify(body) });
}



let owner: Actor;
let other: Actor;
let tripId: string;
let comparisonId: string;
let runId: string;
let v1: string;
let setId: string;
let optionId: string;
let stopId: string;

before(async () => {
  await assertDisposableDb();
  owner = await registerTraveler("owner");
  other = await registerTraveler("other");
  tripId = await createTrip(owner);
  const created = await post(owner, `/api/trips/${tripId}/option-sets`, { categoryKey: "accommodation", label: "Where you'll stay", anchor: true });
  assert.equal(created.status, 201, await created.clone().text());
  setId = (await created.json()).set.id;
  const opt = await post(owner, `/api/trips/${tripId}/option-sets/${setId}/options`, { source: { kind: "custom", title: `Gion inn ${RUN}`, lat: 35.0037, lng: 135.7788 } });
  optionId = (await opt.json()).option.id;
  const [cmp] = await db.insert(itineraryComparisons).values({ userId: owner.id, tripId, destination: "Kyoto, Japan" } as any).returning();
  comparisonId = cmp.id;
  const id = await recordOptimizerRun(
    { tripId, comparisonId, basis: "paid", paymentIntentId: `pi_test_${RUN}`, tollRunId: null, createdBy: owner.id },
    { inputSnapshot: { items: [] }, modelVersion: "test-model", prompt: "the prompt text is never stored" },
  );
  assert.ok(id, "the run was recorded");
  runId = id!;
  const [v] = await db.insert(itineraryVariants).values({ comparisonId, name: "V1", source: "ai_optimized", sortOrder: 1, runId } as any).returning();
  v1 = v.id;
  await db.insert(itineraryVariantItems).values({ variantId: v1, dayNumber: 1, name: `Gion inn ${RUN}`, serviceType: "accommodation", latitude: "35.0037", longitude: "135.7788", metadata: { optionId, setId }, sortOrder: -1 } as any);
  const [stop] = await db.insert(itineraryVariantItems).values({ variantId: v1, dayNumber: 2, name: `Moss garden ${RUN}`, serviceType: "activity", sortOrder: 0 } as any).returning();
  stopId = stop.id;
});

after(async () => {
  await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, comparisonId)).catch(() => {});
  await db.delete(optimizerRunOutcomes).where(eq(optimizerRunOutcomes.runId, runId)).catch(() => {});
  await db.delete(optimizerRuns).where(eq(optimizerRuns.id, runId)).catch(() => {});
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email IN (${owner?.email ?? ""}, ${other?.email ?? ""})`).catch(() => {});
});

test("R1 a whole-version adopt appends adopted_whole and option_chosen", async () => {
  await db.update(itineraryComparisons).set({ selectedVariantId: v1 } as any).where(eq(itineraryComparisons.id, comparisonId));
  const res = await post(owner, `/api/itinerary-comparisons/${comparisonId}/apply-to-trip`, {});
  assert.equal(res.status, 200, await res.text());
  const rows = await db.select().from(optimizerRunOutcomes).where(eq(optimizerRunOutcomes.runId, runId));
  const kinds = rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["adopted_whole", "option_chosen"]);
  const chosen = rows.find((r) => r.kind === "option_chosen")!;
  assert.equal(chosen.setId, setId);
  assert.equal(chosen.optionId, optionId);
});

test("R2 adopt-stops appends one adopted_part naming the items it added", async () => {
  await db.delete(itineraryItems).where(eq(itineraryItems.title, `Moss garden ${RUN}`));
  const res = await post(owner, `/api/itinerary-comparisons/${comparisonId}/adopt-stops`, { variantItemIds: [stopId] });
  assert.equal(res.status, 200, await res.text());
  const parts = (await db.select().from(optimizerRunOutcomes).where(eq(optimizerRunOutcomes.runId, runId))).filter((r) => r.kind === "adopted_part");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].variantItemIds, [stopId]);
});

test("R3 the runs read carries basis, versions and outcomes — and no snapshot, hash or payment id", async () => {
  const res = await fetch(`${BASE_URL}/api/trips/${tripId}/optimizer-runs`, { headers: { cookie: owner.cookie } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const { runs } = JSON.parse(raw);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].basisLabel, "Paid run");
  assert.deepEqual(runs[0].versions.map((v: any) => v.id), [v1]);
  assert.ok(runs[0].outcomes.length >= 3);
  for (const leak of ["inputSnapshot", "promptSha256", "paymentIntentId", "pi_test_", "the prompt text"]) {
    assert.ok(!raw.includes(leak), `the read must not carry ${leak}`);
  }
  const [row] = await db.select().from(optimizerRuns).where(eq(optimizerRuns.id, runId));
  assert.equal(row.promptSha256, crypto.createHash("sha256").update("the prompt text is never stored").digest("hex"));
  assert.ok(!JSON.stringify(row).includes("the prompt text"), "the prompt text is never stored");
});

test("R4 another traveler cannot read the runs", async () => {
  const res = await fetch(`${BASE_URL}/api/trips/${tripId}/optimizer-runs`, { headers: { cookie: other.cookie } });
  assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
});

test("R5 a paid run outlives its plan", async () => {
  await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, comparisonId));
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id = ${tripId}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`);
  const [row] = await db.select().from(optimizerRuns).where(eq(optimizerRuns.id, runId));
  assert.ok(row, "the run row stays");
  assert.equal(row.tripId, null);
  assert.equal(row.comparisonId, null);
  assert.equal(row.authorizationBasis, "paid");
});

test("R6 the one writer exposes no UPDATE or DELETE of optimizer_runs", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "..", "services", "optimizer-runs.service.ts"), "utf8");
  assert.doesNotMatch(src, /\.update\(optimizerRuns\)/);
  assert.doesNotMatch(src, /\.delete\(optimizerRuns\)/);
});
