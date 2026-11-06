/**
 * CAP-2 Phase 3 — the public guest-capabilities read (ledger `2026-11-06-cap2-phase3-plan-actions`; dispatch ruling 5).
 *
 *   G1 waitlist mode: save true, book false, hire false — for any city.
 *   G2 open mode: book true; hire only for a city whose market has an approved expert (none seeded here ⇒ false), and
 *      false with no city or a city that is no market.
 *   G3 the answer carries exactly {mode, actions:{save, book, hire}} — no price, fee or amount.
 *
 * Disposable database only. The signup-mode row is restored in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cap2-phase3.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { guestCapabilitiesFor } from "../routes/launch-public.routes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

let priorMode: string | null = null;
async function setMode(mode: "open" | "waitlist") {
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', ${mode})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = ${mode}`);
  invalidatePlatformFlagCache();
}

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r as any).rows?.[0]?.setting_value as string | undefined) ?? null;
});

after(async () => {
  if (priorMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
  invalidatePlatformFlagCache();
});

describe("CAP-2 Phase 3 — guest capabilities", () => {
  it("G1 waitlist: save only", async () => {
    await setMode("waitlist");
    for (const city of ["Kyoto", null, "Atlantis"]) {
      assert.deepEqual(await guestCapabilitiesFor(city), { mode: "waitlist", actions: { save: true, book: false, hire: false } }, String(city));
    }
  });

  it("G2 open: book; hire needs an area with an approved expert", async () => {
    await setMode("open");
    const kyoto = await guestCapabilitiesFor("Kyoto");
    assert.equal(kyoto.mode, "open");
    assert.equal(kyoto.actions.book, true);
    assert.equal(typeof kyoto.actions.hire, "boolean");
    assert.deepEqual(await guestCapabilitiesFor(null), { mode: "open", actions: { save: true, book: true, hire: false } }, "no area ⇒ no hire");
    assert.deepEqual(await guestCapabilitiesFor("Atlantis"), { mode: "open", actions: { save: true, book: true, hire: false } }, "no market ⇒ no hire");
  });

  it("G3 no price, fee or amount in the answer", async () => {
    await setMode("open");
    const answer = await guestCapabilitiesFor("Kyoto");
    assert.deepEqual(Object.keys(answer).sort(), ["actions", "mode"]);
    assert.deepEqual(Object.keys(answer.actions).sort(), ["book", "hire", "save"]);
    assert.doesNotMatch(JSON.stringify(answer), /price|fee|amount|cents/i);
  });
});
