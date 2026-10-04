/**
 * Step 6 pure rules (surface spec v1.3.4; ledger `2026-10-04-step6-trip-card`).
 *   T1 R-aa  `anchorConflicts` flags a stop starting AFTER take-off, and one before landing
 *   T2 R-bc  the season line names only recorded months; a trip over New Year touches Dec and Jan;
 *            a `city_events` row covers the trip only when its dates overlap
 *   T3 R-aq  photo order: ours first; a Commons file must be freely licensed AND name the place;
 *            a stubbed Wikimedia hit wins and is cached; a Google photo is never cached
 *   T4 R-ac  the cap: 5 covered runs, the sixth is paid; a pass holder's re-times are unlimited
 *            inside 24 h and never after
 *   T5 finalize smoke: "ready" only with a final version, by ONE rule for the slip, card and nudge
 *   T6 R-ay  the free plan's prompt line; nothing claimed with no findings
 *   T7 the card's snapshot meta: per-day source run/version, the dominant version
 *   T8 R-ad  the re-check day, its conflicts and its banner words
 *   T9 post_trip opens at T+1 on a final plan only; `rough` carries text
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorConflicts, freeFindingsPromptLine, type Finding } from "../optimizer-lead";
import { aiSeasonPromptLine, cityEventCoversDates, tripMonths } from "../ai-place-text";
import { pickCommonsPhoto, resolvePlacePhoto, type PhotoResolveDeps, type PhotoView } from "../place-photos";
import { passCoversRun, passRunsLeft } from "../trip-pass-runs";
import { retimeIsFree } from "../version-board";
import { tripCardBannerState, tripCardNudgeCopy } from "../trip-primary-surface";
import { dominantVariant, finalCardDays, readFinalCardMeta } from "../trip-card-final";
import { isRecheckDay, recheckAskLabel, recheckBannerLine, recheckConflicts } from "../facts-recheck";
import { feedbackText, isFeedbackPair, postTripOpen } from "../feedback";

test("T1 R-aa: after take-off and before landing are conflicts; an ordinary stop is not", () => {
  const dep = [{ id: "d", anchorType: "flight_departure", anchorDatetime: "2026-11-15T14:00:00", bufferBefore: 150, bufferAfter: 0 }];
  const after = anchorConflicts(dep, [{ title: "Dinner", dayNumber: 5, date: "2026-11-15", startTime: "18:00" }]);
  assert.equal(after.length, 1, "a stop starting after take-off is a conflict");
  assert.match(after[0].conflict, /starts after take-off/);
  assert.equal(anchorConflicts(dep, [{ title: "Breakfast", dayNumber: 5, date: "2026-11-15", startTime: "08:00" }]).length, 0);
  assert.equal(anchorConflicts(dep, [{ title: "Earlier day", dayNumber: 4, date: "2026-11-14", startTime: "20:00" }]).length, 0);
  const arr = [{ id: "a", anchorType: "flight_arrival", anchorDatetime: "2026-11-11T13:10:00", bufferBefore: 0, bufferAfter: 120 }];
  const before = anchorConflicts(arr, [{ title: "Temple", dayNumber: 1, date: "2026-11-11", startTime: "10:00" }]);
  assert.equal(before.length, 1);
  assert.match(before[0].conflict, /starts before landing/);
  assert.equal(anchorConflicts(arr, [{ title: "Dinner", dayNumber: 1, date: "2026-11-11", startTime: "17:00" }]).length, 0);
});

test("T2 R-bc: season line, trip months, city-event coverage", () => {
  assert.deepEqual(tripMonths("2026-12-28", "2027-01-03"), [12, 1]);
  assert.deepEqual(tripMonths("2026-11-11", "2026-11-15"), [11]);
  assert.equal(aiSeasonPromptLine([], "2026-11-11", "2026-11-15"), "", "no season recorded ⇒ nothing claimed");
  const line = aiSeasonPromptLine([{ month: 11, rating: "best", crowdLevel: "high", weatherDescription: "Autumn leaves" }, { month: 4, rating: "best" }], "2026-11-11", "2026-11-15");
  assert.match(line, /November: best season \(high crowds; Autumn leaves\)/);
  assert.doesNotMatch(line, /April/);
  assert.equal(cityEventCoversDates("2026-11-12T10:00:00Z", null, "2026-11-11", "2026-11-15"), true);
  assert.equal(cityEventCoversDates("2026-07-17T10:00:00Z", "2026-07-17T22:00:00Z", "2026-11-11", "2026-11-15"), false, "Gion Matsuri is not in November");
});

const view = (url: string, source: PhotoView["source"] = "wikimedia"): PhotoView => ({ source, url, licence: "CC BY-SA 4.0", attribution: "x", sourceUrl: null });
function deps(over: Partial<PhotoResolveDeps> & { googleCalls?: { n: number }; cache?: Map<string, PhotoView | null> } = {}): PhotoResolveDeps {
  const cache = over.cache ?? new Map<string, PhotoView | null>();
  return {
    cacheGet: async (k) => (cache.has(k) ? cache.get(k)! : undefined),
    cacheSet: async (k, p) => void cache.set(k, p),
    commons: async () => [],
    googleLive: async () => {
      if (over.googleCalls) over.googleCalls.n += 1;
      return null;
    },
    googleAllowed: async () => true,
    wikimediaEnabled: () => true,
    ...over,
  };
}
const kinkaku = { name: "Kinkaku-ji", placeId: "ChIJ-kinkaku", lat: 35.0394, lng: 135.7292 };

test("T3 R-aq: photo order — ours, then a cached Commons hit, then Google live (a miss), else none", async () => {
  assert.equal((await resolvePlacePhoto({ ...kinkaku, ownImage: "https://cdn.example/listing.jpg" }, deps()))!.source, "ours");
  const cache = new Map<string, PhotoView | null>();
  const googleCalls = { n: 0 };
  const hit = await resolvePlacePhoto(
    kinkaku,
    deps({
      cache,
      googleCalls,
      commons: async () => [
        { title: "File:Some shop near the temple.jpg", url: "https://upload/x.jpg", licence: "CC BY 4.0", distanceM: 5 },
        { title: "File:Kinkaku-ji 2019.jpg", url: "https://upload/kinkaku.jpg", licence: "CC BY-SA 4.0", artist: "<a>Jane</a>", distanceM: 40 },
      ],
    }),
  );
  assert.equal(hit!.source, "wikimedia");
  assert.equal(hit!.url, "https://upload/kinkaku.jpg", "the file that NAMES the place, not the nearer one that does not");
  assert.equal(hit!.attribution, "Jane · CC BY-SA 4.0 · Wikimedia Commons");
  assert.equal(googleCalls.n, 0, "a Commons hit never reaches Google");
  assert.equal(cache.get("ChIJ-kinkaku")!.url, "https://upload/kinkaku.jpg", "the Commons answer is cached");
  // A stubbed Google miss after no Commons file: none — and a remembered Commons miss.
  const cache2 = new Map<string, PhotoView | null>();
  const calls2 = { n: 0 };
  assert.equal(await resolvePlacePhoto(kinkaku, deps({ cache: cache2, googleCalls: calls2 })), null);
  assert.equal(calls2.n, 1);
  assert.equal(cache2.get("ChIJ-kinkaku"), null, "the Commons miss is remembered");
  // A Google photo is NEVER cached.
  const cache3 = new Map<string, PhotoView | null>();
  const g = await resolvePlacePhoto(kinkaku, deps({ cache: cache3, wikimediaEnabled: () => false, googleLive: async () => view("https://lh3/live", "google_live") }));
  assert.equal(g!.source, "google_live");
  assert.equal(cache3.size, 0);
  // The cap refuses ⇒ no live call.
  const calls4 = { n: 0 };
  assert.equal(await resolvePlacePhoto(kinkaku, deps({ googleCalls: calls4, wikimediaEnabled: () => false, googleAllowed: async () => false })), null);
  assert.equal(calls4.n, 0);
  // Unlicensed or non-image files are refused.
  assert.equal(pickCommonsPhoto([{ title: "File:Kinkaku-ji.jpg", url: "u", licence: "Fair use" }], "Kinkaku-ji"), null);
  assert.equal(pickCommonsPhoto([{ title: "File:Kinkaku-ji.pdf", url: "u", licence: "CC0" }], "Kinkaku-ji"), null);
});

test("T4 R-ac: five covered runs, the sixth is paid; re-times unlimited for a pass inside 24 h", () => {
  assert.equal(passCoversRun(0, 5), true);
  assert.equal(passCoversRun(4, 5), true);
  assert.equal(passCoversRun(5, 5), false, "the sixth run is a paid run");
  assert.equal(passCoversRun(Number.POSITIVE_INFINITY, 5), false, "an unread count never spends past the cap");
  assert.equal(passRunsLeft(3, 5), 2);
  assert.equal(passRunsLeft(9, 5), 0);
  const runAt = new Date("2026-10-04T10:00:00Z");
  assert.equal(retimeIsFree({ runAt, now: new Date("2026-10-04T12:00:00Z"), used: 7, limit: 3, unlimited: true }), true);
  assert.equal(retimeIsFree({ runAt, now: new Date("2026-10-04T12:00:00Z"), used: 3, limit: 3 }), false);
  assert.equal(retimeIsFree({ runAt, now: new Date("2026-10-05T12:00:00Z"), used: 0, limit: 3, unlimited: true }), false, "the 24 h rule holds for a pass");
});

test("T5 finalize smoke: 'ready' only when a final exists — slip banner, card and nudge agree", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const inWindow = { startDate: "2026-11-11", endDate: "2026-11-15", now };
  assert.equal(tripCardBannerState({ ...inWindow, finalizedAt: null, finalVersion: null }), "finalize_now");
  assert.equal(tripCardBannerState({ ...inWindow, finalizedAt: null, finalVersion: 2 }), "ready");
  assert.equal(tripCardBannerState({ startDate: "2027-01-01", endDate: "2027-01-05", now, finalizedAt: null, finalVersion: null }), null);
  assert.equal(tripCardBannerState({ startDate: "2027-01-01", endDate: "2027-01-05", now, finalizedAt: "2026-11-01T00:00:00Z", finalVersion: 1 }), "ready");
  assert.equal(tripCardNudgeCopy(false, "Kyoto, Japan").path, "slip");
  assert.doesNotMatch(tripCardNudgeCopy(false, "Kyoto").title, /ready/i);
  assert.equal(tripCardNudgeCopy(true, "Kyoto").title, "Your Trip Card is ready");
});

test("T6 R-ay: the free plan's prompt", () => {
  const f: Finding[] = [
    { kind: "closed_on_arrival", count: 1, days: [2] },
    { kind: "timed_entry_conflict", count: 1, days: [5] },
  ];
  assert.equal(freeFindingsPromptLine(f), "2 stops may not be reachable in time · Add travel times");
  assert.match(freeFindingsPromptLine([{ kind: "city_crossing", count: 2, days: [1, 3], est: true }])!, /cross the city .* · Add travel times$/);
  assert.equal(freeFindingsPromptLine([]), null);
  assert.equal(freeFindingsPromptLine(undefined), null);
});

test("T7 the card's snapshot meta", () => {
  const days = finalCardDays([
    { dayNumber: 1, sourceRunId: null, sourceVariantId: null },
    { dayNumber: 2, sourceRunId: "run1", sourceVariantId: "vA" },
    { dayNumber: 2, sourceRunId: "run1", sourceVariantId: "vB" },
    { dayNumber: 3, sourceRunId: "run1", sourceVariantId: "vB" },
    { dayNumber: 4, sourceRunId: "run1", sourceVariantId: "vB" },
  ]);
  assert.deepEqual(days.map((d) => d.sourceVariantId), [null, "vA", "vB", "vB"]);
  assert.deepEqual(dominantVariant(days), { sourceVariantId: "vB", sourceRunId: "run1" });
  assert.equal(dominantVariant(finalCardDays([{ dayNumber: 1 }])), null);
  assert.equal(readFinalCardMeta({ trip: {}, items: [] }), null, "a pre-step-6 snapshot carries none");
  assert.equal(readFinalCardMeta({ card: { days: [], builtFrom: { versionLabel: "A", runNumber: 1 }, photos: {} } })!.builtFrom!.versionLabel, "A");
});

test("T8 R-ad: re-check day, conflicts, banner words", () => {
  assert.equal(isRecheckDay("2026-11-11", new Date("2026-11-08T05:00:00Z")), true);
  assert.equal(isRecheckDay("2026-11-11", new Date("2026-11-09T05:00:00Z")), false);
  const c = recheckConflicts([
    { kind: "closed_on_arrival", count: 1, days: [2] },
    { kind: "city_crossing", count: 2, days: [1], est: true },
  ]);
  assert.deepEqual(c.map((f) => f.kind), ["closed_on_arrival"]);
  assert.equal(recheckBannerLine(c, "8 Nov"), "Hours re-checked 8 Nov · 1 stop is reached when it's closed");
  assert.equal(recheckBannerLine([], "8 Nov"), null);
  assert.equal(recheckAskLabel("Aiko"), "Ask Aiko");
  assert.equal(recheckAskLabel(null), "Ask a local");
});

test("T9 post_trip: opens at T+1 on a final plan; `rough` carries text", () => {
  assert.equal(postTripOpen("2026-11-15", true, new Date("2026-11-16T01:00:00Z")), true);
  assert.equal(postTripOpen("2026-11-15", true, new Date("2026-11-15T23:00:00Z")), false);
  assert.equal(postTripOpen("2026-11-15", false, new Date("2026-11-20T00:00:00Z")), false, "no card ⇒ no post-trip tap");
  assert.equal(isFeedbackPair("post_trip", "great"), true);
  assert.equal(isFeedbackPair("post_trip", "fits"), false);
  assert.deepEqual(feedbackText("rough", " rain all week "), { ok: true, text: "rain all week" });
  assert.deepEqual(feedbackText("great", "lovely"), { ok: true, text: null });
});
