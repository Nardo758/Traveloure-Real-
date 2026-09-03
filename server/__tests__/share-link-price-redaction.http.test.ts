/**
 * SHARE-LINK PRICE REDACTION — HTTP-surface proof (ledger `2026-09-03-share-link-price-redaction`).
 *
 * `GET /api/itinerary-share/:token` is PUBLIC. It already redacted the expert's private review
 * commentary on an owner axis, but it sent every MONEY figure to every token holder: per-activity
 * `cost`, per-leg `estimatedCostUsd`, the plan-level `totalCost` and the transport `totalCostUsd`.
 * An anonymous "view" link handed to a friend therefore carried the traveler's prices.
 *
 *   S1 — ANONYMOUS token holder (no session): NO money key at ANY depth, and none of the fixture's
 *        unique marker AMOUNTS anywhere in the raw body. Keys are ABSENT, never zeroed (§13) —
 *        asserted with `in`, because `cost: 0` would be the platform stating a price of zero.
 *   S2 — the OWNER (the session that shared it) still receives all four, unchanged.
 *   S3 — the itinerary itself survives redaction for the anonymous holder: names, coordinates,
 *        times, leg counts and durations are all still there. A price-free plan is still a plan.
 *   S4 — a `suggest` (expert-review) link is a NON-OWNER for money: it keeps the expert notes it
 *        is entitled to and still gets no prices. The two axes are deliberately different — the
 *        notes are the reviewing expert's own content, the traveler's prices are not.
 *
 * Transport: real HTTP against the already-running server on :5000, sessions minted via the real
 * /api/auth/register + /api/auth/login — the same shape as stripe-refs-earner-leak.http.test.ts.
 *
 * BENCH-ONLY. Needs a booted app AND a disposable database (DATABASE_URL). Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/share-link-price-redaction.http.test.ts
 *
 * The predicate half of this fix — which key names count as money, and that the walk reaches every
 * depth — is proven with NO database by server/__tests__/share-money-redaction.test.ts, which runs
 * anywhere.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isMoneyKey } from "../utils/share-money-redaction";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

// Marker AMOUNTS: values unique to this run, so a raw-body substring scan catches a leak through
// ANY path — a renamed key, a nested copy, a stringified total.
const MARKERS = {
  variantTotal: "7331.11",   // itinerary_variants.total_cost
  activityPrice: "6242.22",  // itinerary_variant_items.price
  legCost: "5153.33",        // transport_legs.estimated_cost_usd
};

const emails = {
  owner: `slp-${RUN}-owner@t.test`,
  expert: `slp-${RUN}-expert@t.test`,
};
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
const ids = {
  comparison: `slp-${RUN}-cmp`,
  variant: `slp-${RUN}-var`,
  item: `slp-${RUN}-itm`,
  leg: `slp-${RUN}-leg`,
  shareView: `slp-${RUN}-shr-view`,
  shareSuggest: `slp-${RUN}-shr-sug`,
};
const tokens = {
  view: `slp-${RUN}-token-view`,
  suggest: `slp-${RUN}-token-suggest`,
};

// ── Disposable-DB guard (mirrors the journey suite's; never defaults open) ───────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[share-link-price] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(email: string, first: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: first, lastName: "PriceGate" }),
  });
  assert.equal(res.status, 201, `register ${email} failed (${res.status}): ${await res.clone().text()}`);
  return ((await res.json()) as any).user.id;
}

async function loginCookie(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email} failed (${res.status}): ${await res.clone().text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, `login ${email} must set a session cookie`);
  return setCookie!.split(";")[0];
}

/** Every key present anywhere in a JSON value, at any depth. */
function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

async function getShare(token: string, cookie?: string): Promise<{ raw: string; body: any; status: number }> {
  const res = await fetch(`${BASE_URL}/api/itinerary-share/${token}`, {
    headers: cookie ? { cookie } : {},
  });
  const raw = await res.text();
  return { raw, body: raw ? JSON.parse(raw) : null, status: res.status };
}

