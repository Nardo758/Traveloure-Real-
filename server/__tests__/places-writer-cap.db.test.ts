/**
 * The writer caps a Places fact's expiry at Google's cache limit (ledger `2026-10-19-places-writer-cap`).
 *
 *   PC1  a Places fact with an expiry past fetched_at + placesCacheMaxDays() is stored with exactly the cap
 *   PC2  a Places fact with no expiry is stored with exactly the cap
 *   PC3  a sooner Places expiry is kept; another origin's expiry is untouched
 *   PC4  a Places hours draft is still refused whatever its expiry (GH-1)
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inArray, like } from "drizzle-orm";
import { db, pool } from "../db";
import { placeFacts } from "@shared/schema";
import { recordFacts } from "../services/content-facts/place-facts.service";
import { placesCacheMaxDays } from "../config/content-facts.config";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `pcap-${RUN}-${s}`;
const DAY = 86_400_000;
const fetchedAt = new Date();
const cap = new Date(fetchedAt.getTime() + placesCacheMaxDays() * DAY);
// An obviously fake point (not a real place).
const draft = (ref: string, over: Record<string, unknown>) =>
  ({
    placeRefKind: "free_text", placeRef: id(ref), placeLat: null, placeLng: null, market: null, need: "stop.hours",
    factType: "location", value: { lat: 0.001, lng: 0.001 }, origin: "places_api", sourceId: null, sourceUrl: null,
    license: "restricted", fetchedAt, expiresAt: null, costCents: 0, ...over,
  }) as any;
const stored = async (ref: string) => (await db.select().from(placeFacts).where(inArray(placeFacts.placeRef, [id(ref)])))[0];

before(() => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
});

after(async () => {
  await db.delete(placeFacts).where(like(placeFacts.placeRef, `pcap-${RUN}-%`));
  await pool.end();
});

test("PC1 — an expiry past the cap is stored as the cap", async () => {
  await recordFacts([draft("long", { expiresAt: new Date(fetchedAt.getTime() + 90 * DAY) })], { planId: null, itemId: null });
  assert.equal(new Date((await stored("long")).expiresAt!).getTime(), cap.getTime());
  assert.ok(placesCacheMaxDays() <= 30);
});

test("PC2 — no expiry is stored as the cap", async () => {
  await recordFacts([draft("none", { expiresAt: null })], { planId: null, itemId: null });
  assert.equal(new Date((await stored("none")).expiresAt!).getTime(), cap.getTime());
});

test("PC3 — a sooner expiry is kept; another origin is untouched", async () => {
  const soon = new Date(fetchedAt.getTime() + 3 * DAY);
  const later = new Date(fetchedAt.getTime() + 90 * DAY);
  await recordFacts(
    [
      draft("soon", { expiresAt: soon }),
      draft("tip", { origin: "expert_nugget", license: null, factType: "tip", value: { text: "x" }, expiresAt: later }),
    ],
    { planId: null, itemId: null },
  );
  assert.equal(new Date((await stored("soon")).expiresAt!).getTime(), soon.getTime());
  assert.equal(new Date((await stored("tip")).expiresAt!).getTime(), later.getTime());
});

test("PC4 — a Places hours draft is still refused", async () => {
  const n = await recordFacts([draft("hours", { factType: "hours", value: { weekdayDescriptions: ["Monday: 9 – 5"] }, expiresAt: cap })], { planId: null, itemId: null });
  assert.equal(n, 0);
  assert.equal(await stored("hours"), undefined);
});
