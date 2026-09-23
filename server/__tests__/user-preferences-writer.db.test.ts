/**
 * THE ONE `users.preferences` WRITER HOLDS THE ROW LOCK — ledger `2026-09-23-preferences-one-writer`.
 *
 * Every writer of `users.preferences` used to SELECT the column, merge its own key in JS and
 * UPDATE the whole column, so two saves racing on one account erased each other. The fix is
 * `updateUserPreferences`, which reads the column `FOR UPDATE` inside a transaction and writes the
 * merge in the same transaction.
 *
 *   W1  A save that starts while another transaction holds the row WAITS, and then merges onto
 *       what that transaction committed — the other key survives. This is deterministic: the test
 *       holds the lock itself on a separate connection. Without `FOR UPDATE` the save reads the old
 *       value immediately, blocks only at its UPDATE, and then writes its stale copy over the
 *       committed change — so W1 fails on the unlocked shape.
 *   W2  Twenty concurrent saves, each adding its own key, leave all twenty keys.
 *   W3  A user that does not exist writes nothing and resolves null.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/user-preferences-writer.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { updateUserPreferences } from "../services/user-preferences-writer";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RUN = crypto.randomUUID().slice(0, 8);
const USER_ID = `upw-${RUN}-user`;

async function preferences(): Promise<Record<string, any>> {
  const r = await pool.query(`SELECT preferences FROM users WHERE id = $1`, [USER_ID]);
  return (r.rows[0]?.preferences as Record<string, any>) ?? {};
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, preferences)
     VALUES ($1, $2, 'Prefs', 'Writer', '{"settings": {"language": "en"}}'::jsonb)`,
    [USER_ID, `upw-${RUN}@t.test`],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [USER_ID]);
  } finally {
    await pool.end();
  }
});

test("W1: a save waits for the row lock and merges onto what the holder committed", async () => {
  const holder = await pool.connect();
  let settled = false;
  let save: Promise<unknown> | null = null;
  try {
    await holder.query("BEGIN");
    await holder.query(`SELECT preferences FROM users WHERE id = $1 FOR UPDATE`, [USER_ID]);

    save = updateUserPreferences(USER_ID, (current) => ({
      preferences: { ...current, storefront: { coverImageUrl: "https://images.example.com/w1.jpg" } },
      result: true,
    })).finally(() => {
      settled = true;
    });

    await new Promise((r) => setTimeout(r, 400));
    assert.equal(settled, false, "the save must wait while another transaction holds the row");

    // The holder writes a DIFFERENT key and commits — exactly what a concurrent save of another
    // surface does.
    await holder.query(
      `UPDATE users SET preferences = jsonb_set(preferences, '{travelPreferences}', '{"travelStyles": ["Nature"]}') WHERE id = $1`,
      [USER_ID],
    );
    await holder.query("COMMIT");
  } catch (err) {
    await holder.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    holder.release();
  }

  await save;
  const prefs = await preferences();
  assert.deepEqual(prefs.travelPreferences, { travelStyles: ["Nature"] }, "the holder's committed key survives");
  assert.deepEqual(prefs.storefront, { coverImageUrl: "https://images.example.com/w1.jpg" });
  assert.deepEqual(prefs.settings, { language: "en" });
});

test("W2: twenty concurrent saves to twenty keys leave all twenty", async () => {
  const keys = Array.from({ length: 20 }, (_, i) => `k${i}`);
  await Promise.all(
    keys.map((key) =>
      updateUserPreferences(USER_ID, (current) => ({
        preferences: { ...current, concurrency: { ...(current.concurrency ?? {}), [key]: true } },
        result: key,
      })),
    ),
  );
  const prefs = await preferences();
  assert.deepEqual(Object.keys(prefs.concurrency ?? {}).sort(), [...keys].sort());
});

test("W3: an unknown user writes nothing and resolves null", async () => {
  let merged = false;
  const result = await updateUserPreferences(`upw-${RUN}-nobody`, (current) => {
    merged = true;
    return { preferences: current, result: "written" };
  });
  assert.equal(result, null);
  assert.equal(merged, false, "the merge is not even run for a user that does not exist");
});