before(async () => {
  await assertDisposableDb();
  userIds.owner = await registerUser(emails.owner, "Owner");
  userIds.expert = await registerUser(emails.expert, "Reviewer");
  cookies.owner = await loginCookie(emails.owner);
  cookies.expert = await loginCookie(emails.expert);

  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.comparison}, ${userIds.owner}, ${`Price gate ${RUN}`}, 'Kyoto', '2026-10-01', '2026-10-04', 'completed')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_variants (id, comparison_id, name, description, total_cost, optimization_score)
    VALUES (${ids.variant}, ${ids.comparison}, ${`Variant ${RUN}`}, 'fixture', ${MARKERS.variantTotal}, 87)
  `);
  await db.execute(sql`
    INSERT INTO itinerary_variant_items
      (id, variant_id, day_number, start_time, end_time, name, description, price, location, latitude, longitude, duration, sort_order)
    VALUES
      (${ids.item}, ${ids.variant}, 1, '09:00', '11:00', ${`Fushimi Inari ${RUN}`}, 'fixture activity',
       ${MARKERS.activityPrice}, 'Kyoto', 34.9671, 135.7727, 120, 0)
  `);
  await db.execute(sql`
    INSERT INTO transport_legs
      (id, variant_id, day_number, leg_order, from_name, from_lat, from_lng, to_name, to_lat, to_lng,
       distance_meters, distance_display, recommended_mode, estimated_duration_minutes, estimated_cost_usd, energy_cost)
    VALUES
      (${ids.leg}, ${ids.variant}, 1, 1, 'Hotel', 34.9850, 135.7587, 'Fushimi Inari', 34.9671, 135.7727,
       5400, '5.4 km', 'transit', 18, ${MARKERS.legCost}, 20)
  `);
  await db.execute(sql`
    INSERT INTO shared_itineraries (id, share_token, variant_id, shared_by_user_id, permissions, expert_status, expert_notes)
    VALUES (${ids.shareView}, ${tokens.view}, ${ids.variant}, ${userIds.owner}, 'view', 'pending', NULL)
  `);
  await db.execute(sql`
    INSERT INTO shared_itineraries (id, share_token, variant_id, shared_by_user_id, permissions, expert_status, expert_notes)
    VALUES (${ids.shareSuggest}, ${tokens.suggest}, ${ids.variant}, ${userIds.owner}, 'suggest', 'notes_complete',
            ${`expert note ${RUN}`})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM shared_itineraries WHERE id IN (${ids.shareView}, ${ids.shareSuggest})`);
  await db.execute(sql`DELETE FROM transport_legs WHERE id = ${ids.leg}`);
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE id = ${ids.item}`);
  await db.execute(sql`DELETE FROM itinerary_variants WHERE id = ${ids.variant}`);
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${ids.comparison}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${userIds.owner}, ${userIds.expert})`);
});

test("S1 — an ANONYMOUS token holder receives no money key at any depth, and no amount at all", async () => {
  const { status, raw, body } = await getShare(tokens.view);
  assert.equal(status, 200, raw);

  for (const [name, marker] of Object.entries(MARKERS)) {
    assert.ok(!raw.includes(marker), `${name} amount '${marker}' LEAKED to an anonymous share viewer`);
  }

  const leaked = [...collectKeys(body)].filter(isMoneyKey);
  assert.deepEqual(leaked, [], `money keys reached an anonymous share viewer: ${leaked.join(", ")}`);

  // ABSENT, not zeroed (§13). `cost: 0` is a price claim the platform has no basis for.
  assert.equal("totalCost" in body.variant, false);
  assert.equal("totalCostUsd" in body.variant.transportSummary, false);
  assert.equal("cost" in body.variant.days[0].activities[0], false);
  assert.equal("estimatedCostUsd" in body.variant.days[0].transportLegs[0], false);
  assert.equal(body.isOwner, false);
});

test("S2 — the OWNER still receives every money figure", async () => {
  const { status, raw, body } = await getShare(tokens.view, cookies.owner);
  assert.equal(status, 200, raw);
  assert.equal(body.isOwner, true, "the sharing session must read as the owner");

  assert.equal(String(body.variant.totalCost), MARKERS.variantTotal);
  assert.equal(Number(body.variant.days[0].activities[0].cost), Number(MARKERS.activityPrice));
  assert.equal(Number(body.variant.days[0].transportLegs[0].estimatedCostUsd), Number(MARKERS.legCost));
  assert.equal(typeof body.variant.transportSummary.totalCostUsd, "number");
});

test("S3 — the ITINERARY survives redaction for the anonymous holder", async () => {
  const { body } = await getShare(tokens.view);
  const day = body.variant.days[0];
  assert.equal(day.activities[0].name, `Fushimi Inari ${RUN}`);
  assert.equal(day.activities[0].lat, 34.9671);
  assert.equal(day.activities[0].startTime, "09:00");
  assert.equal(day.transportLegs[0].fromName, "Hotel");
  assert.equal(day.transportLegs[0].estimatedDurationMinutes, 18);
  assert.equal(day.transportLegs[0].energyCost, 20, "energyCost is a fatigue score, not money");
  assert.equal(body.variant.transportSummary.totalLegs, 1);
  assert.equal(body.variant.transportSummary.totalMinutes, 18);
  assert.equal(body.variant.optimizationScore, 87);
  assert.equal(body.variant.name, `Variant ${RUN}`);
});

test("S4 — a `suggest` link keeps the expert notes it is entitled to and still gets no prices", async () => {
  const { status, raw, body } = await getShare(tokens.suggest, cookies.expert);
  assert.equal(status, 200, raw);
  assert.equal(body.isOwner, false);
  // The notes axis is UNCHANGED by this fix — a suggest/edit holder still sees the review content.
  assert.equal(body.expertNotes, `expert note ${RUN}`);
  // The money axis is owner-only: the reviewing expert is a non-owner here like anyone else.
  const leaked = [...collectKeys(body)].filter(isMoneyKey);
  assert.deepEqual(leaked, [], `money keys reached a suggest-link holder: ${leaked.join(", ")}`);
  for (const marker of Object.values(MARKERS)) {
    assert.ok(!raw.includes(marker), `amount '${marker}' LEAKED to a suggest-link holder`);
  }
});
