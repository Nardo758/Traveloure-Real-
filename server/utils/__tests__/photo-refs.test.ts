/**
 * R297 photo references (ledger `2026-10-04-photo-references`).
 *   G1 an empty cache makes ZERO Places requests: a stop with no cached reference falls through to
 *      "none" — the resolver never calls Details or Text Search to find one
 *   G2 with a cached reference the live photo is ONE request — the Place Photo media call, key in a
 *      header, never in the returned URL — and it logs exactly one cost row (what the cap counts);
 *      a failed media call logs its row too and returns nothing
 *   G3 the cap refuses ⇒ no request at all
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePlacePhoto, type PhotoResolveDeps } from "@shared/place-photos";
import { googlePhotoLive } from "../../services/place-photos-google";

const place = { name: "Kinkaku-ji", placeId: "ChIJ-kinkaku", lat: 35.0394, lng: 135.7292 };
function fakeFetch(answer: unknown, ok = true) {
  const calls: string[] = [];
  const f = async (url: string, init?: any) => {
    calls.push(url);
    assert.ok(init?.headers?.["X-Goog-Api-Key"], "the key rides a header");
    return { ok, json: async () => answer };
  };
  return { f, calls };
}
const deps = (fetchImpl: any, logs: Array<{ success: boolean }>, allowed = true): PhotoResolveDeps => ({
  cacheGet: async () => undefined,
  cacheSet: async () => undefined,
  commons: async () => [],
  wikimediaEnabled: () => false,
  googleAllowed: async () => allowed,
  googleLive: (p) => googlePhotoLive(p, fetchImpl, async (r) => void logs.push(r), "k"),
});

test("G1 an empty cache makes zero Places requests", async () => {
  const { f, calls } = fakeFetch({ photoUri: "https://lh3/x" });
  const logs: Array<{ success: boolean }> = [];
  assert.equal(await resolvePlacePhoto({ ...place, photoRef: null }, deps(f, logs)), null);
  assert.equal(await resolvePlacePhoto({ ...place }, deps(f, logs)), null);
  assert.equal(calls.length, 0, "no Details, no Text Search, no media call");
  assert.equal(logs.length, 0, "nothing billed, nothing counted");
});

test("G2 a cached reference is ONE media request; the URI carries no key; one cost row", async () => {
  const { f, calls } = fakeFetch({ photoUri: "https://lh3.googleusercontent.com/p/abc" });
  const logs: Array<{ success: boolean }> = [];
  const ref = { name: "places/ChIJ-kinkaku/photos/AX1", authors: [{ displayName: "Jane Doe", uri: "https://maps.google.com/contrib/1" }] };
  const photo = await resolvePlacePhoto({ ...place, photoRef: ref }, deps(f, logs));
  assert.deepEqual(calls, ["https://places.googleapis.com/v1/places/ChIJ-kinkaku/photos/AX1/media?maxWidthPx=800&skipHttpRedirect=true"]);
  assert.ok(!/places\/[^/]+$|:searchText/.test(calls[0]), "never Details or Text Search");
  assert.equal(photo!.source, "google_live");
  assert.ok(!/key=/.test(photo!.url));
  assert.equal(photo!.attribution, "Jane Doe · Google Maps");
  assert.deepEqual(logs.map((l) => l.success), [true]);
  const failed = fakeFetch({}, false);
  const logs2: Array<{ success: boolean }> = [];
  assert.equal(await resolvePlacePhoto({ ...place, photoRef: ref }, deps(failed.f, logs2)), null);
  assert.deepEqual(logs2.map((l) => l.success), [false], "a failed call is still a counted request");
});

test("G3 the cap refuses ⇒ no request", async () => {
  const { f, calls } = fakeFetch({ photoUri: "https://lh3/x" });
  const logs: Array<{ success: boolean }> = [];
  const ref = { name: "places/X/photos/1", authors: [] };
  assert.equal(await resolvePlacePhoto({ ...place, photoRef: ref }, deps(f, logs, false)), null);
  assert.equal(calls.length, 0);
});
