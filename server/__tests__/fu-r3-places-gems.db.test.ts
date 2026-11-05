/**
 * FU-R3-1 (ledger `2026-11-05-fu-r3-places-gems`; ruling, Nov 5, 2026): `/places/{city}` lists the city page's gems.
 *   P1  `GET /api/places/kyoto` answers the same gem ids, in the same order, as the city page's gem section
 *       (`getLocationView("Kyoto")`.gems), and the same teaser keys.
 *   P2  a withdrawn gem (`hidden_at` set) is on neither; an expert-verified `ai_discovered_gems` row is on neither
 *       (no public page reads that table, CMS-1).
 *   P3  a segment that names no operating market is a 404.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { aiDiscoveredGems, travelPulseHiddenGems } from "@shared/schema";
import landingRoutes from "../routes/landing.routes";
import { locationViewService } from "../services/location-view.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const gemIds: string[] = [];
const aiIds: string[] = [];

async function get(path: string): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(landingRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, json: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const shown = await db.insert(travelPulseHiddenGems).values({ city: "Kyoto", country: "Japan", placeName: `FU visible ${tag}`, placeType: "temple", gemScore: 99 } as any).returning({ id: travelPulseHiddenGems.id });
  const hidden = await db.insert(travelPulseHiddenGems).values({ city: "Kyoto", country: "Japan", placeName: `FU withdrawn ${tag}`, placeType: "temple", gemScore: 98, hiddenAt: new Date() } as any).returning({ id: travelPulseHiddenGems.id });
  gemIds.push(shown[0].id, hidden[0].id);
  const ai = await db.insert(aiDiscoveredGems).values({ destination: "Kyoto", category: "historic_gems", name: `FU ai ${tag}`, description: "x", verifiedByExpert: true } as any).returning({ id: aiDiscoveredGems.id });
  aiIds.push(ai[0].id);
});

after(async () => {
  if (gemIds.length) await db.delete(travelPulseHiddenGems).where(inArray(travelPulseHiddenGems.id, gemIds));
  if (aiIds.length) await db.delete(aiDiscoveredGems).where(inArray(aiDiscoveredGems.id, aiIds));
});

describe("FU-R3-1 /places lists the city page's gems", () => {
  it("P1 same ids, same order, same keys as the city page's gem section", async () => {
    const places = await get("/api/places/kyoto");
    assert.equal(places.status, 200);
    assert.equal(places.json.city, "Kyoto");
    assert.equal(places.json.open, true);
    const view = await locationViewService.getLocationView("Kyoto", null);
    const cityGems = (view as any).gems.data as any[];
    assert.ok(Array.isArray(cityGems));
    assert.deepEqual(places.json.gems.map((g: any) => g.id), cityGems.map((g) => g.id));
    assert.deepEqual(Object.keys(places.json.gems[0]).sort(), Object.keys(cityGems[0]).sort());
    assert.ok(places.json.gems.some((g: any) => g.id === gemIds[0]), "the visible gem is listed");
  });

  it("P2 a withdrawn gem and an ai_discovered_gems row are on neither page", async () => {
    const places = await get("/api/places/Kyoto");
    const ids = places.json.gems.map((g: any) => g.id);
    assert.ok(!ids.includes(gemIds[1]), "withdrawn gem absent");
    assert.ok(!ids.includes(aiIds[0]), "no ai_discovered_gems row");
    assert.ok(!places.json.gems.some((g: any) => g.placeName === `FU ai ${tag}`));
  });

  it("P3 a segment that names no operating market is a 404", async () => {
    assert.equal((await get("/api/places/atlantis")).status, 404);
  });
});
