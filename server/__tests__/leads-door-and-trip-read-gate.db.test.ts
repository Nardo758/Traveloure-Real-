/**
 * V-32 + V-33 — THE RETIRED LEAD DOOR AND THE TRIP READ GATE THAT COULD NEVER GRANT AN EXPERT
 * (punchlist V-32 and V-33; ledger `2026-09-15-v32-v33-leads-door-item-read-gate`).
 *
 * V-33. `GET /api/trips/:id` decided its expert arm on `trip.expertId === userId`. `trips.expert_id`
 * is DECLARED (`shared/schema.ts`) and NOTHING under `server/` writes it — the only same-named
 * writer is `affiliate_booking_requests.expert_id`, a different table — so the arm could never be
 * true. An expert assigned through the ONE author of `trip_expert_advisors`
 * (`upsertTripAdvisorRow`, CLAUDE.md Locked Decision 32's CORRECTION paragraph) was answered
 * **403** on the trip they had just been assigned to, and the handler logged `[IDOR ATTEMPT]` about
 * them: a §13 falsehood in the log as well as a refused read. The arm now asks the CANONICAL §12
 * READ predicate, `isTripAdvisor` (`server/utils/trip-advisor.ts`) — one implementation, one more
 * caller (§18 rule 1), never a second copy of the status allow-list at the route.
 *
 * V-32. `POST /api/leads/route` was a COMMENT with no handler under it. It is RETIRED, not
 * restored: a second "score experts and auto-assign" rail would be a second author of the advisor
 * row, which Locked Decision 42 D7 and ledger `2026-09-04-advisor-row-one-author` both forbid, and
 * two ratified rails already serve it (`POST /api/expert-requests`,
 * `POST /api/trips/:tripId/advisors`). L1 below is the ratchet that keeps the retirement true.
 *
 * TRANSPORT. The gate is INLINE in the handler, so the behavioural proofs mount the REAL
 * `trips.routes.ts` router in a bare express app with a chosen session identity and make REAL
 * requests — the same in-process shape `user-experience-ownership.db.test.ts` uses. A proof that
 * called `isTripAdvisor` directly would pass against an unfixed handler for the wrong reason.
 *
 * NEGATIVE SPACE, stated because green means green-within-stated-bounds (§18d):
 *  • These are proofs about a READ gate. They assert nothing about the item-mutation gates, which
 *    take the WRITE allow-list (`accepted`/`assigned`, never `pending`) and are pinned by
 *    `one-trip-write-resolver.db.test.ts`.
 *  • R1 proves the §21 redaction is not widened by the new arm. It does not re-prove the private
 *    build-notes rail itself (`GET /api/trips/:tripId/expert-notes`), which has its own gate.
 *  • L1 and S1 read SOURCE. They can see that a door is gone and that a gate calls the predicate;
 *    they cannot see request ordering — that is what the behavioural proofs above are for.
 *  • Nothing here claims `trips.expert_id` was DROPPED. It is kept and annotated; S2 pins the
 *    annotation so the next reader is not tempted to build a new grant on it.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key, no network, no full server boot.
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/leads-door-and-trip-read-gate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `v33-${RUN}-owner`,
  pendingAdvisor: `v33-${RUN}-pending`,
  acceptedAdvisor: `v33-${RUN}-accepted`,
  rejectedAdvisor: `v33-${RUN}-rejected`,
  stranger: `v33-${RUN}-stranger`,
  trip: `v33-${RUN}-trip`,
};

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Source with block and line comments stripped — prose naming a symbol is not a call. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every .ts under server/, tests and node_modules excluded. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      serverFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// ── Disposable-DB guard (mirrors one-trip-write-resolver.db.test.ts; never defaults open) ────────
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
      `[leads-door-and-trip-read-gate] REFUSING to write fixtures: DATABASE_URL host ` +
        `'${host ?? "<none>"}' is not a recognized disposable dev/CI database. Opt in ` +
        `DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/**
 * The REAL router, mounted with a chosen session identity, plus every `console.warn` the request
 * emitted. The warn capture is load-bearing: V-33's defect was HALF a wrong log line, and a proof
 * that only checked the status code would have let the libel survive the fix.
 */
