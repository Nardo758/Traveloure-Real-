/**
 * SLIP / TRIP CARD INTEGRITY (ledgers `2026-09-26-slip-renders-live`,
 * `2026-09-26-card-routing-read-only`, `2026-09-26-send-to-expert-needs-expert`; audit
 * `docs/planning/trip-slip-ui-audit.md` G1/G2/G3 — all three VERIFIED in the running app).
 *
 * Proven at the API layer — the Trip Card's buttons are gone too, but a UI rule is never what keeps
 * a write out (§14 posture), so every assertion here is an HTTP call and a DB read:
 *
 *   L1  (G3) finalize → reopen → add an item and edit another: the SLIP's read
 *       (`GET …/plancard?surface=slip`) shows both immediately; the Trip Card's read (no surface)
 *       still renders the frozen final it was designed to.
 *   L2  (G3) the slip's read of a CURRENTLY-final plan is the live plan too (no snapshot branch).
 *   F1  (G1) on a finalized plan "Send to expert" is refused 409 `plan_finalized` — with an
 *       accepted expert on the plan, so the finalized lock and not the no-expert rule is what
 *       refuses — and the item's routing status is unchanged in the DB.
 *   F2  (G1) recalling an item into planning on a finalized plan is refused the same way.
 *   F3  the two edges left open on a finalized plan, by name: owner → ready_for_checkout (the
 *       Finalize chooser's "Book it myself" and LD 52's "Approve & book" stage items here after the
 *       flip), and the expert returning routed work. Recorded as an open question in the PR.
 *   E1  (G2) with NO expert on the plan, "Send to expert" is refused 409 `no_expert_assigned` and the
 *       plancard says `expertAssigned: false`.
 *   E2  a PENDING invite is not an assigned expert — still refused.
 *   E3  with an ACCEPTED expert the same call succeeds and the plancard says `expertAssigned: true`.
 *
 * Runs against the ALREADY-RUNNING server (JOURNEY_BASE_URL, default http://127.0.0.1:5000), the
 * `adopt-version-semantics` harness. DISPOSABLE DB ONLY.
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *        server/__tests__/slip-card-integrity.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[slip-card-integrity] REFUSING to write fixtures to '${host ?? "<none>"}'. Set JOURNEY_DB_WRITES_OK=1.`);
  }
}

type Actor = { id: string; cookie: string };
const userIds: string[] = [];
const tripIds: string[] = [];

async function register(label: string): Promise<Actor> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `sci-${label}-${RUN}@t.test`, password: PASSWORD, firstName: "SCI", lastName: label, userType: "user" }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  userIds.push(body.user.id);
  return { id: body.user.id as string, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function call(actor: Actor, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

async function mintPlan(actor: Actor, titles: string[]): Promise<{ tripId: string; itemIds: string[] }> {
  const start = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 43 * 86400_000).toISOString().slice(0, 10);
  const trip = await call(actor, "POST", "/api/trips", { title: `Integrity ${RUN}`, destination: "Kyoto, Japan", startDate: start, endDate: end });
  assert.ok(trip.status < 300, `create trip: ${trip.status} ${trip.text}`);
  const tripId = trip.json.id as string;
  tripIds.push(tripId);
  const itemIds: string[] = [];
  for (const title of titles) itemIds.push(await addItem(actor, tripId, title));
  return { tripId, itemIds };
}

async function addItem(actor: Actor, tripId: string, title: string): Promise<string> {
  const r = await call(actor, "POST", `/api/trips/${tripId}/itinerary-items`, { title, itemType: "activity", dayNumber: 1 });
  assert.ok(r.status < 300, `add item: ${r.status} ${r.text}`);
  return r.json.id as string;
}

const titlesOf = (plan: any): string[] =>
  (plan?.days ?? []).flatMap((d: any) => (d.activities ?? []).map((a: any) => a.name ?? a.title));

async function routingStatusOf(itemId: string): Promise<string | null> {
  const r: any = await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${itemId}`);
  return r.rows?.[0]?.routing_status ?? null;
}

async function seedAdvisor(tripId: string, expertId: string, status: string): Promise<void> {
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${tripId}`);
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
                       VALUES (${crypto.randomUUID()}, ${tripId}, ${expertId}, ${status})`);
}

let owner: Actor;
let expert: Actor;

before(async () => {
  await assertDisposableDb();
  owner = await register("owner");
  expert = await register("expert");
});

after(async () => {
  for (const t of tripIds) {
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${t}`).catch(() => {});
  }
});

// ── G3: the slip renders the live plan ─────────────────────────────────────────────────────────

test("L1: finalize → reopen → add + edit: the slip shows both immediately; the Trip Card keeps its final", async () => {
  const { tripId, itemIds } = await mintPlan(owner, [`Temple ${RUN}`, `Market ${RUN}`]);
  assert.equal((await call(owner, "POST", `/api/trips/${tripId}/finalize`)).status, 200);
  assert.equal((await call(owner, "POST", `/api/trips/${tripId}/reopen`)).status, 200);

  const added = `Added after reopen ${RUN}`;
  const renamed = `Market renamed ${RUN}`;
  await addItem(owner, tripId, added);
  const patch = await call(owner, "PATCH", `/api/trips/${tripId}/itinerary-items/${itemIds[1]}`, { title: renamed });
  assert.ok(patch.status < 300, `edit: ${patch.status} ${patch.text}`);

  const slip = await call(owner, "GET", `/api/trips/${tripId}/plancard?surface=slip`);
  assert.equal(slip.status, 200);
  const slipTitles = titlesOf(slip.json);
  assert.ok(slipTitles.includes(added), `slip shows the added item: ${JSON.stringify(slipTitles)}`);
  assert.ok(slipTitles.includes(renamed), "slip shows the edited title");
  assert.ok(!slipTitles.includes(`Market ${RUN}`), "slip no longer shows the old title");

  const card = await call(owner, "GET", `/api/trips/${tripId}/plancard`);
  const cardTitles = titlesOf(card.json);
  assert.ok(!cardTitles.includes(added), "the Trip Card still renders the frozen final (by design)");
  assert.ok(cardTitles.includes(`Market ${RUN}`));
  assert.equal(card.json.trip?.finalVersion ?? slip.json.trip?.finalVersion ?? 1, 1);
});

test("L2: a currently-final plan's slip read is the live plan as well", async () => {
  const { tripId } = await mintPlan(owner, [`Garden ${RUN}`]);
  assert.equal((await call(owner, "POST", `/api/trips/${tripId}/finalize`)).status, 200);
  // A row the final does not contain, written straight to the table (adopting it would re-version).
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number)
                       VALUES (${crypto.randomUUID()}, ${tripId}, ${`Live only ${RUN}`}, 'activity', 1)`);
  const slip = await call(owner, "GET", `/api/trips/${tripId}/plancard?surface=slip`);
  assert.ok(titlesOf(slip.json).includes(`Live only ${RUN}`));
});

// ── G1: a finalized plan is not re-planned through the routing rail ─────────────────────────────

test("F1/F2/F3: on a finalized plan send-to-expert and recall are refused; the booking edges stay open", async () => {
  const { tripId, itemIds } = await mintPlan(owner, [`Tea ${RUN}`, `Sake ${RUN}`, `Zen ${RUN}`]);
  await seedAdvisor(tripId, expert.id, "accepted");
  // Zen goes to the expert BEFORE the plan is finalized (allowed: an expert is assigned).
  const pre = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[2]}/route`, { to: "with_expert" });
  assert.equal(pre.status, 200, pre.text);
  assert.equal((await call(owner, "POST", `/api/trips/${tripId}/finalize`)).status, 200);

  const send = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[0]}/route`, { to: "with_expert" });
  assert.equal(send.status, 409, send.text);
  assert.equal(send.json?.code, "plan_finalized");
  assert.equal(await routingStatusOf(itemIds[0]), "in_planning", "the refused transition wrote nothing");

  const recall = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[2]}/route`, { to: "in_planning" });
  assert.equal(recall.status, 409, recall.text);
  assert.equal(recall.json?.code, "plan_finalized");
  assert.equal(await routingStatusOf(itemIds[2]), "with_expert");

  // F3 — the booking edge the Finalize chooser uses.
  const stage = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[1]}/route`, { to: "ready_for_checkout" });
  assert.equal(stage.status, 200, stage.text);
  // F3 — the expert returning routed work.
  const back = await call(expert, "POST", `/api/trips/${tripId}/items/${itemIds[2]}/route`, { to: "in_planning" });
  assert.equal(back.status, 200, back.text);
});

// ── G2: "Send to expert" needs an expert ────────────────────────────────────────────────────────

test("E1/E2/E3: no expert ⇒ refused; a pending invite ⇒ refused; an accepted expert ⇒ allowed", async () => {
  const { tripId, itemIds } = await mintPlan(owner, [`Bamboo ${RUN}`]);

  const none = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[0]}/route`, { to: "with_expert" });
  assert.equal(none.status, 409, none.text);
  assert.equal(none.json?.code, "no_expert_assigned");
  assert.equal(await routingStatusOf(itemIds[0]), "in_planning");
  assert.equal((await call(owner, "GET", `/api/trips/${tripId}/plancard?surface=slip`)).json?.expertAssigned, false);

  await seedAdvisor(tripId, expert.id, "pending");
  const pending = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[0]}/route`, { to: "with_expert" });
  assert.equal(pending.status, 409, pending.text);
  assert.equal(pending.json?.code, "no_expert_assigned");

  await seedAdvisor(tripId, expert.id, "accepted");
  const ok = await call(owner, "POST", `/api/trips/${tripId}/items/${itemIds[0]}/route`, { to: "with_expert" });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(await routingStatusOf(itemIds[0]), "with_expert");
  assert.equal((await call(owner, "GET", `/api/trips/${tripId}/plancard?surface=slip`)).json?.expertAssigned, true);
});
