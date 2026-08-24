/**
 * Email Outbox Service — unit tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/email-outbox.test.ts
 *
 * Coverage:
 * (A) Backoff schedule: _nextRetryAfter returns the correct delay for each
 *     failed attempt index, including the boundary clamp for excess indices.
 * (B) Terminal state: after maxAttempts failures the row is marked 'dead' and
 *     no retry_after is scheduled.
 * (C) Success path: a successful send marks the row 'sent' with the Resend id.
 * (D) Concurrent drain safety: the SQL emitted by drainOutbox() contains
 *     FOR UPDATE SKIP LOCKED so concurrent processes cannot claim the same row.
 * (E) Retry schedule alignment: five consecutive failures produce the delays
 *     [5, 15, 45, 120, 360] min before the sixth (terminal) attempt.
 * (F) drainOutbox() is a no-op when no rows are claimed (empty claim result).
 * (G) enqueueEmail() never throws even when both the DB insert and the send fail.
 * (H) Enqueue-vs-drain race: enqueueEmail() inserts the row as status='processing'
 *     so a concurrent drain's FOR UPDATE SKIP LOCKED cannot claim it while
 *     immediate delivery is in flight.
 * (I) Stale-sender safety: the status update uses WHERE status='processing' so
 *     a sender whose lease expired cannot overwrite a row reclaimed by the drain.
 *
 * Strategy:
 * – db.execute is monkey-patched to capture the SQL string and return
 *   controlled data, so no real database is touched.
 * – _outboxTestHooks.sendEmailFn intercepts the actual Resend call.
 * – db.insert is patched for enqueueEmail() tests.
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../db.js";
import {
  _nextRetryAfter,
  BACKOFF_MINUTES,
  _outboxTestHooks,
  drainOutbox,
  enqueueEmail,
} from "../services/email-outbox.service.js";

// ─── Saved originals ──────────────────────────────────────────────────────────

let origExecute: typeof db.execute;
let origInsert:  typeof db.insert;

before(() => {
  origExecute = db.execute.bind(db);
  origInsert  = db.insert.bind(db);
});

after(() => {
  (db as any).execute = origExecute;
  (db as any).insert  = origInsert;
  delete _outboxTestHooks.sendEmailFn;
});

afterEach(() => {
  (db as any).execute = origExecute;
  (db as any).insert  = origInsert;
  delete _outboxTestHooks.sendEmailFn;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fake outbox row returned from the claim CTE (snake_case, as pg returns it). */
function makeClaimedRow(overrides: Partial<{
  id:            number;
  to_email:      string;
  subject:       string;
  html:          string;
  text_body:     string | null;
  from_address:  string | null;
  reply_to:      string | null;
  attempt_count: number;
  max_attempts:  number;
}>): Record<string, unknown> {
  return {
    id:            1,
    to_email:      "traveler@example.com",
    subject:       "Your booking is confirmed — Day tour",
    html:          "<p>confirmed</p>",
    text_body:     null,
    from_address:  null,
    reply_to:      null,
    attempt_count: 0,
    max_attempts:  6,
    ...overrides,
  };
}

/**
 * Serialize a Drizzle SQL chunk value to a string for assertion inspection.
 * Null parameter values are represented as the literal text "NULL".
 */
function chunkToString(c: unknown): string {
  if (c === null) return "NULL";
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const obj = c as any;
    // Drizzle SQL template nodes expose queryChunks recursively
    if (obj.queryChunks !== undefined) {
      return (obj.queryChunks as unknown[]).map(chunkToString).join("");
    }
    if ("value" in obj) return obj.value === null ? "NULL" : String(obj.value);
  }
  return String(c);
}

/**
 * Patch db.execute to:
 *  1. Capture every SQL string emitted (with null params serialized as "NULL").
 *  2. Return `claimRows` for the first call (the CTE claim) and `[]` for
 *     subsequent calls (the status-update after delivery).
 */
function patchExecute(claimRows: Record<string, unknown>[]): {
  captured: string[];
} {
  const captured: string[] = [];
  let callCount = 0;

  (db as any).execute = (query: any) => {
    const sqlString: string =
      typeof query === "string"
        ? query
        : typeof query?.queryChunks !== "undefined"
          ? (query.queryChunks as unknown[]).map(chunkToString).join("")
          : typeof query?.sql === "string"
            ? query.sql
            : String(query);

    captured.push(sqlString);
    callCount++;

    // First call is the claim CTE; subsequent calls are the row-update.
    return Promise.resolve({ rows: callCount === 1 ? claimRows : [] });
  };

  return { captured };
}

// ─── (A) Backoff schedule ──────────────────────────────────────────────────────

