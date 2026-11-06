/**
 * FU-R3-6b — the boot seeder applies migrations 400 / 425's Kyoto hide rules on insert, so a fresh database shows the
 * same Kyoto gems production does (production ran 400 over rows that already existed; a new database seeds after it).
 *
 *   S1 every KYOTO_GEMS_TO_HIDE name in the seed file is inserted hidden; the eight FU-R3-6 rows among them.
 *   S2 400's Uchida rule and 425's card are applied; a non-Kyoto row and an ordinary Kyoto gem are not hidden.
 *   S3 the seeder passes the helper's answer as hiddenAt.
 *
 * Run: npx tsx --test shared/__tests__/seed-kyoto-hide-list.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { KYOTO_GEMS_HIDDEN_BY_425, KYOTO_GEMS_TO_HIDE, seededKyotoGemHiddenAt } from "../kyoto-feed-cleanup";

const seed = JSON.parse(fs.readFileSync("server/data/hidden-gems.json", "utf8")) as Array<Record<string, any>>;

describe("FU-R3-6b seeded Kyoto hide list", () => {
  it("S1 every hide-list name in the seed is inserted hidden", () => {
    const kyoto = seed.filter((g) => String(g.city).toLowerCase() === "kyoto");
    const listed = kyoto.filter((g) => (KYOTO_GEMS_TO_HIDE as readonly string[]).includes(g.place_name));
    assert.ok(listed.length > 0);
    for (const g of listed) assert.ok(seededKyotoGemHiddenAt(g) instanceof Date, g.place_name);
    for (const name of [
      "Nishiki Market alley stalls",
      "Pontocho evening walk",
      "Tetsugaku-no-Michi (Philosopher's Path)",
      "Otagi Nenbutsu-ji",
      "Tofuku-ji Temple during autumn",
      "Kagurazaka Ishikawa",
      "Kishiwada",
      "Kishiwada Cafe",
    ]) {
      const g = kyoto.find((x) => x.place_name === name);
      if (g) assert.ok(seededKyotoGemHiddenAt(g), `${name} hidden`);
    }
  });

  it("S2 the Uchida rule and 425's card apply; others are not hidden", () => {
    assert.ok(seededKyotoGemHiddenAt({ city: "Kyoto", place_name: "A recital", description: "Mitsuko Uchida plays" }));
    assert.ok(seededKyotoGemHiddenAt({ city: "Kyoto", place_name: KYOTO_GEMS_HIDDEN_BY_425[0] }));
    assert.equal(seededKyotoGemHiddenAt({ city: "Kyoto", place_name: "Ginkaku-ji" }), null);
    assert.equal(seededKyotoGemHiddenAt({ city: "Goa", place_name: "Kishiwada" }), null, "only Kyoto rows");
  });

  it("S3 the seeder passes the helper's answer as hiddenAt", () => {
    const src = fs.readFileSync("server/seed-travelpulse.ts", "utf8");
    assert.match(src, /hiddenAt: seededKyotoGemHiddenAt\(gem\),/);
  });
});
