/**
 * Outbox expiry (fix queue row 167).
 *
 *   npx tsx --test --test-concurrency=1 server/__tests__/email-outbox-expiry.test.ts
 *
 * A past expires_at is held and not sent. A future one still follows the allowlist.
 * NULL is not expired. The lifetime is the single 3-day constant until a per-type
 * table is confirmed.
 */
import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../db.js";
import { logger } from "../infrastructure/logger.js";
import {
  OUTBOX_EXPIRY_REASON,
  OUTBOX_ROW_LIFETIME_BY_TYPE,
  OUTBOX_ROW_LIFETIME_MS,
  outboxExpiresAt,
  outboxRowIsExpired,
} from "../services/email-outbox-expiry.js";
import {
  _outboxTestHooks,
  drainOutbox,
  enqueueEmail,
  logPendingRowsPastExpiry,
} from "../services/email-outbox.service.js";

let origExecute: typeof db.execute;
let origInsert: typeof db.insert;

before(() => {
  origExecute = db.execute.bind(db);
  origInsert = db.insert.bind(db);
});

beforeEach(() => {
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset,email_verification,payment_failed";
});

afterEach(() => {
  (db as { execute: typeof db.execute }).execute = origExecute;
  (db as { insert: typeof db.insert }).insert = origInsert;
  delete _outboxTestHooks.sendEmailFn;
});

function chunkToString(c: unknown): string {
  if (c === null) return "NULL";
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const obj = c as { queryChunks?: unknown[]; value?: unknown };
    if (obj.queryChunks !== undefined) return obj.queryChunks.map(chunkToString).join("");
    if ("value" in obj) return obj.value === null ? "NULL" : String(obj.value);
  }
  return String(c);
}

function sqlText(query: unknown): string {
  if (typeof query === "string") return query;
  if (query && typeof query === "object" && "queryChunks" in query) {
    return ((query as { queryChunks: unknown[] }).queryChunks).map(chunkToString).join("");
  }
  return String(query);
}

function patchExecute(claimRows: Record<string, unknown>[]): { captured: string[] } {
  const captured: string[] = [];
  let callCount = 0;
  (db as { execute: (query: unknown) => Promise<{ rows: unknown[] }> }).execute = (query: unknown) => {
    captured.push(sqlText(query));
    callCount += 1;
    return Promise.resolve({ rows: callCount === 1 ? claimRows : [] });
  };
  return { captured };
}

function claimedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    to_email: "traveler@example.com",
    subject: "Hello",
    html: "<p>hello</p>",
    text_body: null,
    from_address: null,
    reply_to: null,
    attempt_count: 0,
    max_attempts: 6,
    email_type: "password_reset",
    metadata: { authCritical: true, linkExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    ...overrides,
  };
}

describe("outbox expiry lifetime", () => {
  it("uses one 3-day constant for every type until a per-type table is confirmed", () => {
    assert.deepEqual(OUTBOX_ROW_LIFETIME_BY_TYPE, {});
    assert.equal(OUTBOX_EXPIRY_REASON, "expired");
    const enqueuedAt = new Date("2026-10-25T17:00:00.000Z");
    for (const emailType of ["guest_invite", "password_reset", "booking_confirmation", undefined]) {
      const at = outboxExpiresAt(emailType, enqueuedAt);
      assert.equal(at.getTime() - enqueuedAt.getTime(), OUTBOX_ROW_LIFETIME_MS, String(emailType));
    }
  });

  it("treats NULL and unreadable values as not expired, and a past instant as expired", () => {
    const now = Date.parse("2026-10-25T17:00:00.000Z");
    assert.equal(outboxRowIsExpired(null, now), false);
    assert.equal(outboxRowIsExpired(undefined, now), false);
    assert.equal(outboxRowIsExpired("", now), false);
    assert.equal(outboxRowIsExpired("not-a-date", now), false);
    assert.equal(outboxRowIsExpired(new Date(now + 1), now), false);
    assert.equal(outboxRowIsExpired(new Date(now), now), true);
    assert.equal(outboxRowIsExpired(new Date(now - 1).toISOString(), now), true);
  });
});

