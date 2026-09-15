/**
 * `confirmed` NEEDS THE PARTNER'S OWN EVIDENCE.
 *
 * Punchlist decision **D-10, option A** (decision-maker ratified Sep 15, 2026; ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`). CLAUDE.md Locked Decision 44 (c)/(e); §13,
 * §15, §18b, §18 rule 1, §19.
 *
 *   An external/affiliate booking reaches `confirmed` ONLY on PARTNER-ORIGINATED evidence: a
 *   partner callback (none exists today) or the affiliate network's reported conversion matched
 *   back on `sub_id` by the reconciliation matcher. A human agent's typed confirmation reference
 *   is real and stays visible, but it yields `purchased_by_human` with "reference recorded,
 *   awaiting the partner's confirmation" — never `confirmed`.
 *
 * WHAT WAS THERE. `confirmed` sat in `HUMAN_SETTABLE_BOOKING_AGENT_STATUSES`, both agent surfaces
 * PATCHed it on a press, and `storage.confirmAffiliateBookingRequest` wrote it — so the platform
 * told a traveler "Booked" on the strength of an agent ticking a box, with nothing from the
 * partner at all. The `sub_id` matcher, which DOES hold the partner's word, wrote no status.
 *
 *   D1  THE HUMAN RAIL CANNOT WRITE `confirmed` — in both layers. The shared allowlist refuses it
 *       and the refusal names the RULE (not "the platform writes this", which would be the wrong
 *       fact about who decides); the old storage writer is DELETED, not merely unused (§18c); and
 *       no file under `server/` outside the ONE writer sets this column to `'confirmed'`.
 *   D2  A HUMAN PRESS RECORDS A PURCHASE, WITH THE REFERENCE. `purchased_by_human` lands together
 *       with the agent's typed `confirmation_ref`, and the row does NOT read as confirmed.
 *   D3  THE SECOND PRESS IS A ZERO-ROW NO-OP. The §15 statement is the guard, so the confirm
 *       side-effects (plan item, earning ledger) can fire exactly once.
 *   D4  A PRESS NEVER PULLS A ROW OFF THE PARTNER'S WORD. A row already `confirmed` refuses the
 *       purchase transition outright.
 *   D5  THE MATCHER'S WRITER IS THE ONE WRITER, AND IT IS IDEMPOTENT. It flips exactly once,
 *       records the partner's evidence, and answers `already_confirmed` on replay without writing.
 *   D6  THE EVIDENCE IS NEVER INVENTED (§13). An unreported amount, currency, reference or date is
 *       OMITTED from the marker; a contradicted prior state is NAMED; and `confirmation_ref` is
 *       never overwritten with a network action id.
 *   D7  A CLIENT-SUPPLIED `status:'confirmed'` IS REFUSED BY THE ROUTE (§19 posture): the PATCH
 *       rail is pinned to run the shared predicate and answer 400 with the shared refusal BEFORE
 *       it reads or writes anything.
 *   D8  NO BACKFILL. A legacy row already at `confirmed` keeps its value and its (absent)
 *       reference — a row confirmed under the old rule was confirmed under it.
 *
 * NEGATIVE SPACE, STATED — the load-bearing half. **No HTTP is exercised here.** The writes and
 * the decisions run against real Postgres; the Express rail is a thin adapter proven by source
 * pins (comments stripped) that it parses the shared allowlist, derives the transition from the
 * shared purchase predicate, and calls the atomic writer. A green run therefore says the writes
 * and the vocabulary are right and the adapter is shaped right — not that Express delivered them.
 * It asserts nothing about the partner REPORT FETCHERS (mocked elsewhere, in
 * `affiliate-reconciliation-token-adoption.test.ts`), nothing about partner-side CHANGES or
 * CANCELLATIONS (no signal exists, by ruling), and nothing about the plan ITEM's own booking
 * status, which this lane leaves at `pending` and never upgrades.
 *
 * Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-concurrency=1 --test-force-exit \
 *     server/__tests__/booking-agent-confirmed.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/traveloure";
}

const { pool } = await import("../db");
const { storage } = await import("../storage");
const {
  buildPartnerConfirmationNote,
  confirmFromPartnerReport,
  PARTNER_CONFIRMATION_MARKER_PREFIX,
} = await import("../services/affiliate-booking-confirmation.service");
const {
  HUMAN_SETTABLE_BOOKING_AGENT_STATUSES,
  bookingAgentStatusRefusal,
  isHumanSettableBookingAgentStatus,
} = await import("@shared/booking-agent-vocabulary");

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Comments stripped, so a pin never passes (or fails) on prose. */
function sourceWithoutComments(relPath: string): string {
  return fs
    .readFileSync(path.join(ROOT, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let travelerId = "";
const createdRequestIds: string[] = [];

async function newRequest(status: string, extra: Record<string, unknown> = {}): Promise<string> {
  const row = await storage.createAffiliateBookingRequest({
    userId: travelerId,
    expertId: null,
    itemName: "Nishiki Market food walk",
    itemDescription: null,
    partnerName: "WeGoTrip",
    partnerCategory: "tours",
    affiliateUrl: "https://partner.example.com/book?sub_id=405110.d10-db-test",
    travelDate: null,
    travelers: 2,
    userNotes: null,
    expertNotes: null,
    confirmationRef: null,
    price: null,
    status,
    ...extra,
  } as any);
  createdRequestIds.push(row.id);
  return row.id;
}

async function readRow(
  id: string,
): Promise<{ status: string | null; confirmation_ref: string | null; expert_notes: string | null }> {
  const { rows } = await pool.query(
    `SELECT status, confirmation_ref, expert_notes FROM affiliate_booking_requests WHERE id = $1`,
    [id],
  );
  return rows[0];
}

describe("D-10 — `confirmed` needs partner evidence", () => {
  before(async () => {
    travelerId = crypto.randomUUID();
    await pool.query(`INSERT INTO users (id, email, role) VALUES ($1, $2, 'user')`, [
      travelerId,
      `d10-traveler-${travelerId}@t.test`,
    ]);
  });

  after(async () => {
    if (createdRequestIds.length) {
      await pool.query(`DELETE FROM affiliate_booking_requests WHERE id = ANY($1::varchar[])`, [
        createdRequestIds,
      ]);
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [travelerId]);
    await pool.end();
  });

  // ── D1 ──────────────────────────────────────────────────────────────────────────────────────
  it("D1 — the human rail cannot write `confirmed`, and only ONE module under server/ writes it", () => {
    assert.equal(
      (HUMAN_SETTABLE_BOOKING_AGENT_STATUSES as readonly string[]).includes("confirmed"),
      false,
      "`confirmed` is still in the human-settable allowlist",
    );
    assert.equal(isHumanSettableBookingAgentStatus("confirmed"), false);
    const refusal = bookingAgentStatusRefusal("confirmed");
    assert.match(refusal, /partner/i, "the refusal must name the partner rule");
    assert.match(refusal, /purchased_by_human/, "the refusal must say what to do instead");

    // §18c: the old writer is DELETED, not left dormant for a caller to rediscover.
    const storageSrc = sourceWithoutComments("server/storage.ts");
    assert.equal(
      /confirmAffiliateBookingRequest\s*\(/.test(storageSrc),
      false,
      "storage.confirmAffiliateBookingRequest still exists — it wrote `confirmed` on a human press",
    );
    assert.match(
      storageSrc,
      /async recordAffiliateBookingPurchase\s*\(/,
      "the purchase writer must be the storage rail's affiliate transition",
    );

    // ONE WRITER (§18 rule 1). Walk the server tree: no other .ts may set THIS table's status to
    // 'confirmed'. STATED NEGATIVE SPACE: the predicate matches the two shapes this codebase
    // writes — a raw `UPDATE affiliate_booking_requests … status = 'confirmed'` and a drizzle
    // `.update(affiliateBookingRequests) … status: "confirmed"` — within 400 characters of the
    // table name. A dynamically assembled status string would pass it. That is the cost of a
    // static pin, and it is why the runtime proofs above and below stand on their own.
    const serverFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) serverFiles.push(full);
      }
    };
    walk(path.join(ROOT, "server"));
    const writers = serverFiles.filter((file) => {
      const src = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return (
        /UPDATE\s+affiliate_booking_requests[\s\S]{0,400}?status\s*=\s*'confirmed'/i.test(src) ||
        /\.update\(affiliateBookingRequests\)[\s\S]{0,400}?(^|[^A-Za-z])status:\s*"confirmed"/m.test(src)
      );
    });
    assert.deepEqual(
      writers.map((f) => path.relative(ROOT, f)),
      ["server/services/affiliate-booking-confirmation.service.ts"],
      "exactly one module may write affiliate_booking_requests.status = 'confirmed'",
    );
  });

  // ── D2 ──────────────────────────────────────────────────────────────────────────────────────
  it("D2 — a human press records `purchased_by_human` WITH the reference, and is not confirmed", async () => {
    const id = await newRequest("pending");
    const updated = await storage.recordAffiliateBookingPurchase(id, "purchased_by_human", {
      confirmationRef: "WGT-77421",
    });
    assert.ok(updated, "the press must claim the row");
    assert.equal(updated!.status, "purchased_by_human");
    assert.equal(updated!.confirmationRef, "WGT-77421");

    const row = await readRow(id);
    assert.equal(row.status, "purchased_by_human");
    assert.notEqual(row.status, "confirmed");
    // The reference is REAL and stays visible — D-10 does not discard it, it declines to read it
    // as the partner's word.
    assert.equal(row.confirmation_ref, "WGT-77421");
  });

  // ── D3 ──────────────────────────────────────────────────────────────────────────────────────
  it("D3 — a second press matches ZERO rows, so the side-effects can fire exactly once", async () => {
    const id = await newRequest("pending");
    const first = await storage.recordAffiliateBookingPurchase(id, "purchased_by_human", {});
    assert.ok(first, "the first press wins");

    const second = await storage.recordAffiliateBookingPurchase(id, "purchased_by_human", {
      confirmationRef: "SHOULD-NOT-LAND",
    });
    assert.equal(second, undefined, "a second press must claim nothing — the statement is the guard");
    assert.equal((await readRow(id)).confirmation_ref, null, "the no-op must not write a field either");

    // And two CONCURRENT presses produce exactly one winner, for the same reason.
    const raceId = await newRequest("pending");
    const [a, b] = await Promise.all([
      storage.recordAffiliateBookingPurchase(raceId, "purchased_by_human", {}),
      storage.recordAffiliateBookingPurchase(raceId, "purchased_by_traveler", {}),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1, "exactly one concurrent press may win");
  });

  // ── D4 ──────────────────────────────────────────────────────────────────────────────────────
  it("D4 — a press never pulls a row back off the partner's word", async () => {
    const id = await newRequest("confirmed", { confirmationRef: "PARTNER-OK" });
    const attempted = await storage.recordAffiliateBookingPurchase(id, "purchased_by_human", {
      confirmationRef: "AGENT-TYPED",
    });
    assert.equal(attempted, undefined, "a `confirmed` row must refuse the purchase transition");
    const row = await readRow(id);
    assert.equal(row.status, "confirmed");
    assert.equal(row.confirmation_ref, "PARTNER-OK");
  });

  // ── D5 ──────────────────────────────────────────────────────────────────────────────────────
  it("D5 — the partner report is the ONE writer of `confirmed`, once, and a replay writes nothing", async () => {
    const id = await newRequest("purchased_by_human", { confirmationRef: "WGT-77421" });

    const first = await confirmFromPartnerReport(id, {
      partner: "travelpayouts",
      partnerReferenceId: "tp-action-99",
      reportedAmount: 12.4,
      reportedCurrency: "USD",
      reportedAt: "2026-09-14T10:00:00.000Z",
    });
    assert.equal(first.confirmed, true);
    assert.equal(first.previousStatus, "purchased_by_human");

    const row = await readRow(id);
    assert.equal(row.status, "confirmed");
    // §13: the partner's evidence is RECORDED on the row's existing free-text field, and the
    // agent's own reference is untouched — a network action id is not a booking confirmation
    // number and never replaces one.
    assert.ok(row.expert_notes?.includes(PARTNER_CONFIRMATION_MARKER_PREFIX));
    assert.match(row.expert_notes!, /travelpayouts/);
    assert.match(row.expert_notes!, /tp-action-99/);
    assert.match(row.expert_notes!, /12\.4/);
    assert.equal(row.confirmation_ref, "WGT-77421");

    const replay = await confirmFromPartnerReport(id, { partner: "travelpayouts" });
    assert.equal(replay.confirmed, false);
    assert.equal(replay.reason, "already_confirmed");
    const after = await readRow(id);
    assert.equal(after.expert_notes, row.expert_notes, "a replay must append nothing");

    const missing = await confirmFromPartnerReport(crypto.randomUUID(), { partner: "travelpayouts" });
    assert.equal(missing.confirmed, false);
    assert.equal(missing.reason, "not_found");

    // The matcher is the caller, and it hands the writer the partner's REPORTED numbers verbatim.
    const matcher = sourceWithoutComments("server/services/affiliate-reconciliation.service.ts");
    assert.match(matcher, /confirmFromPartnerReport\(/, "the matcher must call the one writer");
    assert.match(matcher, /reportedAmount:\s*ext\.amount/, "the reported amount is the partner's own");
  });

  // ── D6 ──────────────────────────────────────────────────────────────────────────────────────
  it("D6 — the evidence marker states only what the partner reported, and names a contradiction", async () => {
    // A partner that reported nothing but "a conversion on this token" says exactly that: no
    // amount, no currency, no reference, no date invented (§13).
    const bare = buildPartnerConfirmationNote({}, "purchased_by_human", new Date("2026-09-15T00:00:00Z"));
    assert.match(bare, /the partner reported this booking/);
    assert.doesNotMatch(bare, /reported amount/);
    assert.doesNotMatch(bare, /partner reference/);
    assert.doesNotMatch(bare, /\b0\b/);
    assert.doesNotMatch(bare, /USD/);

    // A prior state the report CONTRADICTS is named, so the agent sees it rather than the record
    // changing quietly under them.
    const contradicted = buildPartnerConfirmationNote(
      { partner: "travelpayouts" },
      "unavailable",
      new Date("2026-09-15T00:00:00Z"),
    );
    assert.match(contradicted, /overrides the agent's earlier "unavailable"/);
    const ordinary = buildPartnerConfirmationNote(
      { partner: "travelpayouts" },
      "ready_to_buy",
      new Date("2026-09-15T00:00:00Z"),
    );
    assert.doesNotMatch(ordinary, /overrides/);

    // Live: a confirm over a `failed` row flips it AND leaves the contradiction on the record,
    // appended to the agent's existing note rather than replacing it.
    const id = await newRequest("failed", { expertNotes: "Sold out when I checked." });
    const outcome = await confirmFromPartnerReport(id, { partner: "travelpayouts" });
    assert.equal(outcome.confirmed, true);
    assert.equal(outcome.previousStatus, "failed");
    const row = await readRow(id);
    assert.match(row.expert_notes!, /Sold out when I checked\./);
    assert.match(row.expert_notes!, /overrides the agent's earlier "failed"/);
  });

  // ── D7 ──────────────────────────────────────────────────────────────────────────────────────
  it("D7 — the PATCH rail refuses a client-supplied `confirmed` before it writes anything", () => {
    const routes = sourceWithoutComments("server/routes/content.routes.ts");
    const start = routes.indexOf('router.patch("/api/affiliate-booking-requests/:id"');
    const end = routes.indexOf('router.post("/api/affiliate-booking-requests/:id/verify"');
    assert.ok(start > -1 && end > start, "the PATCH rail must stay greppable — repair this pin, never delete it");
    const handler = routes.slice(start, end);

    // The allowlist gate is the SHARED predicate and its SHARED refusal (§18 rule 1) …
    assert.match(handler, /!isHumanSettableBookingAgentStatus\(data\.status\)/);
    assert.match(handler, /bookingAgentStatusRefusal\(data\.status\)/);
    // … it answers 400 …
    assert.match(handler, /res\.status\(400\)\.json\(\{\s*message:\s*bookingAgentStatusRefusal/);
    // … and it runs BEFORE the row is even read, so a refused status touches nothing.
    const gate = handler.indexOf("isHumanSettableBookingAgentStatus");
    const read = handler.indexOf("getAffiliateBookingRequestById");
    assert.ok(gate > -1 && read > gate, "the status gate must precede the row read");

    // The transition is derived from the SHARED purchase predicate, never from a local literal,
    // and it drives the atomic writer.
    assert.match(handler, /isHumanPurchaseBookingAgentStatus\(data\.status\)/);
    assert.match(handler, /storage\.recordAffiliateBookingPurchase\(id,\s*purchaseStatus,\s*data\)/);
    assert.equal(
      /["']confirmed["']/.test(handler),
      false,
      "the PATCH rail must not name `confirmed` at all — it is not its value to write",
    );

    // And neither agent surface sends it. The pin is scoped to the mutation that targets THIS
    // rail — `service_bookings`' own accept/decline (`/api/expert/bookings/:id/status`) legitimately
    // writes `confirmed` in its own vocabulary on the same page, and is none of this lane's
    // business (LD 44: the two status columns are never merged, mirrored or derived).
    for (const [surface, mutationName] of [
      ["client/src/pages/expert/inbox.tsx", "updateMutation"],
      ["client/src/pages/expert/workspace.tsx", "updateBookingMutation"],
    ] as const) {
      const src = sourceWithoutComments(surface);
      const mutationFn = src.slice(src.indexOf(`const ${mutationName} = useMutation`));
      assert.match(
        mutationFn.slice(0, 600),
        /\/api\/affiliate-booking-requests\//,
        `${surface}: ${mutationName} must be the affiliate-booking rail — repair this pin, never delete it`,
      );
      const presses = [...src.matchAll(new RegExp(`${mutationName}\\.mutate\\(\\{[\\s\\S]{0,400}?\\}\\)`, "g"))]
        .map((m) => m[0]);
      assert.ok(presses.length > 0, `${surface}: no ${mutationName} press found`);
      for (const press of presses) {
        assert.equal(
          /status:\s*"confirmed"/.test(press),
          false,
          `${surface} still sends status: "confirmed" on the affiliate rail`,
        );
      }
      assert.ok(
        presses.some((press) => /status:\s*"purchased_by_human"/.test(press)),
        `${surface} must record a purchase, not a confirmation`,
      );
    }
  });

  // ── D8 ──────────────────────────────────────────────────────────────────────────────────────
  it("D8 — no backfill: a legacy `confirmed` row keeps its value and its absent reference", async () => {
    const id = await newRequest("confirmed");
    const before = await readRow(id);
    assert.equal(before.status, "confirmed");
    assert.equal(before.confirmation_ref, null);

    // Nothing in this lane rewrites it, and an ordinary field edit leaves the status alone.
    await storage.updateAffiliateBookingRequest(id, { expertNotes: "legacy row, untouched" });
    const after = await readRow(id);
    assert.equal(after.status, "confirmed");
    assert.equal(after.confirmation_ref, null);
    assert.equal(after.expert_notes, "legacy row, untouched");

    // No migration was added by this lane — the column stays varchar(30) with no CHECK.
    const migrations = fs.readdirSync(path.join(ROOT, "server", "migrations"));
    const d10 = migrations.filter((f) => /confirm|partner_evidence|d10/i.test(f) && f.endsWith(".sql"));
    assert.deepEqual(d10, [], "D-10 adds no migration");
  });
});
