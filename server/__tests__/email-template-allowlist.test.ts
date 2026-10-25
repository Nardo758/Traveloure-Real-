/**
 * EMAIL_TEMPLATE_ALLOWLIST — fail closed after EMAIL_SENDS_ENABLED.
 *
 * Run with:
 *   npx tsx --test server/__tests__/email-template-allowlist.test.ts
 *
 * An outbox row leaves only when both gates allow its email_type. Unset, empty,
 * or blank allows nothing. Auth-critical types are not exempt. Direct sendEmail
 * callers are not covered here.
 */

import { describe, it, before, beforeEach, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { db } from "../db.js";
import { logger } from "../infrastructure/logger.js";
import {
  emailTemplateAllowed,
  emailTemplateAllowlist,
} from "../services/email.service.js";
import {
  _outboxTestHooks,
  adminOutboxRetryRefusal,
  deliverQueuedEmail,
  drainOutbox,
  enqueueEmail,
} from "../services/email-outbox.service.js";

const RECIPIENT = "traveler@example.com";

let origExecute: typeof db.execute;
let origInsert: typeof db.insert;
let priorSends: string | undefined;
let priorAllow: string | undefined;

before(() => {
  origExecute = db.execute.bind(db);
  origInsert = db.insert.bind(db);
  priorSends = process.env.EMAIL_SENDS_ENABLED;
  priorAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;
});

beforeEach(() => {
  process.env.EMAIL_SENDS_ENABLED = "true";
  delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
});

after(() => {
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
  delete _outboxTestHooks.sendEmailFn;
  restoreEnv();
});

afterEach(() => {
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
  delete _outboxTestHooks.sendEmailFn;
  restoreEnv();
});

function restoreEnv(): void {
  if (priorSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = priorSends;
  if (priorAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = priorAllow;
}

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
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (chunks) return chunks.map(chunkToString).join("");
  return String(query);
}

function claimedRow(emailType: string, id = 41): Record<string, unknown> {
  return {
    id,
    to_email: RECIPIENT,
    subject: "A notice",
    html: "<p>hello</p>",
    text_body: null,
    from_address: null,
    reply_to: null,
    attempt_count: 0,
    max_attempts: 6,
    email_type: emailType,
    metadata: emailType === "password_reset" || emailType === "email_verification"
      ? { authCritical: true, linkExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
      : {},
  };
}

/** Claim SQL returns the row only when the allowlist fragment names its type. */
function patchDrain(emailType: string): { captured: string[] } {
  const captured: string[] = [];
  (db as any).execute = (query: unknown) => {
    const text = sqlText(query);
    captured.push(text);
    const claim = text.includes("FOR UPDATE SKIP LOCKED");
    const named = text.includes(`ARRAY[`) && text.includes(emailType);
    return Promise.resolve({ rows: claim && named ? [claimedRow(emailType)] : [] });
  };
  return { captured };
}

function captureWarn() {
  const lines: Array<{ obj: unknown; msg?: string }> = [];
  const orig = logger.warn.bind(logger);
  (logger as unknown as { warn: (obj: unknown, msg?: string) => void }).warn = (obj, msg) => {
    lines.push({ obj, msg });
    return orig(obj as object, msg);
  };
  return {
    lines,
    restore() {
      (logger as unknown as { warn: typeof orig }).warn = orig;
    },
  };
}

function assertNoRecipient(lines: Array<{ obj: unknown; msg?: string }>): void {
  const text = JSON.stringify(lines);
  assert.equal(text.includes(RECIPIENT), false);
  assert.equal(text.includes("@"), false);
}

describe("emailTemplateAllowlist parsing", () => {
  it("unset, empty, and blanks allow nothing, and there is no wildcard", () => {
    assert.deepEqual(emailTemplateAllowlist(undefined), []);
    assert.deepEqual(emailTemplateAllowlist(""), []);
    assert.deepEqual(emailTemplateAllowlist("   "), []);
    assert.deepEqual(emailTemplateAllowlist(" , , "), []);
    assert.equal(emailTemplateAllowed("password_reset", []), false);
    assert.equal(emailTemplateAllowed("password_reset", ["*"]), false);
    assert.equal(emailTemplateAllowed("password_reset", ["all"]), false);
  });

  it("trims spaces, drops empty items, and compares exactly", () => {
    assert.deepEqual(
      emailTemplateAllowlist(" password_reset , email_verification "),
      ["password_reset", "email_verification"],
    );
    assert.equal(emailTemplateAllowed("password_reset", ["password_reset", "email_verification"]), true);
    assert.equal(emailTemplateAllowed("Password_Reset", ["password_reset"]), false);
    assert.equal(emailTemplateAllowed("password_reset", ["Password_Reset"]), false);
  });
});

describe("EMAIL_TEMPLATE_ALLOWLIST delivery", () => {
  for (const value of [undefined, "", "   ", " , "] as const) {
    const label = value === undefined ? "unset" : value === "" ? "empty" : "blank";
    it(`${label} allowlist sends nothing even when EMAIL_SENDS_ENABLED=true`, async () => {
      if (value === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
      else process.env.EMAIL_TEMPLATE_ALLOWLIST = value;
      const { captured } = patchDrain("password_reset");
      let providerCalls = 0;
      _outboxTestHooks.sendEmailFn = async () => {
        providerCalls += 1;
        return { ok: true, id: "should-not-send" };
      };
      await drainOutbox();
      assert.equal(providerCalls, 0);
      assert.equal(captured.some((sql) => /attempt_count\s*=/.test(sql)), false);
      assert.ok(captured.some((sql) => sql.includes("FOR UPDATE SKIP LOCKED")));
      assert.ok(captured.some((sql) => sql.includes("FALSE")));
    });
  }

  it("a listed type sends", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset";
    const { captured } = patchDrain("password_reset");
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "allowed" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 1);
    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("sent"), updateSql);
    assert.ok(updateSql.includes("allowed"));
  });

  it("an unlisted type is not claimed on repeat drains and attempt_count stays unchanged", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "email_verification";
    const { captured } = patchDrain("password_reset");
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    await drainOutbox();
    await drainOutbox();
    assert.equal(providerCalls, 0);
    assert.equal(captured.filter((sql) => sql.includes("FOR UPDATE SKIP LOCKED")).length, 2);
    assert.equal(captured.some((sql) => /attempt_count\s*=/.test(sql)), false);
    assert.equal(captured.some((sql) => sql.includes("password_reset")), false);
    assert.ok(captured.some((sql) => sql.includes("email_verification")));
  });

  it("two types listed with spaces both may leave", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = " password_reset , email_verification ";
    const reset = patchDrain("password_reset");
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "reset-sent" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 1);
    assert.ok(reset.captured[0]?.includes("password_reset"));
    assert.ok(reset.captured[0]?.includes("email_verification"));

    const verify = patchDrain("email_verification");
    await drainOutbox();
    assert.equal(providerCalls, 2);
    assert.ok(verify.captured[0]?.includes("email_verification"));
  });

  it("wrong case does not match", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "Password_Reset";
    const { captured } = patchDrain("password_reset");
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 0);
    assert.equal(captured.some((sql) => /attempt_count\s*=/.test(sql)), false);
    assert.ok(captured.some((sql) => sql.includes("Password_Reset")));
    assert.equal(captured.some((sql) => sql.includes("password_reset")), false);
  });

  it("password reset and verification are not exempt unless listed", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "itinerary_ready";
    for (const emailType of ["password_reset", "email_verification"] as const) {
      const { captured } = patchDrain(emailType);
      let providerCalls = 0;
      _outboxTestHooks.sendEmailFn = async () => {
        providerCalls += 1;
        return { ok: true, id: "should-not-send" };
      };
      await drainOutbox();
      assert.equal(providerCalls, 0, emailType);
      assert.equal(captured.some((sql) => /attempt_count\s*=/.test(sql)), false, emailType);
      assert.equal(captured.some((sql) => sql.includes(emailType)), false, emailType);
    }
  });

  it("immediate enqueue of an unlisted row is held without an attempt and logs no recipient", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "itinerary_ready";
    const captured: string[] = [];
    (db as any).insert = () => ({
      values() {
        return { returning: () => Promise.resolve([{ id: 88 }]) };
      },
    });
    (db as any).execute = (query: unknown) => {
      captured.push(sqlText(query));
      return Promise.resolve({ rows: [] });
    };
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    const logs = captureWarn();
    try {
      await enqueueEmail({
        to: RECIPIENT,
        subject: "Reset your Traveloure password",
        html: "<p>reset</p>",
        emailType: "password_reset",
        authCritical: true,
      });
    } finally {
      logs.restore();
    }
    assert.equal(providerCalls, 0);
    const updateSql = captured.join("\n");
    assert.ok(updateSql.includes("held"), updateSql);
    assert.ok(updateSql.includes("EMAIL_TEMPLATE_ALLOWLIST"));
    assert.equal(/attempt_count\s*=/.test(updateSql), false);
    assert.equal(updateSql.includes(RECIPIENT), false);
    assertNoRecipient(logs.lines);
    const refusal = logs.lines.find((line) => line.msg?.includes("EMAIL_TEMPLATE_ALLOWLIST"));
    assert.ok(refusal);
    const obj = refusal.obj as { outboxId?: number; emailType?: string; reason?: string };
    assert.equal(obj.reason, "EMAIL_TEMPLATE_ALLOWLIST");
    assert.equal(obj.emailType, "password_reset");
    assert.equal(obj.outboxId, 88);
  });

  it("deliverQueuedEmail leaves an unlisted due row unclaimed", async () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "itinerary_ready";
    const captured: string[] = [];
    (db as any).execute = (query: unknown) => {
      const text = sqlText(query);
      captured.push(text);
      if (text.includes("SELECT email_type") && !text.includes("UPDATE")) {
        return Promise.resolve({ rows: [{ email_type: "signup_welcome" }] });
      }
      return Promise.resolve({ rows: [] });
    };
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    const logs = captureWarn();
    try {
      await deliverQueuedEmail(19);
    } finally {
      logs.restore();
    }
    assert.equal(providerCalls, 0);
    assert.equal(captured.some((sql) => sql.includes("UPDATE")), false);
    assert.equal(captured.some((sql) => /attempt_count\s*=/.test(sql)), false);
    const refusal = logs.lines.find((line) => line.msg?.includes("EMAIL_TEMPLATE_ALLOWLIST"));
    assert.ok(refusal);
    const obj = refusal.obj as { outboxId?: number; emailType?: string; reason?: string };
    assert.equal(obj.outboxId, 19);
    assert.equal(obj.emailType, "signup_welcome");
    assert.equal(obj.reason, "EMAIL_TEMPLATE_ALLOWLIST");
    assertNoRecipient(logs.lines);
  });

  it("admin retry of an unlisted row refuses and the route checks before the reset", () => {
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "itinerary_ready";
    const logs = captureWarn();
    try {
      assert.equal(adminOutboxRetryRefusal("password_reset", 7), "EMAIL_TEMPLATE_ALLOWLIST");
      assert.equal(adminOutboxRetryRefusal("email_verification", 8), "EMAIL_TEMPLATE_ALLOWLIST");
    } finally {
      logs.restore();
    }
    assertNoRecipient(logs.lines);
    assert.ok(logs.lines.some((line) => {
      const obj = line.obj as { reason?: string; emailType?: string; outboxId?: number };
      return obj.reason === "EMAIL_TEMPLATE_ALLOWLIST" && obj.emailType === "password_reset" && obj.outboxId === 7;
    }));

    process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset";
    assert.equal(adminOutboxRetryRefusal("password_reset", 7), null);

    const route = readFileSync(new URL("../routes/admin.routes.ts", import.meta.url), "utf8");
    const retry = route.slice(route.indexOf("POST /api/admin/email-outbox/:id/retry"));
    const refusalAt = retry.indexOf("adminOutboxRetryRefusal");
    const updateAt = retry.indexOf("SET    status        = 'pending'");
    assert.ok(refusalAt > 0 && updateAt > refusalAt);
  });

  it("EMAIL_SENDS_ENABLED unset still refuses a listed type", async () => {
    delete process.env.EMAIL_SENDS_ENABLED;
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset,email_verification";
    const captured: string[] = [];
    (db as any).execute = (query: unknown) => {
      captured.push(sqlText(query));
      return Promise.resolve({ rows: [claimedRow("password_reset")] });
    };
    let providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      providerCalls += 1;
      return { ok: true, id: "should-not-send" };
    };
    await drainOutbox();
    assert.equal(providerCalls, 0);
    assert.equal(captured.length, 0);

    (db as any).insert = () => ({
      values() {
        return { returning: () => Promise.resolve([{ id: 90 }]) };
      },
    });
    (db as any).execute = (query: unknown) => {
      captured.push(sqlText(query));
      return Promise.resolve({ rows: [] });
    };
    const logs = captureWarn();
    try {
      await enqueueEmail({
        to: RECIPIENT,
        subject: "Reset your Traveloure password",
        html: "<p>reset</p>",
        emailType: "password_reset",
        authCritical: true,
      });
    } finally {
      logs.restore();
    }
    assert.equal(providerCalls, 0);
    const updateSql = captured.join("\n");
    assert.ok(updateSql.includes("held"), updateSql);
    assert.ok(updateSql.includes("EMAIL_SENDS_ENABLED is not true"));
    assert.equal(updateSql.includes("EMAIL_TEMPLATE_ALLOWLIST"), false);
    assert.equal(/attempt_count\s*=/.test(updateSql), false);
    assertNoRecipient(logs.lines);
  });
});
