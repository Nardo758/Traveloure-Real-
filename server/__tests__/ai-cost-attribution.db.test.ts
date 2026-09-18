/**
 * ai-cost-attribution.db.test.ts — AN AI COST ROW IS ATTRIBUTED BY A STRING, AND A LOST ONE SAYS SO.
 *
 * (decision-maker ruling 2026-09-17; ledger `2026-09-17-ai-cost-actor-id`; migration 310.
 *  CLAUDE.md LD 44 (f), LD 45 (3) / punchlist **D-47**, §13, §18 rule 1, §20, and the
 *  "Replit deploy-push vs. our migrations" CRITICAL block — `ai_cost_tracking` is the table that
 *  block names BY NAME as the publish casualty.)
 *
 * WHAT WAS BROKEN. `ai_cost_tracking.user_id` is a **uuid** column (`025b_ai_cost_tracking.sql`)
 * while `users.id` is a **varchar** (`DEFAULT gen_random_uuid()`). A normally-minted account happens
 * to fit; an OIDC/Replit subject or any legacy row does not, and its INSERT raises `22P02`. Because
 * `trackAICost` swallows its own error by design ("logging failures should not block the request"),
 * the WHOLE cost row vanished — no row, no log, and an admin cost breakdown that totals less than
 * the platform actually spent. The READ had the same hole from the other side.
 *
 *   W1  **THE ROW THAT USED TO VANISH.** A NON-uuid actor id writes exactly ONE row, `actor_id` set
 *       to that id verbatim and `user_id` NULL. The negative beside it is load-bearing: the same id
 *       handed to `user_id` still raises `22P02` on this database, so W1 proves the fix rather than
 *       a change of mind about Postgres.
 *   W2  A uuid-shaped actor writes BOTH columns, equal — nothing is lost for the accounts that
 *       already worked, and the pre-310 `user_id` join keeps answering.
 *   W3  §13 — NO ACTOR ⇒ BOTH COLUMNS NULL. An unattributed row stays unattributed; it is never
 *       zero-filled, never stamped with a placeholder, and never folded into anyone's spend.
 *   W4  **THE READER ATTRIBUTES ALL THREE ERAS THROUGH ONE EXPRESSION** (§18 rule 1). Against real
 *       rows — a pre-310 row (`actor_id` NULL, `user_id` set: the shape nothing was backfilled to
 *       change), a post-310 uuid row and a post-310 non-uuid row — `aiCostActorMatchesSql` finds
 *       each by its own actor and finds NEITHER for a stranger. The non-uuid probe does not raise
 *       `22P02`, which the pre-310 `user_id = $1` comparison did for exactly the accounts whose
 *       rows were also being dropped at write time.
 *   W5  **ONE WRITER, PINNED STATICALLY.** No `INSERT INTO ai_cost_tracking` and no
 *       `.insert(aiCostTracking)` exists anywhere under `server/` or `shared/` outside
 *       `server/services/ai-cost-tracker.ts`. A second writer is the derivation-drift class §18
 *       rule 1 names, and it is how one rail starts attributing rows the other cannot read.
 *   W6  **D-47's COST ROW, DRIVEN THROUGH THE REAL SERVICE, FOR A NON-UUID ASKER.**
 *       `createProposalFromAsk` runs with a stubbed model and the REAL `trackAnthropicResponse`:
 *       the row lands with `actor_id` = the SESSION ASKER, `source_type` = `ai_task` and
 *       `request_id` = the pre-minted proposal id — the three values D-47 ruled — where before 310
 *       this exact call wrote nothing at all.
 *   W7  **THE DECLARATION AND THE MIGRATION AGREE, AND THE PREVIEW SCRIPT AGREES WITH BOTH.** The
 *       live column exists with the declared type/length/nullability and NO default; migration 310
 *       adds no index (the one actor-filtering reader filters on the COALESCE expression, which a
 *       plain btree could not serve), and the table's index set is exactly the two 025b created
 *       plus the primary key — the set `shared/schema.ts` declares, so the publish-time push finds
 *       nothing to drop.
 *
 * STATED NEGATIVE SPACE (§18d), and it is the load-bearing half. These proofs say nothing about
 * whether any spend was LOST before 310 — a row that was never written leaves nothing to count
 * (§13), which is exactly why the writer now logs its own failures instead of being audited after
 * the fact. They say nothing about the `logger.warn` reaching an operator (a log line's delivery is
 * not a thing CI can assert; W1's negative proves the condition that used to trigger it). They do
 * not run `drizzle-kit push` and therefore cannot PROMISE the publish plan — W7 pins the shape the
 * push compares, and `scripts/preview-ai-cost-tracking-shape.cjs` is the instrument for the real
 * database, which no test can reach. They assert no COST VALUE and no model id beyond its presence.
 *
 * NO FEE LITERALS (§8): no amount is created, read or asserted here. Costs are per-request token
 * costs, not fees, and W1/W2/W6 assert the ATTRIBUTION columns only.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/ai-cost-attribution.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  trackAICost,
  aiCostActorMatchesSql,
  fitsUuidColumn,
} from "../services/ai-cost-tracker";
import { createProposalFromAsk } from "../services/proposal-create.service";

const RUN = crypto.randomUUID().slice(0, 8);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * THE SHAPE PRODUCTION ALSO MINTS, AND THE POINT OF THE WHOLE LANE. An OIDC/Replit subject is not
 * uuid-shaped; `users.id` is a varchar and holds it fine, and the uuid `ai_cost_tracking.user_id`
 * cannot. Every `nonUuid*` id below is deliberately of that shape.
 */
