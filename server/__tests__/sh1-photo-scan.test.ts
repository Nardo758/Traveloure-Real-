/**
 * SH-1 item 6 (R-01) — no image of Kiyomizu-dera or Kinkaku-ji ships in seed or static content
 * (ledger `2026-10-20-sh1-banned-photos`). Pure: no DB, no network.
 *
 *   PS1  the scanner flags a planted record that names a blocked place and carries an image (the name rule)
 *   PS2  the scanner flags a planted banned photo id on any record, whatever it is named
 *   PS3  a record naming a blocked place in ANOTHER city, or carrying no image, is not flagged
 *   PS4  every seed and static file under client/src, server and shared is clean
 *   PS5  the read helpers hide a banned photo with no block row present, and keep the other gallery photos
 *   PS6  photo 1545569341 is gone from the Kyoto hero and from every static record
 *
 * THE DATABASE IS NOT SCANNED HERE. Rows already stored are hidden at read time by the per-place blocks
 * (`place_photo_blocks`, CS-1 item 1) and by the banned-id backstop. The two name blocks — Kiyomizu-dera and
 * Kinkaku-ji, city Kyoto — are Leon's to enter in /admin/content-sources after the deploy that carries #1563; no
 * migration or seed inserts them. Until they are entered, only the banned-id list hides stored photos.
 *
 * STATED NEGATIVE SPACE: the scan reads a record as the innermost `{…}` around an image URL and its string fields;
 * a record split across files, a name built at runtime, or a city-less record (the name rule needs both keys) is
 * not caught. `artifacts/` and `attached_assets/` are mock-ups that are not served and are not scanned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BANNED_PHOTOS, STATIC_PHOTO_BLOCKED_PLACES, bannedPhotoIn } from "@shared/banned-photos";
import { blockFor, normalisePlaceName, type PhotoBlockRow } from "../services/place-photo-block-rules";
import { hideBlockedGemImage, hideBlockedListingImages, visibleListingImage } from "../services/place-photo-blocks.service";

const STATIC_BLOCKS: PhotoBlockRow[] = STATIC_PHOTO_BLOCKED_PLACES.map((p, i) => ({
  id: `static-${i}`,
  placeId: null,
  placeNameNormalised: normalisePlaceName(p.name, p.city),
  city: p.city,
  reason: "SH-1 item 6",
}));

const IMAGE_URL = /https?:\/\/[^\s"'`)]+?\.(?:unsplash\.com|pexels\.com)[^\s"'`)]*|https?:\/\/[^\s"'`)]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'`)]*)?|\bphoto-\d{6,}-[0-9a-f]+\b/g;
const NAME_KEYS = /^(?:name|title|place_?name|placeName|serviceName|service_name|location|venue|neighborhood)$/i;
const CITY_KEYS = /^(?:city|destination)$/i;

/** The innermost `{…}` around `at`, or the whole text when none encloses it. */
function enclosingObject(text: string, at: number): string {
  let depth = 0;
  let start = -1;
  for (let i = at; i >= 0; i--) {
    const c = text[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start < 0) return text;
  depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);
}

interface Hit { url: string; why: string }

