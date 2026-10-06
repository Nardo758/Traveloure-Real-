/**
 * The billboard's locals and the event page's "N verified in <city>" are ONE R343-gated set
 * (ledger `2026-10-06-billboard-locals-routable`).
 *
 *   VL1  `verifiedLocalIds` keeps only the routable candidate: never an unverified, unpayable, seed,
 *        pending-application, form-less or concierge-pool account; candidate order is kept
 *   VL2  the event page's count is that set's size
 *   VL3  the billboard's default candidates ARE that set, and a non-routable candidate never reaches
 *        the byline gate, so it never takes a tile
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards; the pool setting is
 * restored to what it was.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  DEFAULT_DEPS,
  billboardVerifiedCandidates,
  resolveBillboardOverrides,
  verifiedLocalIds,
} from "../services/landing-billboard.service";
import { countVerifiedLocals } from "../services/event-page.service";
import { invalidatePlatformConciergeCache, PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } from "../services/platform-concierge.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ex = (k: string) => `vl-${RUN}-${k}`;
const EXPERTS: Array<[string, string, string, string, string]> = [
  // key, email, application, identity, connect
  ["ok", `${ex("ok")}@routable.invalid`, "approved", "verified", "complete"],
  ["unverified", `${ex("unverified")}@routable.invalid`, "approved", "pending", "complete"],
  ["unpayable", `${ex("unpayable")}@routable.invalid`, "approved", "verified", "pending"],
  ["seed", `${ex("seed")}@example.com`, "approved", "verified", "complete"],
  ["pendingapp", `${ex("pendingapp")}@routable.invalid`, "pending", "verified", "complete"],
  ["pool", `${ex("pool")}@routable.invalid`, "approved", "verified", "complete"],
];
const ALL = [...EXPERTS.map(([k]) => ex(k)), ex("noform")];
const fixture = async () => ALL;
let priorPool: string | null = null;
let priorDemo: string | undefined;

async function setPool(v: string | null) {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
  if (v !== null) await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}, ${v})`);
  invalidatePlatformConciergeCache();
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  priorDemo = process.env.SHOW_DEMO_EXPERTS;
  delete process.env.SHOW_DEMO_EXPERTS;
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
  priorPool = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  for (const [k, email, status, identity, connect] of EXPERTS) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ex(k)}, ${email}, 'VL', ${k}, 'local_expert')`);
    await db.execute(sql`
      INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, specialties,
                                      identity_verification_status, stripe_connect_status)
      VALUES (${`${ex(k)}-form`}, ${ex(k)}, 'VL', 'Fixture', ${`${ex(k)}@form.invalid`}, ${status}, '["Kyoto"]'::jsonb, '[]'::jsonb, ${identity}, ${connect})
    `);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ex("noform")}, ${`${ex("noform")}@routable.invalid`}, 'VL', 'noform', 'local_expert')`);
  await setPool(ex("pool"));
});

after(async () => {
  await setPool(priorPool).catch(() => {});
  if (priorDemo === undefined) delete process.env.SHOW_DEMO_EXPERTS;
  else process.env.SHOW_DEMO_EXPERTS = priorDemo;
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`vl-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`vl-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("VL1 only the routable candidate is a verified local", async () => {
  assert.deepEqual(await verifiedLocalIds("kyoto", { candidates: fixture }), [ex("ok")]);
  assert.deepEqual(await verifiedLocalIds("kyoto", { candidates: async () => ALL.filter((id) => id !== ex("ok")) }), [],
    "seed, pending application, concierge pool, unverified, unpayable and form-less are never counted");
  assert.deepEqual(await verifiedLocalIds("kyoto", { candidates: async () => [] }), []);
});

test("VL2 the event page counts that set", async () => {
  assert.equal(await countVerifiedLocals("kyoto", { candidates: fixture }), 1);
  assert.equal(await countVerifiedLocals("kyoto", { candidates: async () => [ex("seed"), ex("pendingapp"), ex("pool")] }), 0);
});

test("VL3 the billboard's candidates are that set; a non-routable local never reaches the gate", async () => {
  assert.equal(DEFAULT_DEPS.candidates, billboardVerifiedCandidates, "the billboard reads the one R343-gated set");
  const gated: string[] = [];
  const overrides = await resolveBillboardOverrides({
    candidates: (k) => verifiedLocalIds(k, { candidates: fixture }),
    gate: async (id) => { gated.push(id); return { eligible: true }; },
    qualify: async (id) => ({ handle: `h-${id}`, roleLabel: "Local expert", listings: [{ id: `${id}-l`, title: "Walk", lines: [], price: null, priceType: null, pricingUnit: null, showPrice: false, imageUrl: null }] }),
  });
  for (const k of ["seed", "pendingapp", "pool", "unverified", "unpayable", "noform"]) {
    assert.equal(gated.filter((id) => id === ex(k)).length, 0, `${k} never reaches the byline gate`);
  }
  assert.ok(gated.length > 0 && gated.every((id) => id === ex("ok")));
  assert.ok(overrides.every((o) => o.handle === `h-${ex("ok")}`), "only the routable local takes a tile");
});