type GateResult = { status: number; body: any; warnings: string[] };

async function getTripAs(userId: string | null, tripId: string): Promise<GateResult> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(" "));
  };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${tripId}`);
    const body = await res.json().catch(() => null);
    return { status: res.status, body, warnings };
  } finally {
    console.warn = realWarn;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const idorLines = (r: GateResult) => r.warnings.filter((w) => w.includes("[IDOR ATTEMPT]"));

/** Force an advisor row to a status the ONE author may not assert (`rejected` is decline-only). */
async function setAdvisorStatus(advisorId: string, status: string): Promise<void> {
  await db.execute(sql`
    UPDATE trip_expert_advisors SET status = ${status}
    WHERE trip_id = ${ids.trip} AND local_expert_id = ${advisorId}
  `);
}

before(async () => {
  await assertDisposableDb();
  for (const [id, role] of [
    [ids.owner, "traveler"],
    [ids.pendingAdvisor, "local_expert"],
    [ids.acceptedAdvisor, "local_expert"],
    [ids.rejectedAdvisor, "local_expert"],
    [ids.stranger, "traveler"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'V33', ${role}, ${role})
    `);
  }

  // A raw insert, so the fixture states exactly the columns the gate reads and NOTHING writes
  // `expert_id` — which is the whole point: the trip carries no expert column value, as every
  // real trip on the platform does not.
  // `expert_notes` (PRIVATE, §21) and `expert_traveler_note` (traveler-facing) are both set so R1
  // can tell the redaction apart from an empty column.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                       expert_notes, expert_traveler_note)
    VALUES (${ids.trip}, ${ids.owner}, ${`V33 plan ${RUN}`}, 'Kyoto, Japan',
            '2027-05-01', '2027-05-06', 'draft',
            ${`V33 private build note ${RUN}`}, ${`V33 traveler note ${RUN}`})
  `);

  // Three advisor rows through the ONE author (`storage.createTripExpertAdvisor` →
  // `upsertTripAdvisorRow`). `accepted` is written by the author; `rejected` is reachable only by
  // the expert's own decline path, so it is set directly — the proof is about what the READ gate
  // does with the status, not about who may write it.
  for (const advisor of [ids.pendingAdvisor, ids.acceptedAdvisor, ids.rejectedAdvisor]) {
    await storage.createTripExpertAdvisor({
      tripId: ids.trip,
      localExpertId: advisor,
      message: "V33 fixture assignment",
    } as any);
  }
  await setAdvisorStatus(ids.acceptedAdvisor, "accepted");
  await setAdvisorStatus(ids.rejectedAdvisor, "rejected");
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`v33-${RUN}-%`}`);
});

// ── A1–A4: the behavioural gate ─────────────────────────────────────────────────────────────────

test("A0 fixture: the trip carries NO expert_id, and three advisor rows exist", async () => {
  const t = await db.execute(sql`SELECT expert_id FROM trips WHERE id = ${ids.trip}`);
  assert.equal(
    (t.rows[0] as any).expert_id,
    null,
    "fixture invalid: the proof requires the dead column to be unset, as it is on every real trip",
  );
  const a = await db.execute(
    sql`SELECT local_expert_id, status FROM trip_expert_advisors WHERE trip_id = ${ids.trip} ORDER BY local_expert_id`,
  );
  assert.equal(a.rows.length, 3, "fixture invalid: three advisor rows expected");
  const byId = Object.fromEntries(a.rows.map((r: any) => [r.local_expert_id, r.status]));
  assert.equal(byId[ids.pendingAdvisor], "pending");
  assert.equal(byId[ids.acceptedAdvisor], "accepted");
  assert.equal(byId[ids.rejectedAdvisor], "rejected");
});

test("A1: a PENDING advisor reads 200, and is NOT logged as an IDOR attempt", async () => {
  const r = await getTripAs(ids.pendingAdvisor, ids.trip);
  assert.equal(
    r.status,
    200,
    "a pending advisor was refused — Locked Decision 12 keeps `pending` on the READ surfaces, " +
      "and the trip GET is one of them",
  );
  assert.equal(r.body?.id, ids.trip);
  assert.deepEqual(
    idorLines(r),
    [],
    "the handler libelled a legitimately assigned advisor in the log (§13) — this is the half of " +
      "V-33 a status-code-only assertion would have missed",
  );
});

