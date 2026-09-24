/**
 * AN APPLICATION ENTERS A STATUS ONCE — board task #905, ledger `2026-09-23-phase2-messages`.
 *
 * The admin approval and rejection routes send one-time messages (the approval notification and
 * email, the rejection notice and email). They used to send them on every save, so re-saving an
 * approved application congratulated the applicant again. The status writers now read the prior
 * status under a row lock and return it; `enteredStatus` answers whether this save changed it.
 *
 *   T1  First save to `approved` enters it; a second save of `approved` does not.
 *   T2  Ten concurrent saves of `approved` on a pending application: exactly ONE enters it. Without
 *       the lock two saves can both read `pending` and both send the messages.
 *   T3  Both writers (expert and provider) behave the same; an unknown id resolves undefined.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/form-status-transition.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { storage } from "../storage";
import { enteredStatus } from "../utils/form-status-transition";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RUN = crypto.randomUUID().slice(0, 8);
const USER_ID = `fst-${RUN}-user`;
const providerFormIds: string[] = [];
const expertFormIds: string[] = [];

const extraUserIds: string[] = [];

// One current provider form per user (a DB unique index), so each fixture form has its own owner.
async function newProviderForm(): Promise<string> {
  const id = `fst-${RUN}-p${providerFormIds.length}`;
  const owner = `${id}-owner`;
  await pool.query(`INSERT INTO users (id, email, first_name, last_name) VALUES ($1, $2, 'Form', 'Owner')`, [
    owner,
    `${owner}@traveloure.test`,
  ]);
  extraUserIds.push(owner);
  await pool.query(
    `INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
     VALUES ($1, $2, 'FST Business', 'FST Owner', 'fst@example.com', '+10000000000', 'Japan', '1 Test St', 'tour', 'pending')`,
    [id, owner],
  );
  providerFormIds.push(id);
  return id;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(`INSERT INTO users (id, email, first_name, last_name) VALUES ($1, $2, 'Form', 'Status')`, [
    USER_ID,
    `fst-${RUN}@traveloure.test`,
  ]);
});

after(async () => {
  try {
    await pool.query(`DELETE FROM service_provider_forms WHERE id = ANY($1)`, [providerFormIds]);
    await pool.query(`DELETE FROM local_expert_forms WHERE id = ANY($1)`, [expertFormIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[USER_ID, ...extraUserIds]]);
  } finally {
    await pool.end();
  }
});

test("T1: the first save enters `approved`; a re-save does not", async () => {
  const id = await newProviderForm();
  const first = await storage.updateServiceProviderFormStatus(id, "approved");
  assert.ok(first);
  assert.equal(first.priorStatus, "pending");
  assert.equal(enteredStatus(first, "approved"), true);

  const again = await storage.updateServiceProviderFormStatus(id, "approved");
  assert.ok(again);
  assert.equal(again.priorStatus, "approved");
  assert.equal(enteredStatus(again, "approved"), false, "a re-save is not an entry");
});

test("T2: ten concurrent approvals — exactly one enters the status", async () => {
  const id = await newProviderForm();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => storage.updateServiceProviderFormStatus(id, "approved")),
  );
  const entered = results.filter((row) => row && enteredStatus(row, "approved"));
  assert.equal(entered.length, 1, "exactly one save may send the one-time messages");
});

test("T3: the expert writer reports the same way; an unknown id is undefined", async () => {
  const id = `fst-${RUN}-e0`;
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, status) VALUES ($1, $2, 'pending')`,
    [id, USER_ID],
  );
  expertFormIds.push(id);
  const first = await storage.updateLocalExpertFormStatus(id, "rejected", "Not yet");
  assert.ok(first);
  assert.equal(enteredStatus(first, "rejected"), true);
  const again = await storage.updateLocalExpertFormStatus(id, "rejected", "Still not");
  assert.ok(again);
  assert.equal(enteredStatus(again, "rejected"), false);
  assert.equal(again.rejectionMessage, "Still not", "a re-save still updates the message");

  assert.equal(await storage.updateLocalExpertFormStatus(`fst-${RUN}-missing`, "approved"), undefined);
  assert.equal(await storage.updateServiceProviderFormStatus(`fst-${RUN}-missing`, "approved"), undefined);
});
