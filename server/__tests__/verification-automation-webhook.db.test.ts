import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import express from "express";
import Stripe from "stripe";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_local_verification_automation_harness";
process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = "whsec_local_identity_automation_harness_only";

const { db, pool } = await import("../db");
const { providerServices, localExpertForms, users } = await import("@shared/schema");
const { eq } = await import("drizzle-orm");
const webhookRouter = (await import("../routes/webhooks.routes")).default;

const runId = crypto.randomUUID();
const userId = `verification-automation-${runId}`;
const heldDraftId = `verification-held-${runId}`;
const pausedId = `verification-paused-${runId}`;
const createdEmails = [`verification-automation-${runId}@test.invalid`];
let server: Server | null = null;
let baseUrl: string;

function assertDisposableDatabase(): void {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "set JOURNEY_DB_WRITES_OK=1 to enable disposable-DB writes");
  assert.equal(process.env.PROD_DATABASE_URL, undefined, "PROD_DATABASE_URL must be unset");
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must point to the development database");
}

before(async () => {
  assertDisposableDatabase();
  await db.insert(users).values({
    id: userId,
    email: createdEmails[0],
    firstName: "Verification",
    lastName: "Harness",
    role: "expert",
  } as any);
  await db.insert(localExpertForms).values({
    userId,
    identityVerificationStatus: "pending",
  } as any);
  await db.insert(providerServices).values([
    {
      id: heldDraftId,
      userId,
      serviceName: `Held draft ${runId}`,
      approvalStatus: "approved",
      status: "draft",
    },
    {
      id: pausedId,
      userId,
      serviceName: `Owner paused ${runId}`,
      approvalStatus: "approved",
      status: "paused",
    },
  ] as any);

  const app = express();
  app.use(express.json({
    verify: (req: express.Request, _res, body) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
    },
  }));
  app.use("/api/webhooks", webhookRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
  await pool.query("DELETE FROM provider_services WHERE id = ANY($1)", [[heldDraftId, pausedId]]).catch(() => {});
  await pool.query("DELETE FROM local_expert_forms WHERE user_id = $1", [userId]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => {});
});

test("signed identity verification webhook dispatches the existing held-listing guard", async () => {
  assertDisposableDatabase();
  const payload = JSON.stringify({
    id: `evt_${runId}`,
    object: "event",
    type: "identity.verification_session.verified",
    data: {
      object: {
        id: `vs_${runId}`,
        object: "identity.verification_session",
        metadata: { user_id: userId, form_type: "expert" },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_IDENTITY_WEBHOOK_SECRET!,
  });
  const deliver = () => fetch(`${baseUrl}/api/webhooks/stripe-identity`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });

  const response = await deliver();
  assert.equal(response.status, 200);
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId));
  assert.equal(form.identityVerificationStatus, "verified");
  const [held] = await db.select().from(providerServices).where(eq(providerServices.id, heldDraftId));
  const [paused] = await db.select().from(providerServices).where(eq(providerServices.id, pausedId));
  assert.equal(held.status, "active");
  assert.equal(paused.status, "paused");

  assert.equal((await deliver()).status, 200);
  const [afterReplay] = await db.select().from(providerServices).where(eq(providerServices.id, heldDraftId));
  assert.equal(afterReplay.status, "active");
});