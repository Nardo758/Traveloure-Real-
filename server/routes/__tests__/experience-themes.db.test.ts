/**
 * Discover theme filter and suggestion admission against Postgres.
 * Untagged listings stay in the result until a theme param is sent.
 *
 * Run: npx tsx --test server/routes/__tests__/experience-themes.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { THEME_NOT_ON_LIST_MESSAGE } from "@shared/experience-themes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const { pool: p } = await import("../../db");
    const r = await p.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = (r.rows[0]?.addr as string) ?? null;
  } catch { /* local socket */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[experience-themes] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a disposable database.`,
    );
  }
}

const { pool } = await import("../../db");
const { storage } = await import("../../storage");
const { admitListingTheme, recordThemeSuggestion } = await import("../../services/experience-themes.service");

const tag = `theme-${crypto.randomUUID().slice(0, 8)}`;
const location = `ThemeLoc-${tag}`;
let userId = "";
let taggedId = "";
let untaggedId = "";
let suggestionLabel = "";

before(async () => {
  await assertDisposableDb();
  const sql = fs.readFileSync(path.join(process.cwd(), "server/migrations/409_experience_themes.sql"), "utf8");
  await pool.query(sql);
  userId = crypto.randomUUID();
  taggedId = crypto.randomUUID();
  untaggedId = crypto.randomUUID();
  suggestionLabel = `Suggested ${tag}`;
  await pool.query(
    `INSERT INTO users (id, email, role) VALUES ($1, $2, 'provider')`,
    [userId, `theme-fixture-${userId}@example.invalid`],
  );
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, location, status, approval_status, delivery_method, theme_id)
     VALUES ($1, $2, $3, $4, 'active', 'approved', 'pdf', 'hiking_itinerary')`,
    [taggedId, userId, `Tagged hike ${tag}`, location],
  );
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, location, status, approval_status, delivery_method, theme_id)
     VALUES ($1, $2, $3, $4, 'active', 'approved', 'pdf', NULL)`,
    [untaggedId, userId, `No theme ${tag}`, location],
  );
});

after(async () => {
  await pool.query(`DELETE FROM experience_theme_suggestions WHERE label = $1`, [suggestionLabel]);
  await pool.query(`DELETE FROM provider_services WHERE id = ANY($1::varchar[])`, [[taggedId, untaggedId]]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

describe("unifiedSearch theme filter", () => {
  it("keeps untagged listings when no theme is requested", async () => {
    const result = await storage.unifiedSearch({ location, limit: 20, offset: 0 });
    const ids = result.services.map((row) => row.id);
    assert.ok(ids.includes(taggedId));
    assert.ok(ids.includes(untaggedId));
    const tagged = result.services.find((row) => row.id === taggedId);
    const untagged = result.services.find((row) => row.id === untaggedId);
    assert.equal(tagged?.themeSlug, "hiking_itinerary");
    assert.equal(tagged?.themeLabel, "Hiking Itinerary");
    assert.equal(untagged?.themeSlug, null);
    assert.equal(untagged?.themeLabel, null);
    assert.equal(JSON.stringify(result).includes("Untagged"), false);
  });

  it("returns only the tagged listing, and the total excludes the untagged one", async () => {
    const page = await storage.unifiedSearch({
      location,
      themeIds: ["hiking_itinerary"],
      limit: 1,
      offset: 0,
    });
    assert.equal(page.total, 1);
    assert.equal(page.services.length, 1);
    assert.equal(page.services[0]?.id, taggedId);
    const next = await storage.unifiedSearch({
      location,
      themeIds: ["hiking_itinerary"],
      limit: 1,
      offset: 1,
    });
    assert.equal(next.total, 1);
    assert.equal(next.services.length, 0);
  });
});

describe("theme admission", () => {
  it("leaves the column alone when the body does not mention a theme", async () => {
    const admitted = await admitListingTheme({ serviceName: "Walk" });
    assert.equal(admitted.ok, true);
    if (admitted.ok) {
      assert.deepEqual(admitted.themePatch, {});
      assert.equal(admitted.suggestion, null);
    }
  });

  it("refuses an id that is not on the catalog", async () => {
    const admitted = await admitListingTheme({ themeChoice: "catalog", themeId: `missing-${tag}` });
    assert.equal(admitted.ok, false);
    if (!admitted.ok) assert.equal(admitted.body.message, THEME_NOT_ON_LIST_MESSAGE);
  });

  it("stores a suggestion without publishing a theme", async () => {
    const before = await pool.query(`SELECT count(*)::int AS n FROM experience_themes WHERE label = $1`, [suggestionLabel]);
    await recordThemeSuggestion({ label: suggestionLabel, serviceId: taggedId, suggestedBy: userId });
    const themes = await pool.query(`SELECT count(*)::int AS n FROM experience_themes WHERE label = $1`, [suggestionLabel]);
    const suggestions = await pool.query(
      `SELECT status FROM experience_theme_suggestions WHERE label = $1`,
      [suggestionLabel],
    );
    assert.equal(themes.rows[0].n, before.rows[0].n);
    assert.equal(suggestions.rows.length, 1);
    assert.equal(suggestions.rows[0].status, "pending");
    const listing = await pool.query(`SELECT theme_id FROM provider_services WHERE id = $1`, [taggedId]);
    assert.equal(listing.rows[0].theme_id, "hiking_itinerary");
  });
});
