/**
 * QA F3 regression pin — the Guest Invites caption must name the day the host chose.
 *
 * Run under all three timezones (that is the whole point: the bug is invisible at UTC and east
 * of it, so a UTC-only run passes on the defect):
 *
 *   TZ=America/New_York npx tsx --test client/src/lib/__tests__/guest-invite-meta.test.ts
 *   TZ=Asia/Tokyo       npx tsx --test client/src/lib/__tests__/guest-invite-meta.test.ts
 *   TZ=UTC              npx tsx --test client/src/lib/__tests__/guest-invite-meta.test.ts
 *
 * THE BUG. `user_experiences.event_date` is a Postgres DATE column and reaches the client as a
 * bare "YYYY-MM-DD" string. `GuestInviteManager` rendered it with
 * `new Date(eventDate).toLocaleDateString()`, and `new Date("2026-10-10")` is specified to parse
 * as UTC MIDNIGHT — so every viewer west of UTC read "10/9/2026", a day that can fall outside
 * the plan's own start/end range.
 *
 * WHAT THIS HOLDS:
 *   G1  a date-only string is the day it says it is, in LOCAL time, in every timezone.
 *   G2  the naive parse is what we are pinning against.
 *   G3  a full ISO timestamp keeps instant semantics (the helper is not a date-only-only parser).
 *   G4  §13 — an absent / blank / unparseable date is OMITTED, separator and all; never
 *       "Invalid Date", never the epoch.
 *   G5  §13 — a blank name or destination is omitted the same way, so the line never opens or
 *       closes on a dangling separator.
 *   G6  the parser is NOT re-implemented here: the helper agrees with `parseTripDate`, the
 *       client's one date-only parser (CLAUDE.md §18 rule 1).
 *
 * Pure unit test: no DB, no browser, no React. CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { guestInviteMetaLine, GUEST_INVITE_META_SEPARATOR } = await import("../guest-invite-meta");
const { parseTripDate } = await import("../calendar-date");

const TZ = process.env.TZ ?? "(unset)";
const SEP = GUEST_INVITE_META_SEPARATOR;

/** The day part of the composed line — everything after the name and destination. */
function dayPart(line: string): string | undefined {
  const parts = line.split(SEP);
  return parts.length > 2 ? parts[2] : undefined;
}

test(`G1 a date-only event day renders as that LOCAL calendar day [TZ=${TZ}]`, () => {
  const line = guestInviteMetaLine({
    eventName: "Ceremony",
    eventDestination: "Kyoto",
    eventDate: "2026-10-10",
  });
  const expected = new Date(2026, 9, 10).toLocaleDateString();
  assert.equal(line, `Ceremony${SEP}Kyoto${SEP}${expected}`);
  assert.equal(dayPart(line), expected, "the 10th, not the 9th");
});

test(`G2 the naive parse is what we are pinning against [TZ=${TZ}]`, () => {
  // Asserts the DEFECT relationship rather than a timezone-dependent literal: wherever
  // `new Date()` disagrees with the stated day, the helper must side with the stated day.
  const naive = new Date("2026-10-10").toLocaleDateString();
  const fixed = dayPart(
    guestInviteMetaLine({ eventName: "Ceremony", eventDestination: "Kyoto", eventDate: "2026-10-10" }),
  );
  assert.equal(fixed, new Date(2026, 9, 10).toLocaleDateString());
  if (naive !== fixed) {
    assert.notEqual(naive, fixed, "this TZ reproduces the original bug");
  }
});

test(`G3 a full ISO timestamp keeps instant semantics [TZ=${TZ}]`, () => {
  const iso = "2026-10-10T23:30:00.000Z";
  assert.equal(
    dayPart(guestInviteMetaLine({ eventName: "Ceremony", eventDestination: "Kyoto", eventDate: iso })),
    new Date(iso).toLocaleDateString(),
    "an instant is unchanged — only date-only strings were shifting",
  );
});

test(`G4 an unstated day is OMITTED, never "Invalid Date" and never the epoch [TZ=${TZ}]`, () => {
  for (const missing of [undefined, null, "", "   ", "not a date"]) {
    const line = guestInviteMetaLine({
      eventName: "Ceremony",
      eventDestination: "Kyoto",
      eventDate: missing as string | null | undefined,
    });
    assert.equal(line, `Ceremony${SEP}Kyoto`, `no dangling separator for ${JSON.stringify(missing)}`);
    assert.ok(!line.includes("Invalid"), "never renders Invalid Date");
    assert.ok(!line.includes("1970"), "never renders the epoch");
  }
});

test(`G5 a blank name or destination is omitted the same way [TZ=${TZ}]`, () => {
  const expected = new Date(2026, 9, 10).toLocaleDateString();
  assert.equal(
    guestInviteMetaLine({ eventName: "Ceremony", eventDestination: "", eventDate: "2026-10-10" }),
    `Ceremony${SEP}${expected}`,
  );
  assert.equal(
    guestInviteMetaLine({ eventName: "  ", eventDestination: "  ", eventDate: "2026-10-10" }),
    expected,
  );
  assert.equal(guestInviteMetaLine({}), "", "nothing stated ⇒ nothing rendered");
});

test(`G6 the day comes from parseTripDate, not a second parser [TZ=${TZ}]`, () => {
  for (const value of ["2026-10-10", "2026-01-01", "2026-12-31", "2026-10-10T09:15:00"]) {
    assert.equal(
      dayPart(guestInviteMetaLine({ eventName: "a", eventDestination: "b", eventDate: value })),
      parseTripDate(value)!.toLocaleDateString(),
      `helper must agree with the one parser for ${value}`,
    );
  }
});
