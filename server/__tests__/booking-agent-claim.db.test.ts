/**
 * THE BOOKING AGENT IS NOT ASSIGNED — THE REQUEST IS CLAIMED.
 *
 * CLAUDE.md Locked Decision 44's reserved question, ruled by ledger
 * `2026-09-08-assignment-is-claimed` and executed by `2026-09-15-booking-agent-claim`:
 *
 *   **BOOKING-AGENT AUTO-ASSIGNMENT IS RETIRED; A REQUEST IS CLAIMED FROM THE POOL.** No assignee
 *   is stamped at create. The request lands in the pooled queue that already exists on the expert
 *   inbox and is CLAIMED by whoever takes it; matching may ORDER the queue and never binds a
 *   person. §13: an unclaimed request says it is unclaimed and is never rendered as someone's.
 *   NO BACKFILL: existing assigned rows keep their assignee.
 *
 * WHAT WAS THERE. Both create rails ran `getExpertUserIds(10)[0]` — the first `role='expert'` row
 * the table happened to return, no category, no city, no load — and stamped it as the request's
 * booking agent, born `status='assigned'`. The only "claim" was a PATCH of `{ expertId: "self" }`
 * through the generic update rail: an identity taken off the BODY (§14's class), written by a
 * plain UPDATE with no conditional, so two agents pressing Claim at the same moment BOTH
 * succeeded and the second silently took the row from the first (§15: a write with no conditional
 * is not a claim).
 *
 *   C1  BORN UNCLAIMED. Neither create rail resolves an expert at all — `getExpertUserIds` is
 *       called nowhere in `server/`, both rails pin `expertId` to `null` explicitly, and neither
 *       writes the legacy `assigned` status. (Source pin: the two rails are inside one 7k-line
 *       router with heavy imports; the claim DECISION is proven live below, the create rails'
 *       absence of one is proven on the file with comments stripped.)
 *   C2  EXACTLY ONE WINNER. Two concurrent claims on one unclaimed row: one `ok`, one refused
 *       `already_claimed`, and the row carries the winner. The statement is the guard.
 *   C3  THE WINNER'S RETRY IS IDEMPOTENT, NOT A SECOND GRANT. A repeat claim by the holder
 *       answers `ok` with `alreadyYours: true` and moves nothing. Chosen over a 409 for the reason
 *       §15d gives for the balance-payer claim: refusing a holder their own claim makes a lost
 *       response look like someone else's win.
 *   C4  THE REFUSAL NAMES THE FACT, NOT THE PERSON. `already_claimed` maps to 409 and its message
 *       contains no user id — the pooled reader serves `expert_id = me OR IS NULL`, so no other
 *       agent's identity is on that wire and this refusal must not put one there.
 *   C5  A NON-AGENT CANNOT CLAIM, and the row is untouched by the refusal.
 *   C6  AN ADMIN CAN — the gate is the queue's own gate (expert role or admin), not a new one.
 *   C7  AN UNKNOWN ID IS 404, and the classification read that produces it decides nothing.
 *   C8  THE CLAIMANT CANNOT ARRIVE ON THE WIRE. The rail's body schema is a `.strict()` allowlist
 *       of NOTHING, so a body carrying `expertId` is REFUSED rather than silently stripped, and
 *       the route is pinned to take its actor from `getUserId(req)` and to read no identity from
 *       the body (§14, §19).
 *   C9  THE PATCH RAIL IS NO LONGER AN ASSIGNEE AUTHOR — in BOTH layers. Its allowlist no longer
 *       names `expertId` (source), and `storage.updateAffiliateBookingRequest` strips the field so
 *       an internal `as any` caller a type-level Pick cannot reach is covered too (live).
 *   C10 NO BACKFILL, AND A CLAIM WRITES NO STATUS. A legacy row carrying an auto-assigned
 *       `expert_id` and `status='assigned'` keeps both; a fresh claim leaves `status` alone, so a
 *       claim can never write a value outside LD 44 (e)'s human-settable allowlist.
 *   C11 A ROW BORN `received` CLAIMS EXACTLY AS ONE BORN `pending` (ledger
 *       `2026-09-20-handoff-born-received`). The claim decision reads no status at all
 *       (`expert_id IS NULL` is its whole predicate), so the server-born concierge hand-off's
 *       ruled birth value changes nothing about winning, losing or retrying a claim.
 *
 * NEGATIVE SPACE, STATED — this is the load-bearing half. **No HTTP is exercised here.** The proofs
 * run the claim DECISION (`claimBookingRequest`) and the WRITE (`storage.claimAffiliateBookingRequest`)
 * against real Postgres; the route is a thin adapter and is proven by source pins that it parses
 * `claimBodySchema`, takes the actor from the session, and maps each refusal through the shared
 * status/message tables. A green run therefore says the decision and the write are right and the
 * adapter is shaped right — not that Express delivered them. It asserts nothing about queue
 * ORDERING (untouched by this lane) and nothing about releasing a claim (no such rail exists).
 *
 * Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-concurrency=1 --test-force-exit \
 *     server/__tests__/booking-agent-claim.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/traveloure";
}

// server/db.ts throws at import time when DATABASE_URL is unset, and ESM hoists static imports
// above the default assigned just now — so the modules under test are deferred dynamic imports.
const { pool } = await import("../db");
const { storage } = await import("../storage");
const {
  BOOKING_AGENT_CLAIM_MESSAGE,
  BOOKING_AGENT_CLAIM_STATUS,
  claimBodySchema,
  claimBookingRequest,
} = await import("../services/booking-agent-claim.service");

const ROOT = path.resolve(import.meta.dirname, "..", "..");
/** Comments stripped, so a pin never passes (or fails) on prose. */
function sourceWithoutComments(relPath: string): string {
  return fs
    .readFileSync(path.join(ROOT, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let travelerId = "";
let agentAId = "";
let agentBId = "";
let adminId = "";
let plainUserId = "";
const createdRequestIds: string[] = [];

async function newUnclaimedRequest(status: string = "pending"): Promise<string> {
  const row = await storage.createAffiliateBookingRequest({
    userId: travelerId,
    expertId: null,
    itemName: "Kiyomizu-dera early entry",
    itemDescription: null,
    partnerName: "Klook",
    partnerCategory: "tours",
    affiliateUrl: "https://partner.example.com/book?ref=claim-db-test",
    travelDate: null,
    travelers: 2,
    userNotes: null,
    expertNotes: null,
    confirmationRef: null,
    price: null,
    status,
  } as any);
  createdRequestIds.push(row.id);
  return row.id;
}

async function readRow(id: string): Promise<{ expert_id: string | null; status: string | null }> {
  const { rows } = await pool.query(
    `SELECT expert_id, status FROM affiliate_booking_requests WHERE id = $1`,
    [id],
  );
  return rows[0];
}

describe("booking-agent claim — auto-assignment retired, the pool is claimed", () => {
  before(async () => {
    travelerId = crypto.randomUUID();
    agentAId = crypto.randomUUID();
    agentBId = crypto.randomUUID();
    adminId = crypto.randomUUID();
    plainUserId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, role) VALUES
         ($1, $2, 'user'), ($3, $4, 'expert'), ($5, $6, 'expert'), ($7, $8, 'admin'), ($9, $10, 'user')`,
      [
        travelerId, `abc-traveler-${travelerId}@t.test`,
        agentAId, `abc-agent-a-${agentAId}@t.test`,
        agentBId, `abc-agent-b-${agentBId}@t.test`,
        adminId, `abc-admin-${adminId}@t.test`,
        plainUserId, `abc-plain-${plainUserId}@t.test`,
      ],
    );
  });

  after(async () => {
    if (createdRequestIds.length) {
      await pool.query(`DELETE FROM affiliate_booking_requests WHERE id = ANY($1::varchar[])`, [
        createdRequestIds,
      ]);
    }
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [
      [travelerId, agentAId, agentBId, adminId, plainUserId],
    ]);
    await pool.end();
  });

  // ── C1 ──────────────────────────────────────────────────────────────────────────────────────
  it("C1 — no create rail picks a booking agent, and none writes the legacy `assigned` status", async () => {
    const routes = sourceWithoutComments("server/routes/content.routes.ts");
    assert.equal(
      /getExpertUserIds\s*\(/.test(routes),
      false,
      "content.routes.ts still calls getExpertUserIds — auto-assignment is retired",
    );

    // The helper itself is deleted, not merely unused (§18c: no consumer + a state-bearing effect
    // is a delete). Proven over the whole server tree so a second caller cannot reintroduce it.
    const serverFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) serverFiles.push(full);
      }
    };
    walk(path.join(ROOT, "server"));
    const definers = serverFiles.filter((f) =>
      /function\s+getExpertUserIds\b/.test(
        fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"),
      ),
    );
    assert.deepEqual(definers, [], "getExpertUserIds is still defined somewhere under server/");

    // Both rails pin the assignee to null explicitly rather than leaving the column to a default —
    // the absence is deliberate and greppable.
    const pinned = routes.match(/const expertId:\s*string \| null = null;/g) ?? [];
    assert.equal(pinned.length, 2, "both affiliate-booking create rails must pin expertId to null");

    // Neither create rail writes `assigned`. The birth status stays the legacy `pending` the ONE
    // reader already maps to `received`; re-pointing it is a vocabulary move this lane did not make.
    const createStart = routes.indexOf('router.post("/api/affiliate-booking-requests"');
    const createEnd = routes.indexOf('router.get("/api/affiliate-booking-requests/user"');
    assert.ok(
      createStart > -1 && createEnd > createStart,
      "the two create rails must still be greppable — repair this pin, do not delete it",
    );
    const createSection = routes.slice(createStart, createEnd);
    assert.equal(
      /["']assigned["']/.test(createSection),
      false,
      "a create rail still writes the legacy `assigned` status",
    );
  });

  // ── C2 ──────────────────────────────────────────────────────────────────────────────────────
  it("C2 — two concurrent claims produce exactly ONE winner; the loser is refused `already_claimed`", async () => {
    const id = await newUnclaimedRequest();
    assert.equal((await readRow(id)).expert_id, null, "the row must be born unclaimed");

    const [a, b] = await Promise.all([
      claimBookingRequest({ requestId: id, actorUserId: agentAId }),
      claimBookingRequest({ requestId: id, actorUserId: agentBId }),
    ]);

    const winners = [a, b].filter((r) => r.ok && !r.alreadyYours);
    const losers = [a, b].filter((r) => !r.ok);
    assert.equal(winners.length, 1, "exactly one claim must win");
    assert.equal(losers.length, 1, "exactly one claim must be refused");
    assert.equal((losers[0] as { reason: string }).reason, "already_claimed");

    const row = await readRow(id);
    assert.ok(row.expert_id === agentAId || row.expert_id === agentBId);
    assert.equal(
      row.expert_id,
      (winners[0] as { row: { expertId: string | null } }).row.expertId,
      "the row must carry the agent the winning claim reported",
    );
  });

  // ── C3 ──────────────────────────────────────────────────────────────────────────────────────
  it("C3 — the holder's own second claim is idempotent (ok + alreadyYours), and moves nothing", async () => {
    const id = await newUnclaimedRequest();
    const first = await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    assert.equal(first.ok, true);
    assert.equal((first as { alreadyYours: boolean }).alreadyYours, false);

    const second = await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    assert.equal(second.ok, true, "the holder's retry must not be refused");
    assert.equal((second as { alreadyYours: boolean }).alreadyYours, true);
    assert.equal((await readRow(id)).expert_id, agentAId);
  });

  // ── C4 ──────────────────────────────────────────────────────────────────────────────────────
  it("C4 — `already_claimed` is 409 and names the fact, never the holder", async () => {
    const id = await newUnclaimedRequest();
    await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    const refused = await claimBookingRequest({ requestId: id, actorUserId: agentBId });

    assert.equal(refused.ok, false);
    assert.equal((refused as { reason: string }).reason, "already_claimed");
    assert.equal(BOOKING_AGENT_CLAIM_STATUS.already_claimed, 409);
    const message = BOOKING_AGENT_CLAIM_MESSAGE.already_claimed;
    assert.equal(message.includes(agentAId), false, "the refusal must not publish the holder's id");
    assert.equal((await readRow(id)).expert_id, agentAId, "a refused claim moves nothing");
  });

  // ── C5 ──────────────────────────────────────────────────────────────────────────────────────
  it("C5 — a non-agent cannot claim, and the refusal writes nothing", async () => {
    const id = await newUnclaimedRequest();
    const refused = await claimBookingRequest({ requestId: id, actorUserId: plainUserId });
    assert.equal(refused.ok, false);
    assert.equal((refused as { reason: string }).reason, "not_an_agent");
    assert.equal(BOOKING_AGENT_CLAIM_STATUS.not_an_agent, 403);
    assert.equal((await readRow(id)).expert_id, null, "a refused claim must leave the row unclaimed");

    // An unknown actor is likewise not an agent — the gate reads the DB row, never a session string.
    const ghost = await claimBookingRequest({ requestId: id, actorUserId: crypto.randomUUID() });
    assert.equal((ghost as { reason: string }).reason, "not_an_agent");
  });

  // ── C6 ──────────────────────────────────────────────────────────────────────────────────────
  it("C6 — an admin may claim: the gate is the pooled queue's own gate, not a new one", async () => {
    const id = await newUnclaimedRequest();
    const claimed = await claimBookingRequest({ requestId: id, actorUserId: adminId });
    assert.equal(claimed.ok, true);
    assert.equal((await readRow(id)).expert_id, adminId);
  });

  // ── C7 ──────────────────────────────────────────────────────────────────────────────────────
  it("C7 — an unknown request id is 404", async () => {
    const refused = await claimBookingRequest({
      requestId: crypto.randomUUID(),
      actorUserId: agentAId,
    });
    assert.equal(refused.ok, false);
    assert.equal((refused as { reason: string }).reason, "not_found");
    assert.equal(BOOKING_AGENT_CLAIM_STATUS.not_found, 404);
  });

  // ── C8 ──────────────────────────────────────────────────────────────────────────────────────
  it("C8 — the claimant cannot arrive on the wire: an empty `.strict()` body, actor from the session", () => {
    assert.equal(claimBodySchema.safeParse({}).success, true, "a bodiless claim must parse");
    assert.equal(
      claimBodySchema.safeParse({ expertId: agentBId }).success,
      false,
      "a body naming its own claimant must be REFUSED, not silently stripped (§19)",
    );
    assert.equal(claimBodySchema.safeParse({ anything: 1 }).success, false);

    const routes = sourceWithoutComments("server/routes/content.routes.ts");
    const start = routes.indexOf('router.post("/api/affiliate-booking-requests/:id/claim"');
    assert.ok(start > -1, "the claim rail must exist at this path");
    const handler = routes.slice(start, start + 2000);
    assert.match(handler, /claimBodySchema\.safeParse/, "the rail must parse the empty allowlist");
    assert.match(handler, /actorUserId:\s*sessionUserId/, "the actor must be the session user");
    assert.match(handler, /const sessionUserId = getUserId\(req\)/);
    assert.equal(
      /req\.body\.[A-Za-z]/.test(handler),
      false,
      "the claim rail must read no field off the body",
    );
    assert.equal(/req\.query/.test(handler), false, "the claim rail must read nothing off the query");
  });

  // ── C9 ──────────────────────────────────────────────────────────────────────────────────────
  it("C9 — the PATCH rail is no longer an assignee author, in both layers", async () => {
    const routes = sourceWithoutComments("server/routes/content.routes.ts");
    const allowLine = routes.match(/const allowed = \[[^\]]*\] as const;/);
    assert.ok(allowLine, "the PATCH allowlist must still be greppable — repair this pin, don't delete it");
    assert.equal(
      allowLine![0].includes("expertId"),
      false,
      "the PATCH allowlist must not admit expertId — the claim rail is its one author",
    );
    assert.equal(
      /data\.expertId/.test(routes),
      false,
      'the "self" self-assign sentinel must be gone with it',
    );

    // Layer 2, live: the storage writer strips it, so an `as any` caller cannot reach the column.
    const id = await newUnclaimedRequest();
    await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    await storage.updateAffiliateBookingRequest(id, { expertId: agentBId, status: "ready_to_buy" } as any);
    const row = await readRow(id);
    assert.equal(row.expert_id, agentAId, "the update rail must not reassign a claimed request");
    assert.equal(row.status, "ready_to_buy", "…while the fields it does own still write");
  });

  // ── C10 ─────────────────────────────────────────────────────────────────────────────────────
  it("C10 — no backfill: a legacy assigned row keeps its assignee and its status; a claim writes no status", async () => {
    // A row exactly as the retired auto-assignment left it.
    const legacy = await storage.createAffiliateBookingRequest({
      userId: travelerId,
      expertId: agentAId,
      itemName: "Legacy auto-assigned request",
      itemDescription: null,
      partnerName: "Klook",
      partnerCategory: null,
      affiliateUrl: "https://partner.example.com/book?ref=legacy",
      travelDate: null,
      travelers: 1,
      userNotes: null,
      expertNotes: null,
      confirmationRef: null,
      price: null,
      status: "assigned",
    } as any);
    createdRequestIds.push(legacy.id);

    const refused = await claimBookingRequest({ requestId: legacy.id, actorUserId: agentBId });
    assert.equal((refused as { reason: string }).reason, "already_claimed");
    const legacyRow = await readRow(legacy.id);
    assert.equal(legacyRow.expert_id, agentAId, "a row that was assigned was assigned");
    assert.equal(legacyRow.status, "assigned", "and its legacy status is not rewritten");

    // A fresh claim is an ASSIGNMENT fact only: `assigned` is outside LD 44 (e)'s human-settable
    // allowlist, so a claim that also wrote a status would be writing a value no ruled rail may.
    const fresh = await newUnclaimedRequest();
    const before = await readRow(fresh);
    await claimBookingRequest({ requestId: fresh, actorUserId: agentBId });
    const afterClaim = await readRow(fresh);
    assert.equal(afterClaim.expert_id, agentBId);
    assert.equal(afterClaim.status, before.status, "a claim must not touch the status column");

    const { HUMAN_SETTABLE_BOOKING_AGENT_STATUSES } = await import("@shared/booking-agent-vocabulary");
    assert.equal(
      (HUMAN_SETTABLE_BOOKING_AGENT_STATUSES as readonly string[]).includes("assigned"),
      false,
      "`assigned` is not a status a human rail may write — which is why the claim writes none",
    );
  });

  // ── C11 ─────────────────────────────────────────────────────────────────────────────────────
  it("C11 — a request born `received` (ledger `2026-09-20-handoff-born-received`) claims exactly as a legacy `pending` one", async () => {
    const id = await newUnclaimedRequest("received");
    assert.equal((await readRow(id)).status, "received");

    const claimed = await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    assert.equal(claimed.ok, true);
    assert.equal((claimed as { alreadyYours: boolean }).alreadyYours, false);
    const row = await readRow(id);
    assert.equal(row.expert_id, agentAId);
    assert.equal(row.status, "received", "a claim writes no status regardless of the birth value");

    // A second agent is refused exactly as they would be against a `pending` row.
    const refused = await claimBookingRequest({ requestId: id, actorUserId: agentBId });
    assert.equal((refused as { reason: string }).reason, "already_claimed");

    // The holder's own retry is idempotent, exactly as C3 proves for `pending`.
    const retry = await claimBookingRequest({ requestId: id, actorUserId: agentAId });
    assert.equal(retry.ok, true);
    assert.equal((retry as { alreadyYours: boolean }).alreadyYours, true);
  });
});