/** Pure. Every image in `text` that is banned by id, or sits in a record naming a blocked place with its city. */
export function findBlockedPhotosInText(text: string): Hit[] {
  const hits: Hit[] = [];
  for (let m = IMAGE_URL.exec(text); m; m = IMAGE_URL.exec(text)) {
    const url = m[0];
    const banned = bannedPhotoIn(url);
    if (banned) { hits.push({ url, why: `banned photo (${banned.shows})` }); continue; }
    const record = enclosingObject(text, m.index);
    const names: string[] = [];
    let city: string | null = null;
    const field = /["']?([A-Za-z_]+)["']?\s*:\s*["']([^"'\n]{1,200})["']/g;
    for (let f = field.exec(record); f; f = field.exec(record)) {
      if (NAME_KEYS.test(f[1])) names.push(f[2]);
      else if (CITY_KEYS.test(f[1]) && !city) city = f[2];
    }
    const block = blockFor(STATIC_BLOCKS, { names, city });
    if (block) hits.push({ url, why: `record names a blocked place (${names.join(" / ")}, ${city})` });
  }
  IMAGE_URL.lastIndex = 0;
  return hits;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue;
      out.push(...filesUnder(p));
    } else if (/\.(?:ts|tsx|js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("PS1 — a planted record naming a blocked place with an image is flagged (the name rule)", () => {
  const planted = `[{ "place_name": "Kiyomizu-dera Temple", "city": "Kyoto", "image_url": "https://images.unsplash.com/photo-1111111111111-abcdef?w=600" }]`;
  assert.equal(findBlockedPhotosInText(planted).length, 1);
  const plantedTs = `{ city: "Kyoto", placeName: "Kinkakuji", imageUrl: "https://example.test/gold.jpg" }`;
  assert.equal(findBlockedPhotosInText(plantedTs).length, 1, "Temple/-ji normalisation: Kinkakuji is Kinkaku-ji");
});

test("PS2 — a planted banned photo id is flagged whatever the record is named", () => {
  for (const p of BANNED_PHOTOS) {
    const url = p.host === "unsplash"
      ? `https://images.unsplash.com/photo-${p.id}-0a1b2c?w=400`
      : `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg`;
    const planted = `{ name: "Pontocho Alley Evening Stroll", city: "Kyoto", imageUrl: "${url}" }`;
    assert.equal(findBlockedPhotosInText(planted).length, 1, `${p.host} ${p.id}`);
  }
});

test("PS3 — another city's place, or a blocked place with no image, is not flagged", () => {
  assert.equal(findBlockedPhotosInText(`{ name: "Kiyomizu-dera", city: "Osaka", imageUrl: "https://example.test/a.jpg" }`).length, 0);
  assert.equal(findBlockedPhotosInText(`{ name: "Kiyomizu-dera", city: "Kyoto", description: "a temple" }`).length, 0);
  assert.equal(findBlockedPhotosInText(`{ name: "Nishiki Market", city: "Kyoto", imageUrl: "https://example.test/b.jpg" }`).length, 0);
});

test("PS4 — every seed and static file is clean", () => {
  const root = process.cwd();
  const skip = new Set([path.join(root, "shared/banned-photos.ts")]);
  const files = [...filesUnder(path.join(root, "client/src")), ...filesUnder(path.join(root, "server")), ...filesUnder(path.join(root, "shared"))]
    .filter((f) => !skip.has(f));
  assert.ok(files.length > 100, "the scan reached the source tree");
  const found: string[] = [];
  for (const f of files) {
    for (const h of findBlockedPhotosInText(fs.readFileSync(f, "utf8"))) found.push(`${path.relative(root, f)}: ${h.why} — ${h.url}`);
  }
  assert.deepEqual(found, []);
});

test("PS5 — the read helpers hide a banned photo with no block row, and keep the rest", () => {
  const banned = "https://images.unsplash.com/photo-1675384201068-aaaa?w=800";
  const fine = "https://example.test/fine.jpg";
  assert.equal(visibleListingImage({ serviceName: "Snow walk", city: "Kyoto", serviceImage: banned }, []), null);
  assert.equal(visibleListingImage({ serviceName: "Snow walk", city: "Kyoto", serviceImage: fine }, []), fine);
  const listing = hideBlockedListingImages({ serviceName: "Snow walk", city: "Kyoto", serviceImage: fine, galleryImages: [fine, banned] }, []);
  assert.equal(listing.serviceImage, fine);
  assert.deepEqual(listing.galleryImages, [fine]);
  assert.equal(hideBlockedGemImage({ placeName: "Otagi Nenbutsu-ji", city: "Kyoto", imageUrl: banned }, []).imageUrl, null);
  assert.equal(hideBlockedGemImage({ placeName: "Otagi Nenbutsu-ji", city: "Kyoto", imageUrl: fine }, []).imageUrl, fine);
});

test("PS6 — photo 1545569341 is gone from the Kyoto hero and every static record", () => {
  const root = process.cwd();
  const hero = fs.readFileSync(path.join(root, "client/src/components/plancard/plancard-types.tsx"), "utf8");
  assert.doesNotMatch(hero, /^\s*kyoto:\s*"photo-/m);
  assert.ok(bannedPhotoIn("photo-1545569341-9eb8b30979d9"), "the hero key form is recognised as banned");
});
