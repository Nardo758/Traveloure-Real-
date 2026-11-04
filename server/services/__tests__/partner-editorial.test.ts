/**
 * PARTNER-1 + migration 432 (ledger `2026-11-03-gate1-partner1`).
 *
 *   T4 the Fever projection never carries Fever's description, short description or highlights; our editorial
 *      description appears only once `editorial_reviewed_at` is set. The same rule for the activities and hotels the
 *      recommendation service returns (`toEditorialPartnerRow`).
 *      Catalog search and the catalog item read (experience-catalog.service.ts) follow the same rule (DB-backed rows).
 *   T8 migration 432 is registered, its ALTERs are ADD COLUMN IF NOT EXISTS, its UPDATE matches only the old text, and
 *      its statements are the brief's §8 text; the eight columns are declared in shared/schema.ts.
 *
 * No network: the fixtures carry no partner URL (no token is minted), geocoding is off and the neighbourhood list is
 * empty; the editorial lookup is injected.
 * Run: npx tsx --test server/services/__tests__/partner-editorial.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toPublicFeverEvents } from "../fever-public";
import { reviewedEditorialDescription, toEditorialPartnerRow } from "../partner-editorial";
import type { FeverEvent } from "../fever.service";
import { MIGRATION_FILES } from "../../migrations/migration-files";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

function fever(id: string): FeverEvent {
  return {
    id,
    title: `Concert ${id}`,
    slug: `concert-${id}`,
    description: "SUPPLIER LONG TEXT",
    shortDescription: "SUPPLIER SHORT TEXT",
    category: "music",
    city: "Kyoto",
    cityCode: "KYO",
    country: "Japan",
    dates: { startDate: "2026-12-01T19:00:00Z" },
    pricing: { currency: "JPY" },
    isFree: false,
    isSoldOut: false,
    bookingUrl: "",
    highlights: ["SUPPLIER HIGHLIGHT"],
  } as unknown as FeverEvent;
}

const deps = {
  partnerName: null,
  contactEmail: null,
  neighborhoods: async () => [],
  editorial: async () =>
    new Map([
      ["reviewed", { editorialDescription: "Our reviewed words.", editorialReviewedAt: new Date("2026-11-01T00:00:00Z") }],
      ["unreviewed", { editorialDescription: "Draft words.", editorialReviewedAt: null }],
    ]),
};

test("T4 Fever: no supplier text; editorial description only when reviewed", async () => {
  const out = await toPublicFeverEvents([fever("reviewed"), fever("unreviewed"), fever("none")], deps);
  const json = JSON.stringify(out);
  for (const raw of ["SUPPLIER LONG TEXT", "SUPPLIER SHORT TEXT", "SUPPLIER HIGHLIGHT", "shortDescription", "highlights"]) {
    assert.ok(!json.includes(raw), `projection carries "${raw}"`);
  }
  const byId = new Map(out.map((e) => [e.id, e]));
  assert.equal(byId.get("reviewed")?.description, "Our reviewed words.");
  assert.equal(byId.get("unreviewed")?.description, null, "unreviewed editorial text is not published");
  assert.equal(byId.get("none")?.description, null);
  // The default lookup reads reviewed rows only, and fails closed.
  const src = read("server/services/fever-public.ts");
  assert.match(src, /isNotNull\(feverEventCache\.editorialReviewedAt\)/);
  assert.match(src, /\} catch \{\s*return new Map\(\);/);
});

test("T4 activities and hotels: the recommendation rows carry the reviewed editorial description only", () => {
  const activity = {
    id: "a1",
    title: "Tea ceremony",
    description: "SUPPLIER ACTIVITY TEXT",
    rawData: { description: "SUPPLIER RAW" },
    editorialDescription: "Ours.",
    editorialReviewedAt: "2026-11-02T00:00:00Z",
    aiScore: 70,
  };
  const a = toEditorialPartnerRow(activity);
  assert.equal(a.description, "Ours.");
  assert.ok(!JSON.stringify(a).includes("SUPPLIER"));
  assert.ok(!("editorialDescription" in a) && !("editorialReviewedAt" in a) && !("rawData" in a));
  assert.equal((a as { aiScore?: number }).aiScore, 70, "every other field is kept");

  const hotel = { id: "h1", name: "Ryokan", rawData: { description: "SUPPLIER HOTEL" }, editorialDescription: "Ours too.", editorialReviewedAt: null };
  const h = toEditorialPartnerRow(hotel);
  assert.equal(h.description, null, "not reviewed ⇒ no text");
  assert.ok(!JSON.stringify(h).includes("SUPPLIER"));

  assert.equal(reviewedEditorialDescription({ editorialDescription: "  ", editorialReviewedAt: new Date() }), null);
  assert.equal(reviewedEditorialDescription({ editorialDescription: "x", editorialReviewedAt: "not a date" }), null);

  const rec = read("server/services/recommendation.service.ts");
  assert.match(rec, /hotels: enhancedHotels\.map\(\(h\) => toEditorialPartnerRow\(h\)\)/);
  assert.match(rec, /activities: enhancedActivities\.map\(\(a\) => toEditorialPartnerRow\(a\)\)/);
});

test("T4 catalog search and catalog item read: Fever description only when reviewed", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("needs DATABASE_URL (disposable database)");
    return;
  }
  const host = new URL(process.env.DATABASE_URL).hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const { db } = await import("../../db");
  const { experienceCatalogService } = await import("../experience-catalog.service");
  const run = crypto.randomUUID().slice(0, 8);
  const city = `Editorialtown ${run}`;
  const ids = { reviewed: `pe-${run}-r`, unreviewed: `pe-${run}-u` };
  const insert = (id: string, reviewedAt: Date | null) => db.execute(sql`
    INSERT INTO fever_event_cache (id, event_id, title, description, short_description, category, city, city_code, country, booking_url, expires_at, editorial_description, editorial_reviewed_at)
    VALUES (${id}, ${id}, ${`Concert ${id}`}, 'SUPPLIER CATALOG TEXT', 'SUPPLIER CATALOG SHORT', 'music', ${city}, 'EDT', 'Nowhere',
            'https://partner.example.test/x', NOW() + interval '1 day', 'Our catalog words.', ${reviewedAt})`);
  try {
    await insert(ids.reviewed, new Date("2026-11-01T00:00:00Z"));
    await insert(ids.unreviewed, null);
    const found = await (experienceCatalogService as any).searchEvents({ destination: city, providers: ["fever"] }, 10, 0);
    const byId = new Map<string, any>(found.map((e: any) => [e.id, e]));
    assert.equal(byId.get(ids.reviewed)?.description, "Our catalog words.");
    assert.equal(byId.get(ids.unreviewed)?.description, null, "unreviewed ⇒ no description");
    assert.ok(!JSON.stringify(found).includes("SUPPLIER CATALOG"), "catalog search carries no Fever text");
    const one = await experienceCatalogService.getCatalogItem(ids.unreviewed, "event");
    assert.equal(one?.description, null);
    assert.ok(!JSON.stringify(one).includes("SUPPLIER CATALOG"));
    const two = await experienceCatalogService.getCatalogItem(ids.reviewed, "event");
    assert.equal(two?.description, "Our catalog words.");
  } finally {
    await db.execute(sql`DELETE FROM fever_event_cache WHERE id IN (${ids.reviewed}, ${ids.unreviewed})`).catch(() => {});
  }
});

test("T8 migration 432: registered, additive, guarded, and the brief's §8 statements", () => {
  const file = "432_waitlist_markets_and_partner_editorial.sql";
  assert.equal(MIGRATION_FILES[MIGRATION_FILES.length - 1], file, "registered last");
  const sql = read(`server/migrations/${file}`);
  const statements = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();
  const expected = `INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('live_market_slugs', '[]',
   'Markets shown as "Live" (full planner, bookings). JSON array of operating-market keys. Empty at launch. Marquee = launch_market_slug.'),
  ('market_launch_dates', '{}',
   'Optional opening month per market, JSON {"<market-key>":"YYYY-MM"}; shown as "Opening <Month YYYY>" only when set.')
ON CONFLICT (setting_key) DO NOTHING;
ALTER TABLE fever_event_cache    ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE activity_cache       ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE hotel_cache          ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE affiliate_products   ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
UPDATE experience_types SET description = 'Plan the proposal: the place, the moment, the dinner after.'
  WHERE description = 'Plan the perfect proposal with the right setting and ambiance';`;
  assert.equal(statements, expected);
  for (const line of statements.split("\n").filter((l) => l.startsWith("ALTER TABLE"))) {
    assert.equal(line.match(/ADD COLUMN IF NOT EXISTS/g)?.length, 2, line);
  }
  assert.doesNotMatch(statements, /\b(DROP|CHECK|DEFAULT|NOT NULL|CREATE INDEX|UNIQUE)\b/i);
  assert.match(statements, /UPDATE experience_types[\s\S]*WHERE description = 'Plan the perfect proposal with the right setting and ambiance';/);

  const schema = read("shared/schema.ts");
  assert.equal(schema.match(/editorialDescription: text\("editorial_description"\),\n\s*editorialReviewedAt: timestamp\("editorial_reviewed_at"\),/g)?.length, 4);
});