describe("_nextRetryAfter — backoff schedule", () => {
  it("(A1) after 1st failure schedules a ~5-min delay", () => {
    const before = Date.now();
    const d      = _nextRetryAfter(1);
    const minMs  = BACKOFF_MINUTES[0] * 60 * 1000;
    assert.ok(d.getTime() >= before + minMs - 50,    "must be at least 5 min in the future");
    assert.ok(d.getTime() <= Date.now() + minMs + 200, "must not exceed 5 min + 200ms");
  });

  it("(A2) after 2nd failure schedules a ~15-min delay", () => {
    const before = Date.now();
    const d      = _nextRetryAfter(2);
    const minMs  = BACKOFF_MINUTES[1] * 60 * 1000;
    assert.ok(d.getTime() >= before + minMs - 50);
    assert.ok(d.getTime() <= Date.now() + minMs + 200);
  });

  it("(A3) after 3rd failure schedules a ~45-min delay", () => {
    const d     = _nextRetryAfter(3);
    const minMs = BACKOFF_MINUTES[2] * 60 * 1000;
    assert.ok(d.getTime() >= Date.now() + minMs - 200);
  });

  it("(A4) after 4th failure schedules a ~120-min delay", () => {
    const d     = _nextRetryAfter(4);
    const minMs = BACKOFF_MINUTES[3] * 60 * 1000;
    assert.ok(d.getTime() >= Date.now() + minMs - 200);
  });

  it("(A5) after 5th failure schedules a ~360-min delay", () => {
    const d     = _nextRetryAfter(5);
    const minMs = BACKOFF_MINUTES[4] * 60 * 1000;
    assert.ok(d.getTime() >= Date.now() + minMs - 200);
  });

  it("(A6) out-of-bounds index clamps to the last backoff entry (360 min)", () => {
    const d5  = _nextRetryAfter(5);
    const d99 = _nextRetryAfter(99);
    // Both should produce a ~360-min delay; allow 1 s of clock drift.
    assert.ok(
      Math.abs(d99.getTime() - d5.getTime()) < 1000,
      "excess indices must clamp to the final backoff entry"
    );
  });
});

// ─── (E) Five consecutive failures → correct delay sequence ──────────────────

describe("_nextRetryAfter — five-failure sequence matches BACKOFF_MINUTES", () => {
  it("(E) delays align with documented schedule [5, 15, 45, 120, 360] min", () => {
    for (let i = 0; i < BACKOFF_MINUTES.length; i++) {
      const failedCount = i + 1; // 1-based
      const expected    = BACKOFF_MINUTES[i] * 60 * 1000;
      const d           = _nextRetryAfter(failedCount);
      const actual      = d.getTime() - Date.now();
      assert.ok(
        Math.abs(actual - expected) < 500,
        `attempt ${failedCount}: expected ~${BACKOFF_MINUTES[i]} min, got ${Math.round(actual / 60000)} min`
      );
    }
  });
});

// ─── (B) Terminal state ───────────────────────────────────────────────────────

describe("drainOutbox — terminal state (dead)", () => {
  it("(B) after maxAttempts failures the row is marked dead with retry_after=NULL", async () => {
    // Row has already failed 5 times; the 6th attempt exhausts maxAttempts=6.
    const row = makeClaimedRow({ attempt_count: 5, max_attempts: 6 });
    const { captured } = patchExecute([row]);

    _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "Resend 503" });

    await drainOutbox();

    assert.ok(captured.length >= 2, "must emit at least the claim + update SQL");

    const updateSql = captured.slice(1).join("\n");
    assert.ok(
      updateSql.includes("dead"),
      `status-update SQL must contain 'dead'; got: ${updateSql}`
    );
    assert.ok(
      updateSql.includes("NULL"),
      `retry_after must be set to NULL for dead rows; got: ${updateSql}`
    );
  });
});

// ─── (C) Success path ─────────────────────────────────────────────────────────

describe("drainOutbox — success path", () => {
  it("(C) marks row sent with resend_id, clears last_error, conditional on status='processing'", async () => {
    const row = makeClaimedRow({ attempt_count: 1, max_attempts: 6 });
    const { captured } = patchExecute([row]);

    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "resend-abc-123" });

    await drainOutbox();

    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("sent"),              "status must be set to 'sent'");
    assert.ok(updateSql.includes("resend-abc-123"),    "resend_id must be embedded in the update");
    assert.ok(
      updateSql.toLowerCase().includes("status") && updateSql.toLowerCase().includes("processing"),
      "update must be conditional on status='processing' to prevent stale-sender overwrites"
    );
  });
});

// ─── (D) Concurrent drain safety ─────────────────────────────────────────────

