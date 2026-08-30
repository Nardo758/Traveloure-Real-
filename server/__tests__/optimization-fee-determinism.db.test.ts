/**
 * optimization-fee-determinism.db.test.ts
 *
 * Proves the fee resolver picks a DETERMINISTIC, FAIL-SAFE row when more than one active
 * `optimization_fees` row matches — the money defect the Aug 16 2026 spec-coverage sweep found.
 *
 * WHAT WAS WRONG. `resolveOptimizationFee`'s event-type branch was
 *   `WHERE event_type = ? AND is_active` … `LIMIT 1`
 * with **no ORDER BY and no complexity_tier filter**, and nothing in the schema holds the table to
 * one active row per event_type. With two active rows, which fee applied was whatever Postgres
 * returned first — arbitrary, and free to change with a vacuum, a plan change, or an unrelated
 * insert. `is_disabled` rode the same coin flip, so **the quote could offer a paid AI path an
 * admin had explicitly disabled**. The tier-level default query had the identical shape.
 *
 * WHY IT SURVIVED. `concierge-phase-a.spec.ts`'s `$0=off` test exists precisely to catch this, and
 * it never ran: that spec was in no workflow, and its psql helper was broken besides. A defect and
 * the test that would have caught it were both dark for the same reason.
 *
 * WHAT IS ASSERTED (D1–D4). The ordering is `is_disabled DESC, updated_at DESC, id` — disabled
 * wins, because when the configuration is ambiguous the safe reading of "an admin turned this off"
 * is to honour the off. D4 is the discriminating half: ordering must not make everything look
 * disabled, or the "fix" would just break the paid path in the other direction.
 *
 * NOT asserted here: that duplicates cannot exist. Preventing them needs a partial UNIQUE index,
 * which the deploy push enforces at publish time — so it needs a production preflight first and is
 * filed separately. This file guards the RESOLUTION, which is what actually charges money.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getFee } from "../services/optimization-fee.service";

const RUN = crypto.randomUUID().slice(0, 8);
/** A synthetic event_type that no seed uses, so this file never races the real catalog. */
const EVENT = `zz-determinism-${RUN}`;

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts; never defaults open) ──────────
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
      `[optimization-fee-determinism] REFUSING to write fixtures: DATABASE_URL host ` +
        `'${host ?? "<none>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

async function insertFee(opts: {
  tier: string;
  priceCents: number;
  disabled: boolean;
  updatedAt: string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO optimization_fees
      (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${opts.tier}, ${EVENT}, ${opts.priceCents}, 'USD', true, ${opts.disabled},
       NOW(), ${opts.updatedAt}::timestamptz)
  `);
}

async function clearFixtures(): Promise<void> {
  await db.execute(sql`DELETE FROM optimization_fees WHERE event_type = ${EVENT}`);
}

before(async () => {
  await assertDisposableDb();
  await clearFixtures();
});

after(async () => {
  await clearFixtures();
});

/**
 * D1 — the original defect, reproduced. TWO active rows for one event_type, one of them DISABLED.
 * Before the fix this returned whichever row Postgres surfaced first; the enabled row winning
 * meant a disabled offering was quoted as purchasable.
 */
test("D1: with two active rows, a DISABLED row wins over an enabled one", async () => {
  await clearFixtures();
  // INSERT ORDER IS LOAD-BEARING. An unordered `LIMIT 1` returns rows in physical order, so the
  // row inserted FIRST is the one the unfixed code surfaces. The ENABLED row therefore goes in
  // first: on the broken resolver this test sees isDisabled=false and FAILS, which is the whole
  // point. (Written the other way round it passed against the unfixed code — by luck, not by
  // detection. Verified by mutation.)
  //
  // The enabled row is also the NEWER one, so a naive "newest wins" rule would pick it too:
  // disabled has to win on its own merits, not by being more recent.
  await insertFee({ tier: "simple", priceCents: 599, disabled: false, updatedAt: "2030-01-01T00:00:00Z" });
  await insertFee({ tier: "standard", priceCents: 999, disabled: true, updatedAt: "2020-01-01T00:00:00Z" });

  const fee = await getFee(EVENT, "standard");
  assert.equal(
    fee.isDisabled,
    true,
    "an admin's disabled row must win the ambiguous case — otherwise the quote offers a paid path that was turned off",
  );
});

/**
 * D2 — determinism itself. The same query, repeated, must give the same answer. This is the part a
 * single-run assertion cannot show: the original bug was not "wrong every time", it was "unstable".
 */
test("D2: repeated resolution of the same ambiguous config is stable", async () => {
  await clearFixtures();
  await insertFee({ tier: "standard", priceCents: 999, disabled: false, updatedAt: "2021-01-01T00:00:00Z" });
  await insertFee({ tier: "complex", priceCents: 1999, disabled: false, updatedAt: "2022-01-01T00:00:00Z" });

  const runs = await Promise.all([
    getFee(EVENT, "standard"),
    getFee(EVENT, "standard"),
    getFee(EVENT, "standard"),
    getFee(EVENT, "standard"),
  ]);
  const prices = new Set(runs.map((r) => r.priceCents));
  assert.equal(prices.size, 1, `resolution must be stable across calls; saw ${[...prices].join(", ")}`);
  // updated_at DESC decides among equally-enabled rows.
  assert.equal(runs[0].priceCents, 1999, "the most recently updated row should win among enabled rows");
});

/**
 * D3 — the unambiguous case is untouched. One active row ⇒ that row, exactly as before. A fix to
 * the ambiguous path must not change the ordinary path, which is every real request.
 */
test("D3: a single active row resolves to itself (no behaviour change)", async () => {
  await clearFixtures();
  await insertFee({ tier: "standard", priceCents: 777, disabled: false, updatedAt: "2024-01-01T00:00:00Z" });

  const fee = await getFee(EVENT, "standard");
  assert.equal(fee.priceCents, 777);
  assert.equal(fee.isDisabled, false);
});

/**
 * D4 — the DISCRIMINATING half. `is_disabled DESC` must not make an all-enabled config resolve as
 * disabled. Without this, a fix that simply returned `isDisabled: true` whenever rows were
 * ambiguous would pass D1 while silently killing the paid path for everyone.
 */
test("D4: with only ENABLED rows, the result is enabled", async () => {
  await clearFixtures();
  await insertFee({ tier: "simple", priceCents: 599, disabled: false, updatedAt: "2023-01-01T00:00:00Z" });
  await insertFee({ tier: "standard", priceCents: 999, disabled: false, updatedAt: "2023-06-01T00:00:00Z" });

  const fee = await getFee(EVENT, "standard");
  assert.equal(fee.isDisabled, false, "ordering must not manufacture a disabled verdict");
  assert.equal(fee.priceCents, 999);
});
