/**
 * Lane 4 — /places (ledger `2026-11-05-lane4-places`; briefs A-16, A-20, C-4, C-5).
 *
 *   S1  A-16: `/places`, `/places?city=Kyoto` and `/hidden-gems` answer 301 to `/places/{city}`; an unknown city answers
 *       404; a known one falls through to the SPA.
 *   S2  A-20 / C-5: the categories a city shows are only those with a reviewed item there, labelled and ordered by the
 *       approved chip set; a category the chip set does not name ("Off the Tourist Path") is never a chip; an AI-only
 *       (unreviewed) row never makes a chip.
 *   S3  C-4: a city's gems match its stored destination case-insensitively ("Kyoto" and "Kyoto, Japan"), never another
 *       city whose name starts the same.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/lane4-places.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { aiDiscoveredGems } from "@shared/schema";
import { gemDiscoveryService } from "../services/gem-discovery.service";
import seoRoutes from "../routes/seo.routes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
// A city of its own, so rows other tests left behind cannot add a chip.
const CITY = `Lane4ville${tag}`;
const ids: string[] = [];

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const rows = [
    { destination: CITY, category: "hidden_viewpoints", verifiedByExpert: true },
    { destination: `${CITY}, Japan`, category: "nightlife_secrets", verifiedByExpert: true },
    { destination: CITY, category: "off_tourist_path", verifiedByExpert: true },
    { destination: CITY, category: "street_art", verifiedByExpert: false },
    { destination: `${CITY}town`, category: "local_markets", verifiedByExpert: true },
  ];
  for (const r of rows) {
    const [g] = await db
      .insert(aiDiscoveredGems)
      .values({ ...r, name: `Lane4 ${r.category} ${tag}`, description: "Lane 4 fixture." } as any)
      .returning({ id: aiDiscoveredGems.id });
    ids.push(g.id);
  }
});

after(async () => {
  if (ids.length) await db.delete(aiDiscoveredGems).where(inArray(aiDiscoveredGems.id, ids));
});

async function get(path: string): Promise<{ status: number; location: string | null }> {
  const app = express();
  app.use(seoRoutes);
  app.use((_req, res) => res.status(299).send("spa"));
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
    return { status: res.status, location: res.headers.get("location") };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("Lane 4 places", () => {
  it("S1 every /places address redirects to /places/{city}; an unknown city is not found", async () => {
    assert.deepEqual(await get("/places"), { status: 301, location: "/places/kyoto" });
    assert.deepEqual(await get("/places?city=Kyoto"), { status: 301, location: "/places/kyoto" });
    assert.deepEqual(await get("/hidden-gems"), { status: 301, location: "/places/kyoto" });
    assert.deepEqual(await get("/hidden-gems?city=kyoto"), { status: 301, location: "/places/kyoto" });
    assert.equal((await get("/places/atlantis")).status, 404);
    assert.equal((await get("/places/kyoto")).status, 299, "a known city falls through to the SPA");
  });

  it("S2 only the chips this city has reviewed items in, in the approved order", async () => {
    const chips = await gemDiscoveryService.getAvailableCategories(CITY);
    assert.deepEqual(chips, [
      { value: "hidden_viewpoints", label: "Viewpoints" },
      { value: "nightlife_secrets", label: "Nightlife" },
    ]);
  });

  it("S3 a city's gems match its own destination only", async () => {
    const { gems, total } = await gemDiscoveryService.getGemsForDestination(CITY.toLowerCase());
    assert.equal(total, 3, "Kyoto-style and 'City, Country' rows, reviewed only; never the '...town' row");
    assert.ok(gems.every((g: any) => g.destination === CITY || g.destination === `${CITY}, Japan`));
  });
});
