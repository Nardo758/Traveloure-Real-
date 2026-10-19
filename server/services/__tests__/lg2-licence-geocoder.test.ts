/**
 * LG-2 Ask 8 (ledger `2026-10-19-lg2-licence-geocoder`): the coordinate tables stay internal, and the item batch asks a
 * configured geocoder and refuses the public Nominatim server. Pure and source-level; no request leaves the process.
 *
 *   LG1 the refusal: unset, malformed and the public host are refused; a self-hosted address is not
 *   LG2 the lookup builds its URL from GEOCODER_BASE_URL when set
 *   LG3 the batch script checks the refusal before any request, and never prints the address
 *   LG4 no route outside the admin place-coords route reads the open-coordinate tables; that route returns rows only
 *       for at most 200 place ids it is asked about (never the table in bulk) and counts otherwise
 *
 * NEGATIVE SPACE (§18d): LG4 reads route files for the table and service names; a route that reached the rows through
 * some other module would not be seen. The city-event seeder (LD 59) is a separate ruled path, not covered here.
 *
 * Run: npx tsx --test server/services/__tests__/lg2-licence-geocoder.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { batchGeocoderRefusal, isPublicNominatimHost, PUBLIC_NOMINATIM_BASE_URL } from "../../config/geocoder.config";
import { regeocodeItemV2, type RegeocodeItem } from "../item-osm-regeocode.service";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("LG1 the batch refuses an unset, malformed or public geocoder", () => {
  assert.equal(batchGeocoderRefusal(null), "not_configured");
  assert.equal(batchGeocoderRefusal(""), "not_configured");
  assert.equal(batchGeocoderRefusal("not a url"), "malformed");
  assert.equal(batchGeocoderRefusal(PUBLIC_NOMINATIM_BASE_URL), "public_nominatim");
  assert.equal(batchGeocoderRefusal("https://nominatim.openstreetmap.org/"), "public_nominatim");
  assert.equal(batchGeocoderRefusal("https://NOMINATIM.OpenStreetMap.org"), "public_nominatim");
  assert.equal(isPublicNominatimHost("https://geocoder.example.test"), false);
  assert.equal(batchGeocoderRefusal("https://geocoder.example.test"), null);
});

test("LG2 the lookup asks the configured geocoder", async () => {
  const prev = process.env.GEOCODER_BASE_URL;
  process.env.GEOCODER_BASE_URL = "https://geocoder.example.test/";
  try {
    const seen: string[] = [];
    const item: RegeocodeItem = { id: "i", title: "Kinkaku-ji", locationName: null, destination: "Kyoto, Japan", storedLat: null, storedLng: null };
    await regeocodeItemV2(item, [], (async (url: string) => {
      seen.push(url);
      return { ok: true, json: async () => [] };
    }) as any);
    assert.equal(new URL(seen[0]).host, "geocoder.example.test");
    assert.equal(new URL(seen[0]).pathname, "/search");
  } finally {
    if (prev === undefined) delete process.env.GEOCODER_BASE_URL;
    else process.env.GEOCODER_BASE_URL = prev;
  }
});

test("LG3 the batch script refuses before any request and never prints the address", () => {
  const src = readFileSync(join(root, "scripts", "regeocode-items-osm.ts"), "utf8");
  const main = src.slice(src.indexOf("async function main(): Promise<void> {"));
  const refuse = main.indexOf("batchGeocoderRefusal(geocoderBaseUrl())");
  assert.ok(refuse > 0, "main checks the refusal");
  for (const call of ["mainWikidata()", "mainV2(apply)", "regeocodeItem(item)"]) {
    assert.ok(main.indexOf(call) > refuse, `${call} runs only after the refusal check`);
  }
  assert.doesNotMatch(main.slice(refuse, refuse + 900), /console\.\w+\([^)]*geocoderBaseUrl\(\)/, "the address is never printed");
});

test("LG4 the open-coordinate tables are read only by the admin route, and never in bulk", () => {
  const files = [join(root, "server", "routes.ts"), ...readdirSync(join(root, "server", "routes")).filter((f) => f.endsWith(".ts")).map((f) => join(root, "server", "routes", f))];
  const pattern = /\b(?:openPlaceCoords|itineraryItemOpenCoords|adminPlaceCoords|open_place_coords|itinerary_item_open_coords|admin_place_coords)\b|open-place-coords\.service/;
  const readers = files.filter((f) => pattern.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1));
  assert.deepEqual(readers, ["server/routes/admin-place-coords.routes.ts"]);
  const admin = readFileSync(join(root, "server", "routes", "admin-place-coords.routes.ts"), "utf8");
  assert.match(admin, /\.slice\(0, 200\)/, "rows only for the place ids asked about, capped");
  const svc = readFileSync(join(root, "server", "services", "routing", "open-place-coords.service.ts"), "utf8");
  const rows = svc.slice(svc.indexOf("export async function adminPlaceCoordRows"), svc.indexOf("export async function openPlaceCoordCounts"));
  assert.match(rows, /if \(ids\.length === 0\) return \{ osm: \[\], admin: \[\] \}/, "no ids, no rows");
});
