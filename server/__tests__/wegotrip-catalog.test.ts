import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWeGoTripProducts, buildWeGoTripUrl, searchWeGoTripProducts } from "../services/travelpayouts/wegotrip.service";
import { getTravelpayoutsMarker } from "../services/travelpayouts/travelpayouts-client";

/**
 * Task: surface WeGoTrip tours with tracked affiliate links.
 *
 * Covers: (1) mapping of the documented /products/popular/ response shape,
 * (2) the verified Travelpayouts outbound link format
 *     https://wegotrip.com/{city-slug}-d{cityId}/{product-slug}-p{productId}/?sub_id=<MARKER>,
 * (3) no-token retrieval — the WeGoTrip catalog API is public, so products must
 *     come back (live) even when TRAVELPAYOUTS_TOKEN is absent.
 *
 * The two live-network subtests only run with WEGOTRIP_LIVE_TEST=1 (they hit the
 * real wegotrip.com API and need the app's cache store); they skip honestly
 * otherwise so the suite stays green in sandboxes/CI without outbound network.
 */

const LIVE = process.env.WEGOTRIP_LIVE_TEST === "1";

// A product exactly as documented in WeGoTrip's affiliate API docs (products/popular results[]).
const docProduct = {
  id: 25,
  title: "Masterpieces of Louvre: Skip-the-Line Ticket & Audio Tour",
  slug: "masterpieces-of-louvre",
  duration: "1.5 hours",
  cover: "https://app.wegotrip.com/media/store/cover.jpeg",
  preview: "https://app.wegotrip.com/media/CACHE/images/store/preview.jpeg",
  price: 35.0,
  exprice: 35.0,
  currency: "€",
  currencyCode: "EUR",
  rating: 4.5,
  reviewsCount: 140,
  ratingsCount: 392,
  category: "Art & Museums",
  city: { id: 2988507, name: "Paris", slug: "paris" },
  durationMin: 90,
  durationMax: 90,
  type: 3,
  tags: { audioguide: true, available: true },
  locale: "en",
};

test("maps the documented API response shape onto CatalogItem", () => {
  const [item] = mapWeGoTripProducts([docProduct], { city: "Paris" });
  assert.equal(item.id, "wegotrip-25");
  assert.equal(item.externalId, "25");
  assert.equal(item.provider, "wegotrip");
  assert.equal(item.title, docProduct.title);
  assert.equal(item.imageUrl, docProduct.preview);
  assert.equal(item.price, 35.0);
  assert.equal(item.currency, "EUR");
  assert.equal(item.rating, 4.5);
  assert.equal(item.reviewCount, 140);
  assert.equal(item.destination, "Paris");
  assert.equal(item.duration, "1.5 hours");
  assert.deepEqual(item.tags, ["audioguide", "available"]);
});

test("builds the verified Travelpayouts sub_id product URL", () => {
  const url = buildWeGoTripUrl(docProduct);
  const marker = getTravelpayoutsMarker();
  assert.equal(url, `https://wegotrip.com/paris-d2988507/masterpieces-of-louvre-p25/?sub_id=${marker}`);
  const [item] = mapWeGoTripProducts([docProduct], {});
  assert.equal(item.bookingUrl, url);
  assert.equal(item.affiliateUrl, url);
});

test("returns null URL (not a broken link) when slug/city data is missing", () => {
  assert.equal(buildWeGoTripUrl({ id: 1, slug: "x" }), null);
  const [item] = mapWeGoTripProducts([{ id: 1, title: "No city" }], {});
  assert.equal(item.bookingUrl, null);
});

test("fetches live products with tracked links even without TRAVELPAYOUTS_TOKEN", { skip: !LIVE && "live network test — set WEGOTRIP_LIVE_TEST=1" }, async () => {
  const saved = process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_TOKEN;
  try {
    const items = await searchWeGoTripProducts({ city: "Rome", limit: 5 });
    assert.ok(items.length > 0, "expected live products for Rome");
    for (const it of items) {
      assert.ok(it.title);
      assert.match(it.bookingUrl || "", /^https:\/\/wegotrip\.com\/.+-d\d+\/.+-p\d+\/\?sub_id=/);
    }
  } finally {
    if (saved !== undefined) process.env.TRAVELPAYOUTS_TOKEN = saved;
  }
});

test("degrades to an empty list for cities WeGoTrip does not cover", { skip: !LIVE && "live network test — set WEGOTRIP_LIVE_TEST=1" }, async () => {
  const items = await searchWeGoTripProducts({ city: "Nowhereville-Xyz" });
  assert.deepEqual(items, []);
});