const ids = {
  nonUuidActor: `replit|acct-${RUN}`,
  nonUuidAsker: `oidc-subject-${RUN}`,
  uuidActor: crypto.randomUUID(),
  legacyUuidActor: crypto.randomUUID(),
  /** W4 gets its OWN actors so its assertions are exact sets, not "at least these". */
  w4UuidActor: crypto.randomUUID(),
  w4NonUuidActor: `replit|w4-${RUN}`,
  strangerActor: `stranger-${RUN}`,
  trip: `aca-${RUN}-trip`,
  proposal: crypto.randomUUID(),
};

/** Every source_type this file writes, so cleanup is exact and touches nothing else. */
const SOURCE = `ai_cost_attr_${RUN}`;

// ── Disposable-DB guard (the house shape; never defaults open) ─────────────────────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[ai-cost-attribution] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        "is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.",
    );
  }
}

type Row = { actor_id: string | null; user_id: string | null; source_type: string; request_id: string | null };

async function rowsFor(requestId: string): Promise<Row[]> {
  const r = await db.execute<Row>(
    sql`SELECT actor_id, user_id::text AS user_id, source_type, request_id
        FROM ai_cost_tracking WHERE request_id = ${requestId} ORDER BY created_at`,
  );
  return (r.rows ?? []) as Row[];
}

/** `trackAnthropicResponse` is fire-and-forget by design, so W6 waits for the row rather than
 *  racing it. A bounded poll — a timeout here is a real failure, not flake tolerance. */
async function awaitRow(requestId: string, tries = 40): Promise<Row[]> {
  for (let i = 0; i < tries; i++) {
    const rows = await rowsFor(requestId);
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rowsFor(requestId);
}

before(async () => {
  await assertDisposableDb();
  // W6's asker. `users.id` is a VARCHAR, so this NON-uuid id is a shape a real account genuinely
  // carries (an OIDC subject) — which is the entire point of the lane: `trips.user_id` holds it,
  // and the uuid `ai_cost_tracking.user_id` could not.
  await db.execute(sql`
    INSERT INTO users (id, email) VALUES (${ids.nonUuidAsker}, ${`aca-${RUN}@t.test`})
  `);
  // W6's fixture: a bare plan is all `loadAskScope` needs. `destination`/`start_date`/`end_date`
  // are NOT NULL and are never invented (LD 42 D12) — these are this file's own fixture values.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${ids.trip}, ${ids.nonUuidAsker}, ${`ACA ${RUN}`}, '2030-03-01', '2030-03-04', 'Kyoto, Japan')
  `);
});

after(async () => {
  await db
    .execute(sql`DELETE FROM ai_cost_tracking WHERE source_type = ${SOURCE} OR request_id = ${ids.proposal}`)
    .catch(() => {});
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.nonUuidAsker}`).catch(() => {});
});

