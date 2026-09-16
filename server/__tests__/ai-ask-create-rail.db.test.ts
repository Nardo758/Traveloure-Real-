/**
 * ai-ask-create-rail.db.test.ts — THE FIVE PROPOSAL RAILS AS L16 LANE 1 LEAVES THEM.
 *
 * (decision-maker rulings 2026-09-16, punchlist **D-45** to **D-50**; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. Brief of record: `docs/design/ASK_AI_DRAWER_BRIEF.md` §4.
 *  CLAUDE.md Locked Decision 42 D16 / D17, Locked Decision 44 D19, Locked Decision 45 (3), §13,
 *  §14, §18 rule 1, §19. **No schema change, no migration.**)
 *
 *   A1  the CREATE rail is on the SAME §12 WRITE gate the read and discard rails run: the owner
 *       reaches it, an ACCEPTED advisor reaches it (D-48 leaves ASK at the write tier), a PENDING
 *       advisor and a stranger do not.
 *   A2  §19 — the body is `{ question }` and an unknown key is REFUSED, not stripped; a blank
 *       question is not a question.
 *   A3  **THE MODEL CALL IS NOT BUILT, AND THE RAIL SAYS SO** — an honest 503 naming the reason,
 *       and **NO `plan_proposals` row is written** by any of it (§13: an omitted capability is
 *       stated, never faked).
 *   A4  D-46 (i) — the in-flight marker is RELEASED on every path out, so a second ask is not
 *       wedged behind the first.
 *   A5  **D-48, THE AMENDMENT** — PAY and APPLY are OWNER-ONLY at the ROUTE. An ACCEPTED advisor,
 *       who may ask, read and discard, is refused by BOTH. This is the proof that the narrowing is
 *       at the route and not in a render rule (LD 42 D16's own wording; LD 44 D19 from the other
 *       direction — an advisor who paid would pay with their own card).
 *   A6  D-48's READ half — `GET …/proposals` carries a server-resolved `aiTask` block, and §13:
 *       an unanswerable field is OMITTED rather than guessed, so neither "covered" nor "not
 *       covered" is claimed without an answer.
 *   A7  D-49 — the apply path carries the re-finalize call, AFTER the transaction and LOUD
 *       (a static pin over the service file: the call is outside `db.transaction` and the failure
 *       log names both ids).
 *
 * STATED NEGATIVE SPACE (§18d), and it is the load-bearing half. **Nothing here proves the create
 * rail produces a proposal, because it does not yet** — the prompt builder and the model call were
 * stopped by instruction and their design is written out in
 * `docs/lane-reports/2026-09-16-l16-lane1-create-rail.md` §4 for the decision-maker to read first.
 * A3 is a proof of an HONEST REFUSAL, not of a working feature. These proofs also say nothing
 * about the rate limits' numeric thresholds (exercising them here would either depend on a
 * literal count or take a real window — the limiter's behaviour is proven purely in
 * `ai-ask-create-rail.test.ts`), nothing about Stripe, and nothing about the session middleware
 * that supplies an identity (the harness stubs it, so the GATE's decision is what is proven).
 *
 * NO FEE LITERALS (§8): no amount is created, read or asserted anywhere in this file. A6 asserts
 * the SHAPE of the price field, never a value.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/ai-ask-create-rail.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createPlanProposal } from "../services/plan-proposals.service";
import { __resetAiAskInFlight } from "../services/ai-ask-inflight";
import { __resetMessageRateLimiter } from "../infrastructure/message-rate-limiter";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ── Disposable-DB guard (the plan-proposals shape; never defaults open) ─────────────────────────
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
      `[ai-ask-create-rail] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const ids = {
  owner: `aac-${RUN}-owner`,
  stranger: `aac-${RUN}-stranger`,
  advisor: `aac-${RUN}-advisor`,
  trip: `aac-${RUN}-trip`,
};

/** Mounts the REAL trips router with a chosen session identity (the plan-proposals harness). */
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

const ask = (base: string, tripId: string, body: unknown) =>
  fetch(`${base}/api/trips/${tripId}/proposals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function proposalCount(tripId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM plan_proposals WHERE trip_id = ${tripId}`);
  return Number((r.rows[0] as any).n);
}