describe("drainOutbox expiry", () => {
  it("does not claim a row whose expires_at has passed", async () => {
    const { captured } = patchExecute([]);
    await drainOutbox();
    assert.match(captured[0] ?? "", /FOR UPDATE SKIP LOCKED/);
    assert.match(captured[0] ?? "", /expires_at IS NULL OR expires_at > NOW\(\)/);
    assert.match(captured[1] ?? "", /expires_at <= NOW\(\)/);
    assert.match(captured[1] ?? "", /expired/);
    assert.match(captured[1] ?? "", /INTERVAL '1 minute'/);
    assert.equal(/attempt_count\s*=/.test(captured[1] ?? ""), false);
  });

  it("does not send a claimed row that is already past expires_at", async () => {
    const { captured } = patchExecute([
      claimedRow({ expires_at: new Date(Date.now() - 60_000) }),
    ]);
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    const result = await drainOutbox();
    assert.equal(providerCalls, 0);
    assert.equal(result.drained, 1);
    const held = captured.filter((text) => text.includes("held") && text.includes("expired"));
    assert.ok(held.length >= 1, captured.join("\n"));
    assert.equal(captured.some((text) => text.includes("should-not-send")), false);
  });

  it("still holds a not-yet-expired unlisted row for the allowlist", async () => {
    const { captured } = patchExecute([
      claimedRow({
        email_type: "guest_invite",
        metadata: {},
        expires_at: new Date(Date.now() + OUTBOX_ROW_LIFETIME_MS),
      }),
    ]);
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 0);
    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("EMAIL_TEMPLATE_ALLOWLIST"), updateSql);
    assert.equal(updateSql.includes("should-not-send"), false);
  });

  it("sends an allowlisted row with no expires_at", async () => {
    patchExecute([claimedRow()]);
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "sent-null-expiry" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 1);
  });

  it("sends an allowlisted row whose expires_at is still ahead", async () => {
    patchExecute([
      claimedRow({ expires_at: new Date(Date.now() + OUTBOX_ROW_LIFETIME_MS) }),
    ]);
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "sent-future-expiry" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 1);
  });

  it("does not mark rows when sends are disabled", async () => {
    delete process.env.EMAIL_SENDS_ENABLED;
    const { captured } = patchExecute([claimedRow({ expires_at: new Date(Date.now() - 60_000) })]);
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    const result = await drainOutbox();
    assert.equal(providerCalls, 0);
    assert.equal(captured.length, 0);
    assert.equal(result.drained, 0);
  });
});

describe("enqueue stores expires_at", () => {
  it("sets guest_invite expiresAt to the 3-day constant", async () => {
    let inserted: { expiresAt?: Date; emailType?: string } | undefined;
    (db as { insert: () => unknown }).insert = () => ({
      values(row: { expiresAt?: Date; emailType?: string }) {
        inserted = row;
        return { returning: () => Promise.resolve([{ id: 9 }]) };
      },
    });
    (db as { execute: () => Promise<{ rows: unknown[] }> }).execute = () => Promise.resolve({ rows: [] });
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "unused" });
    const before = Date.now();
    await enqueueEmail({
      to: "guest@example.com",
      subject: "You're invited",
      html: "<p>invite</p>",
      emailType: "guest_invite",
    });
    assert.equal(inserted?.emailType, "guest_invite");
    assert.ok(inserted?.expiresAt instanceof Date);
    const delta = inserted.expiresAt.getTime() - before;
    assert.ok(delta >= OUTBOX_ROW_LIFETIME_MS - 5_000, String(delta));
    assert.ok(delta <= OUTBOX_ROW_LIFETIME_MS + 5_000, String(delta));
  });
});

describe("pending rows past expiry", () => {
  it("logs the count at boot", async () => {
    const seen: Array<{ obj: unknown; msg?: string }> = [];
    const orig = logger.info.bind(logger);
    (logger as unknown as { info: (obj: unknown, msg?: string) => void }).info = (obj, msg) => {
      seen.push({ obj, msg });
      return orig(obj as object, msg);
    };
    (db as { execute: () => Promise<{ rows: unknown[] }> }).execute = () =>
      Promise.resolve({ rows: [{ n: 4 }] });
    try {
      await logPendingRowsPastExpiry();
    } finally {
      (logger as unknown as { info: typeof orig }).info = orig;
    }
    const line = seen.find((entry) => entry.msg?.includes("pending rows past expiry"));
    assert.ok(line, JSON.stringify(seen));
    assert.equal((line.obj as { pendingPastExpiry?: number }).pendingPastExpiry, 4);
  });

  it("warns and does not throw when the count cannot be read", async () => {
    const warns: string[] = [];
    const orig = logger.warn.bind(logger);
    (logger as unknown as { warn: (obj: unknown, msg?: string) => void }).warn = (obj, msg) => {
      warns.push(msg ?? "");
      return orig(obj as object, msg);
    };
    (db as { execute: () => Promise<unknown> }).execute = () => Promise.reject(new Error("column missing"));
    try {
      await assert.doesNotReject(() => logPendingRowsPastExpiry());
    } finally {
      (logger as unknown as { warn: typeof orig }).warn = orig;
    }
    assert.ok(warns.some((msg) => msg.includes("could not count pending rows past expiry")));
  });

  it("the scheduler start path calls the count", () => {
    const src = readFileSync(new URL("../services/email-outbox.service.ts", import.meta.url), "utf8");
    assert.match(src, /void logPendingRowsPastExpiry\(\)/);
  });
});