// ── W1 ─────────────────────────────────────────────────────────────────────────────────────────
test("W1 a NON-uuid actor writes ONE row with actor_id set and user_id NULL — the row that used to vanish", async () => {
  // The negative FIRST, so this proof is about the fix and not about a change in Postgres: the very
  // id W1 is about still cannot go in the uuid column.
  let pgCode: string | null = null;
  try {
    await db.execute(
      sql`INSERT INTO ai_cost_tracking (source_type, user_id, cost) VALUES (${SOURCE}, ${ids.nonUuidActor}, 0.000001)`,
    );
  } catch (err: any) {
    // The driver's SQLSTATE, which drizzle wraps — read through `cause` exactly as the writer's
    // own log line does (`pgCodeOf`), so this proof and the log cannot disagree about where it is.
    pgCode = err?.code ?? err?.cause?.code ?? null;
  }
  assert.equal(pgCode, "22P02", "the uuid column must still refuse a non-uuid id — that is why actor_id exists");
  assert.equal(fitsUuidColumn(ids.nonUuidActor), false);

  const requestId = `w1-${RUN}`;
  await trackAICost({ sourceType: SOURCE, userId: ids.nonUuidActor, costUsd: 0.000123, requestId });

  const rows = await rowsFor(requestId);
  assert.equal(rows.length, 1, "exactly one row — the write is not retried and not duplicated");
  assert.equal(rows[0].actor_id, ids.nonUuidActor, "the acting id is recorded verbatim");
  assert.equal(rows[0].user_id, null, "the uuid column stays NULL rather than taking the row down with it");
});

// ── W2 ─────────────────────────────────────────────────────────────────────────────────────────
test("W2 a uuid-shaped actor writes BOTH columns, equal — nothing regresses for accounts that worked", async () => {
  const requestId = `w2-${RUN}`;
  assert.equal(fitsUuidColumn(ids.uuidActor), true);
  await trackAICost({ sourceType: SOURCE, userId: ids.uuidActor, costUsd: 0.000123, requestId });

  const rows = await rowsFor(requestId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, ids.uuidActor);
  assert.equal(rows[0].user_id, ids.uuidActor, "the pre-310 join keeps answering for these rows");
});

// ── W3 ─────────────────────────────────────────────────────────────────────────────────────────
test("W3 §13 — no actor means BOTH columns NULL; an unattributed row is never zero-filled", async () => {
  const requestId = `w3-${RUN}`;
  await trackAICost({ sourceType: SOURCE, costUsd: 0.000123, requestId });

  const rows = await rowsFor(requestId);
  assert.equal(rows.length, 1, "an unattributed cost is still RECORDED — the spend happened");
  assert.equal(rows[0].actor_id, null, "no placeholder, no sentinel, no empty string");
  assert.equal(rows[0].user_id, null);
});

// ── W4 ─────────────────────────────────────────────────────────────────────────────────────────
test("W4 ONE expression attributes all three eras, and a stranger matches none", async () => {
  // A PRE-310 row, written the way the table held them before this migration: actor_id NULL, the
  // uuid user_id carrying the attribution. Nothing was backfilled, so this shape is permanent.
  const legacyRequest = `w4-legacy-${RUN}`;
  await db.execute(sql`
    INSERT INTO ai_cost_tracking (source_type, request_id, user_id, cost)
    VALUES (${SOURCE}, ${legacyRequest}, ${ids.legacyUuidActor}::uuid, 0.000123)
  `);
  const uuidRequest = `w4-uuid-${RUN}`;
  await trackAICost({ sourceType: SOURCE, userId: ids.w4UuidActor, costUsd: 0.000123, requestId: uuidRequest });
  const nonUuidRequest = `w4-nonuuid-${RUN}`;
  await trackAICost({ sourceType: SOURCE, userId: ids.w4NonUuidActor, costUsd: 0.000123, requestId: nonUuidRequest });

  const requestsFor = async (actorId: string): Promise<string[]> => {
    const r = await db.execute<{ request_id: string }>(sql`
      SELECT request_id FROM ai_cost_tracking
      WHERE source_type = ${SOURCE} AND ${aiCostActorMatchesSql(actorId)}
      ORDER BY request_id
    `);
    return (r.rows ?? []).map((x) => x.request_id);
  };

  assert.deepEqual(
    await requestsFor(ids.legacyUuidActor),
    [legacyRequest],
    "a pre-310 row is still attributed, through the EXPLICIT user_id::text fallback (§13)",
  );
  assert.deepEqual(await requestsFor(ids.w4UuidActor), [uuidRequest]);
  // The probe that used to raise 22P02 and disappear into a non-fatal catch.
  assert.deepEqual(await requestsFor(ids.w4NonUuidActor), [nonUuidRequest]);
  assert.deepEqual(await requestsFor(ids.strangerActor), [], "a stranger is attributed nothing");
});

