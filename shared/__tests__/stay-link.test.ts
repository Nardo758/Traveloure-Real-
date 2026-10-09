/**
 * FU-S1-2 — the stay card's one link, pure rules (ledger `2026-10-09-fu-s1-2-stay-link`).
 *
 *   SL1  A → B → C: the provider's own site, else Google's website, else Google Maps; none ⇒ null
 *   SL2  only http(s): javascript:, data:, a bare word or a relative path is never a link, and an
 *        unsafe value is skipped to the next source rather than ending the order
 *   SL3  a provider's "www.example.com" means the web site and gets https://
 *   SL4  the no-call Google Maps URL: name and city, a place ID only when given; no name ⇒ none
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseStayLink, googleMapsSearchUrl, safeHttpUrl } from "../stay-link";

test("SL1 the order: own, then google, then maps; nothing ⇒ null", () => {
  const all = { own: "https://ryokan.example.jp/", googleWebsite: "https://g.example.com/", googleMapsUri: "https://maps.google.com/?cid=1" };
  assert.deepEqual(chooseStayLink(all), { kind: "own", url: "https://ryokan.example.jp/" });
  assert.deepEqual(chooseStayLink({ ...all, own: null }), { kind: "google", url: "https://g.example.com/" });
  assert.deepEqual(chooseStayLink({ googleMapsUri: all.googleMapsUri }), { kind: "maps", url: "https://maps.google.com/?cid=1" });
  assert.equal(chooseStayLink({}), null);
});

test("SL2 only http(s) URLs; an unsafe one falls to the next source", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "hello", "/relative/path", "ftp://x.example.com", "https://localhost", "", "  ", null, 42]) {
    assert.equal(safeHttpUrl(bad), null, String(bad));
  }
  assert.deepEqual(chooseStayLink({ own: "javascript:alert(1)", googleWebsite: "https://g.example.com" }), { kind: "google", url: "https://g.example.com/" });
});

test("SL3 a bare host gets https://", () => {
  assert.equal(safeHttpUrl("www.ryokan-example.jp"), "https://www.ryokan-example.jp/");
  assert.equal(safeHttpUrl("http://ryokan-example.jp/rooms"), "http://ryokan-example.jp/rooms");
});

test("SL4 the no-call Google Maps URL", () => {
  assert.equal(googleMapsSearchUrl("Hotel Kamogawa", "Kyoto"), "https://www.google.com/maps/search/?api=1&query=Hotel+Kamogawa%2C+Kyoto");
  assert.equal(googleMapsSearchUrl("Hotel Kamogawa", "Kyoto", "ChIJabc"), "https://www.google.com/maps/search/?api=1&query=Hotel+Kamogawa%2C+Kyoto&query_place_id=ChIJabc");
  assert.equal(googleMapsSearchUrl("  ", "Kyoto"), null);
});
