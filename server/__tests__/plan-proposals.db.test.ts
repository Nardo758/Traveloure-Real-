/**
 * plan-proposals.db.test.ts — WHERE AN AI PROPOSAL LIVES, AND WHAT THE EXPERT RAIL STILL IS.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-19** = option (b); ledger
 *  `2026-09-15-d19-plan-proposals`; migration 299. CLAUDE.md Locked Decision 45 (3), Locked
 *  Decision 42 D3 / D4 / D17 / D18 / D23, §13, §14, §15, §18 rule 1, §18b, §19.)
 *
 *   P1  the table, its columns and its index EXIST after migrations, and the DB agrees with
 *       `shared/schema.ts` column-for-column — the deploy-push durability rule made mechanical,
 *       derived from `getTableColumns` rather than a hand-typed list.
 *   P2  CASCADE: deleting the plan deletes its proposals; deleting the THREAD does NOT (SET NULL).
 *   P3  the EXPERT rail is untouched — `trip_suggestions.expert_id` is still NOT NULL, and no
 *       source file anywhere mints an AI sentinel author on it.
 *   P4  discard is ATOMIC — two concurrent discards produce exactly ONE write, and an APPLIED
 *       proposal can never be discarded (Locked Decision 42 D18: there is no undo).
 *   P5  §19 — no `createInsertSchema(planProposals)` denylist exists, and neither the pick nor the
 *       table is parsed from any `req.body` under `server/routes*`.
 *   P6  the routes are gated by the SAME §12 WRITE predicate item mutations use: the owner reads,
 *       a PENDING advisor cannot discard (and, on this rail, cannot read either).
 *   P7  a proposal that belongs to ANOTHER trip 404s on this trip's route — never a 403 (the
 *       probing posture), and the other trip's row is left untouched.
 *
 * STATED NEGATIVE SPACE (§18d). These proofs cover the STORE, its lifecycle refusals and the two
 * routes this lane ships. They say NOTHING about an APPLY — there is none, deliberately: the apply
 * is the charge point and belongs to punchlist D-20/D-21 — and nothing about how a proposal is
 * PRODUCED, because nothing produces one yet (the L16 Ask-AI drawer is the consumer that follows).
 * P3's grep is a SOURCE pin: it proves no file writes an AI author onto the expert rail, not that
 * no future route could. P6 drives the real router but mounts it with a stubbed session identity,
 * so it proves the gate's DECISION, never the session middleware that supplies the identity.
 *
 * NO FEE LITERALS (§8): no money is created, read or asserted anywhere in this file.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/plan-proposals.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { getTableColumns } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { planProposals } from "@shared/schema";
import {
  PLAN_PROPOSAL_STATUSES,
  PLAN_PROPOSAL_STATUS_APPLIED,
  PLAN_PROPOSAL_STATUS_DISCARDED,
  PLAN_PROPOSAL_STATUS_PROPOSED,
} from "@shared/plan-proposals";
import {
  createPlanProposal,
  discardPlanProposal,
  listPlanProposals,
} from "../services/plan-proposals.service";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// ── Disposable-DB guard (the from-state-guards shape; never defaults open) ───────────────────────
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
      `[plan-proposals] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const ids = {
  owner: `pp-${RUN}-owner`,
  stranger: `pp-${RUN}-stranger`,
  advisor: `pp-${RUN}-advisor`,
  trip: `pp-${RUN}-trip`,
  otherTrip: `pp-${RUN}-trip2`,
};
let conversationId: number | null = null;

async function seedTrip(id: string, userId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${userId}, ${`PP ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto')
  `);
}

/** Mounts the REAL trips router with a chosen session identity (the authored-item-price harness). */
async function asUser<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${ids.owner}, ${`pp-${RUN}-owner@t.test`}, 'user'),
           (${ids.stranger}, ${`pp-${RUN}-stranger@t.test`}, 'user'),
           (${ids.advisor}, ${`pp-${RUN}-advisor@t.test`}, 'local_expert')
  `);
  await seedTrip(ids.trip, ids.owner);
  await seedTrip(ids.otherTrip, ids.owner);
  const conv = await db.execute(sql`
    INSERT INTO conversations (title, user_id, trip_id)
    VALUES (${`PP ${RUN}`}, ${ids.owner}, ${ids.trip})
    RETURNING id
  `);
  conversationId = Number((conv.rows[0] as any).id);
});

after(async () => {
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id IN (${ids.trip}, ${ids.otherTrip})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${ids.trip}, ${ids.otherTrip})`).catch(() => {});
  await db.execute(sql`DELETE FROM conversations WHERE user_id = ${ids.owner}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.otherTrip})`).catch(() => {});
  await db
    .execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.stranger}, ${ids.advisor})`)
    .catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P1 — the object exists on disk and the DB agrees with `shared/schema.ts`
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P1: `plan_proposals` and its index exist, and the DB columns match shared/schema.ts exactly", async () => {
  // The DECLARATION is the licence: an object `shared/schema.ts` does not declare is dropped by
  // Replit's publish-time push and never recreated, because migration 299 is stamped by then. So
  // the expectation is DERIVED from the declaration, never hand-typed — a column added to one side
  // tomorrow fails here until a human puts it on both.
  const declared = getTableColumns(planProposals);
  const expected = new Map<string, { notNull: boolean; hasDefault: boolean }>();
  for (const col of Object.values(declared) as any[]) {
    expected.set(col.name, { notNull: !!col.notNull, hasDefault: !!col.hasDefault });
  }

  const info = await db.execute(sql`
    SELECT column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_name = 'plan_proposals'
  `);
  const actual = new Map<string, any>();
  for (const r of info.rows as any[]) actual.set(r.column_name as string, r);

  assert.ok(actual.size > 0, "plan_proposals must exist after migrations");
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    "the DB's columns and shared/schema.ts's declaration must be the same set",
  );

  for (const [name, want] of expected) {
    const got = actual.get(name);
    assert.equal(
      got.is_nullable === "NO",
      want.notNull,
      `${name}: nullability must match the declaration`,
    );
  }

  // `status` carries NO DEFAULT deliberately (migration 299): a writer always states it, so a row
  // can never exist because somebody forgot to say what it was.
  assert.equal(actual.get("status").column_default, null, "status must have NO DB default");
  assert.equal(actual.get("status").is_nullable, "NO", "status must be NOT NULL");

  // NO DB CHECK on `status` — the publish-trap posture. The value set is app-enforced.
  const checks = await db.execute(sql`
    SELECT cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'plan_proposals' AND tc.constraint_type = 'CHECK'
  `);
  // `information_schema` reports a NOT NULL as a check constraint (`status IS NOT NULL`); that is
  // the column's nullability, not a value-set CHECK, and it is what this table WANTS.
  const statusChecks = (checks.rows as any[]).filter((r) => {
    const clause = String(r.check_clause ?? "");
    return clause.includes("status") && !/IS NOT NULL/i.test(clause);
  });
  assert.equal(statusChecks.length, 0, "there must be NO DB CHECK over plan_proposals.status");

  // The index the declaration names, and NO unique index: proposals are a LOG, not an ordered list.
  const idx = await db.execute(sql`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'plan_proposals'
  `);
  const names = (idx.rows as any[]).map((r) => r.indexname as string);
  assert.ok(names.includes("plan_proposals_trip_idx"), "the trip_id index must exist");
  const uniques = (idx.rows as any[]).filter(
    (r) => String(r.indexdef).includes("UNIQUE") && !String(r.indexdef).includes("_pkey"),
  );
  assert.equal(uniques.length, 0, "no UNIQUE index — proposals are a log, not an ordered list");

  // NO payment / charge / claim column. The charge point is punchlist D-20/D-21 and adds its own.
  for (const name of actual.keys()) {
    assert.ok(
      !/pay|charge|claim|stripe|amount|price|fee|cents|entitle/i.test(name),
      `plan_proposals must carry no money column; found '${name}' (see punchlist D-20/D-21)`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P2 — the FK postures: the plan CASCADEs, the thread does NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P2: deleting the plan deletes its proposals; deleting the thread only clears the link", async () => {
  const tripId = `pp-${RUN}-cascade`;
  await seedTrip(tripId, ids.owner);
  const conv = await db.execute(sql`
    INSERT INTO conversations (title, user_id, trip_id) VALUES ('c', ${ids.owner}, ${tripId}) RETURNING id
  `);
  const convId = Number((conv.rows[0] as any).id);

  const kept = await createPlanProposal({ tripId: ids.trip, conversationId: convId });
  const doomed = await createPlanProposal({ tripId, conversationId: convId });

  // SET NULL: deleting a THREAD must never delete the proposals it produced.
  await db.execute(sql`DELETE FROM conversations WHERE id = ${convId}`);
  const afterThread = await db.execute(
    sql`SELECT id, conversation_id FROM plan_proposals WHERE id IN (${kept.id}, ${doomed.id})`,
  );
  assert.equal(afterThread.rows.length, 2, "a deleted thread must not delete its proposals");
  for (const r of afterThread.rows as any[]) {
    assert.equal(r.conversation_id, null, "the link is cleared, the row survives (§13: names no thread)");
  }

  // CASCADE: a proposal is about ONE plan and has no meaning without it.
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`);
  const afterTrip = await db.execute(sql`SELECT id FROM plan_proposals WHERE id = ${doomed.id}`);
  assert.equal(afterTrip.rows.length, 0, "deleting the plan must delete its proposals");
  const survivor = await db.execute(sql`SELECT id FROM plan_proposals WHERE id = ${kept.id}`);
  assert.equal(survivor.rows.length, 1, "another plan's proposal is untouched");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P3 — the EXPERT rail is untouched, and there is no AI sentinel author anywhere
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P3: `trip_suggestions.expert_id` is still NOT NULL and no source mints an AI author on it", async () => {
  const col = await db.execute(sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'trip_suggestions' AND column_name = 'expert_id'
  `);
  assert.equal((col.rows[0] as any)?.is_nullable, "NO", "the expert rail's identity column is unchanged");

  // The whole reason D-19 chose a new table over widening this one: an AI author here would have to
  // be a sentinel `users` row, and afterwards would be indistinguishable from a real expert.
  // SOURCE PIN over the file SET, not a call-site count (operating procedure §3).
  const roots = ["server", "shared", "client/src"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        walk(rel);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        files.push(rel);
      }
    }
  };
  for (const r of roots) walk(r);

  const offenders: string[] = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    // A write to the expert rail whose author is a machine: any `tripSuggestions` insert in the
    // same file as an ai/system/bot sentinel expert id.
    if (!/tripSuggestions|trip_suggestions/.test(src)) continue;
    if (/expertId\s*:\s*["'`](ai|system|bot|assistant|claude|concierge)/i.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], "no file may mint an AI sentinel author on the expert rail");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P4 — the STATEMENT is the guard (§15, §18b)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P4: two concurrent discards produce exactly ONE write, and an applied proposal is never discardable", async () => {
  const row = await createPlanProposal({ tripId: ids.trip, question: "move day two earlier?" });
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_PROPOSED, "born proposed, stated by the writer");
  assert.equal(row.discardedAt, null, "a born proposal carries no discard stamp");

  const [a, b] = await Promise.all([
    discardPlanProposal(row.id, ids.trip),
    discardPlanProposal(row.id, ids.trip),
  ]);
  const winners = [a, b].filter(Boolean);
  assert.equal(winners.length, 1, "exactly one concurrent discard may win");
  assert.equal(winners[0]!.status, PLAN_PROPOSAL_STATUS_DISCARDED);
  assert.ok(winners[0]!.discardedAt, "the winner is stamped");

  // A third attempt after the fact is the same no-op — the guard is the WHERE clause, not a memory.
  assert.equal(await discardPlanProposal(row.id, ids.trip), undefined);

  // An APPLIED proposal can never be discarded: the apply changed the plan's items, and Locked
  // Decision 42 D18 is explicit that there is no undo. (Nothing in this lane writes `applied` —
  // the fixture sets it directly, which is exactly why the refusal has to be proven here.)
  const applied = await createPlanProposal({ tripId: ids.trip });
  await db.execute(
    sql`UPDATE plan_proposals SET status = ${PLAN_PROPOSAL_STATUS_APPLIED}, applied_at = now() WHERE id = ${applied.id}`,
  );
  assert.equal(
    await discardPlanProposal(applied.id, ids.trip),
    undefined,
    "an applied proposal is not discardable",
  );
  const still = await db.execute(sql`SELECT status, discarded_at FROM plan_proposals WHERE id = ${applied.id}`);
  assert.equal((still.rows[0] as any).status, PLAN_PROPOSAL_STATUS_APPLIED, "and the row is unchanged");
  assert.equal((still.rows[0] as any).discarded_at, null);

  // The whole log comes back, newest first — a discarded row is a record of what was refused.
  const log = await listPlanProposals(ids.trip);
  const statuses = new Set(log.map((p) => p.status));
  assert.ok(statuses.has(PLAN_PROPOSAL_STATUS_DISCARDED), "discarded rows stay in the log");
  assert.ok(statuses.has(PLAN_PROPOSAL_STATUS_APPLIED), "applied rows stay in the log");
  for (const p of log) {
    assert.ok(
      (PLAN_PROPOSAL_STATUSES as readonly string[]).includes(p.status),
      `unknown status '${p.status}' — the value set is app-enforced and stated once`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P5 — §19: the admission is an allowlist, and it reaches no request body
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P5: no denylist insert schema exists, and nothing under server/routes* parses one off req.body", () => {
  // Comments stripped on BOTH sides: the declaration's own prose names the schema it deliberately
  // does not create, and a pin that reads a comment is pinning a sentence, not the code.
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const schemaSrc = stripComments(
    fs.readFileSync(path.join(REPO_ROOT, "shared/schema.ts"), "utf8"),
  );
  assert.ok(
    !/createInsertSchema\(planProposals\)\s*\n?\s*\.omit/.test(schemaSrc),
    "§19: there must be NO `.omit()` denylist over planProposals — a new privileged column would be client-settable by default",
  );
  assert.ok(
    /createInsertSchema\(planProposals\)[\s\S]{0,80}\.pick\(/.test(schemaSrc),
    "the one admission schema must be pick-based",
  );
  assert.ok(
    !/insertPlanProposalSchema/.test(schemaSrc),
    "no `insertPlanProposalSchema` may exist — there is nothing for a body to be parsed against",
  );

  // The file SET under server/routes*, comments stripped (operating procedure §3).
  const routeFiles: string[] = ["server/routes.ts"];
  const dir = path.join(REPO_ROOT, "server/routes");
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".ts")) routeFiles.push(`server/routes/${e.name}`);
  }
  assert.ok(routeFiles.length > 5, "the route file set must be non-trivial (pin derives from the set)");

  for (const rel of routeFiles) {
    const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
    assert.ok(
      !/planProposalCreateSchema[\s\S]{0,200}?req\.body/.test(src),
      `${rel}: the create allowlist must never be parsed from a request body (§19; the writer is server-side only)`,
    );
    assert.ok(
      !/insertPlanProposalSchema/.test(src),
      `${rel}: no denylist insert schema for plan proposals may be referenced`,
    );
    assert.ok(
      !/db\s*\n?\s*\.insert\(planProposals\)/.test(src),
      `${rel}: routes must not insert proposals directly — the service is the one writer (§18 rule 1)`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P6 — the gate is the §12 WRITE predicate item mutations use
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P6: the owner reads and discards; a PENDING advisor does neither", async () => {
  const mine = await createPlanProposal({ tripId: ids.trip, question: `p6 ${RUN}` });

  // The OWNER.
  await asUser(ids.owner, async (base) => {
    const res = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(res.status, 200, "the owner may read their plan's proposals");
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.proposals) && body.proposals.some((p: any) => p.id === mine.id));
  });

  // A STRANGER — no ownership, no advisor row.
  await asUser(ids.stranger, async (base) => {
    const res = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(res.status, 403, "a stranger is refused by the trip gate");
  });

  // A PENDING advisor: §12 — "a PENDING advisor may not write". The gate is the shared
  // `requireWriteAccess` predicate, so `pending` does not pass.
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${`pp-${RUN}-adv`}, ${ids.trip}, ${ids.advisor}, 'pending')
  `);
  await asUser(ids.advisor, async (base) => {
    const discard = await fetch(`${base}/api/trips/${ids.trip}/proposals/${mine.id}/discard`, {
      method: "POST",
    });
    assert.equal(discard.status, 403, "a pending advisor may not discard");
    const read = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(read.status, 403, "and on this rail may not read either");
  });
  const untouched = await db.execute(sql`SELECT status FROM plan_proposals WHERE id = ${mine.id}`);
  assert.equal(
    (untouched.rows[0] as any).status,
    PLAN_PROPOSAL_STATUS_PROPOSED,
    "a refusal writes nothing",
  );

  // Accepting flips the same advisor into the WRITE allow-list — one predicate, one behaviour.
  await db.execute(
    sql`UPDATE trip_expert_advisors SET status = 'accepted' WHERE trip_id = ${ids.trip} AND local_expert_id = ${ids.advisor}`,
  );
  await asUser(ids.advisor, async (base) => {
    const read = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(read.status, 200, "an accepted advisor passes the same gate");
  });

  // The owner discards it through the route, and the route is idempotent-in-report afterwards.
  await asUser(ids.owner, async (base) => {
    const first = await fetch(`${base}/api/trips/${ids.trip}/proposals/${mine.id}/discard`, {
      method: "POST",
    });
    assert.equal(first.status, 200);
    const again = await fetch(`${base}/api/trips/${ids.trip}/proposals/${mine.id}/discard`, {
      method: "POST",
    });
    assert.equal(again.status, 404, "a second discard is the same 404 as every other refusal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// P7 — a proposal on another trip is 404, never 403, and is left alone
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("P7: a proposal belonging to another trip 404s on this trip's route and is untouched", async () => {
  const other = await createPlanProposal({ tripId: ids.otherTrip, question: `p7 ${RUN}` });

  await asUser(ids.owner, async (base) => {
    // The caller OWNS both trips — so a 403 here would be wrong for a second reason: this is not an
    // authorization failure at all, it is an address that does not resolve on this plan.
    const res = await fetch(`${base}/api/trips/${ids.trip}/proposals/${other.id}/discard`, {
      method: "POST",
    });
    assert.equal(res.status, 404, "not on this trip ⇒ 404, never 403 (the probing posture)");

    // A proposal id that exists nowhere answers identically — the two cases are indistinguishable.
    const ghost = await fetch(
      `${base}/api/trips/${ids.trip}/proposals/pp-${RUN}-nope/discard`,
      { method: "POST" },
    );
    assert.equal(ghost.status, 404, "and so does an id that names nothing");

    // The other plan's log never carried it either way round.
    const listed = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    const body = (await listed.json()) as any;
    assert.ok(
      !body.proposals.some((p: any) => p.id === other.id),
      "a plan's log carries only its own proposals",
    );
  });

  const still = await db.execute(sql`SELECT status FROM plan_proposals WHERE id = ${other.id}`);
  assert.equal(
    (still.rows[0] as any).status,
    PLAN_PROPOSAL_STATUS_PROPOSED,
    "the other trip's row is untouched",
  );
});
