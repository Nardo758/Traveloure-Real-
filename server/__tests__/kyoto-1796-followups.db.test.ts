/**
 * MIGRATION 425: #1796 follow-ups, items 8 and 9 (ledger `2026-10-31-kyoto-1796-followups`).
 *
 *   K1  Yoshida Sanso Ryokan in Kyoto is hidden (hidden_at stamped while NULL). A row hidden earlier
 *       keeps its timestamp, and a Yoshida row in another city is untouched.
 *   K2  A Kyoto row still storing one of the three 404 Unsplash URLs loses image_url and image_credit.
 *       A Kyoto row with a Commons URL, and another city's row with a dead URL, are untouched.
 *   K3  A second run changes 0 rows.
 *
 * Runs inside one transaction that is ROLLED BACK, so the shared database is never changed.
 *   npx tsx --test server/__tests__/kyoto-1796-followups.db.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { after, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SQL = fs.readFileSync(path.resolve(import.meta.dirname, "../migrations/425_kyoto_1796_followups.sql"), "utf-8");
const RUN = crypto.randomBytes(4).toString("hex");

const DEAD_YOSHIDA = "https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80";
const DEAD_FUSHIMI = "https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80";
const DEAD_PHILOSOPHER = "https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80";
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/0/01/Philosopher%27s_Walk_Sakyo%2C_Kyoto_-_panoramio.jpg";

after(async () => {
  await pool.end();
});

function rowCounts(result: unknown): number[] {
  const list = Array.isArray(result) ? result : [result];
  return list.map((r: any) => r.rowCount ?? 0);
}

test("K1–K3: Yoshida hidden, dead Unsplash URLs nulled, a second run is a no-op", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Start from a known state: the real Kyoto rows these statements match are moved out of the way
    // inside this transaction, so the row counts below are this fixture's alone.
    await client.query(
      `UPDATE travel_pulse_hidden_gems SET city = 'kyoto-moved-' || id
        WHERE city ILIKE 'kyoto' AND (place_name = 'Yoshida Sanso Ryokan' OR image_url = ANY($1))`,
      [[DEAD_YOSHIDA, DEAD_FUSHIMI, DEAD_PHILOSOPHER]],
    );
    const ins = async (city: string, place: string, imageUrl: string | null, hiddenAt: string | null) =>
      (
        await client.query(
          `INSERT INTO travel_pulse_hidden_gems (id, city, place_name, image_url, image_credit, hidden_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
          [city, place, imageUrl, imageUrl ? `credit ${RUN}` : null, hiddenAt],
        )
      ).rows[0].id as string;

    const yoshida = await ins("Kyoto", "Yoshida Sanso Ryokan", DEAD_YOSHIDA, null);
    const fushimi = await ins("kyoto", `Fushimi ${RUN}`, DEAD_FUSHIMI, null);
    const philosopher = await ins("Kyoto", `Philosopher ${RUN}`, DEAD_PHILOSOPHER, null);
    const commons = await ins("Kyoto", `Commons ${RUN}`, COMMONS, null);
    const otherCityYoshida = await ins("Osaka", "Yoshida Sanso Ryokan", DEAD_YOSHIDA, null);
    const read = async (id: string) =>
      (await client.query(`SELECT image_url, image_credit, hidden_at FROM travel_pulse_hidden_gems WHERE id = $1`, [id])).rows[0];

    const first = rowCounts(await client.query(SQL));
    assert.deepEqual(first, [1, 3], "one card hidden, three dead URLs cleared");

    const y = await read(yoshida);
    assert.ok(y.hidden_at, "Yoshida is hidden");
    assert.equal(y.image_url, null);
    assert.equal(y.image_credit, null);
    for (const id of [fushimi, philosopher]) {
      const r = await read(id);
      assert.equal(r.image_url, null);
      assert.equal(r.image_credit, null);
      assert.equal(r.hidden_at, null, "only Yoshida is hidden");
    }
    assert.deepEqual(await read(commons), { image_url: COMMONS, image_credit: `credit ${RUN}`, hidden_at: null });
    assert.deepEqual(await read(otherCityYoshida), { image_url: DEAD_YOSHIDA, image_credit: `credit ${RUN}`, hidden_at: null });

    const stamped = y.hidden_at;
    const second = rowCounts(await client.query(SQL));
    assert.deepEqual(second, [0, 0], "a second run changes 0 rows");
    assert.deepEqual((await read(yoshida)).hidden_at, stamped, "the first timestamp is kept");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
