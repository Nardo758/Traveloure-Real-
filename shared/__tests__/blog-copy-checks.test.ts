/**
 * Blog publish checks (ledger `2026-10-21-blog-checks-fever-area`).
 * The five phrases and the future-date rule, pure — no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blogBannedHits, containsBannedCopy } from "../banned-copy";
import {
  calendarDay,
  hasStructuredDates,
  latestProseDate,
  proseDatesArePast,
  structuredDatesArePast,
} from "../blog-publish-checks";

const TODAY = "2026-10-21";

test("BC-blog: the five phrases, case-insensitive, and nothing else on the draft list", () => {
  for (const phrase of ["Trending", "trending", "HIDDEN GEM", "hidden gems", "Geisha", "geishas", "back alley", "Back-Alley", "back alleys", "Illuminations", "illumination"]) {
    assert.ok(blogBannedHits(phrase).length > 0, phrase);
  }
  assert.deepEqual(blogBannedHits("A trending hidden gem with a geisha in a back alley at the illuminations."), [
    "trending", "hidden gem(s)", "geisha", "back alley", "illuminations",
  ]);
  assert.deepEqual(blogBannedHits("A quiet week in Kyoto."), []);
  assert.equal(blogBannedHits("A secret insider spot, vetted, no markup.").length, 0, "the rest of the draft list is not a blog refusal");
  assert.equal(containsBannedCopy("geisha"), false, "bare geisha stays off the item-title list");
  assert.equal(containsBannedCopy("back alley"), false);
  assert.equal(containsBannedCopy("illuminations"), false);
  assert.equal(containsBannedCopy("Trending"), true, "trending is reused from the draft list");
  assert.equal(containsBannedCopy("hidden gems"), true);
});

test("dates: today is not past, a window ends on its last day, a series uses its latest instance", () => {
  assert.equal(structuredDatesArePast({ event: { lastDate: TODAY } }, TODAY), false);
  assert.equal(structuredDatesArePast({ event: { lastDate: "2026-10-20" } }, TODAY), true);
  assert.equal(structuredDatesArePast({ event: { firstDate: "2026-10-20", lastDate: "2026-10-22" } }, TODAY), false);
  assert.equal(structuredDatesArePast({ event: { firstDate: "2026-10-20" } }, TODAY), true, "a one-day event ends on its own day");
  assert.equal(structuredDatesArePast({ trip: { endDate: "2026-10-01" } }, TODAY), true);
  assert.equal(structuredDatesArePast({ trip: { end_date: TODAY } }, TODAY), false);
  assert.equal(structuredDatesArePast({
    instances: [{ lastDate: "2026-09-01" }, { lastDate: "2026-11-01" }],
  }, TODAY), false, "a series is past only when the latest instance has ended");
  assert.equal(structuredDatesArePast({
    instances: [{ lastDate: "2026-09-01" }, { lastDate: "2026-10-01" }],
  }, TODAY), true);
  assert.equal(hasStructuredDates({ event: { city: "Kyoto" } }), false);
  assert.equal(hasStructuredDates({ event: { lastDate: "2099-01-01" } }), true);
});

test("prose dates: complete dates only, Checked lines ignored, invalid days dropped", () => {
  assert.equal(latestProseDate("Kyoto in November"), null);
  assert.equal(latestProseDate("On 2020-01-01 and again on 1 June 2099."), "2099-06-01");
  assert.equal(latestProseDate("January 2, 2020"), "2020-01-02");
  assert.equal(latestProseDate("Checked 1 January 2020\nSee you on 1 June 2099."), "2099-06-01");
  assert.equal(latestProseDate("Checked 1 January 2020"), null);
  assert.equal(latestProseDate("31 February 2020 and 1 March 2020"), "2020-03-01");
  assert.equal(proseDatesArePast("Checked 1 January 2020\nSee you on 1 June 2099.", TODAY), false);
  assert.equal(proseDatesArePast("On 1 January 2020 the week began.", TODAY), true);
  assert.equal(proseDatesArePast("Kyoto in November", TODAY), false);
});

test("calendarDay reads the zone, not the server", () => {
  const instant = new Date("2026-10-21T15:30:00Z");
  assert.equal(calendarDay(instant, "Asia/Tokyo"), "2026-10-22");
  assert.equal(calendarDay(instant, "America/New_York"), "2026-10-21");
});
