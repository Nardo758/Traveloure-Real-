/**
 * REQUEST LOGS CARRY AN ALLOWLIST OF HEADERS (security fix, Sep 24, 2026). Pure — no DB, no network.
 *
 *   H1  A request through pino-http with the app's serializer logs NONE of the credential headers
 *       (the internal job secret, authorization, cookie, stripe-signature, x-api-key) and keeps the
 *       allowlisted ones.
 *   H2  Credential-looking query values are masked; ordinary ones are kept.
 *   H3  Both the base logger and httpLogger use the allowlist serializer (static pin).
 *
 * Run: npx tsx --test server/__tests__/log-header-allowlist.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { Writable } from "node:stream";
import pino from "pino";
import pinoHttp from "pino-http";
import { redactUrlForLog, safeRequestSerializer } from "../infrastructure/logger";

const SECRET = "int_job_secret_value_that_must_never_be_logged";

test("H1: credential headers never reach the request log; allowlisted ones do", async () => {
  const lines: string[] = [];
  const sink = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); } });
  const log = pino({ serializers: { req: safeRequestSerializer } }, sink);
  const mw = pinoHttp({ logger: log, serializers: { req: safeRequestSerializer } });
  const server = http.createServer((req, res) => {
    mw(req, res);
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  await fetch(`http://127.0.0.1:${port}/internal/run-occasion-drafts?token=${SECRET}&page=2`, {
    method: "POST",
    headers: {
      "x-internal-secret": SECRET,
      authorization: `Bearer ${SECRET}`,
      cookie: `sid=${SECRET}`,
      "stripe-signature": `t=1,v1=${SECRET}`,
      "x-api-key": SECRET,
      "x-request-id": "req-123",
      "user-agent": "trigger/1.0",
    },
  });
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise((r) => setTimeout(r, 20));
  const out = lines.join("");
  assert.ok(out.length > 0, "a request line was logged");
  assert.ok(!out.includes(SECRET), "no credential value appears anywhere in the log");
  const entry = JSON.parse(lines.find((l) => l.includes('"req"'))!);
  assert.equal(entry.req.headers["x-request-id"], "req-123");
  assert.equal(entry.req.headers["user-agent"], "trigger/1.0");
  for (const h of ["x-internal-secret", "authorization", "cookie", "stripe-signature", "x-api-key"]) {
    assert.equal(entry.req.headers[h], undefined, `${h} is not logged`);
  }
  assert.match(entry.req.url, /token=\[REDACTED\]&page=2$/);
});

test("H2: credential-looking query values are masked, others kept", () => {
  assert.equal(redactUrlForLog("/a?page=2&sort=asc"), "/a?page=2&sort=asc");
  assert.equal(redactUrlForLog("/a?claim_token=x&api_key=y&q=z"), "/a?claim_token=[REDACTED]&api_key=[REDACTED]&q=z");
  assert.equal(redactUrlForLog("/a?Signature=x"), "/a?Signature=[REDACTED]");
  assert.equal(redactUrlForLog("/a"), "/a");
  assert.equal(redactUrlForLog(undefined), undefined);
  assert.equal(redactUrlForLog("/a?flag"), "/a?flag");
});

test("H3: the app's loggers use the allowlist serializer", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../infrastructure/logger.ts"), "utf8");
  assert.ok(!src.includes("req: pino.stdSerializers.req"), "the raw request serializer is not used");
  assert.equal((src.match(/req: safeRequestSerializer/g) ?? []).length, 2, "base logger and httpLogger both use it");
});
