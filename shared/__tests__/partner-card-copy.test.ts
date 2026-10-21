/**
 * G-02 (ledger `2026-10-20-g02-g06-copy`): partner and activity cards never carry
 * "hidden gem(s)", "secret(s)", or "geisha" (the site rule, which covers "geisha culture").
 * A label that is only those phrases is omitted. The public affiliate DTO is the API path.
 *
 * Run: npx tsx --test shared/__tests__/partner-card-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePartnerCardCopy, stripPartnerCardPhrase } from "../banned-copy";
import { toPublicPartnerProduct, toPublicPartnerProducts } from "../../server/services/public-partner-product";

const PHRASE = /\bhidden\s+gems?\b|\bsecrets?\b|\bgeishas?\b/i;

test("G02 strip drops the three phrases and leaves an untouched string alone", () => {
  assert.equal(stripPartnerCardPhrase("Hidden gems of Kyoto"), "Kyoto");
  assert.equal(stripPartnerCardPhrase("Secret Garden Tour"), "Garden Tour");
  assert.equal(stripPartnerCardPhrase("Geisha culture"), "Culture");
  assert.equal(stripPartnerCardPhrase("A secret walk through geisha culture and hidden gems."), "Walk through culture.");
  assert.equal(stripPartnerCardPhrase("Hidden gem"), "");
  assert.equal(stripPartnerCardPhrase("Secretary tour"), "Secretary tour");
  assert.equal(stripPartnerCardPhrase("no hidden fees"), "no hidden fees");
  assert.equal(stripPartnerCardPhrase("Kyoto walk"), "Kyoto walk");
});

test("G02 a card whose name is only a banned phrase is omitted; a cleaned name stays", () => {
  assert.equal(sanitizePartnerCardCopy({ name: "Hidden gem", description: "A walk" }), null);
  const kept = sanitizePartnerCardCopy({
    name: "Hidden gems of Kyoto",
    description: "A secret walk through geisha culture.",
    highlights: ["secret lanes", "tea"],
    imageUrl: "https://cdn.example/secret-garden.jpg",
  });
  assert.ok(kept);
  assert.equal(kept!.name, "Kyoto");
  assert.equal(kept!.description, "Walk through culture.");
  assert.equal(kept!.imageUrl, "https://cdn.example/secret-garden.jpg");
  assert.deepEqual(kept!.highlights, ["Lanes", "tea"]);
  assert.equal(PHRASE.test(`${kept!.name} ${kept!.description} ${(kept!.highlights as string[]).join(" ")}`), false);
});

test("G02 the public affiliate product response never carries the phrases", () => {
  const clean = toPublicPartnerProduct({
    id: "x",
    name: "n",
    rating: "4.5",
    price: "10",
    currency: "USD",
    originalPrice: "12",
    discountPercent: 5,
    lastScrapedAt: new Date(),
    metadata: null,
  });
  assert.deepEqual(clean, { id: "x", name: "n", rating: "4.5", metadata: null });

  const dirty = toPublicPartnerProduct({
    id: "y",
    name: "Secret geisha culture hidden gems",
    description: "Hidden gems and secrets.",
    shortDescription: "Geisha culture evening",
    highlights: ["a secret"],
    metadata: { blurb: "hidden gem of the city" },
    price: "10",
    affiliateUrl: "https://partner.example/secret-tour",
  });
  assert.ok(dirty);
  assert.equal(dirty!.name, "Culture");
  assert.equal(dirty!.description, "");
  assert.equal(dirty!.shortDescription, "Culture evening");
  assert.deepEqual(dirty!.highlights, []);
  assert.equal((dirty!.metadata as { blurb: string }).blurb, "City");
  assert.equal("affiliateUrl" in dirty!, false);
  assert.equal("price" in dirty!, false);
  assert.equal(PHRASE.test(JSON.stringify({
    name: dirty!.name,
    description: dirty!.description,
    shortDescription: dirty!.shortDescription,
    highlights: dirty!.highlights,
    metadata: dirty!.metadata,
  })), false);

  const listed = toPublicPartnerProducts([
    { id: "keep", name: "Hidden gems of Kyoto", description: "Tea." },
    { id: "drop", name: "Hidden gem", description: "Gone." },
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "Kyoto");
  assert.equal(JSON.stringify(listed).match(PHRASE), null);
});
