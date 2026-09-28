/**
 * Ledger `2026-09-27-funnel-share-token-purged` (R173) — funnel events store IDS and ENUMS only.
 *
 * `POST /api/trips/:id/share` wrote the plan's share token — a LIVE 90-day read grant — into
 * `funnel_events.properties.refToken`. P1–P4 are pure and prove the tracker and the route never
 * store one again; M1–M8 run migration 326 (the ONE recorded exception to 089's append-only table)
 * against a throwaway schema and prove what it does to the rows already on disk, including the
 * unpaid-revenue void flag (ledger `2026-09-27-funnel-revenue-on-paid`).
 *
 * FAILS ON main: `buildFunnelProperties` does not exist there (P1–P3), the share route passes
 * `refToken: shareToken` (P4), and migration 326 is neither on disk nor registered (M1–M8).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { MIGRATION_FILES } from "../migrations/migration-files";
import { buildFunnelProperties } from "../utils/funnelTracker";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRATION_FILE = "326_funnel_events_purge_share_tokens.sql";
const sha = (v: string) => crypto.createHash("sha256").update(v, "utf8").digest("hex");

// ── Pure ────────────────────────────────────────────────────────────────────────────────────────

test("P1 a refToken is stored only as its SHA-256, never raw", () => {
  const props = buildFunnelProperties({ refToken: "abc123" })!;
  assert.equal(props.refToken, undefined);
  assert.equal(props.refTokenSha256, sha("abc123"));
  assert.equal(JSON.stringify(props).includes("abc123"), false);
});

test("P2 credential-shaped eventData keys are dropped; ids and digests pass", () => {
  const props = buildFunnelProperties({
    eventData: {
      shareToken: "s", accessToken: "a", apiKey: "k", password: "p", clientSecret: "c",
      sharedTripId: "st-1", refTokenSha256: "forged", amount: 10,
    },
    refToken: "real",
  })!;
  for (const k of ["shareToken", "accessToken", "apiKey", "password", "clientSecret"]) {
    assert.equal(k in props, false, `${k} must not be stored`);
  }
  assert.equal(props.sharedTripId, "st-1");
  assert.equal(props.amount, 10);
  // A caller-supplied digest never stands in for the tracker's own.
  assert.equal(props.refTokenSha256, sha("real"));
});

test("P3 nothing to record ⇒ no properties bag (not {})", () => {
  assert.equal(buildFunnelProperties({}), undefined);
  assert.equal(buildFunnelProperties({ refToken: "" }), undefined);
});

test("P4 the share route records the share row id, never the token", () => {
  const src = readFileSync(join(REPO, "server", "routes", "booking-actions.ts"), "utf8");
  const start = src.indexOf("router.post('/trips/:id/share'");
  assert.ok(start > 0, "share route present");
  const handler = src.slice(start, src.indexOf("\nrouter.", start + 10));
  assert.equal(/refToken\s*:/.test(handler), false, "share route must not pass refToken");
  assert.ok(handler.includes("sharedTripId"), "share route records sharedTripId");
});

// ── Migration 326 on a throwaway schema ─────────────────────────────────────────────────────────

const SCHEMA = `fe326_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
let client: Client;
let dbReady = false;

before(async () => {
  if (!process.env.DATABASE_URL) return;
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const host = new URL(process.env.DATABASE_URL).hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("refusing to write to a non-disposable database");
  }
  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  await client.query(`CREATE TABLE ${SCHEMA}.funnel_events (LIKE public.funnel_events INCLUDING ALL)`);
  await client.query(`CREATE TABLE ${SCHEMA}.shared_trips (LIKE public.shared_trips INCLUDING ALL)`);
  await client.query(`SET search_path TO ${SCHEMA}, public`);
  dbReady = true;
});

after(async () => {
  if (!client) return;
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.end();
});

async function seed(eventType: string, properties: unknown): Promise<string> {
  const r = await client.query(
    `INSERT INTO funnel_events (event_type, stage, properties) VALUES ($1, 'T0', $2::jsonb) RETURNING id`,
    [eventType, properties === undefined ? null : JSON.stringify(properties)],
  );
  return String(r.rows[0].id);
}
async function props(id: string): Promise<any> {
  return (await client.query(`SELECT properties FROM funnel_events WHERE id = $1`, [id])).rows[0].properties;
}

test("M1–M8 migration 326 purges tokens, flags unpaid revenue void, and is idempotent", async (t) => {
  if (!dbReady) return t.skip("DATABASE_URL not set");
  const sql = readFileSync(join(REPO, "server", "migrations", MIGRATION_FILE), "utf8");
  assert.ok((MIGRATION_FILES as readonly string[]).includes(MIGRATION_FILE), "M8 326 is registered");

  const st = await client.query(
    `INSERT INTO shared_trips (share_token) VALUES ('live-token-1') RETURNING id`,
  );
  const sharedId = String(st.rows[0].id);

  const matched = await seed("viral_share", { refToken: "live-token-1", source: "slip" });
  const orphan = await seed("viral_share", { refToken: "no-such-token" });
  const signup = await seed("account_created", { refToken: "partner-code", source: "ref" });
  const badType = await seed("account_created", { refToken: 42 });
  const unpaid = await seed("revenue", { amount: 250, bookingId: "b1" });
  const unpaidNull = await seed("revenue", undefined);
  const paid = await seed("revenue", { amount: 250, bookingId: "b2", paidStatus: "confirmed" });
  const other = await seed("trip_created", { source: "hero" });

  await client.query(sql);

  // M1 a token naming a share row becomes that row's id
  assert.deepEqual(await props(matched), { sharedTripId: sharedId, source: "slip" });
  // M2 a token naming no row is removed; no id invented
  assert.deepEqual(await props(orphan), {});
  // M3 any other raw refToken becomes its SHA-256
  assert.deepEqual(await props(signup), { refTokenSha256: sha("partner-code"), source: "ref" });
  // M4 a non-string refToken is removed
  assert.deepEqual(await props(badType), {});
  // M5 unpaid revenue rows are flagged void, kept, and keep their other keys
  assert.deepEqual(await props(unpaid), {
    amount: 250, bookingId: "b1", void: true, voidReason: "unpaid_at_emission",
  });
  assert.deepEqual(await props(unpaidNull), { void: true, voidReason: "unpaid_at_emission" });
  // M6 a paid-transition revenue row and unrelated rows are untouched
  assert.deepEqual(await props(paid), { amount: 250, bookingId: "b2", paidStatus: "confirmed" });
  assert.deepEqual(await props(other), { source: "hero" });

  // M7 no row anywhere still carries a raw token, and a second run is a byte-for-byte no-op
  const leaks = await client.query(`SELECT count(*)::int AS n FROM funnel_events WHERE properties ? 'refToken'`);
  assert.equal(leaks.rows[0].n, 0);
  const before2 = await client.query(`SELECT id, properties::text AS p FROM funnel_events ORDER BY id`);
  await client.query(sql);
  const after2 = await client.query(`SELECT id, properties::text AS p FROM funnel_events ORDER BY id`);
  assert.deepEqual(after2.rows, before2.rows);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM funnel_events`)).rows[0].n, 8, "nothing deleted");
});
