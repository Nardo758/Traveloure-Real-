/**
 * The billboard's locals and the event page's "N verified in <city>" are ONE R343-gated set
 * (ledger `2026-10-06-billboard-locals-routable`).
 *
 *   VL1  `verifiedLocalIds` keeps only the routable candidate: never an unverified, unpayable, seed,
 *        pending-application, form-less or concierge-pool account; candidate order is kept
 *   VL2  the event page's count is that set's size
 *   VL3  the billboard's default candidates ARE that set, and a non-routable candidate never reaches
 *        the byline gate, so it never takes a tile
 *   VL4  slots 2 and 3 read the same set (ledger `2026-10-06-billboard-slots-routable`): a seed,
 *        pending-application, concierge-pool or unverified gem curator never reaches the gate and never
 *        takes slot 2, and a listing owned by one never takes slot 3; the routable local takes both
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
  resolveBillboardDispatch,
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

test("VL4 slots 2 and 3 take only a verified local", async () => {
  const listing = (id: string) => ({ id, title: "Walk", lines: [], price: "40.00", priceType: "fixed", pricingUnit: null, showPrice: true, imageUrl: null });
  const order = ["seed", "pendingapp", "pool", "unverified", "unpayable", "noform", "ok"];
  const gated: string[] = [];
  const result = await resolveBillboardDispatch({
    candidates: async () => [ex("ok")],
    gate: async (id) => { gated.push(id); return { eligible: true }; },
    qualify: async (id) => ({ handle: `h-${id}`, roleLabel: "Local expert", listings: [listing(`${id}-l`)] }),
    creditedMarkets: async () => new Set(["kyoto"]),
    now: () => new Date(0),
    verifiedLocals: (k) => verifiedLocalIds(k, { candidates: fixture }),
    // Every non-routable curator and owner is offered FIRST, so only the gate can be what skips them.
    gems: async () => order.map((k, i) => ({ id: `gem-${k}`, city: "Kyoto", name: `Gem ${k}`, score: 90 - i, curatorExpertId: ex(k), curatorHandle: `h-${ex(k)}` })),
    sliceReadyListings: async () => order.map((k) => ({
      id: `slice-${k}`, city: "Kyoto", handle: `h-${ex(k)}`, listing: listing(`slice-${k}`), ownerUserId: ex(k),
      latitude: "35.01", longitude: "135.76", cancellationPolicyType: "flexible",
      action: { primary: { kind: "book", label: "Book" }, ask: ["slot"], landing: { store: "checkout", timed: true, placeAnchored: true, forksFinal: false } } as any,
      nextOpenSlot: { date: "2099-01-01", startTime: "09:00" },
    })),
  });
  const slots = result.marketSelection.slots;
  assert.deepEqual(slots.map((s) => s.slot), [1, 2, 3]);
  const two = slots.find((s) => s.slot === 2) as any;
  const three = slots.find((s) => s.slot === 3) as any;
  assert.equal(two.gem.id, "gem-ok", "slot 2: the routable curator's gem, not a higher-scored non-routable one");
  assert.equal(two.handle, `h-${ex("ok")}`);
  assert.equal(three.listing.id, "slice-ok", "slot 3: the routable owner's listing");
  assert.equal("ownerUserId" in three, false, "no user id in the slot payload (LD 40)");
  for (const k of order.slice(0, -1)) {
    assert.equal(gated.includes(ex(k)), false, `${k} never reaches the byline gate`);
  }
});