test("A2: an ACCEPTED advisor reads 200, and is NOT logged as an IDOR attempt", async () => {
  const r = await getTripAs(ids.acceptedAdvisor, ids.trip);
  assert.equal(r.status, 200, "an accepted advisor was refused on the trip they are assigned to");
  assert.equal(r.body?.id, ids.trip);
  assert.deepEqual(idorLines(r), []);
});

test("A3: an UNRELATED user reads 403 — and that refusal IS the IDOR log's real job", async () => {
  const r = await getTripAs(ids.stranger, ids.trip);
  assert.equal(r.status, 403, "a stranger reached someone else's plan");
  assert.equal(r.body?.message, "Access denied");
  assert.equal(
    idorLines(r).length,
    1,
    "the IDOR warning stopped firing for the case it exists for — the fix must narrow the log to " +
      "genuine strangers, not silence it",
  );
  assert.ok(idorLines(r)[0].includes(ids.stranger));
});

test("A4: a REJECTED advisor reads 403 — the §12 allow-list is unweakened", async () => {
  const r = await getTripAs(ids.rejectedAdvisor, ids.trip);
  assert.equal(
    r.status,
    403,
    "a rejected advisor was granted access — `isTripAdvisor` is a closed allow-list " +
      "(pending/accepted/assigned) and `rejected` must keep denying",
  );
});

test("A5: the OWNER still reads 200, and an anonymous caller with no token is 401", async () => {
  const owner = await getTripAs(ids.owner, ids.trip);
  assert.equal(owner.status, 200);
  assert.deepEqual(idorLines(owner), []);

  const anon = await getTripAs(null, ids.trip);
  assert.equal(anon.status, 401, "the fully-anonymous arm must stay 401, not 403");
});

// ── R1: the §21 redaction is NOT widened by the new arm ─────────────────────────────────────────

test("R1: an advisor's 200 carries the TRAVELER note and NOT the private build notes (§21)", async () => {
  for (const advisor of [ids.pendingAdvisor, ids.acceptedAdvisor]) {
    const r = await getTripAs(advisor, ids.trip);
    assert.equal(r.status, 200);
    assert.equal(
      r.body?.expertNotes,
      null,
      "`trips.expert_notes` is the Workstation's PRIVATE build note and has its own WRITE-status " +
        "rail (GET /api/trips/:tripId/expert-notes). The access fix must not hand it to a READ-status " +
        "advisor through this spread — that is the §21 leak that rail closed.",
    );
    assert.equal(
      r.body?.expertTravelerNote,
      `V33 traveler note ${RUN}`,
      "the traveler-facing note is meant for exactly this audience and must not be redacted",
    );
  }
  // And the owner, whose redaction was already correct, is unchanged.
  const owner = await getTripAs(ids.owner, ids.trip);
  assert.equal(owner.body?.expertNotes, null);
});

// ── S1/S2: the source pins ──────────────────────────────────────────────────────────────────────