// ── W5 ─────────────────────────────────────────────────────────────────────────────────────────
test("W5 ONE writer — no other INSERT into ai_cost_tracking exists under server/ or shared/", () => {
  const AUTHOR = path.join("server", "services", "ai-cost-tracker.ts");
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      const rel = path.relative(REPO_ROOT, full);
      if (rel === AUTHOR) continue;
      const src = fs.readFileSync(full, "utf8");
      // The raw-SQL form and the drizzle form. Comments naming the table are not writes, so the
      // predicate is the INSERT itself — this guard's stated negative space is that it catches
      // INSERTs and not UPDATEs, and that it does not scan test files.
      if (/INSERT\s+INTO\s+ai_cost_tracking/i.test(src)) offenders.push(`${rel} (raw INSERT)`);
      if (/\.insert\(\s*aiCostTracking\s*\)/.test(src)) offenders.push(`${rel} (drizzle insert)`);
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  walk(path.join(REPO_ROOT, "shared"));

  assert.deepEqual(
    offenders,
    [],
    `ai_cost_tracking has exactly one writer (${AUTHOR}); a second author would attribute rows the ` +
      "one reader expression cannot read",
  );
});

// ── W6 ─────────────────────────────────────────────────────────────────────────────────────────
test("W6 D-47's cost row lands for a NON-uuid asker, driven through the real create service", async () => {
  const outcome = await createProposalFromAsk(
    {
      proposalId: ids.proposal,
      tripId: ids.trip,
      askerUserId: ids.nonUuidAsker,
      question: `w6 ${RUN}`,
    },
    {
      // The model is stubbed; `trackCost` is deliberately NOT injected, so the REAL
      // `trackAnthropicResponse` → `trackAICost` path is what writes the row.
      callModel: async () => ({
        text: JSON.stringify({ notes: [`w6 ${RUN}`] }),
        model: `stub-model-${RUN}`,
        truncated: false,
        usage: { input_tokens: 11, output_tokens: 7 },
      }),
    },
  );
  assert.equal(outcome.ok, true, "the ask itself succeeds — this proof is about the cost row it writes");

  const rows = await awaitRow(ids.proposal);
  assert.equal(rows.length, 1, "exactly one cost row for one model call — where before 310 there were none");
  assert.equal(rows[0].actor_id, ids.nonUuidAsker, "attributed to the SESSION ASKER (§14, D-47)");
  assert.equal(rows[0].user_id, null, "the uuid column cannot hold this id, and no longer has to");
  assert.equal(rows[0].source_type, "ai_task", "D-47's sourceType");
  assert.equal(rows[0].request_id, ids.proposal, "D-47's join back to the proposal, with no new column");
});

// ── W7 ─────────────────────────────────────────────────────────────────────────────────────────
test("W7 the live column matches the declaration, and migration 310 added no index", async () => {
  const cols = await db.execute<{
    data_type: string;
    character_maximum_length: number | null;
    is_nullable: string;
    column_default: string | null;
  }>(sql`
    SELECT data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_cost_tracking' AND column_name = 'actor_id'
  `);
  assert.equal(cols.rows.length, 1, "migration 310 has applied on this database");
  assert.equal(cols.rows[0].data_type, "character varying");
  assert.equal(Number(cols.rows[0].character_maximum_length), 255);
  assert.equal(cols.rows[0].is_nullable, "YES", "additive NULLABLE — §13's not-captured state");
  assert.equal(cols.rows[0].column_default, null, "NO DEFAULT — a default would invent an actor");

  const idx = await db.execute<{ indexname: string }>(sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ai_cost_tracking' ORDER BY indexname
  `);
  assert.deepEqual(
    idx.rows.map((r) => r.indexname),
    [
      "ai_cost_tracking_pkey",
      "idx_ai_cost_tracking_source_type_created",
      "idx_ai_cost_tracking_user_id_created",
    ],
    "exactly the 025b set plus the primary key — the set shared/schema.ts declares, so the " +
      "publish-time push finds nothing to drop and 310 added no index of its own",
  );

  // No DB CHECK was added (the publish-trap posture).
  const checks = await db.execute<{ conname: string }>(sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'ai_cost_tracking'::regclass AND contype = 'c'
  `);
  assert.deepEqual(checks.rows.map((r) => r.conname), [], "NO DB CHECK on this table");
});
