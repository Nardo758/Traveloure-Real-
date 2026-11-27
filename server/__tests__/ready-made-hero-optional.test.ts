/**
 * D1 (Leon, Nov 27 2026): a cover photo is OPTIONAL. A listing with no hero passes the completeness checklist; a hero
 * that is present must still be an Unsplash image with its credit, which the save route checks separately.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertReadyMadeComplete } from "../routes/ready-made.routes";

const ROOT = process.cwd();
const base: any = {
  title: "A real Kyoto title",
  planType: "hiking",
  priceCents: 12000,
  market: "Kyoto",
  heroImageUrl: null,
  heroImageMeta: null,
};

test("[d1-hero] submit with no hero passes", async () => {
  const lines = await assertReadyMadeComplete({ ...base });
  const hero = lines.filter((l: any) => l.requirement === "hero");
  console.log(`[d1-hero] no_hero blocking=${lines.length} hero_lines=${hero.length}`);
  assert.deepEqual(hero, []);
});

test("[d1-hero] an existing hero still passes", async () => {
  const lines = await assertReadyMadeComplete({
    ...base,
    heroImageUrl: "https://images.unsplash.com/photo-1",
    heroImageMeta: { unsplashId: "x", photographer: "P", profileUrl: "https://unsplash.com/@p" },
  });
  const hero = lines.filter((l: any) => l.requirement === "hero");
  console.log(`[d1-hero] with_hero hero_lines=${hero.length}`);
  assert.deepEqual(hero, []);
});

test("[d1-hero] the refusal copy is gone, and a present non-Unsplash hero is still refused", () => {
  const src = fs.readFileSync(path.join(ROOT, "server/routes/ready-made.routes.ts"), "utf8");
  assert.equal(src.includes("Pick a cover photo from the Unsplash picker"), false, "the no-hero refusal is removed");
  assert.match(src, /isUnsplashImageUrl\(patch\.heroImageUrl\)/, "a present hero is still checked");
});
