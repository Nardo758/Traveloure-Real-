/**
 * Round 2 EXP-QA rows (ledger `2026-11-04-round2-exp-qa`), the pure parts.
 *
 *   R1 E-1/E-5/E-8  the choice label: event title, then a picked occasion, then the group label — never a default.
 *   R2 E-1          date ranges carry their year; one day is one day; mint dates are verbatim.
 *   R3 E-2          a door that names its occasion, or an event anchor, opens on dates and party.
 *   R4 E-4          the event picker lists the marquee's events first, then the rest, each by month.
 *   R5 E-7          the strip heading names the marquee city.
 *   R6 C-1          a stored photo credit is compacted: attribution + licence, no raw URL.
 *   R7 N-2          the shared sign-up form is ready only with every field and the consent box.
 *   R8 N-5          the tab title is the page's own name, or "Traveloure".
 *   R9 banner       the guest plan's banner composes title, dates with year, and party.
 *
 * Run: npx tsx --test client/src/lib/__tests__/round2-exp-qa.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventPickerGroups, initialPlanEntry, planEntryChoiceLabel, planEntryMintDates } from "../plan-entry";
import { guestDateRange, guestPlanBanner } from "../guest-map";
import { eventsStripTitle } from "../../components/landing/events-strip";
import { compactCredit } from "../gem-photo-credit";
import { EMPTY_SIGNUP_DRAFT, signupDraftReady } from "../../components/auth/SignupForm";
import { documentTitleFor } from "../use-document-title";

describe("round 2 EXP-QA", () => {
  it("R1 the choice label never shows a group's default occasion", () => {
    assert.equal(planEntryChoiceLabel({ eventTitle: "Japanese Grand Prix", specificOccasionName: "Show / Festival", groupLabel: "A trip" }), "Japanese Grand Prix");
    assert.equal(planEntryChoiceLabel({ specificOccasionName: "Proposal", groupLabel: "A moment" }), "Proposal");
    assert.equal(planEntryChoiceLabel({ groupLabel: "Group travel" }), "Group travel");
    assert.equal(planEntryChoiceLabel({ eventTitle: "  ", specificOccasionName: null, groupLabel: "A hosted event" }), "A hosted event");
  });

  it("R2 dates carry their year; one day is one day; mint dates are verbatim", () => {
    assert.equal(guestDateRange("2027-04-09", "2027-04-11"), "Fri 9 – Sun 11 Apr 2027");
    assert.equal(guestDateRange("2026-10-30", "2026-11-02"), "Fri 30 Oct – Mon 2 Nov 2026");
    assert.equal(guestDateRange("2026-12-30", "2027-01-01"), "Wed 30 Dec 2026 – Fri 1 Jan 2027");
    assert.equal(guestDateRange("2026-11-04", "2026-11-04"), "Wed 4 Nov 2026");
    assert.deepEqual(planEntryMintDates({ startDate: "2026-11-01", endDate: "2026-11-04", market: null }), { startDate: "2026-11-01", endDate: "2026-11-04" });
  });

  it("R3 a known occasion is not asked again", () => {
    assert.equal(initialPlanEntry({ city: "Kyoto", experienceSlug: "proposal" }).step, "details");
    const ev = initialPlanEntry({ city: "Kyoto", experienceSlug: "show", anchor: { title: "F1", firstDate: "2027-04-09", lastDate: "2027-04-11", startTime: null, venue: "Suzuka" } });
    assert.equal(ev.step, "details");
    assert.equal(ev.state.startDate, "2027-04-09");
    assert.equal(initialPlanEntry({ city: "Kyoto" }).step, "occasion", "no occasion ⇒ asked");
  });

  it("R4 marquee events first", () => {
    const groups = eventPickerGroups(
      [
        { id: "p", firstDate: "2026-11-10", marketKey: "porto" },
        { id: "k", firstDate: "2027-04-09", marketKey: "kyoto" },
        { id: "g", firstDate: "2026-12-01", marketKey: "goa" },
      ],
      "kyoto",
    );
    // E-7 (ruling, Nov 5, 2026; sanctioned edit): the marquee is ONE section headed by its city, then other cities by month.
    assert.deepEqual(groups.map((g) => [g.key, g.city, g.month, g.events.map((e) => e.id)]), [
      ["marquee-kyoto", "Kyoto", null, ["k"]],
      ["other-2026-11", null, "2026-11", ["p"]],
      ["other-2026-12", null, "2026-12", ["g"]],
    ]);
  });

  it("R5 the strip heading", () => {
    assert.equal(eventsStripTitle("Kyoto"), "What's on in Kyoto");
    assert.equal(eventsStripTitle(null), "What's on");
  });

  it("R6 compact photo credit", () => {
    const c = compactCredit(
      "Jakub Hałun / Wikimedia Commons, CC BY 4.0. Source: https://commons.wikimedia.org/wiki/File:X.jpg License: https://creativecommons.org/licenses/by/4.0/",
    );
    assert.deepEqual(c, {
      who: "Jakub Hałun / Wikimedia Commons",
      licence: "CC BY 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    });
    const odd = compactCredit("Photo by A at https://example.com/x");
    assert.equal(odd?.who.includes("http"), false);
    assert.equal(compactCredit("  "), null);
  });

  it("R7 sign-up readiness", () => {
    const filled = { firstName: "A", lastName: "B", email: "a@b.test", password: "12345678", consent: true };
    assert.equal(signupDraftReady(filled), true);
    assert.equal(signupDraftReady({ ...filled, consent: false }), false);
    assert.equal(signupDraftReady({ ...filled, password: "short" }), false);
    assert.equal(signupDraftReady(EMPTY_SIGNUP_DRAFT), false);
  });

  it("R8 tab titles", () => {
    assert.equal(documentTitleFor("A trip in Kyoto"), "A trip in Kyoto | Traveloure");
    assert.equal(documentTitleFor(null), "Traveloure");
  });

  it("R9 guest plan banner", () => {
    assert.equal(
      guestPlanBanner({ title: "A trip in Kyoto", startDate: "2027-04-09", endDate: "2027-04-12", datesConfirmed: true, adults: 2, kids: null }),
      "A trip in Kyoto, Fri 9 – Mon 12 Apr 2027 and 2 travelers",
    );
    assert.equal(
      guestPlanBanner({ title: "Kyoto trip", startDate: "2026-11-04", endDate: "2026-11-04", datesConfirmed: false, adults: null, kids: null }),
      "Kyoto trip",
    );
  });
});
