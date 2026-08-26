/**
 * upsell-click-payload.db.test.ts — POST /api/upsell/click validates the discover
 * payload and records the click.
 *
 * Runs against a live server (BASE_URL). The end-to-end attribution test writes one
 * impression row to a DISPOSABLE db (opt-in guard below) and cleans it up.
 *
 * The bug it pins: clickBodySchema REQUIRED tripId and the route sat behind
 * isAuthenticated, but the discover feed is public and tripless — it POSTs
 * { surface, offeringId } with no tripId — so every discover Book-now click 400'd
 * (validation_failed) and recorded nothing. The fix makes tripId optional and the
 * route public (matching the impression sibling), and markImpressionClicked matches
 * the trip_id-NULL discover impression.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[upsell-click] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

test("discover click validates with NO tripId and NO auth → 200 { ok: true }", async () => {
  const res = await post("/api/upsell/click", { surface: "discover_location", offeringId: `off-${RUN}` });
  assert.equal(res.status, 200, "a tripless, unauthenticated discover click must validate (was 400)");
  assert.equal(res.body?.ok, true);
});

test("click still enforces its shape: a body missing `surface` → 400 validation_failed", async () => {
  const res = await post("/api/upsell/click", { offeringId: `off-${RUN}` });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error, "validation_failed");
});

test("impression → click marks the discover (trip_id NULL) impression clicked", async () => {
  await assertDisposableDb();
  const surface = "discover_location";
  const offeringId = `off-e2e-${RUN}`;

  const imp = await post("/api/upsell/impression", { surface, offeringIds: [offeringId] });
  assert.equal(imp.status, 200, "the anonymous discover impression must be accepted");

  const clk = await post("/api/upsell/click", { surface, offeringId });
  assert.equal(clk.status, 200, "the matching click must be accepted");

  const row = await db.execute(sql`
    SELECT clicked FROM upsell_impressions
    WHERE surface = ${surface} AND offering_id = ${offeringId}
    ORDER BY shown_at DESC LIMIT 1
  `);
  assert.equal((row.rows[0] as any)?.clicked, true, "the discover impression must be flipped clicked=true");

  await db.execute(sql`DELETE FROM upsell_impressions WHERE offering_id = ${offeringId}`);
});
