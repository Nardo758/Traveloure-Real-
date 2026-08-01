import { describe, it, expect } from "vitest";
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
 */

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

describe("WeGoTrip catalog", () => {
  it("maps the documented API response shape onto CatalogItem", () => {
    const [item] = mapWeGoTripProducts([docProduct], { city: "Paris" });
    expect(item.id).toBe("wegotrip-25");
    expect(item.externalId).toBe("25");
    expect(item.provider).toBe("wegotrip");
    expect(item.title).toBe(docProduct.title);
    expect(item.imageUrl).toBe(docProduct.preview);
    expect(item.price).toBe(35.0);
    expect(item.currency).toBe("EUR");
    expect(item.rating).toBe(4.5);
    expect(item.reviewCount).toBe(140);
    expect(item.destination).toBe("Paris");
    expect(item.duration).toBe("1.5 hours");
    expect(item.tags).toEqual(["audioguide", "available"]);
  });

  it("builds the verified Travelpayouts sub_id product URL", () => {
    const url = buildWeGoTripUrl(docProduct);
    const marker = getTravelpayoutsMarker();
    expect(url).toBe(`https://wegotrip.com/paris-d2988507/masterpieces-of-louvre-p25/?sub_id=${marker}`);
    const [item] = mapWeGoTripProducts([docProduct], {});
    expect(item.bookingUrl).toBe(url);
    expect(item.affiliateUrl).toBe(url);
  });

  it("returns null URL (not a broken link) when slug/city data is missing", () => {
    expect(buildWeGoTripUrl({ id: 1, slug: "x" })).toBeNull();
    const [item] = mapWeGoTripProducts([{ id: 1, title: "No city" }], {});
    expect(item.bookingUrl).toBeNull();
  });

  it("fetches live products with tracked links even without TRAVELPAYOUTS_TOKEN", async () => {
    const saved = process.env.TRAVELPAYOUTS_TOKEN;
    delete process.env.TRAVELPAYOUTS_TOKEN;
    try {
      const items = await searchWeGoTripProducts({ city: "Rome", limit: 5 });
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.title).toBeTruthy();
        expect(it.bookingUrl).toMatch(/^https:\/\/wegotrip\.com\/.+-d\d+\/.+-p\d+\/\?sub_id=/);
      }
    } finally {
      if (saved !== undefined) process.env.TRAVELPAYOUTS_TOKEN = saved;
    }
  }, 30000);

  it("degrades to an empty list for cities WeGoTrip does not cover", async () => {
    const items = await searchWeGoTripProducts({ city: "Nowhereville-Xyz" });
    expect(items).toEqual([]);
  }, 30000);
});
