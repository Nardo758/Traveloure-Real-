/**
 * Z-21 Resend webhook. Signature reject and accept, against the route handler
 * over HTTP with the same raw-body capture the server uses.
 *
 *   H1  a missing secret is 401 and writes nothing
 *   H2  a bad signature is 400 and writes nothing
 *   H3  a signed hard bounce is 200 and one row; a replay stays one row
 *   H4  a signed complaint is one complaint row
 *   H5  a signed transient bounce writes no hard bounce
 *
 *   npx tsx --test server/__tests__/email-suppression.http.test.ts
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_resend_webhook";
}

const { Pool } = await import("pg");
const { resendWebhookHandler } = await import("../services/resend-webhook.js");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RUN = randomUUID().slice(0, 8);
const SECRET = `whsec_${Buffer.from("traveloure-z21-webhook-test-key").toString("base64")}`;
const addr = (label: string) => `z21-hook-${label}-${RUN}@example.test`;

let server: Server;
let base = "";
const priorSecret = process.env.RESEND_WEBHOOK_SECRET;

before(async () => {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.post("/api/webhooks/resend", (req, res) => {
    void resendWebhookHandler(req, res);
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (priorSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = priorSecret;
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.query(`DELETE FROM email_suppressions WHERE email LIKE $1`, [`%${RUN}@example.test`]);
  await pool.end();
});

function sign(payload: string, secret = SECRET): { id: string; timestamp: string; signature: string } {
  const wh = new Webhook(secret);
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return { id, timestamp: String(Math.floor(timestamp.getTime() / 1000)), signature };
}

async function post(payload: string, headers: Record<string, string>): Promise<{ status: number; body: { received?: boolean; recorded?: number; message?: string } }> {
  const res = await fetch(`${base}/api/webhooks/resend`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
  const body = await res.json() as { received?: boolean; recorded?: number; message?: string };
  return { status: res.status, body };
}

async function rows(email: string): Promise<Array<{ reason: string }>> {
  const found = await pool.query(
    `SELECT reason FROM email_suppressions WHERE email = $1 ORDER BY reason`,
    [email],
  );
  return found.rows as Array<{ reason: string }>;
}

test("H1 a missing secret is rejected and writes nothing", async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  const email = addr("nosecret");
  const payload = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: { email_id: "em_nosecret", from: "from@example.test", to: [email], subject: "s", bounce: { message: "no", subType: "General", type: "Permanent" } },
  });
  const signed = sign(payload);
  const response = await post(payload, {
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await rows(email), []);
});

test("H2 a bad signature is rejected and writes nothing", async () => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  const email = addr("bad");
  const payload = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: { email_id: "em_bad", from: "from@example.test", to: [email], subject: "s", bounce: { message: "no", subType: "General", type: "Permanent" } },
  });
  const signed = sign(payload);
  const tampered = payload.replace(email, addr("tampered"));
  const response = await post(tampered, {
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await rows(email), []);
  assert.deepEqual(await rows(addr("tampered")), []);
  const missing = await post(payload, {});
  assert.equal(missing.status, 400);
  assert.deepEqual(await rows(email), []);
});

test("H3 a signed hard bounce is stored once", async () => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  const email = addr("hard");
  const payload = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "em_hard",
      from: "from@example.test",
      to: [`Patron <${email}>`],
      subject: "s",
      bounce: { message: "unknown user", subType: "NoEmail", type: "Permanent" },
    },
  });
  const signed = sign(payload);
  const headers = {
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  };
  const first = await post(payload, headers);
  assert.equal(first.status, 200);
  assert.equal(first.body.received, true);
  assert.equal(first.body.recorded, 1);
  assert.deepEqual(await rows(email), [{ reason: "hard_bounce" }]);
  const replay = await post(payload, headers);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.recorded, 0);
  assert.deepEqual(await rows(email), [{ reason: "hard_bounce" }]);
});

test("H4 a signed complaint is stored", async () => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  const email = addr("complaint");
  const payload = JSON.stringify({
    type: "email.complained",
    created_at: new Date().toISOString(),
    data: { email_id: "em_complaint", from: "from@example.test", to: [email], subject: "s" },
  });
  const signed = sign(payload);
  const response = await post(payload, {
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.recorded, 1);
  assert.deepEqual(await rows(email), [{ reason: "complaint" }]);
});

test("H5 a transient bounce is not a hard bounce", async () => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  const email = addr("soft");
  const payload = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "em_soft",
      from: "from@example.test",
      to: [email],
      subject: "s",
      bounce: { message: "mailbox full", subType: "MailboxFull", type: "Transient" },
    },
  });
  const signed = sign(payload);
  const response = await post(payload, {
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.recorded, 0);
  assert.deepEqual(await rows(email), []);
});
