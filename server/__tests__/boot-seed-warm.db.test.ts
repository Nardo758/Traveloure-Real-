/**
 * The warm boot's query budget (ledger `2026-10-19-boot-seed-timing`). On a database that already holds every
 * reference row, the eleven boot seeders make one existence read each (the template-tabs seeder three reads and
 * one matrix statement) — never a round trip per row. Production boot took 43 s; at its round-trip cost the
 * per-row loops (DMO sources, experience types, Kyoto heritage stubs) were most of it.
 *
 *   W1  run every boot seeder twice; the second (warm) pass writes nothing and makes at most 20 queries
 *   W2  each of the three former loops makes exactly one query when warm
 *
 * DISPOSABLE DB ONLY: it seeds reference rows a CI database already carries; it deletes nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

let n = 0;
const orig = (pg as any).Client.prototype.query;
(pg as any).Client.prototype.query = function (...a: unknown[]) {
  n++;
  return orig.apply(this, a);
};

const { seedCategories } = await import("../seed-categories");
const { seedExperienceTypes } = await import("../seed-experience-types");
const { seedExpertServices } = await import("../seed-expert-services");
const { seedCanonicalServiceTemplates, seedCanonicalExpertOfferings } = await import("../seeds/canonical-service-templates.seed");
const { ensureDefaultBookingFeeConfig } = await import("../services/booking-fee-bootstrap");
const { seedExperienceTemplateTabs } = await import("../seeds/experience-template-tabs.seed");
const { seedDmoSources } = await import("../seeds/dmo-sources.seed");
const { seedDmoKyotoHeritage } = await import("../seeds/dmo-kyoto-heritage.seed");
const { seedRoleScopedTemplates } = await import("../seeds/role-scoped-templates.seed");
const { seedLocationCache } = await import("../seeds/location-cache.seed");
const { pool } = await import("../db");

const SEEDERS: Array<[string, () => Promise<unknown>]> = [
  ["seedCategories", () => seedCategories()],
  ["seedExperienceTypes", () => seedExperienceTypes()],
  ["seedExperienceTemplateTabs", () => seedExperienceTemplateTabs()],
  ["seedExpertServices", () => seedExpertServices()],
  ["seedRoleScopedTemplates", () => seedRoleScopedTemplates()],
  ["seedCanonicalServiceTemplates", () => seedCanonicalServiceTemplates()],
  ["seedCanonicalExpertOfferings", () => seedCanonicalExpertOfferings()],
  ["ensureDefaultBookingFeeConfig", () => ensureDefaultBookingFeeConfig()],
  ["seedDmoSources", () => seedDmoSources()],
  ["seedDmoKyotoHeritage", () => seedDmoKyotoHeritage()],
  ["seedLocationCache", () => seedLocationCache({ refresh: false })],
];

after(async () => {
  await pool.end();
});

test("W1 + W2 — a warm boot makes one read per seeder, not one per row", async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to seed a non-disposable database");
  }
  for (const [, fn] of SEEDERS) await fn(); // cold, or already warm in CI
  const perSeeder: Record<string, number> = {};
  let total = 0;
  for (const [name, fn] of SEEDERS) {
    n = 0;
    const out: any = await fn();
    perSeeder[name] = n;
    total += n;
    if (out && typeof out === "object") {
      for (const k of ["created", "inserted", "upserted"]) if (k in out) assert.equal(out[k], 0, `${name} wrote ${k} on a warm pass`);
    }
  }
  assert.ok(total <= 20, `warm boot made ${total} queries: ${JSON.stringify(perSeeder)}`);
  for (const name of ["seedDmoSources", "seedExperienceTypes", "seedDmoKyotoHeritage"]) assert.equal(perSeeder[name], 1, name);
});