describe("drainOutbox — concurrent drain safety", () => {
  it("(D) claim SQL contains FOR UPDATE SKIP LOCKED", async () => {
    const { captured } = patchExecute([]); // no rows → nothing to deliver

    await drainOutbox();

    assert.ok(captured.length >= 1, "drainOutbox must emit at least the claim SQL");
    const claimSql = captured[0].toUpperCase();
    assert.ok(
      claimSql.includes("FOR UPDATE SKIP LOCKED"),
      `claim SQL must contain FOR UPDATE SKIP LOCKED; got:\n${captured[0]}`
    );
  });
});

// ─── (F) No-op when claim returns no rows ────────────────────────────────────

describe("drainOutbox — no-op on empty claim", () => {
  it("(F) emits only the claim SQL and no update SQL when no rows are claimed", async () => {
    const { captured } = patchExecute([]); // empty claim

    _outboxTestHooks.sendEmailFn = async () => {
      throw new Error("sendEmail must not be called when no rows are claimed");
    };

    await drainOutbox();

    assert.strictEqual(
      captured.length,
      1,
      "must emit exactly one SQL call (the claim CTE) when no rows are due"
    );
  });
});

// ─── (G) enqueueEmail never throws ───────────────────────────────────────────

describe("enqueueEmail — never throws", () => {
  it("(G1) does not throw when the DB insert fails", async () => {
    (db as any).insert  = () => { throw new Error("DB insert failed"); };
    (db as any).execute = () => Promise.resolve({ rows: [] });
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "resend-xyz" });

    await assert.doesNotReject(
      () => enqueueEmail({ to: "t@example.com", subject: "Test", html: "<p>x</p>" }),
      "enqueueEmail must not throw when the DB insert fails"
    );
  });

  it("(G2) does not throw when both DB insert and send fail", async () => {
    (db as any).insert  = () => { throw new Error("DB insert failed"); };
    (db as any).execute = () => Promise.resolve({ rows: [] });
    _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "Resend timeout" });

    await assert.doesNotReject(
      () => enqueueEmail({ to: "t@example.com", subject: "Test", html: "<p>x</p>" }),
      "enqueueEmail must not throw when both DB insert and send fail"
    );
  });
});

// ─── (H) Enqueue-vs-drain race ────────────────────────────────────────────────

describe("enqueueEmail — enqueue-vs-drain race protection", () => {
  it("(H) enqueueEmail inserts the row as status='processing' (not 'pending')", async () => {
    let insertedStatus: string | undefined;

    (db as any).insert = (_table: any) => ({
      values(row: any) {
        insertedStatus = row.status;
        return {
          returning(_fields: any) {
            return Promise.resolve([{ id: 42 }]);
          },
        };
      },
    });

    // After insert, execute is called for the status update; let it succeed.
    (db as any).execute = () => Promise.resolve({ rows: [] });
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "r-1" });

    await enqueueEmail({ to: "t@example.com", subject: "Confirmed", html: "<p>ok</p>" });

    assert.strictEqual(
      insertedStatus,
      "processing",
      "row must be born as 'processing' so the drain's FOR UPDATE SKIP LOCKED cannot claim it"
    );
  });

  it("(H2) a 'processing' row with a live lease is NOT targeted by the drain claim SQL", async () => {
    // The drain CTE must not select processing rows whose retry_after (lease) is
    // still in the future — verify by inspecting the WHERE clause of the claim SQL.
    const { captured } = patchExecute([]); // no rows returned (drain finds nothing)

    await drainOutbox();

    const claimSql = captured[0] ?? "";
    // The 'processing' condition must require retry_after to be in the past.
    // This proves live-lease rows are excluded from claims.
    assert.ok(
      claimSql.includes("processing") && claimSql.includes("NOW()"),
      `drain SQL must exclude non-expired processing rows; got:\n${claimSql}`
    );
  });
});

// ─── (I) Stale-sender safety ─────────────────────────────────────────────────

describe("attemptDelivery — stale-sender conditional update", () => {
  it("(I) status update SQL includes AND status='processing' guard for success path", async () => {
    const row = makeClaimedRow({ attempt_count: 0, max_attempts: 6 });
    const { captured } = patchExecute([row]);

    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "r-stale" });

    await drainOutbox();

    const updateSql = captured.slice(1).join("\n").toLowerCase();
    assert.ok(
      updateSql.includes("status") && updateSql.includes("processing"),
      `success-path update must be conditional on status='processing'; got:\n${captured.slice(1).join("\n")}`
    );
  });

  it("(I2) status update SQL includes AND status='processing' guard for failure path", async () => {
    const row = makeClaimedRow({ attempt_count: 2, max_attempts: 6 });
    const { captured } = patchExecute([row]);

    _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "network error" });

    await drainOutbox();

    const updateSql = captured.slice(1).join("\n").toLowerCase();
    assert.ok(
      updateSql.includes("status") && updateSql.includes("processing"),
      `failure-path update must be conditional on status='processing'; got:\n${captured.slice(1).join("\n")}`
    );
  });
});
