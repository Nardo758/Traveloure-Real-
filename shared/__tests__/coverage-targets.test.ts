/**
 * FD-5 — coverage targets, pure (ledger `2026-10-10-fd5-coverage-targets`; brief
 * docs/planning/briefs/fd-5-coverage-targets.md).
 *
 *   CT1  day type: weekend ⇒ peak; a season at/above the multiplier ⇒ peak (wrapping the new year too); a season
 *        below it ⇒ not; unconfirmed or unknown dates ⇒ peak (the stricter target)
 *   CT2  meetsTarget: under either count ⇒ false; at target ⇒ true; no target or unset field ⇒ no gate
 *   CT3  the teaser gate: zero ⇒ nothing; under target ⇒ nothing; at target ⇒ the honest count; a slug with no
 *        target keeps FD-1's behaviour; a two-neighbourhood day counts only the one at target (never summed)
 *   CT4  the gate measures the neighbourhood's whole content, not the plan's remainder
 *   CT5  the census: counts per slug, official facts by source, unplaced gems, unknown target slugs, gates
 *   CT6  the words: honest counts, singulars, nothing on zero
 *   CT7  Leon's Kyoto numbers, on the eight production slugs and no 042 slug; official fields unset
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoverageCensus, censusSummary, coverageDayType, meetsTarget, planDayIso, type SlugTargets } from "../coverage-targets";
import { localTeaserLine, localTeasersByDay, type TeaserInput } from "../free-draft-cap";
import { COVERAGE_TARGETS, coveragePeakMultiplier } from "../../server/config/coverage-targets.config";

const KYOTO_SEASONS = [
  { startMonthDay: "03-20", endMonthDay: "04-20", multiplier: 1.9 },
  { startMonthDay: "06-07", endMonthDay: "07-20", multiplier: 0.7 },
  { startMonthDay: "10-20", endMonthDay: "12-01", multiplier: 1.8 },
  { startMonthDay: "12-02", endMonthDay: "03-19", multiplier: 0.85 },
];
const dt = (dateIso: string | null, datesConfirmed = true, seasons = KYOTO_SEASONS) => coverageDayType({ dateIso, datesConfirmed, seasons, peakMultiplier: 1.5 });

test("CT1 — the day type", () => {
  assert.equal(dt("2027-05-12"), "normal_weekday", "a May Wednesday");
  assert.equal(dt("2027-05-15"), "peak", "Saturday");
  assert.equal(dt("2027-05-16"), "peak", "Sunday");
  assert.equal(dt("2027-04-07"), "peak", "a sakura Wednesday");
  assert.equal(dt("2027-11-10"), "peak", "a momiji Wednesday");
  assert.equal(dt("2027-06-16"), "normal_weekday", "tsuyu is below 1.5");
  assert.equal(dt("2027-05-12", false), "peak", "unconfirmed dates gate against peak");
  assert.equal(dt(null), "peak");
  assert.equal(dt("not-a-date"), "peak");
  assert.equal(
    dt("2028-01-05", true, [{ startMonthDay: "12-20", endMonthDay: "01-10", multiplier: 2 }]),
    "peak",
    "a season wrapping the new year",
  );
  assert.equal(planDayIso("2027-12-31", 2), "2028-01-01");
  assert.equal(planDayIso(null, 1), null);
  assert.equal(coveragePeakMultiplier(), 1.5);
});

test("CT2 — meetsTarget", () => {
  const t = { localPicks: 3, localNotes: 2 };
  assert.equal(meetsTarget({ localPicks: 2, localNotes: 5 }, t), false);
  assert.equal(meetsTarget({ localPicks: 5, localNotes: 1 }, t), false);
  assert.equal(meetsTarget({ localPicks: 3, localNotes: 2 }, t), true, "equal is at target");
  assert.equal(meetsTarget({ localPicks: 0, localNotes: 0 }, null), true, "no target ⇒ no gate");
  assert.equal(meetsTarget({ localPicks: 0, localNotes: 4 }, { localNotes: 2 }), true, "an unset field does not gate");
});

// Two Kyoto neighbourhoods; a day with one stop in each.
const hoods = [
  { id: "h-gion", slug: "gion", name: "Gion", lat: 35.0037, lng: 135.7788 },
  { id: "h-arashi", slug: "arashiyama", name: "Arashiyama", lat: 35.0094, lng: 135.668 },
];
const gems = (slug: string, n: number, prefix = slug) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, neighbourhoodSlug: slug }));
const notes = (id: string, n: number) => Array.from({ length: n }, () => ({ neighbourhoodId: id, neighbourhoodName: null }));
const T: Record<string, SlugTargets> = {
  gion: { peak: { localPicks: 5, localNotes: 3 }, normal_weekday: { localPicks: 3, localNotes: 2 } },
  arashiyama: { peak: { localPicks: 5, localNotes: 3 }, normal_weekday: { localPicks: 3, localNotes: 2 } },
};
const base = (over: Partial<TeaserInput> = {}): TeaserInput => ({
  items: [
    { dayNumber: 1, lat: 35.004, lng: 135.779, gemId: null },
    { dayNumber: 1, lat: 35.009, lng: 135.669, gemId: null },
  ],
  neighbourhoods: hoods,
  gems: [],
  notes: [],
  ...over,
});
const gate = (type: "peak" | "normal_weekday", targets = T) => ({ targets, dayTypeOf: () => type });

test("CT3 — the teaser gate", () => {
  // zero ⇒ nothing, gated or not
  assert.equal(localTeasersByDay(base({ gate: gate("normal_weekday") })).size, 0);
  // under target ⇒ nothing (gion 2 picks / 2 notes against 3/2)
  assert.equal(localTeasersByDay(base({ gems: gems("gion", 2), notes: notes("h-gion", 2), gate: gate("normal_weekday") })).size, 0);
  // at target ⇒ honest count
  const at = localTeasersByDay(base({ gems: gems("gion", 3), notes: notes("h-gion", 2), gate: gate("normal_weekday") }));
  assert.deepEqual(at.get(1), { localPicks: 3, localNotes: 2 });
  // the same counts are under the PEAK target
  assert.equal(localTeasersByDay(base({ gems: gems("gion", 3), notes: notes("h-gion", 2), gate: gate("peak") })).size, 0);
  // no gate ⇒ FD-1's behaviour; a slug with no target ⇒ no gate
  assert.deepEqual(localTeasersByDay(base({ gems: gems("gion", 1) })).get(1), { localPicks: 1, localNotes: 0 });
  assert.deepEqual(localTeasersByDay(base({ gems: gems("gion", 1), gate: gate("peak", {}) })).get(1), { localPicks: 1, localNotes: 0 });
  // two neighbourhoods: gion at target, arashiyama under ⇒ only gion's counts, never summed
  const mixed = localTeasersByDay(base({
    gems: [...gems("gion", 3), ...gems("arashiyama", 2)],
    notes: [...notes("h-gion", 2), ...notes("h-arashi", 1)],
    gate: gate("normal_weekday"),
  }));
  assert.deepEqual(mixed.get(1), { localPicks: 3, localNotes: 2 });
});

test("CT4 — the gate measures the neighbourhood, the teaser shows the plan's remainder", () => {
  // gion holds 3 picks (at target); one is already on the plan ⇒ the teaser says 2, and the day still speaks.
  const r = localTeasersByDay(base({
    items: [{ dayNumber: 1, lat: 35.004, lng: 135.779, gemId: "gion-0" }],
    gems: gems("gion", 3),
    notes: notes("h-gion", 2),
    gate: gate("normal_weekday"),
  }));
  assert.deepEqual(r.get(1), { localPicks: 2, localNotes: 2 });
});

test("CT5 — the census", () => {
  const c = buildCoverageCensus({
    market: "kyoto",
    neighbourhoods: hoods,
    gems: [...gems("gion", 5).map((g) => ({ neighbourhoodSlug: g.neighbourhoodSlug })), { neighbourhoodSlug: "fushimi_inari" }, { neighbourhoodSlug: null }],
    notes: [...notes("h-gion", 3), { neighbourhoodId: null, neighbourhoodName: "Arashiyama" }],
    facts: [
      { lat: 35.0036, lng: 135.7787, sourceClass: "public", license: "official", factType: "last_admission", sourceName: "Kiyomizu-dera" },
      { lat: 35.0036, lng: 135.7787, sourceClass: "public", license: "official", factType: "hours", sourceName: null },
      { lat: 35.0093, lng: 135.6681, sourceClass: "local", license: null, factType: "tip", sourceName: null },
      { lat: 35.0093, lng: 135.6681, sourceClass: "public", license: "official", factType: "description", sourceName: "X" },
    ],
    targets: { ...T, "kyoto-station": T.gion },
  });
  const gion = c.rows.find((r) => r.slug === "gion")!;
  const arashi = c.rows.find((r) => r.slug === "arashiyama")!;
  assert.deepEqual([gion.localPicks, gion.localNotes, gion.officialLastAdmission, gion.officialHours], [5, 3, 1, 1]);
  assert.deepEqual(gion.officialBySource, { "Kiyomizu-dera": 1, "unregistered source": 1 });
  assert.deepEqual(gion.gate, { peak: true, normal_weekday: true });
  assert.deepEqual([arashi.localPicks, arashi.localNotes, arashi.localFacts, arashi.officialHours], [0, 1, 1, 0], "a description is not an official feasibility count");
  assert.deepEqual(arashi.gate, { peak: false, normal_weekday: false });
  assert.equal(c.unplacedGems, 2, "042's slug and a null slug place nowhere");
  assert.deepEqual(c.unknownTargetSlugs, ["kyoto-station"]);
  assert.deepEqual(censusSummary(c), { market: "kyoto", targeted: 2, atTargetPeak: 1, atTargetNormal: 1, unplacedGems: 2, unknownTargetSlugs: ["kyoto-station"] });
});

test("CT6 — the words", () => {
  assert.equal(localTeaserLine({ localPicks: 3, localNotes: 2 }), "3 local picks and 2 local notes for this day");
  assert.equal(localTeaserLine({ localPicks: 1, localNotes: 0 }), "1 local pick for this day");
  assert.equal(localTeaserLine({ localPicks: 0, localNotes: 1 }), "1 local note for this day");
  assert.equal(localTeaserLine({ localPicks: 0, localNotes: 0 }), null);
  assert.equal(localTeaserLine(null), null);
  assert.equal(/public|local tier|paid/i.test(localTeaserLine({ localPicks: 2, localNotes: 2 })!), false, "no tier words");
});

test("CT7 — Leon's Kyoto numbers", () => {
  const k = COVERAGE_TARGETS.kyoto;
  assert.deepEqual(Object.keys(k).sort(), ["arashiyama", "fushimi", "gion", "higashiyama", "kawaramachi-sanjo", "kyoto-station", "nishijin", "pontocho"]);
  for (const t of Object.values(k)) {
    assert.deepEqual(t.peak, { localPicks: 5, localNotes: 3 });
    assert.deepEqual(t.normal_weekday, { localPicks: 3, localNotes: 2 });
  }
  assert.equal("fushimi_inari" in k || "downtown_kawaramachi" in k, false);
});
