/**
 * AF-1 — the Travelpayouts API token never leaves the server (ledger `2026-10-12-af1-transport-token-leak`).
 *
 *   A1 a leg's affiliate options are built with the public marker: no stored link or affiliate code holds the token
 *   A2 GET /api/transport-legs/:legId/options carries no token and no `affiliateCode`
 *   A3 a row stored BEFORE AF-1 (token in its link and code) is scrubbed on every way out: the option GET,
 *      the click redirect and the leg-options list
 *   A4 the hub response carries no token and no `affiliateCode`
 *   A5 the two helpers: the scrub is a no-op without a token; the client projection drops both fields
 *
 * TRANSPORT: the REAL transport-hub router in a bare express app. DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/af1-transport-token-leak.db.test.ts
 */
const TOKEN = "tp-secret-AF1-fixture-9f3c27";
const MARKER = "405110";
process.env.TRAVELPAYOUTS_TOKEN = TOKEN;
process.env.TRAVELPAYOUTS_MARKER = MARKER;
process.env.STRIPE_SECRET_KEY ||= "sk_test_af1";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[af1] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const hubRoutes = (await import("../routes/transport-hub.routes")).default;
const { populateBookingOptionsForLeg } = await import("../services/transport-booking-options.service");
const { scrubStoredTransportOption, toClientTransportOption } = await import("../services/transport-option-client");
const { scrubTravelpayoutsToken } = await import("../services/travelpayouts/travelpayouts-client");

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `af1-${RUN}-owner`;
const CMP = `af1-${RUN}-cmp`;
const VAR = `af1-${RUN}-var`;
const LEG = `af1-${RUN}-leg`;
const OLD_LEG = `af1-${RUN}-oldleg`;
const OLD_OPT = `af1-${RUN}-oldopt`;

async function call(method: "GET" | "POST", path: string): Promise<{ status: number; text: string }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: owner } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(hubRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    return { status: res.status, text: await res.text() };
  } finally {
    server.close();
  }
}

function legRow(id: string, variantId: string | null) {
  return sql`INSERT INTO transport_legs (id, variant_id, day_number, leg_order, from_name, from_lat, from_lng, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes)
    VALUES (${id}, ${variantId}, 1, 0, 'Kyoto Station', 34.9858, 135.7588, 'Osaka Station', 34.7025, 135.4959,
      150000, '150 km', 'transit', 90)`;
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${CMP}, ${owner}, 'AF-1', 'Kyoto', '2027-11-11', '2027-11-13', 'completed')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source) VALUES (${VAR}, ${CMP}, 'Optimized', 'ai_optimized')`);
  await db.execute(legRow(LEG, null));
  await db.execute(legRow(OLD_LEG, VAR));
  // The pre-AF-1 shape: the API token in the stored link and the stored affiliate code.
  await db.execute(sql`INSERT INTO transport_booking_options (id, transport_leg_id, variant_id, booking_type, source, title, mode_type, external_url, affiliate_code)
    VALUES (${OLD_OPT}, ${OLD_LEG}, ${VAR}, 'affiliate', '12go', 'Kyoto → Osaka', 'transit',
      ${`https://12go.asia/en/travel/kyoto/osaka?z=${TOKEN}`}, ${TOKEN})`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM transport_booking_options WHERE transport_leg_id IN (${LEG}, ${OLD_LEG})`);
    await db.execute(sql`DELETE FROM transport_legs WHERE id IN (${LEG}, ${OLD_LEG})`);
    await db.execute(sql`DELETE FROM itinerary_variants WHERE id = ${VAR}`);
    await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${CMP}`);
    await db.execute(sql`DELETE FROM affiliate_clicks WHERE user_id = ${owner}`).catch(() => undefined);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("A1 a leg's affiliate options carry the marker, never the token", async () => {
  await populateBookingOptionsForLeg(LEG, "Kyoto", 2);
  const rows = (await db.execute(sql`SELECT source, external_url, affiliate_code FROM transport_booking_options
    WHERE transport_leg_id = ${LEG} AND booking_type = 'affiliate'`)).rows as any[];
  // TC-2 (sanctioned Oct 12, 2026): the every-leg partner list is retired; with no registry rows the
  // leg resolver stores no affiliate row for this leg. The token assertions are unchanged.
  assert.equal(rows.length, 0, "no affiliate row for a leg without registry rows");
  for (const r of rows) {
    assert.ok(!String(r.external_url ?? "").includes(TOKEN), `${r.source} link holds no token`);
    assert.ok(!String(r.affiliate_code ?? "").includes(TOKEN), `${r.source} code holds no token`);
  }
});

test("A2 the leg-options response carries no token and no affiliateCode", async () => {
  const res = await call("GET", `/api/transport-legs/${LEG}/options`);
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes(TOKEN));
  assert.ok(!res.text.includes("affiliateCode"));
  assert.ok(JSON.parse(res.text).options.length > 0);
});

test("A3 a row stored before AF-1 is scrubbed on every way out", async () => {
  const one = await call("GET", `/api/transport-booking-options/${OLD_OPT}`);
  assert.equal(one.status, 200);
  assert.ok(!one.text.includes(TOKEN));
  assert.ok(!one.text.includes("affiliateCode"));

  const click = await call("POST", `/api/transport-booking-options/${OLD_OPT}/click`);
  assert.equal(click.status, 200);
  assert.ok(!click.text.includes(TOKEN), "the redirect carries no token");
  const { redirectUrl } = JSON.parse(click.text);
  assert.equal(redirectUrl, `https://12go.asia/en/travel/kyoto/osaka?z=${MARKER}&affiliate=${MARKER}`);

  const list = await call("GET", `/api/transport-legs/${OLD_LEG}/options`);
  assert.equal(list.status, 200);
  assert.ok(!list.text.includes(TOKEN));
});

test("A4 the hub response carries no token and no affiliateCode", async () => {
  const res = await call("GET", `/api/itinerary/${CMP}/transport-hub`);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.text);
  const opts = body.days.flatMap((d: any) => d.legs.flatMap((l: any) => l.bookingOptions ?? []));
  assert.ok(opts.some((o: any) => o.id === OLD_OPT), "the stored option is in the hub");
  assert.ok(!res.text.includes(TOKEN));
  assert.ok(!res.text.includes("affiliateCode"));
});

test("A5 the helpers", () => {
  const scrubbed = scrubStoredTransportOption({ externalUrl: `https://x.test/?a=${TOKEN}&b=${TOKEN}`, affiliateCode: TOKEN, title: "t" });
  assert.equal(scrubbed.externalUrl, `https://x.test/?a=${MARKER}&b=${MARKER}`);
  assert.equal(scrubbed.affiliateCode, MARKER);
  assert.equal(scrubTravelpayoutsToken(null), null);
  const saved = process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_TOKEN;
  try {
    assert.equal(scrubTravelpayoutsToken("https://x.test/?z=abc"), "https://x.test/?z=abc");
  } finally {
    process.env.TRAVELPAYOUTS_TOKEN = saved;
  }
  const client = toClientTransportOption({ id: "o", externalUrl: "https://x.test", affiliateCode: MARKER, title: "t" });
  assert.deepEqual(client, { id: "o", title: "t", hasBookingLink: true });
});
