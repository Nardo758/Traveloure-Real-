/**
 * Row 278 (ledger `2026-10-28-guest-landing-render`): the guest invite landing renders from the
 * server's `landing` key only, is noindex, and records one view per page load.
 *
 *   GL1  every landing key that is present becomes its row, in order, with its held label
 *   GL2  an absent or blank key shows nothing: no placeholder, no "Your host"
 *   GL3  the note keeps its label only when the host's first name is known
 *   GL4  the street address shows only when the server sent it (it releases it after "accepted")
 *   GL5  the "shared after you RSVP" line needs hasVenueAddress and a guest who has not accepted;
 *        the server does not send hasVenueAddress yet (3B), so today the line never shows
 *   GL6  the page reads the details from `landing`, not the free-text destination, and the invite
 *        type carries only the guest-safe keys
 *   GL7  the page is noindex and fires POST …/view once per load
 *   GL8  never-say over the held labels
 *
 * Pure and static: no git, no ref, no database, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { guestLandingRows, landingDay } from "../guest-landing";
import { GUEST_LANDING_COPY } from "../guest-landing-copy";
import { siteNeverSayHits } from "@shared/banned-copy";

const PAGE = fs.readFileSync(path.join(process.cwd(), "client/src/pages/GuestInvitePage.tsx"), "utf8");

const FULL = {
  hostFirstName: "Maya",
  title: "Maya & Ken",
  eventDate: "2027-04-10",
  startTime: "18:30",
  timezone: "Asia/Tokyo",
  venue: "Garden House",
  area: "Kyoto",
  hostNote: "Dress for the garden.",
  rsvpBy: "2027-03-01",
};

test("GL1: every present key becomes its row, in order, with its label", () => {
  const rows = guestLandingRows(FULL, "pending");
  assert.deepEqual(rows.map((r) => r.key), ["host", "date", "time", "venue", "city", "note", "rsvpBy"]);
  assert.equal(rows[0].value, "Hosted by Maya");
  assert.equal(rows[1].label, "Date");
  assert.equal(rows[1].value, landingDay("2027-04-10"));
  assert.deepEqual(rows[2], { key: "time", label: "Time", value: "18:30 (Asia/Tokyo)" });
  assert.deepEqual(rows[3], { key: "venue", label: "Venue", value: "Garden House" });
  assert.deepEqual(rows[4], { key: "city", label: "City", value: "Kyoto" });
  assert.deepEqual(rows[5], { key: "note", label: "Note from Maya", value: "Dress for the garden." });
  assert.equal(rows[6].value, `RSVP by ${landingDay("2027-03-01")}`);
});

test("GL2: absent or blank keys show nothing", () => {
  assert.deepEqual(guestLandingRows(null, "pending"), []);
  assert.deepEqual(guestLandingRows({}, "pending"), []);
  assert.deepEqual(guestLandingRows({ hostFirstName: "  ", venue: "", eventDate: "not-a-date" }, "pending"), []);
  const timeOnly = guestLandingRows({ startTime: "09:00" }, "pending");
  assert.deepEqual(timeOnly, [{ key: "time", label: "Time", value: "09:00" }], "no zone, no parentheses");
});

test("GL3: the note's label needs the host's first name", () => {
  const rows = guestLandingRows({ hostNote: "See you there." }, "pending");
  assert.deepEqual(rows, [{ key: "note", label: undefined, value: "See you there." }]);
});

test("GL4: the street address shows only when the server sent it", () => {
  assert.equal(guestLandingRows(FULL, "accepted").some((r) => r.key === "address"), false);
  const rows = guestLandingRows({ ...FULL, venueAddress: "12 Garden Lane" }, "accepted");
  assert.deepEqual(rows.at(-1), { key: "address", value: "12 Garden Lane" });
});

test("GL5: the after-RSVP line needs hasVenueAddress and a guest who has not accepted", () => {
  assert.equal(guestLandingRows(FULL, "pending").some((r) => r.key === "addressAfterRsvp"), false, "absent today");
  const pending = guestLandingRows({ ...FULL, hasVenueAddress: true }, "pending");
  assert.deepEqual(pending.at(-1), { key: "addressAfterRsvp", value: "The address is shared after you RSVP." });
  assert.equal(guestLandingRows({ ...FULL, hasVenueAddress: true }, "accepted").some((r) => r.key === "addressAfterRsvp"), false);
  assert.equal(guestLandingRows({ ...FULL, hasVenueAddress: false }, "pending").some((r) => r.key === "addressAfterRsvp"), false);
});

test("GL6: the page renders from landing, never the free-text destination", () => {
  assert.match(PAGE, /setLanding\(data\.landing \?\? null\)/);
  assert.match(PAGE, /guestLandingRows\(landing, invite\.rsvpStatus\)/);
  assert.match(PAGE, /\{landing\?\.title && <h1/);
  const render = PAGE.slice(PAGE.indexOf("export function GuestInvitePage("));
  assert.doesNotMatch(render, /experience\.(destination|startDate|title)/, "the render reads no experience field");
  const iface = PAGE.slice(PAGE.indexOf("interface Invite {"), PAGE.indexOf("}", PAGE.indexOf("interface Invite {")));
  for (const key of ["guestEmail", "guestPhone", "organizerId"]) assert.ok(!iface.includes(key), key);
});

test("GL7: noindex, and one view beacon per page load", () => {
  assert.match(PAGE, /<SEOHead url=\{`\/invite\/\$\{token\}`\} noindex \/>/);
  assert.equal((PAGE.match(/\/view`/g) ?? []).length, 1, "one beacon call site");
  assert.match(PAGE, /fetch\(`\/api\/invites\/\$\{token\}\/view`, \{ method: 'POST' \}\)/);
  const effect = PAGE.slice(PAGE.indexOf("viewRecordedFor.current === token"), PAGE.indexOf("/view`"));
  assert.match(effect, /viewRecordedFor\.current = token;/, "the ref is set before the call, so a repeat does nothing");
});

test("GL8: never-say over the held labels", () => {
  const labels = [
    GUEST_LANDING_COPY.hostedBy("Maya"),
    GUEST_LANDING_COPY.date,
    GUEST_LANDING_COPY.time,
    GUEST_LANDING_COPY.venue,
    GUEST_LANDING_COPY.city,
    GUEST_LANDING_COPY.noteFrom("Maya"),
    GUEST_LANDING_COPY.rsvpBy("3/1/2027"),
    GUEST_LANDING_COPY.addressAfterRsvp,
  ];
  for (const l of labels) assert.deepEqual(siteNeverSayHits(l), [], l);
});
