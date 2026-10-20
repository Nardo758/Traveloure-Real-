/**
 * FB-1 expert hook — the pure rules (ledger `2026-10-18-fb1-expert-hook`).
 *
 *   H1 the four strings, word for word
 *   H2 switch off ⇒ the OFF line and no button, whatever the chooser holds
 *   H3 switch on ⇒ the ON line naming the city; the button only when the chooser has someone (`canAsk`)
 *   H4 FD-5 counts on the day replace the plain line in either state; the button rule is unchanged
 *   H5 every string we draw passes the never-say list; the list catches each phrase it names
 *   H6 the in-season line: zero, absent or no day ⇒ nothing; a count ⇒ the line
 *   H7 the in-season counter: new stops only, transport never, the same place counted once
 *   H8 expert_hook_cities: a JSON array of operating-market keys, empty by default; garbage reads as none
 *
 * Run: npx tsx --test shared/__tests__/fb1-expert-hook.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPERT_HOOK_BUTTON, EXPERT_HOOK_OFF_LINE, EXPERT_HOOK_TITLE, IN_SEASON_SEE_THEM, countInSeasonAdditions,
  expertHookCities, expertHookCitiesRefusal, expertHookForDay, expertHookOnLine, inSeasonAdditionsLine, inSeasonLine,
} from "../expert-hook";
import { containsNeverSayCopy } from "../banned-copy";
import { localTeaserLine } from "../free-draft-cap";

const ON = { switchOn: true, cityName: "Kyoto", canAsk: true };

test("H1 the strings, word for word", () => {
  assert.equal(EXPERT_HOOK_TITLE, "With local picks");
  assert.equal(EXPERT_HOOK_OFF_LINE, "With local picks, this day gets notes on timing, crowds and food near its stops.");
  assert.equal(expertHookOnLine("Kyoto"), "A Kyoto local can add notes on timing, crowds and food near this day’s stops.");
  assert.equal(EXPERT_HOOK_BUTTON, "Want a local to tune this day?");
  assert.equal(inSeasonAdditionsLine(3, 2), "3 in-season additions for Day 2");
  assert.equal(inSeasonAdditionsLine(1, 2), "1 in-season addition for Day 2", "singular at one, as the FD-5 teaser line");
  assert.equal(inSeasonAdditionsLine(2, 2), "2 in-season additions for Day 2");
  assert.equal(IN_SEASON_SEE_THEM, "See them");
});

test("H2 switch off: the OFF line and no button", () => {
  for (const canAsk of [true, false]) {
    assert.deepEqual(expertHookForDay({ switchOn: false, cityName: "Kyoto", canAsk }, null), { line: EXPERT_HOOK_OFF_LINE, button: false });
  }
  assert.deepEqual(expertHookForDay({ switchOn: true, cityName: null, canAsk: true }, null), { line: EXPERT_HOOK_OFF_LINE, button: false });
});

test("H3 switch on: the city line; the button only when the chooser has someone", () => {
  assert.deepEqual(expertHookForDay(ON, null), { line: expertHookOnLine("Kyoto"), button: true });
  assert.deepEqual(expertHookForDay({ ...ON, canAsk: false }, null), { line: expertHookOnLine("Kyoto"), button: false });
});

test("H4 FD-5 counts replace the plain line", () => {
  const teaser = { localPicks: 2, localNotes: 1 };
  const counts = localTeaserLine(teaser)!;
  assert.equal(counts, "2 local picks and 1 local note for this day");
  assert.deepEqual(expertHookForDay(ON, teaser), { line: counts, button: true });
  assert.deepEqual(expertHookForDay({ switchOn: false, cityName: "Kyoto", canAsk: false }, teaser), { line: counts, button: false });
  assert.deepEqual(expertHookForDay(ON, { localPicks: 0, localNotes: 0 }), { line: expertHookOnLine("Kyoto"), button: true }, "zero counts keep the plain line");
});

test("H5 never-say: our strings pass, and each listed phrase is caught", () => {
  for (const s of [EXPERT_HOOK_TITLE, EXPERT_HOOK_OFF_LINE, expertHookOnLine("Kyoto"), EXPERT_HOOK_BUTTON, inSeasonAdditionsLine(3, 2), IN_SEASON_SEE_THEM, localTeaserLine({ localPicks: 3, localNotes: 2 })!]) {
    assert.equal(containsNeverSayCopy(s), false, s);
  }
  for (const bad of [
    "Local notes coming soon", "Trending in Gion", "No hidden fees", "No markup", "Geisha spotting in Gion", "A hidden gem",
    "10 min walk", "two minutes away", "Checked live", "real-time crowds", "Works offline", "In the app", "Download the guide",
  ]) {
    assert.equal(containsNeverSayCopy(bad), true, bad);
  }
});

test("H6 the in-season line draws nothing at zero", () => {
  assert.equal(inSeasonLine(0, 2), null);
  assert.equal(inSeasonLine(null, 2), null);
  assert.equal(inSeasonLine(undefined, 2), null);
  assert.equal(inSeasonLine(-1, 2), null);
  assert.equal(inSeasonLine(2, null), null);
  assert.equal(inSeasonLine(2, 3), "2 in-season additions for Day 3");
  assert.equal(inSeasonLine(1, 3), "1 in-season addition for Day 3");
});

test("H7 the in-season counter: new stops only, transport never", () => {
  const plan = [{ placeId: "p1", title: "Kiyomizu-dera" }, { title: "Nishiki Market" }];
  const version = [
    { placeId: "p1", title: "Kiyomizu-dera" }, // already held (same place)
    { title: "nishiki market" }, // already held (same title)
    { placeId: "p2", title: "Gion Matsuri evening" },
    { placeId: "p2", title: "Gion Matsuri evening" }, // counted once
    { title: "Sagano Romantic Train", transport: true }, // transport never counts
    { title: "Kamogawa Odori" },
  ];
  assert.equal(countInSeasonAdditions(version, plan), 2);
  assert.equal(countInSeasonAdditions([], plan), 0);
});

test("H8 expert_hook_cities", () => {
  assert.deepEqual(expertHookCities(null), []);
  assert.deepEqual(expertHookCities("not json"), []);
  assert.deepEqual(expertHookCities('{"kyoto":true}'), []);
  assert.deepEqual(expertHookCities('["kyoto","nowhere","kyoto"]'), ["kyoto"]);
  assert.equal(expertHookCitiesRefusal('["kyoto"]'), null);
  assert.equal(expertHookCitiesRefusal("[]"), null);
  assert.match(expertHookCitiesRefusal('["nowhere"]')!, /unknown market/);
  assert.match(expertHookCitiesRefusal('["kyoto","kyoto"]')!, /duplicate market/);
  assert.match(expertHookCitiesRefusal("kyoto")!, /JSON array/);
});
