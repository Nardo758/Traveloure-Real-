/**
 * #1796 follow-ups (ledger `2026-10-31-kyoto-1796-followups`), items 2, 8 and 9.
 *
 *   F1  the Arashiyama provider line and href go to provider sign-up; the expert line is unchanged.
 *   F2  Yoshida Sanso Ryokan is hidden by a fresh Kyoto seed (the overlay), and not in another city.
 *       Migration 400's own hide list is unchanged.
 *   F3  migration 425 is registered, data-only, names Yoshida and the three dead URLs, and carries
 *       no approval sentence.
 *
 * Run: npx tsx --test shared/__tests__/kyoto-1796-followups.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KYOTO_GEMS_HIDDEN_BY_425, KYOTO_GEMS_TO_HIDE, kyotoGemSeedOverlay } from "../kyoto-feed-cleanup";
import {
  ARASHIYAMA_ITINERARY_EXPERT_HREF,
  ARASHIYAMA_ITINERARY_EXPERT_LINK,
  ARASHIYAMA_ITINERARY_PROVIDER_HREF,
  ARASHIYAMA_ITINERARY_PROVIDER_LINK,
} from "../../client/src/lib/arashiyama-wanted-copy";
import * as waitlist from "../launch-waitlist";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const sql = read("server/migrations/425_kyoto_1796_followups.sql");
const registry = read("server/migrations/migration-files.ts");
const DEAD = [
  "https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80",
];

test("F1 the Arashiyama business line goes to provider sign-up; the expert line is unchanged", () => {
  assert.equal(ARASHIYAMA_ITINERARY_PROVIDER_LINK, "Run a business in Arashiyama? Sign up as a provider.");
  assert.equal(ARASHIYAMA_ITINERARY_PROVIDER_HREF, "/signup?intent=supply&supplyRole=provider");
  assert.equal(ARASHIYAMA_ITINERARY_EXPERT_LINK, "Know Arashiyama well? Apply now as a local expert.");
  assert.equal(ARASHIYAMA_ITINERARY_EXPERT_HREF, "/kyoto#experts");
  assert.equal("WAITLIST_PROVIDER_FORM_PATH" in waitlist, false, "the waitlist provider path has no importer left");
});

test("F2 a fresh Kyoto seed inserts Yoshida Sanso Ryokan hidden", () => {
  assert.deepEqual([...KYOTO_GEMS_HIDDEN_BY_425], ["Yoshida Sanso Ryokan"]);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Yoshida Sanso Ryokan").hidden, true);
  assert.equal(kyotoGemSeedOverlay("kyoto", "Yoshida Sanso Ryokan").hidden, true);
  assert.equal(kyotoGemSeedOverlay("Osaka", "Yoshida Sanso Ryokan").hidden, false);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Fushimi Inari Torii Tunnel at Dawn").hidden, false);
  assert.equal((KYOTO_GEMS_TO_HIDE as readonly string[]).includes("Yoshida Sanso Ryokan"), false);
  assert.equal(KYOTO_GEMS_TO_HIDE.length, 28);
});

test("F3 migration 425 is registered, data-only, and names its rows", () => {
  assert.ok(registry.includes('"425_kyoto_1796_followups.sql"'));
  assert.ok(registry.indexOf('"420_kyoto_gem_photo_credits.sql"') < registry.indexOf('"425_kyoto_1796_followups.sql"'));
  assert.match(sql, /place_name = 'Yoshida Sanso Ryokan'/);
  assert.match(sql, /hidden_at IS NULL/);
  for (const url of DEAD) assert.ok(sql.includes(`'${url}'`), url);
  assert.equal((sql.match(/city ILIKE 'kyoto'/g) ?? []).length, 2);
  for (const banned of [/\bALTER\b/i, /\bDELETE\b(?!\s*:)/, /\bDROP\b/i, /CREATE INDEX/i, /CHECK \(/, /DEFAULT\s+\S/]) {
    assert.equal(banned.test(sql.replace(/^--.*$/gm, "")), false, String(banned));
  }
  assert.equal(/SQL approved/i.test(sql), false, "the file carries no approval sentence");
});
