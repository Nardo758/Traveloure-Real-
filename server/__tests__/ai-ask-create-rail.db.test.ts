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
 *   A3  **RE-PINNED BY LANE 1b** (ledger `2026-09-16-l16-lane1b-model-call`). It used to pin the
 *       honest `503 model_call_not_built`; the model call now exists, so it pins the BUILT
 *       behaviour — a well-formed ask writes exactly ONE `plan_proposals` row carrying the
 *       PRE-MINTED id (D-46 (i)) — and asserts the old refusal string is gone from the route.
 *       The case was re-pinned, never deleted: a proof of a refusal that no longer happens is a
 *       proof of nothing.
 *   A4  D-46 (i) — the in-flight marker is RELEASED on every path out, so a second ask is not
 *       wedged behind the first.
 *   A5  **D-48, THE AMENDMENT** — PAY and APPLY are OWNER-ONLY at the ROUTE. An ACCEPTED advisor,
 *       who may ask, read and discard, is refused by BOTH. This is the proof that the narrowing is
 *       at the route and not in a render rule (LD 42 D16's own wording; LD 44 D19 from the other
 *       direction — an advisor who paid would pay with their own card).
 *   A6  D-48's READ half — `GET …/proposals` carries a server-resolved `aiTask` block, and §13:
 *       an unanswerable field is OMITTED rather than guessed, so neither "covered" nor "not
 *       covered" is claimed without an answer.
 *   A7  D-49 — `applyPlanProposal` is driven with a re-finalize that THROWS: the apply still
 *       resolves, the row is `applied`, and the error line names both ids. A behavioural proof
 *       through the injected seam (review finding 4, ledger `2026-09-16-l16-lane1-review-fixes`)
 *       — it replaced a string-index pin over the service file, which proved the shape of the
 *       source and nothing about what runs.
 *
 * ── LANE 1b — THE MODEL CALL (ledger `2026-09-16-l16-lane1b-model-call`) ─────────────────────
 *   A8  **THE HAPPY PATH, AND D-47's THREE VALUES.** One ask ⇒ exactly ONE `plan_proposals` row
 *       carrying the pre-minted id, and exactly ONE `ai_cost_tracking` row whose `source_type` is
 *       `ai_task`, whose `user_id` is the SESSION ASKER (never the plan's owner) and whose
 *       `request_id` is that same pre-minted id — the join D-47 exists for, with no new column.
 *   A9  **THE INPUT SCOPE (D-50), BOTH DIRECTIONS.** Protected rows reach the model MARKED AS
 *       CONSTRAINTS (LD 42 D3), and every excluded fact — `trips.expert_notes`, a guest's email
 *       and dietary note, another traveler's plan, the asker's own `users` row, any fee band —
 *       is absent from the prompt that was actually sent. Asserted on the REAL prompt strings the
 *       transport received, not on a rebuilt copy.
 *  A10  **THE SANITISER AT THE RAIL (D-50 a/b, LD 42 D3).** A model price is OVERWRITTEN by the
 *       catalog row's own; an addition naming a listing this trip's catalog does not carry is
 *       DROPPED (not a failed ask); and a `replaces` naming a protected row never reaches the
 *       stored row.
 *  A11  **THE FAILURE PATHS (§4.4's table).** A model error writes NO proposal row and releases
 *       the marker, and writes a cost row IFF the SDK surfaced usage — where it did not, the
 *       honest record is NO row and a log line saying why (§13), never a fabricated token count.
 *  A12  **D-46 (i) — A DOUBLE SUBMIT IS ONE MODEL CALL.** A second ask arriving while the first
 *       is still in the model answers 409 NAMING the in-flight proposal id, and the transport is
 *       entered exactly once.
 *  A13  **PAID vs FREE CATALOG INCLUSION (D-50, LD 41 (b)/(c)).** A plan HOLDING items is the
 *       paid task and its prompt carries the catalog; an EMPTY plan defers to the free draft
 *       (LD 41 (b)) and its prompt carries NO catalog and SAYS SO. The decision is the ONE
 *       existing `decideAiDraftEligibility`, never a second empty-plan test.
 *
 * **NO REAL MODEL CALL IS EVER MADE.** `__setAiTaskModelTransport` replaces the transport for the
 * whole file (and refuses to work in production), and the DEFAULT stub installed in `before()`
 * FAILS — so a case that does not deliberately install an answering stub cannot accidentally
 * succeed, and A1/A2/A4's "no row was written" assertions keep meaning what they meant.
 *
 * STATED NEGATIVE SPACE (§18d), and it is the load-bearing half. These proofs say nothing about
 * the QUALITY of a model answer — every answer here is a fixture, so what is proven is what the
 * SERVER does with one, never what a model would produce. They say nothing about the rate limits'
 * numeric thresholds (exercising them here would either depend on a literal count or take a real
 * window — the limiter's behaviour is proven purely in `ai-ask-create-rail.test.ts`), nothing
 * about Stripe, nothing about the real Anthropic SDK's error shapes (A11 drives the module's own
 * `AiTaskModelError`, which is the contract the rail reads — the SDK's own usage-on-error
 * behaviour is not something CI can assert), and nothing about the session middleware that
 * supplies an identity (the harness stubs it, so the GATE's decision is what is proven).
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
import { applyPlanProposal } from "../services/proposal-charge.service";
import { PLAN_PROPOSAL_STATUS_APPLIED } from "@shared/plan-proposals";
import { __resetAiAskInFlight } from "../services/ai-ask-inflight";
import {
  AiTaskModelError,
  __setAiTaskModelTransport,
  type AiTaskModelResult,
  type AiTaskModelTransport,
} from "../services/ai-task-model-client";
import { __resetMessageRateLimiter } from "../infrastructure/message-rate-limiter";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);
/** The asker's own email — A9 proves it never reaches a model (§14). */
const ownerEmail = `aac-${RUN}-owner@t.test`;
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
  // ── USER IDS ARE UUID-SHAPED HERE, DELIBERATELY, AND IT IS A FINDING, NOT A CONVENIENCE ─────
  // `users.id` is `varchar DEFAULT gen_random_uuid()`, so a real account's id is a uuid — but
  // `ai_cost_tracking.user_id` is a **uuid COLUMN** (migration `025b_ai_cost_tracking.sql`), and
  // `trackAICost` swallows its own insert error by design (*"logging failures should not block the
  // request"*). So a user whose id is NOT uuid-shaped — an OIDC/Replit subject, or any legacy row —
  // loses the WHOLE cost row silently, D-47's attribution included. These fixtures therefore use
  // the shape production actually mints, so A8/A11 prove the rail rather than the mismatch. The
  // mismatch itself is recorded as a finding in `docs/lane-reports/2026-09-16-l16-lane1b-model-call.md`
  // and filed in `docs/PUNCHLIST.md`; it is pre-existing, it affects every caller of that table,
  // and closing it needs a migration this lane was ruled not to take.
  owner: crypto.randomUUID(),
  stranger: crypto.randomUUID(),
  advisor: crypto.randomUUID(),
  trip: `aac-${RUN}-trip`,
  /** Lane 1b: a SECOND plan of the owner's that holds nothing — A13's free-draft-deference case. */
  emptyTrip: `aac-${RUN}-empty`,
  /** Lane 1b: a plan belonging to the STRANGER, so A9 can prove another plan never leaks in. */
  otherTrip: `aac-${RUN}-other`,
  plainItem: `aac-${RUN}-item-plain`,
  expertItem: `aac-${RUN}-item-expert`,
  bookedItem: `aac-${RUN}-item-booked`,
  liveListing: `aac-${RUN}-svc-live`,
  pausedListing: `aac-${RUN}-svc-paused`,
  experienceType: `aac-${RUN}-etype`,
  event: `aac-${RUN}-event`,
  invite: `aac-${RUN}-invite`,
};

// ── The secrets A9 proves never reach a model ─────────────────────────────────────────────────
// Each is a distinctive, greppable string planted in a column the exclusion list names, so "it is
// not in the prompt" is a real assertion rather than a shape check.
const SECRETS = {
  /** `trips.expert_notes` — the Workstation's PRIVATE build notes (Locked Decision 21). */
  buildNotes: `PRIVATE-BUILD-NOTES-${RUN}`,
  /** A guest's email and dietary note — the PII class LD 37 / LD 42 D9 keep behind the owner tier. */
  guestEmail: `guest-${RUN}@invited.test`,
  guestDiet: `SHELLFISH-ALLERGY-${RUN}`,
  /** An item on ANOTHER traveler's plan (§14's read clause). */
  otherPlanItem: `OTHER-TRAVELER-ITEM-${RUN}`,
  /** The expert's own words on a protected row (LD 42 D4 — the model is told the row is
   *  untouchable, never what the expert wrote on it). */
  expertNote: `EXPERT-WORDS-${RUN}`,
};

/** The listing price the catalog states. A10 proves the model's number never survives it. */
const CATALOG_PRICE = "137.50";
/** What the model tries to claim instead. It must appear NOWHERE on the stored row. */
const MODEL_INVENTED_PRICE = "12.34";

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

// ── THE MODEL TRANSPORT SEAM — NO REAL CALL IS EVER MADE ─────────────────────────────────────
// `__setAiTaskModelTransport` is the module's own test-only seam (it throws in production). The
// DEFAULT installed in `before()` FAILS with no usage, which is exactly lane 1's behaviour from the
// caller's point of view: a 502 and no row. A case that wants an answer installs its own.
interface CapturedCall {
  system: string;
  user: string;
  model: string;
}
let captured: CapturedCall[] = [];

const failingTransport: AiTaskModelTransport = async (req) => {
  captured.push({ system: req.system, user: req.user, model: req.model });
  throw new AiTaskModelError("model_call_failed", `no stub installed (${RUN})`);
};

/** Install a transport for the duration of one case, then restore the failing default. */
async function withModel<T>(transport: AiTaskModelTransport, fn: () => Promise<T>): Promise<T> {
  __setAiTaskModelTransport(transport);
  try {
    return await fn();
  } finally {
    __setAiTaskModelTransport(failingTransport);
  }
}

/** A transport that answers with one fixed change set and a fixed usage. */
function answering(changeSet: unknown, usage?: { input_tokens: number; output_tokens: number }): AiTaskModelTransport {
  return async (req) => {
    captured.push({ system: req.system, user: req.user, model: req.model });
    const result: AiTaskModelResult = {
      text: JSON.stringify(changeSet),
      model: req.model,
      truncated: false,
      ...(usage ? { usage } : {}),
    };
    return result;
  };
}

/**
 * `trackAnthropicResponse` is fire-and-forget by design (a cost-log failure never breaks a
 * request), so the row can land just after the HTTP response. Poll briefly rather than assert on a
 * race — and FAIL if it never lands, which is the thing worth knowing.
 */
async function costRowsFor(requestId: string, expect: number): Promise<any[]> {
  for (let i = 0; i < 40; i++) {
    const r = await db.execute(
      sql`SELECT source_type, user_id, request_id, model_used, tokens_in, tokens_out
          FROM ai_cost_tracking WHERE request_id = ${requestId}`,
    );
    if (r.rows.length >= expect) return r.rows as any[];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return [];
}

/** Every `ai_task` cost row this run's asker caused, newest first. */
async function askerCostRows(): Promise<any[]> {
  const r = await db.execute(
    sql`SELECT request_id, user_id, source_type FROM ai_cost_tracking
        WHERE user_id = ${ids.owner} AND source_type = 'ai_task' ORDER BY created_at DESC`,
  );
  return r.rows as any[];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${ids.owner}, ${ownerEmail}, 'user'),
           (${ids.stranger}, ${`aac-${RUN}-stranger@t.test`}, 'user'),
           (${ids.advisor}, ${`aac-${RUN}-advisor@t.test`}, 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination, expert_notes, timezone, adults)
    VALUES (${ids.trip}, ${ids.owner}, ${`AAC ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto, Japan',
            ${SECRETS.buildNotes}, 'Asia/Tokyo', 2)
  `);
  // A13's free-draft-deference case: the owner's OTHER plan, holding nothing.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${ids.emptyTrip}, ${ids.owner}, ${`AAC empty ${RUN}`}, '2030-02-01', '2030-02-03', 'Kyoto, Japan')
  `);
  // A9's cross-plan case: a DIFFERENT traveler's plan, with a distinctive item on it.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${ids.otherTrip}, ${ids.stranger}, ${`AAC other ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto, Japan')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status)
    VALUES (${`aac-${RUN}-other-item`}, ${ids.otherTrip}, ${SECRETS.otherPlanItem}, 1, 'in_planning')
  `);

  // THE PLAN'S OWN ROWS: one plain, one EXPERT (LD 42 D3 via `origin`/`expert_note`), one BOOKED.
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, origin, expert_note, location_name)
    VALUES
      (${ids.plainItem},  ${ids.trip}, ${`Plain item ${RUN}`},  1, 0, 'in_planning', 'traveler', NULL, 'Gion'),
      (${ids.expertItem}, ${ids.trip}, ${`Expert item ${RUN}`}, 1, 1, 'in_planning', 'expert', ${SECRETS.expertNote}, 'Arashiyama'),
      (${ids.bookedItem}, ${ids.trip}, ${`Booked item ${RUN}`}, 2, 0, 'purchased',   'traveler', NULL, 'Fushimi')
  `);

  // THE PLAN'S STOPS (Locked Decision 34): position 0 located, position 1 UNLOCATED.
  await db.execute(sql`
    INSERT INTO trip_destinations (id, trip_id, position, name, city, country, lat, lng)
    VALUES (${`aac-${RUN}-stop0`}, ${ids.trip}, 0, 'Kyoto, Japan', 'Kyoto', 'Japan', 35.0116, 135.7681),
           (${`aac-${RUN}-stop1`}, ${ids.trip}, 1, ${`Unplaced stop ${RUN}`}, NULL, NULL, NULL, NULL)
  `);

  // THE PLAN'S EVENT (Locked Decision 29/35) and ONE GUEST, whose PII A9 proves never leaves.
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug)
    VALUES (${ids.experienceType}, ${`AAC type ${RUN}`}, ${`aac-type-${RUN}`})
  `);
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, trip_id, title, event_date, start_time, location)
    VALUES (${ids.event}, ${ids.owner}, ${ids.experienceType}, ${ids.trip},
            ${`Tea ceremony ${RUN}`}, '2030-01-02', '15:00', 'Gion')
  `);
  await db.execute(sql`
    INSERT INTO event_invites (id, experience_id, organizer_id, guest_email, guest_name, unique_token, dietary_restrictions)
    VALUES (${ids.invite}, ${ids.event}, ${ids.owner}, ${SECRETS.guestEmail}, ${`Guest ${RUN}`},
            ${`aac-tok-${RUN}`}, ${JSON.stringify([SECRETS.guestDiet])}::jsonb)
  `);

  // THE CATALOG: one LIVE listing in this market (active + approved) and one PAUSED, so A10's
  // "an id the catalog does not carry drops the addition" is a real listing the reader refuses,
  // not an invented uuid.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, service_type, location, price, status, approval_status)
    VALUES (${ids.liveListing},   ${ids.advisor}, ${`Kyoto walking tour ${RUN}`}, 'experience', 'Kyoto, Japan', ${CATALOG_PRICE}, 'active', 'approved'),
           (${ids.pausedListing}, ${ids.advisor}, ${`Paused tour ${RUN}`},        'experience', 'Kyoto, Japan', '99.00',        'paused', 'approved')
  `);

  // The loopback bypass every limiter honours — the harness drives from 127.0.0.1, so without this
  // a suite of asks would trip the AI-ask caps mid-run (the messaging limiter's own CI posture).
  process.env.RATE_LIMIT_LOOPBACK_SKIP = "1";
  // NO REAL MODEL CALL, EVER: the default stub fails, so nothing can reach the SDK by omission.
  __setAiTaskModelTransport(failingTransport);
});

after(async () => {
  delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
  __setAiTaskModelTransport(null);
  __resetAiAskInFlight();
  __resetMessageRateLimiter();
  await db
    .execute(sql`DELETE FROM ai_cost_tracking WHERE user_id IN (${ids.owner}, ${ids.advisor}, ${ids.stranger})`)
    .catch(() => {});
  await db.execute(sql`DELETE FROM event_invites WHERE experience_id = ${ids.event}`).catch(() => {});
  await db.execute(sql`DELETE FROM user_experiences WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM experience_types WHERE id = ${ids.experienceType}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${ids.advisor}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_destinations WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db
    .execute(sql`DELETE FROM plan_proposals WHERE trip_id IN (${ids.trip}, ${ids.emptyTrip}, ${ids.otherTrip})`)
    .catch(() => {});
  await db
    .execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.trip}, ${ids.emptyTrip}, ${ids.otherTrip})`)
    .catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db
    .execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.emptyTrip}, ${ids.otherTrip})`)
    .catch(() => {});
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
// A3 — RE-PINNED BY LANE 1b: the model call exists, and the rail answers with the row
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A3: a well-formed ask writes exactly ONE row carrying the PRE-MINTED id, and the old 503 is gone", async () => {
  const before = await proposalCount(ids.trip);
  const res = await withModel(
    answering({ notes: [`A3 answer ${RUN}`] }),
    async () =>
      asUser(ids.owner, async (base) => {
        const r = await ask(base, ids.trip, { question: `What should we do on day 2? ${RUN}` });
        return { status: r.status, body: (await r.json()) as any };
      }),
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(await proposalCount(ids.trip), before + 1, "exactly one row, never two");

  // D-46 (i): the id on the row is the one the SERVER minted before the model call — the same id
  // the in-flight marker held and the cost row carries. It is a uuid the route generated, so what
  // is provable here is that the ROW carries the id the response names, and that the row is real.
  const id = res.body.proposal?.id;
  assert.ok(typeof id === "string" && id.length > 0, "the response names the row");
  const [row] = (
    await db.execute(sql`SELECT id, trip_id, status, question, conversation_id FROM plan_proposals WHERE id = ${id}`)
  ).rows as any[];
  assert.ok(row, "and the row is on the table");
  assert.equal(row.trip_id, ids.trip);
  assert.equal(row.status, "proposed");
  assert.ok(String(row.question).includes(RUN), "the traveler's own words are recorded, never rewritten");
  assert.equal(row.conversation_id, null, "D-45 = A: the drawer is STATELESS and an L16 ask names no thread");

  // The refusal this case used to pin is GONE from the rail. Re-pinned, not deleted (§18d): a
  // proof of a refusal that can no longer happen proves nothing.
  const routes = src("server/routes/trips.routes.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(
    routes.includes("model_call_not_built"),
    false,
    "lane 1b replaced the honest 503 with the built behaviour (the comment above it still says so — the CODE does not)",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A4 — D-46 (i): the marker is released on every path out
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A4: the in-flight marker does not survive an ask, so a second ask is not wedged", async () => {
  // Driven on the DEFAULT failing transport (lane 1b): the ask reaches the model, the model
  // refuses, and the marker must still be released — which is the property this case is about.
  await asUser(ids.owner, async (base) => {
    const first = await ask(base, ids.trip, { question: `a4-1 ${RUN}` });
    assert.equal(first.status, 502);
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
// A7 — D-49: the re-finalize runs AFTER the commit, and its failure is LOUD and non-fatal
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A7: an apply whose re-finalize THROWS still resolves, lands `applied`, and logs both ids", async () => {
  const staged = await createPlanProposal({
    tripId: ids.trip,
    question: `a7 ${RUN}`,
    proposal: { additions: [{ title: `A7 addition ${RUN}` }] } as unknown,
  });

  // Capture the LOUD half. `console.error` is the channel the four existing best-effort callers
  // use; the ruling's amendment is that THIS one names the proposal and the trip.
  const captured: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args);
  };

  let result;
  try {
    result = await applyPlanProposal(
      {
        proposalId: staged.id,
        tripId: ids.trip,
        basis: "trip_pass",
        chargedAmountCents: null,
        paymentIntentId: null,
        actorId: ids.owner,
      },
      // The seam: a re-finalize that fails. §15b — an ancillary effect may not break the operation
      // that authorizes it, so this must NOT reject and must NOT roll the apply back.
      { reFinalize: async () => { throw new Error(`refinalize failed (test) ${RUN}`); } },
    );
  } finally {
    console.error = originalError;
  }

  // The apply RESOLVED, and the row is applied — the transaction had already committed.
  assert.equal(result.proposal.status, PLAN_PROPOSAL_STATUS_APPLIED);
  assert.equal(result.createdItemIds.length, 1, "the addition was written before the re-finalize ran");
  const [row] = (
    await db.execute(sql`SELECT status, applied_at FROM plan_proposals WHERE id = ${staged.id}`)
  ).rows as any[];
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_APPLIED, "a re-finalize failure never rolls a committed apply back");
  assert.ok(row.applied_at, "and the record of the apply stands");

  // LOUD: one error line, carrying BOTH ids, so a Trip Card that did not advance after a paid
  // apply is reconcilable rather than a silence.
  const line = captured.find((args) => JSON.stringify(args).includes(staged.id));
  assert.ok(line, "the failure is logged, never swallowed");
  const text = JSON.stringify(line);
  assert.ok(text.includes(staged.id), "the log names the proposal");
  assert.ok(text.includes(ids.trip), "and the trip");
  assert.ok(text.includes(`refinalize failed (test) ${RUN}`), "and carries the helper's own message");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A8 — LANE 1b: the happy path, and D-47's three cost values
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A8: one ask ⇒ one proposal row and ONE ai_task cost row carrying asker + pre-minted id", async () => {
  const usage = { input_tokens: 1234, output_tokens: 567 };
  const res = await withModel(
    answering({ notes: [`A8 note ${RUN}`], protectedNote: `A8 protected ${RUN}` }, usage),
    async () =>
      asUser(ids.owner, async (base) => {
        const r = await ask(base, ids.trip, { question: `a8 ${RUN}` });
        return { status: r.status, body: (await r.json()) as any };
      }),
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const proposalId: string = res.body.proposal.id;

  // D-47, the three values — and the LAST of them is what makes the cost-per-applied-proposal join
  // possible with no new column: `request_id` IS the proposal id.
  const rows = await costRowsFor(proposalId, 1);
  assert.equal(rows.length, 1, "exactly one cost row for one model call");
  assert.equal(rows[0].source_type, "ai_task");
  assert.equal(
    rows[0].user_id,
    ids.owner,
    "§14/D-47: the spend is the SESSION asker's, never the plan's owner-by-lookup",
  );
  assert.equal(rows[0].request_id, proposalId, "the join D-47 exists for");
  assert.equal(Number(rows[0].tokens_in), usage.input_tokens, "reported usage, never a fabricated count (§13)");
  assert.equal(Number(rows[0].tokens_out), usage.output_tokens);

  // The stored change set is the SANITISED one, and `model_tier` is a COST RECORD only — recorded
  // on the row, read by no surface (LD 41 (c), both directions: no badge and no disclaimer).
  const [row] = (
    await db.execute(sql`SELECT proposal, model_tier FROM plan_proposals WHERE id = ${proposalId}`)
  ).rows as any[];
  assert.deepEqual(row.proposal.notes, [`A8 note ${RUN}`]);
  assert.equal(row.proposal.protectedNote, `A8 protected ${RUN}`);
  assert.ok(row.model_tier, "the tier is recorded");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A9 — D-50: what the model sees, and the exclusion list, asserted on the prompt actually sent
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A9: protected rows arrive as CONSTRAINTS; every excluded fact is absent from the sent prompt", async () => {
  captured = [];
  await withModel(answering({ notes: [`a9 ${RUN}`] }), async () =>
    asUser(ids.owner, async (base) => {
      const r = await ask(base, ids.trip, { question: `a9 ${RUN}` });
      assert.equal(r.status, 201);
    }),
  );
  assert.equal(captured.length, 1, "exactly one model call per ask");
  const sent = `${captured[0].system}\n${captured[0].user}`;

  // ── SENT, and marked. LD 42 D3: the two protected classes are present, described, and named as
  //    constraints — the optimizer baseline's own posture, which is why the model can plan around
  //    them instead of proposing to move them.
  assert.ok(sent.includes(ids.expertItem), "the expert row is shown to the model");
  assert.ok(sent.includes(ids.bookedItem), "so is the booked row");
  assert.ok(sent.includes("expert_work"), "and the expert row is MARKED as a constraint");
  assert.ok(sent.includes("booked"), "and so is the money-committed one");
  assert.ok(sent.includes(ids.plainItem), "the plain row is there too");
  assert.ok(sent.includes("Asia/Tokyo"), "the plan's own zone is sent (LD 30) — never guessed");
  assert.ok(sent.includes(`Tea ceremony ${RUN}`), "the plan's events are sent (LD 29/35)");
  assert.ok(sent.includes("15:00"), "an event's wall-clock time is sent verbatim, never converted");
  assert.ok(sent.includes(`Unplaced stop ${RUN}`), "an UNLOCATED stop is sent");
  assert.ok(sent.includes('"located": false'), "…and is flagged as unlocated, never placed (LD 34)");

  // ── NOT SENT. Each line is one item of §4.1's exclusion list, and this is the half that matters.
  assert.equal(sent.includes(SECRETS.buildNotes), false, "LD 21: `trips.expert_notes` is PRIVATE");
  assert.equal(sent.includes(SECRETS.guestEmail), false, "LD 37 / LD 42 D9: guest PII never leaves the owner tier");
  assert.equal(sent.includes(SECRETS.guestDiet), false, "…including a dietary note");
  assert.equal(sent.includes(SECRETS.otherPlanItem), false, "§14: another traveler's plan is not this plan");
  assert.equal(sent.includes(SECRETS.expertNote), false, "LD 42 D4: the expert's WORDS are not a model input");
  assert.equal(sent.includes(ids.otherTrip), false, "nor another plan's id");
  assert.equal(sent.includes(ownerEmail), false, "§14: no `users` row, no email");
  assert.equal(sent.includes(ids.owner), false, "and no user id at all");
  // D-50 (e) / §8 — nothing from `fee_bands` and no platform money vocabulary reaches the model.
  for (const forbidden of ["fee_band", "feeBand", "commission", "revenueShare", "platformFee", "payout"]) {
    assert.equal(sent.includes(forbidden), false, `D-50 (e): '${forbidden}' is never in the model's input`);
  }
  // LD 41 (c) in both directions: the engine's identity is not narrated to the model either.
  assert.equal(sent.includes("model_tier"), false, "the tier is a cost record, not prompt content");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A10 — D-50 (a)/(b) and LD 42 D3 at the rail: no model number survives, no unknown id survives,
//       no protected row is ever proposed for replacement
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A10: the catalog price overwrites the model's, an unknown listing drops ONE addition, a protected replace never lands", async () => {
  const answer = {
    additions: [
      // Names the LIVE listing and lies about the price.
      {
        title: `Kept addition ${RUN}`,
        providerServiceId: ids.liveListing,
        estimatedCost: MODEL_INVENTED_PRICE,
        reason: "because",
      },
      // Names a PAUSED listing — real row, not in this trip's live catalog ⇒ dropped (D-50 b).
      { title: `Dropped addition ${RUN}`, providerServiceId: ids.pausedListing },
      // Names nothing bookable: kept, and carries NO price at all (§13 — never `$0`).
      { title: `Free-text addition ${RUN}` },
    ],
    replaces: [
      { itemId: ids.plainItem, reason: "swap this one" },
      { itemId: ids.expertItem, reason: "and the expert's" },
      { itemId: ids.bookedItem, reason: "and the booked one" },
      { itemId: `aac-${RUN}-other-item`, reason: "and one from another plan" },
    ],
  };
  const res = await withModel(answering(answer, { input_tokens: 10, output_tokens: 20 }), async () =>
    asUser(ids.owner, async (base) => {
      const r = await ask(base, ids.trip, { question: `a10 ${RUN}` });
      return { status: r.status, body: (await r.json()) as any };
    }),
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const stored = (
    await db.execute(sql`SELECT proposal FROM plan_proposals WHERE id = ${res.body.proposal.id}`)
  ).rows[0] as any;
  const changeSet = stored.proposal;

  // (b) — the paused listing's addition is GONE; the ask did NOT fail.
  assert.equal(changeSet.additions.length, 2, "one addition dropped, the ask still answered");
  const kept = changeSet.additions.find((a: any) => a.title === `Kept addition ${RUN}`);
  const freeText = changeSet.additions.find((a: any) => a.title === `Free-text addition ${RUN}`);
  assert.ok(kept && freeText);
  assert.equal(
    changeSet.additions.some((a: any) => a.providerServiceId === ids.pausedListing),
    false,
    "D-50 (b): an id this trip's live catalog does not carry drops that addition",
  );

  // (a) — NO NUMBER THE MODEL PRODUCED IS PERSISTED.
  assert.equal(kept.estimatedCost, CATALOG_PRICE, "the catalog row's own price, not the model's");
  assert.equal(JSON.stringify(changeSet).includes(MODEL_INVENTED_PRICE), false, "the model's number is nowhere");
  assert.equal("estimatedCost" in freeText, false, "§13: no catalog row ⇒ NO price, never `$0`");

  // LD 42 D3 — the protected rows never reach the stored change set, and neither does another
  // plan's row. Only the plain one survives.
  assert.deepEqual(
    changeSet.replaces.map((r: any) => r.itemId),
    [ids.plainItem],
    "expert work, booked rows and off-plan ids are all filtered BEFORE the row is written",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A11 — §4.4's failure table: no row, marker released, and a cost row IFF usage was surfaced
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A11: a model error writes NO proposal row; the cost row exists only where the SDK surfaced usage", async () => {
  const before = await proposalCount(ids.trip);
  const beforeCost = (await askerCostRows()).length;

  // (1) ERROR WITH USAGE — attributable spend with no proposal row behind it. D-46 (i) calls that
  //     consequence INTENDED: an untracked spend is what `ai_cost_tracking` exists to prevent.
  const withUsage = await withModel(
    async () => {
      throw new AiTaskModelError("model_call_failed", `boom-with-usage ${RUN}`, {
        usage: { input_tokens: 7, output_tokens: 3 },
        model: "stub-model",
      });
    },
    async () =>
      asUser(ids.owner, async (base) => {
        const r = await ask(base, ids.trip, { question: `a11-usage ${RUN}` });
        return { status: r.status, body: (await r.json()) as any };
      }),
  );
  assert.equal(withUsage.status, 502, JSON.stringify(withUsage.body));
  assert.equal(withUsage.body.reason, "model_call_failed", "§13: the refusal names its reason");
  assert.ok(
    String(withUsage.body.message).toLowerCase().includes("nothing was charged"),
    "and says nothing was charged — true, because asking is free (D-21)",
  );
  assert.equal(await proposalCount(ids.trip), before, "NO proposal row on a failed ask");

  // One new ai_task cost row for this asker, and NO plan_proposals row carries its request id.
  const afterUsage = await askerCostRows();
  assert.equal(afterUsage.length, beforeCost + 1, "a burned-token ask is attributable");
  const orphanId = afterUsage[0].request_id;
  const orphanRows = await db.execute(sql`SELECT id FROM plan_proposals WHERE id = ${orphanId}`);
  assert.equal(orphanRows.rows.length, 0, "D-46 (i): a cost row may outlive an ask that produced no row");

  // (2) ERROR WITHOUT USAGE — NO cost row at all. A fabricated token count is worse than a
  //     missing row (§13), and `trackAnthropicResponse` returns early without usage anyway.
  const noUsage = await withModel(
    async () => {
      throw new AiTaskModelError("model_call_failed", `boom-no-usage ${RUN}`);
    },
    async () =>
      asUser(ids.owner, async (base) => {
        const r = await ask(base, ids.trip, { question: `a11-nousage ${RUN}` });
        return r.status;
      }),
  );
  assert.equal(noUsage, 502);
  assert.equal(await proposalCount(ids.trip), before, "still no proposal row");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(
    (await askerCostRows()).length,
    beforeCost + 1,
    "§13: no usage surfaced ⇒ NO cost row, and the log says why — never an invented count",
  );

  // The marker was released on BOTH failing paths, so the plan is not wedged.
  const recovered = await withModel(answering({ notes: [`a11-recovered ${RUN}`] }), async () =>
    asUser(ids.owner, async (base) => (await ask(base, ids.trip, { question: `a11-after ${RUN}` })).status),
  );
  assert.equal(recovered, 201, "the in-flight marker is cleared in a `finally` on every path out");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A12 — D-46 (i): a double submit is ONE model call, and the 409 NAMES the in-flight proposal
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A12: a second ask while one is in the model answers 409 naming the in-flight id, and calls the model once", async () => {
  captured = [];
  // Two gates: the test waits until the first ask is INSIDE the model call (so the marker is
  // held), then fires the second, then releases the first. Nothing here sleeps on a guess.
  let signalEntered: () => void = () => {};
  const enteredGate = new Promise<void>((r) => {
    signalEntered = r;
  });
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });

  const blocking: AiTaskModelTransport = async (req) => {
    captured.push({ system: req.system, user: req.user, model: req.model });
    signalEntered();
    await gate;
    return { text: JSON.stringify({ notes: [`a12 ${RUN}`] }), model: req.model, truncated: false };
  };

  const outcome = await withModel(blocking, async () =>
    asUser(ids.owner, async (base) => {
      const first = ask(base, ids.trip, { question: `a12-first ${RUN}` });
      await enteredGate; // the first ask is now inside the model call, marker held
      const second = await ask(base, ids.trip, { question: `a12-second ${RUN}` });
      const secondBody = (await second.json()) as any;
      release();
      const firstRes = await first;
      return { firstStatus: firstRes.status, secondStatus: second.status, secondBody };
    }),
  );

  assert.equal(outcome.firstStatus, 201, "the first ask completes normally");
  assert.equal(outcome.secondStatus, 409, "the second is refused while the first is in flight");
  assert.ok(
    typeof outcome.secondBody.inFlightProposalId === "string" && outcome.secondBody.inFlightProposalId.length > 0,
    "and the 409 NAMES the in-flight proposal id (D-46 (i)) — even though its row may not exist yet",
  );
  assert.equal(captured.length, 1, "THE EXPENSIVE HALF RAN ONCE — a double submit is one model call");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A13 — D-50 + LD 41 (b)/(c): the catalog is the PAID task's, and an empty plan defers
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A13: a plan holding items gets the catalog; an EMPTY plan gets none, and the prompt says so", async () => {
  // (1) THE PAID TASK — this plan holds items, so it is Optimize territory (LD 41 (b)) and the
  //     catalog is in the prompt, scoped to this trip's market by `loadOptimizerCatalog` alone.
  captured = [];
  await withModel(answering({ notes: [`a13-paid ${RUN}`] }), async () =>
    asUser(ids.owner, async (base) => {
      assert.equal((await ask(base, ids.trip, { question: `a13-paid ${RUN}` })).status, 201);
    }),
  );
  const paidPrompt = captured[0].user;
  assert.ok(paidPrompt.includes("CATALOG —"), "the paid task is offered the catalog");
  assert.ok(paidPrompt.includes(ids.liveListing), "…carrying the live listing");
  assert.equal(
    paidPrompt.includes(ids.pausedListing),
    false,
    "and never a paused one — `loadOptimizerCatalog`'s own active+approved gate, not a second read",
  );
  assert.ok(paidPrompt.includes(CATALOG_PRICE), "the listing's OWN price is what the model is shown");

  // (2) THE EMPTY PLAN — LD 41 (b) gives it to the FREE draft and LD 41 (c) rules the free sketch
  //     runs with no live catalog pricing. So no catalog, and the prompt SAYS SO rather than
  //     leaving the model to infer that nothing is bookable there (§13).
  captured = [];
  await withModel(answering({ notes: [`a13-empty ${RUN}`] }), async () =>
    asUser(ids.owner, async (base) => {
      assert.equal((await ask(base, ids.emptyTrip, { question: `a13-empty ${RUN}` })).status, 201);
    }),
  );
  const emptyPrompt = captured[0].user;
  assert.equal(emptyPrompt.includes("CATALOG —"), false, "an empty plan is offered no catalog");
  assert.equal(emptyPrompt.includes(ids.liveListing), false, "not even the live one");
  assert.ok(
    emptyPrompt.includes("CATALOG: not available for this question"),
    "…and the absence is stated, with free-text-only instructions",
  );
  assert.ok(emptyPrompt.includes("THE PLAN'S ITEMS: none"), "the empty plan is described as empty, honestly");
});