async function setAdvisorStatus(status: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${`aac-${RUN}-adv`}, ${ids.trip}, ${ids.advisor}, ${status})
    ON CONFLICT (trip_id, local_expert_id) DO UPDATE SET status = ${status}
  `);
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${ids.owner}, ${`aac-${RUN}-owner@t.test`}, 'user'),
           (${ids.stranger}, ${`aac-${RUN}-stranger@t.test`}, 'user'),
           (${ids.advisor}, ${`aac-${RUN}-advisor@t.test`}, 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${ids.trip}, ${ids.owner}, ${`AAC ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto')
  `);
  // The loopback bypass every limiter honours — the harness drives from 127.0.0.1, so without this
  // a suite of asks would trip the AI-ask caps mid-run (the messaging limiter's own CI posture).
  process.env.RATE_LIMIT_LOOPBACK_SKIP = "1";
});

after(async () => {
  delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
  __resetAiAskInFlight();
  __resetMessageRateLimiter();
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db
    .execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.stranger}, ${ids.advisor})`)
    .catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A1 — the CREATE rail is on the shared §12 WRITE gate
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A1: owner and ACCEPTED advisor may ask; a PENDING advisor and a stranger may not", async () => {
  // The owner: past the gate. (The terminal answer is A3's honest 503, not a 403.)
  await asUser(ids.owner, async (base) => {
    const res = await ask(base, ids.trip, { question: `a1 ${RUN}` });
    assert.notEqual(res.status, 403, "the owner must pass the gate");
    assert.notEqual(res.status, 401);
  });

  await asUser(ids.stranger, async (base) => {
    const res = await ask(base, ids.trip, { question: `a1 ${RUN}` });
    assert.equal(res.status, 403, "a stranger is refused by the trip gate");
  });

  // §12 — "a PENDING advisor may not write". ASK is a write-tier action (D-48 left it there).
  await setAdvisorStatus("pending");
  await asUser(ids.advisor, async (base) => {
    const res = await ask(base, ids.trip, { question: `a1 ${RUN}` });
    assert.equal(res.status, 403, "a pending advisor may not ask");
  });

  // Accepting flips the SAME advisor into the WRITE allow-list — one predicate, one behaviour.
  await setAdvisorStatus("accepted");
  await asUser(ids.advisor, async (base) => {
    const res = await ask(base, ids.trip, { question: `a1 ${RUN}` });
    assert.notEqual(res.status, 403, "D-48 leaves ASK at the §12 WRITE tier");
  });

  assert.equal(await proposalCount(ids.trip), 0, "and none of it wrote a proposal row");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A2 — §19: the body allowlist, at the route
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A2: the ask body is `{ question }`; an unknown key is REFUSED and a blank one is not a question", async () => {
  await asUser(ids.owner, async (base) => {
    for (const body of [
      {},
      { question: "   " },
      { question: "q", tripId: "someone-elses" },
      { question: "q", modelTier: "lite" },
      { question: "q", proposal: { additions: [{ title: "planted" }] } },
      { question: "q", conversationId: 1 },
    ]) {
      const res = await ask(base, ids.trip, body);
      assert.equal(
        res.status,
        400,
        `§19: ${JSON.stringify(body)} must be refused at the door, never silently stripped`,
      );
    }
  });
  assert.equal(await proposalCount(ids.trip), 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A3 — the model call is NOT BUILT, and the rail says so
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A3: a well-formed ask answers an honest 503 naming the reason, and writes NO row", async () => {
  const res = await asUser(ids.owner, async (base) => {
    const r = await ask(base, ids.trip, { question: `What should we do on day 2? ${RUN}` });
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(res.status, 503, JSON.stringify(res.body));
  assert.equal(
    res.body.reason,
    "model_call_not_built",
    "§13: the capability is stated as absent — never an empty proposal, which would be an answer nobody gave",
  );
  assert.equal(await proposalCount(ids.trip), 0, "a refusal writes nothing");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A4 — D-46 (i): the marker is released on every path out
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A4: the in-flight marker does not survive an ask, so a second ask is not wedged", async () => {
  await asUser(ids.owner, async (base) => {
    const first = await ask(base, ids.trip, { question: `a4-1 ${RUN}` });
    assert.equal(first.status, 503);
    const second = await ask(base, ids.trip, { question: `a4-2 ${RUN}` });
    assert.notEqual(
      second.status,
      409,
      "the marker is cleared in a `finally` — a wedged plan is the failure the TTL exists for, not the norm",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A5 — D-48, THE AMENDMENT: pay and apply are OWNER-ONLY at the ROUTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A5: an ACCEPTED advisor may ask, read and discard — and is refused by PAY and by APPLY", async () => {
  await setAdvisorStatus("accepted");
  const staged = await createPlanProposal({ tripId: ids.trip, question: `a5 ${RUN}` });

  await asUser(ids.advisor, async (base) => {
    // Still admitted where the ruling leaves them.
    const read = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(read.status, 200, "D-48: READ stays at the §12 WRITE tier");

    // Refused where the ruling narrows. THE ROUTE IS THE POLICY (LD 42 D16, the §14 posture) —
    // this is not a render rule, and hiding the control while admitting the request is the gap
    // that rule names.
    const pay = await fetch(`${base}/api/trips/${ids.trip}/proposals/${staged.id}/pay`, { method: "POST" });
    assert.equal(pay.status, 403, "D-48: PAY is owner-only (LD 44 D19 — an advisor would pay with their own card)");

    const apply = await fetch(`${base}/api/trips/${ids.trip}/proposals/${staged.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(apply.status, 403, "D-48 AMENDED: APPLY is owner-only too — the consent back door is closed");

    // And DISCARD is still theirs, which is what makes the narrowing a narrowing rather than a ban.
    const discard = await fetch(`${base}/api/trips/${ids.trip}/proposals/${staged.id}/discard`, {
      method: "POST",
    });
    assert.equal(discard.status, 200, "D-48: DISCARD stays at the §12 WRITE tier");
  });

  const [row] = (
    await db.execute(sql`SELECT status, charge_basis FROM plan_proposals WHERE id = ${staged.id}`)
  ).rows as any[];
  assert.equal(row.status, "discarded");
  assert.equal(row.charge_basis, null, "and no refusal above left a charge behind");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A6 — D-48's READ half: the aiTask block, server-resolved
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A6: GET …/proposals carries a server-resolved aiTask block, and omits what it cannot answer", async () => {
  const body = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.trip}/proposals`);
    assert.equal(r.status, 200);
    return (await r.json()) as any;
  });
  assert.ok(Array.isArray(body.proposals), "the log is still the thing the caller asked for");
  assert.ok(body.aiTask && typeof body.aiTask === "object", "the coverage/price block rides the same response");

  // §13 in the direction that matters. Whatever the environment can answer, it answers with a REAL
  // value; whatever it cannot, it OMITS. Neither field may be present-but-meaningless: an absent
  // `coveredByTripPass` is "we have no answer", which is neither covered nor not covered, and an
  // absent `priceCents` is "the band did not resolve", never `0` (which would read as free).
  if ("coveredByTripPass" in body.aiTask) {
    assert.equal(typeof body.aiTask.coveredByTripPass, "boolean");
    assert.equal(body.aiTask.coveredByTripPass, false, "this fixture plan carries no Trip Pass");
  }
  if ("priceCents" in body.aiTask) {
    assert.equal(typeof body.aiTask.priceCents, "number");
    assert.ok(body.aiTask.priceCents > 0, "a resolved price is a real one — a zero would be a claim (§8/§13)");
  }

  // The route resolves BOTH through the existing shared readers — no second entitlement rail and
  // no second fee read (§18 rule 1). Pinned on the source, comments stripped.
  const routes = src("server/routes/trips.routes.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(routes, /aiTask\.coveredByTripPass = await coversAction\(tripId, "ai_task"\)/);
  assert.match(routes, /aiTask\.priceCents = await resolveAiTaskChargeCents\(\)/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A7 — D-49: the re-finalize call is AFTER the transaction, and its failure is LOUD
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A7: applyPlanProposal re-finalizes AFTER the commit, best-effort, naming both ids on failure", () => {
  const service = src("server/services/proposal-charge.service.ts");
  const fn = service.slice(service.indexOf("export async function applyPlanProposal"));

  const txStart = fn.indexOf("db.transaction(");
  const callAt = fn.indexOf("reFinalizeIfCurrentlyFinal(");
  assert.ok(txStart > -1 && callAt > -1, "both the transaction and the re-finalize call must be present");

  // AFTER the transaction's closing `});`, never inside it — a re-finalize failure must never roll
  // back a committed, possibly CHARGED apply (§15b: an ancillary effect may not break the
  // operation that authorizes it).
  const txEnd = fn.indexOf("\n  });", txStart);
  assert.ok(txEnd > -1, "the transaction's close must be findable");
  assert.ok(callAt > txEnd, "D-49: the call sits OUTSIDE the transaction");

  // And LOUD — the ruling's one amendment to the four existing callers' shape.
  const tail = fn.slice(txEnd);
  assert.match(tail, /console\.error\(/, "a failure is logged, never swallowed");
  assert.match(tail, /proposalId: params\.proposalId/, "the log names the proposal");
  assert.match(tail, /tripId: params\.tripId/, "and the trip — so a card that did not advance is reconcilable");
});