test("S1: the trip GET gate calls the canonical predicate and no gate grants on trips.expertId", () => {
  const trips = codeOnly(src("server/routes/trips.routes.ts"));
  assert.match(
    trips,
    /isTripAdvisor\(trip\.id,\s*userId\)/,
    "the trip GET stopped asking the canonical §12 READ predicate",
  );
  assert.match(
    trips,
    /import\s*\{\s*isTripAdvisor\s*\}\s*from\s*"\.\.\/utils\/trip-advisor"/,
    "the predicate must be imported, never re-derived at the route (§18 rule 1)",
  );

  // Repo-wide: no authorization arm anywhere under server/ may be built on the dead column. The
  // pattern is an EQUALITY between a TRIP row's `expertId` and a caller id — the exact shape both
  // V-33 gates wore, in both spellings (`trip.expertId`, `(trip as any).expertId`).
  //
  // STATED NEGATIVE SPACE (§18d): it is keyed on the RECEIVER being named `trip`, because source
  // text is all this proof can see. Three other tables have their own live `expertId` compared to
  // a caller id (`affiliate_booking_requests` in `booking-agent-claim.service.ts` and
  // `statements.routes.ts`, plus a seed's lead check) and every one of them is legitimate — a
  // receiver-blind pattern would indict them. So a grant built on `trips.expert_id` through a
  // differently-named local would slip past. That is why the annotation (S2) is the other half of
  // this proof, and why `trips.expert_id` is never given a writer without a ruling.
  const offenders: string[] = [];
  for (const file of serverFiles(path.join(REPO_ROOT, "server"))) {
    const code = codeOnly(fs.readFileSync(file, "utf8"));
    if (/\btrip\b[^\n;]{0,20}\.expertId\s*===/.test(code)) {
      offenders.push(path.relative(REPO_ROOT, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a grant keyed on a column nothing writes is back in: ${offenders.join(", ")}`,
  );
});

test("S2: shared/schema.ts states that trips.expertId has no writer", () => {
  const schema = src("shared/schema.ts");
  const idx = schema.indexOf('expertId: varchar("expert_id"');
  assert.ok(idx > 0, "trips.expertId is no longer declared where this proof expects it");
  const preamble = schema.slice(Math.max(0, idx - 1600), idx);
  assert.match(
    preamble,
    /WRITTEN BY NOTHING/,
    "the column must carry its own annotation — the next reader's only warning that a grant built " +
      "on it can never fire",
  );
});

// ── L1: the retired lead door stays retired ─────────────────────────────────────────────────────

test("L1: /api/leads/route is registered nowhere under server/ and is named only in prose", () => {
  const registrations: string[] = [];
  const mentions: string[] = [];
  const routeHeaderComments: string[] = [];
  // A route-HEADER comment — `// POST /api/leads/route — …` on a line of its own — is exactly
  // what V-32 was: a line that reads as a live door with nothing under it. Catching only a live
  // registration would leave the original defect re-writable, so both shapes fail here.
  const HEADER_COMMENT = /^\s*(?:\/\/|\*)\s*(?:POST|GET|PUT|PATCH|DELETE)\s+\/api\/leads\/route\b/im;
  for (const file of serverFiles(path.join(REPO_ROOT, "server"))) {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.includes("leads/route")) continue;
    const rel = path.relative(REPO_ROOT, file);
    mentions.push(rel);
    if (/["'`][^"'`]*\/leads\/route/.test(codeOnly(raw))) registrations.push(rel);
    if (HEADER_COMMENT.test(raw)) routeHeaderComments.push(rel);
  }
  assert.deepEqual(
    routeHeaderComments,
    [],
    "a route-header comment for `/api/leads/route` is back — that comment, standing over no " +
      `handler, IS punchlist V-32. Found in: ${routeHeaderComments.join(", ")}`,
  );
  assert.deepEqual(
    registrations,
    [],
    "`/api/leads/route` is back as a live path. It is RETIRED, not missing: a second " +
      "score-and-auto-assign door would be a second author of the advisor row (Locked Decision 42 " +
      "D7; `check-advisor-row-author.cjs`), and `POST /api/expert-requests` already runs the same " +
      `scoring service. Found in: ${registrations.join(", ")}`,
  );
  // Prose that EXPLAINS the retirement is welcome; a stray comment that reads as a live route is
  // what V-32 was, so the one file allowed to mention it is the one that records the ruling.
  assert.deepEqual(
    mentions.filter((m) => m !== "server/routes/payments.routes.ts"),
    [],
    `only payments.routes.ts may name the retired door (it records why): ${mentions.join(", ")}`,
  );
});

test("L1b: the lead-routing SERVICE is untouched and still has live importers", () => {
  const service = path.join(REPO_ROOT, "server/services/lead-routing.service.ts");
  assert.ok(fs.existsSync(service), "the scoring service was deleted — V-32 retired the DOOR, not the logic");
  const importers = serverFiles(path.join(REPO_ROOT, "server")).filter((f) => {
    if (f === service) return false;
    return /lead-routing\.service/.test(codeOnly(fs.readFileSync(f, "utf8")));
  });
  assert.ok(
    importers.length > 0,
    "the scoring service lost every importer — it would then be §18c dead code, which is a " +
      "different ruling than the one this lane made",
  );
});
