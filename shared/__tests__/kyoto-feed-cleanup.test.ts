/**
 * Kyoto feed cleanup (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 *   KF1  Fever titles: the banned phrases, and nothing else
 *   KF2  hidden_at is the visibility flag
 *   KF3  the fact line, including a card with no hours
 *   KF4  banned gem copy is reworded without a new fact
 *   KF5  migration 400 names every hide, the reword, the neighbourhoods and the three cards
 *   KF6  the traveler lists call the one visibility condition; Fever projection calls the title filter
 *   KF7  a fresh popular-cities insert stamps the overlay (seeds run after migrations)
 *   KF8  the Uchida seed is born withdrawn
 *
 * Run: npx tsx --test shared/__tests__/kyoto-feed-cleanup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { feverTitleBlocked } from "../fever-title-filter";
import { gemRowHidden } from "../gem-visibility";
import { composeGemFactLine } from "../gem-fact-line";
import { kyotoUnswappedPhrase, rewordKyotoBannedCopy, scanKyotoGemSeedSource } from "../kyoto-gem-copy";
import {
  BAMBOO_IMAGE_URL,
  GION_OLD_STREETS_DESCRIPTION,
  GION_OLD_STREETS_NAME,
  KYOTO_ARASHIYAMA_CENTROID,
  KYOTO_CANONICAL_GEMS,
  KYOTO_GEMS_TO_HIDE,
  KYOTO_GEM_NEIGHBORHOOD,
  KYOTO_NEW_NEIGHBORHOODS,
  TENRYUJI_IMAGE_CREDIT,
  TENRYUJI_IMAGE_URL,
  HAPPENING_NOW_TITLES_TO_HIDE,
  UCHIDA_SOURCE_ID,
  happeningNowTitleHidden,
  kyotoGemSeedOverlay,
} from "../kyoto-feed-cleanup";
import { GEM_TEASER_KEYS } from "../gem-teaser";
import { MANUAL_CITY_EVENTS } from "../../server/seeds/city-events.manual";

const ROOT = process.cwd();
const sql = readFileSync(path.join(ROOT, "server/migrations/400_kyoto_feed_cleanup.sql"), "utf8");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

test("KF1 Fever titles drop the banned phrases and keep an ordinary title", () => {
  assert.equal(feverTitleBlocked("Kyoto Hidden Gem Food Tour in Fushimi"), true);
  assert.equal(feverTitleBlocked("Private Kyoto Walking Tour Temples, Traditions and Hidden Gems"), true);
  assert.equal(feverTitleBlocked("Geisha dinner"), true);
  assert.equal(feverTitleBlocked("A walk down the back alley"), true);
  assert.equal(feverTitleBlocked("Back Alleys after dark"), true);
  assert.equal(feverTitleBlocked("Trending tonight"), true);
  assert.equal(feverTitleBlocked("Winter illuminations"), true);
  assert.equal(feverTitleBlocked("Candlelight concert at a temple"), false);
  assert.equal(feverTitleBlocked(""), false);
  assert.equal(feverTitleBlocked(null), false);
  assert.equal(feverTitleBlocked("The description mentions a hidden gem"), true, "the phrase is matched wherever it sits in the title");
});

test("KF2 hidden_at hides a row; a null timestamp does not", () => {
  assert.equal(gemRowHidden({ hiddenAt: null }), false);
  assert.equal(gemRowHidden({ hiddenAt: "" }), false);
  assert.equal(gemRowHidden({}), false);
  assert.equal(gemRowHidden({ hiddenAt: new Date("2026-10-20T00:00:00Z") }), true);
  assert.equal(gemRowHidden({ hiddenAt: "2026-10-20T00:00:00Z" }), true);
  assert.equal(GEM_TEASER_KEYS.includes("hiddenAt" as never), false, "the public teaser does not carry the flag");
  for (const key of ["imageCredit", "hours", "admission", "sourceUrl", "factCheckedOn"]) {
    assert.equal(GEM_TEASER_KEYS.includes(key as never), true, key);
  }
});

test("KF3 the fact line ends with the checked date and the source link; bamboo has none", () => {
  const [tenryu, bamboo, ginkaku] = KYOTO_CANONICAL_GEMS;
  const tenryuLine = composeGemFactLine(tenryu);
  assert.ok(tenryuLine);
  assert.equal(
    `${tenryuLine.lead}. Checked ${tenryuLine.checkedLabel} · Source: ${tenryuLine.sourceUrl}`,
    "Garden 8:30–17:00, last entry 16:50 (opens 7:30 Nov 14–30). Garden ¥500 adult; buildings +¥300. Checked 20 Oct 2026 · Source: https://www.tenryuji.com/en/",
  );
  assert.equal(composeGemFactLine(bamboo), null);
  assert.equal(bamboo.hours, null);
  assert.equal(bamboo.admission, null);
  assert.equal(bamboo.imageCredit, null);
  const ginkakuLine = composeGemFactLine(ginkaku);
  assert.ok(ginkakuLine);
  assert.equal(ginkakuLine.checkedLabel, "20 Oct 2026");
  assert.equal(ginkakuLine.sourceUrl, "https://www.shokoku-ji.jp/en/ginkakuji/");
  assert.equal(ginkaku.imageUrl, null);
  assert.equal(composeGemFactLine({ hours: "9:00–17:00", admission: null, sourceUrl: null, factCheckedOn: null })?.lead, "9:00–17:00");
  assert.equal(composeGemFactLine({ hours: "9:00–17:00" })?.checkedLabel, "", "a missing checked date is not invented");
});

test("KF4 approved swaps stay, and hidden gem text is not cut into a fragment", () => {
  assert.equal(rewordKyotoBannedCopy("Walk the geisha district at dusk."), "Walk the district at dusk.");
  assert.equal(rewordKyotoBannedCopy("Turn into the back alleys behind the teahouses."), "Turn into the lanes behind the teahouses.");
  assert.equal(rewordKyotoBannedCopy("One back alley stays quiet."), "One lane stays quiet.");
  assert.equal(rewordKyotoBannedCopy("A hidden gem locals keep to themselves."), "A hidden gem locals keep to themselves.");
  assert.equal(rewordKyotoBannedCopy("Kyoto's hidden gems."), "Kyoto's hidden gems.");
  assert.equal(rewordKyotoBannedCopy("Wooden machiya townhouses."), "Wooden machiya townhouses.");
  assert.equal(rewordKyotoBannedCopy("A hidden gem."), "A hidden gem.");
  assert.equal(kyotoUnswappedPhrase("Kyoto's hidden gems."), "hidden gems");
  assert.equal(kyotoUnswappedPhrase("Walk the geisha district at dusk."), null);
  assert.equal(kyotoUnswappedPhrase("One back alley stays quiet."), null);
  assert.equal(kyotoUnswappedPhrase("A geisha dinner."), "geisha");
  for (const sample of [
    rewordKyotoBannedCopy("Kyoto's hidden gems."),
    rewordKyotoBannedCopy("A hidden gem locals keep to themselves."),
    rewordKyotoBannedCopy("Walk the geisha district at dusk."),
  ]) {
    assert.notEqual(sample, "Kyoto's.");
    assert.equal(sample?.includes("Kyoto's."), false);
  }
  assert.equal(KYOTO_GEMS_TO_HIDE.includes("Gion's back alleys" as never), false, "card 36 is reworded, not hidden");
  assert.equal(KYOTO_GEMS_TO_HIDE.length, 28);
});

test("KF5 migration 400 carries the hide list, the reword, the neighbourhoods and the three cards", () => {
  assert.match(sql, /HELD FOR LEON'S COMMENT/);
  assert.match(sql, /Migration 400 SQL approved — Leon/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS hidden_at timestamp/);
  assert.doesNotMatch(sql, /CREATE INDEX/i);
  assert.doesNotMatch(sql, /CHECK \(/);
  const hideBlock = sql.slice(sql.indexOf("AND place_name IN ("), sql.indexOf("-- Uchida gems"));
  for (const name of KYOTO_GEMS_TO_HIDE) {
    const quoted = `'${name.replace(/'/g, "''")}'`;
    assert.ok(hideBlock.includes(quoted), `hide list missing ${name}`);
  }
  assert.equal(hideBlock.includes("'Gion''s old streets'"), false);
  assert.equal(hideBlock.includes("'Nishiki Market Side Alleys'"), false, "the kept Nishiki card is a different name");
  assert.ok(sql.includes(GION_OLD_STREETS_NAME.replace(/'/g, "''")) || sql.includes(GION_OLD_STREETS_NAME));
  assert.ok(sql.includes(GION_OLD_STREETS_DESCRIPTION));
  assert.ok(sql.includes(KYOTO_ARASHIYAMA_CENTROID.lat));
  assert.ok(sql.includes(KYOTO_ARASHIYAMA_CENTROID.lng));
  assert.ok(sql.includes(KYOTO_ARASHIYAMA_CENTROID.radiusKm));
  for (const n of KYOTO_NEW_NEIGHBORHOODS) {
    assert.ok(sql.includes(n.slug), n.slug);
    assert.ok(sql.includes(n.name.replace(/'/g, "''")), n.name);
    assert.ok(sql.includes(n.lat));
    assert.ok(sql.includes(n.radiusKm));
  }
  for (const gem of KYOTO_CANONICAL_GEMS) {
    assert.ok(sql.includes(gem.id), gem.id);
    assert.ok(sql.includes(gem.description), gem.placeName);
    if (gem.hours) assert.ok(sql.includes(gem.hours), gem.placeName);
    if (gem.sourceUrl) assert.ok(sql.includes(gem.sourceUrl), gem.placeName);
  }
  assert.ok(sql.includes(TENRYUJI_IMAGE_URL));
  assert.ok(sql.includes(TENRYUJI_IMAGE_CREDIT));
  assert.ok(sql.includes(BAMBOO_IMAGE_URL));
  assert.ok(sql.includes("Philosopher''s Path Canal in Autumn"));
  assert.ok(sql.includes("'Kanga-an Temple Shojin Ryori'"));
  assert.ok(sql.includes("'Tofuku-ji Temple'"));
  assert.match(sql, /not assigned to kurama-kibune/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS description_hidden_at timestamp/);
  assert.match(sql, /\\mgeisha\[\[:space:\]\]\+district\\M', 'district'/);
  assert.match(sql, /\\mback\[\[:space:\]\]\+alleys\\M', 'lanes'/);
  assert.match(sql, /\\mback\[\[:space:\]\]\+alley\\M', 'lane'/);
  assert.doesNotMatch(sql, /hidden\[\[:space:\]\]\+gems\?\\M', ''/);
  assert.doesNotMatch(sql, /\\mgeishas\?\\M', ''/);
  assert.doesNotMatch(sql, /THEN NULL/);
  assert.match(sql, /SET description_hidden_at = now\(\)/);
  assert.match(sql, /source_id ILIKE '%uchida%'/);
  assert.match(sql, /place_name ILIKE '%Uchida%'/);
  assert.match(sql, /ALTER TABLE travel_pulse_happening_now ADD COLUMN IF NOT EXISTS hidden_at timestamp/);
  assert.match(sql, /title = 'Sakura Light-Up at Meguro River'/);
  assert.doesNotMatch(sql, /DELETE FROM travel_pulse_happening_now/i);
  assert.equal(HAPPENING_NOW_TITLES_TO_HIDE.length, 1);
  assert.equal(happeningNowTitleHidden("Sakura Light-Up at Meguro River"), true);
  assert.equal(happeningNowTitleHidden("Marché aux Puces de Vanves"), false);
  assert.doesNotMatch(read("server/data/happening-now.json"), /Sakura Light-Up at Meguro River/);
  const seedFn = read("server/services/travelpulse.service.ts");
  const seedBody = seedFn.slice(
    seedFn.indexOf("private async seedHappeningNow"),
    seedFn.indexOf("Seeded ${events.length} happening now events"),
  );
  assert.doesNotMatch(seedBody, /title:\s*"Sakura Light-Up/);
  assert.match(seedFn, /Sakura Light-Up at Meguro River is omitted/);
  assert.match(read("server/seed-travelpulse.ts"), /happeningNowTitleHidden/);
  assert.match(read("server/routes/kyoto-gem-copy.routes.ts"), /\/api\/admin\/kyoto-gem-copy/);
  assert.match(read("server/routes.ts"), /kyotoGemCopyRoutes/);
  const script = read("scripts/list-kyoto-unswapped-gem-copy.ts");
  assert.match(script, /BEGIN READ ONLY/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE)\b/);
  const seedRows = [
    "server/seeds/popular-cities-content.seed.ts",
    "server/seeds/phase-4-kyoto-fill.seed.ts",
    "server/data/hidden-gems.json",
    "playwright/tests/fixtures/discover-location-kyoto.json",
  ].flatMap((file) => scanKyotoGemSeedSource(read(file)));
  assert.deepEqual(seedRows, []);
  assert.equal(
    scanKyotoGemSeedSource('{\n  city: "Kyoto",\n  placeName: "Sample",\n  description: "Kyoto\'s hidden gems.",\n}').map((row) => row.description).join("\n"),
    "Kyoto's hidden gems.",
  );
  const seed = read("server/seeds/popular-cities-content.seed.ts");
  assert.match(seed, /kyotoGemSeedOverlay/);
});

test("KF6 traveler gem lists use visibleGemCondition, and Fever titles go through feverTitleBlocked", () => {
  for (const file of [
    "server/services/location-view.service.ts",
    "server/services/travelpulse.service.ts",
    "server/routes.ts",
    "server/services/landing-billboard.service.ts",
    "server/routes/storefront.routes.ts",
    "server/services/local-teaser.service.ts",
  ]) {
    assert.match(read(file), /visibleGemCondition\(/, file);
  }
  assert.equal((read("server/services/location-view.service.ts").match(/visibleGemCondition\(/g) ?? []).length, 3);
  assert.match(read("server/services/landing-moments.ts"), /g\.hidden_at IS NULL/);
  assert.match(read("server/services/fever-public.ts"), /feverTitleBlocked\(e\.title\)/);
  assert.match(read("server/services/experience-catalog.service.ts"), /feverTitleBlocked\(e\.title\)/);
  assert.match(read("server/services/experience-catalog.service.ts"), /feverTitleBlocked\(event\.title\)/);
  const card = read("client/src/components/city-feed-card.tsx");
  assert.match(card, /composeGemFactLine/);
  assert.match(card, /gem-image-credit-/);
  assert.match(card, /allowFetch: !textOnly/);
  for (const file of [
    "server/services/travelpulse.service.ts",
    "server/routes.ts",
    "server/services/experts-query.service.ts",
  ]) {
    assert.match(read(file), /visibleHappeningNowCondition\(/, file);
  }
});

test("KF7 the seed overlay hides the pre-dawn hike and clears the city-wide neighbourhoods", () => {
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Fushimi Inari Pre-Dawn Hike").hidden, true);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Kanga-an Temple Shojin Ryori").neighborhood, null);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Yoshida Sanso Ryokan").neighborhood, null);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Philosopher's Path Canal in Autumn").neighborhood, null);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Philosopher's Path Canal in Autumn").hidden, false);
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Tofuku-ji Temple").neighborhood, "fushimi");
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Ippodo Tea Kaboku Tearoom").neighborhood, "kawaramachi-sanjo");
  assert.equal(kyotoGemSeedOverlay("Kyoto", "Gion's old streets").neighborhood, "gion");
  assert.equal(kyotoGemSeedOverlay("Paris", "Fushimi Inari Pre-Dawn Hike").hidden, false);
  assert.equal(KYOTO_GEM_NEIGHBORHOOD["Kurama-dera Temple"], null);
  assert.equal(KYOTO_GEM_NEIGHBORHOOD["Kibune"], null);
  assert.equal(KYOTO_GEM_NEIGHBORHOOD["Ginkaku-ji"], "ginkaku-ji-philosophers-path");
});

test("KF8 the Uchida recital is inserted withdrawn", () => {
  const entry = MANUAL_CITY_EVENTS.find((e) => e.sourceId === UCHIDA_SOURCE_ID);
  assert.ok(entry);
  assert.equal(entry.withdrawn, true);
  assert.match(sql, /Uchida/);
  assert.match(read("server/services/city-events.service.ts"), /entry\.withdrawn \? \{ withdrawnAt: new Date\(\) \}/);
});
