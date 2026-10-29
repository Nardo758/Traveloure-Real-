/**
 * Ledger `2026-10-29-rsvp-accommodation-by-answer`: the guest RSVP body asks about accommodation
 * only of a guest who is coming.
 *
 *   A1  "maybe" and "declined" parse with no accommodation, or with it null
 *   A2  "accepted" with no accommodation (absent, null or "") is refused, naming the field
 *   A3  "maybe"/"declined" carrying an accommodation value is refused, naming the field
 *   A4  the stored values carry accommodationPreference only for "accepted"; for any other
 *       answer the key is absent, so the stored column is never written
 *   A5  the route parses through this schema and writes through rsvpUpdateValues; storage takes
 *       the key as optional; the page sends it only for a yes and stops a yes with no choice
 *
 * Pure: no database, no network, no git.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { rsvpSchema, rsvpUpdateValues } from "../services/guest-rsvp-body";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const fieldIssues = (body: unknown) => {
  const r = rsvpSchema.safeParse(body);
  return r.success ? null : r.error.errors.map((e) => e.path.join("."));
};

test("A1 maybe and declined parse with no accommodation, or with it null", () => {
  for (const rsvpStatus of ["maybe", "declined"]) {
    assert.equal(fieldIssues({ rsvpStatus }), null, rsvpStatus);
    assert.equal(fieldIssues({ rsvpStatus, accommodationPreference: null }), null, rsvpStatus);
    assert.equal(fieldIssues({ rsvpStatus, numberOfGuests: 2, message: "Sorry!" }), null, rsvpStatus);
  }
});

test("A2 accepted without accommodation is refused, naming the field", () => {
  for (const body of [{ rsvpStatus: "accepted" }, { rsvpStatus: "accepted", accommodationPreference: null }]) {
    assert.deepEqual(fieldIssues(body), ["accommodationPreference"]);
  }
  assert.deepEqual(fieldIssues({ rsvpStatus: "accepted", accommodationPreference: "" }), ["accommodationPreference"]);
  assert.equal(fieldIssues({ rsvpStatus: "accepted", accommodationPreference: "own_booking" }), null);
});

test("A3 maybe or declined carrying an accommodation value is refused, naming the field", () => {
  for (const rsvpStatus of ["maybe", "declined"]) {
    assert.deepEqual(fieldIssues({ rsvpStatus, accommodationPreference: "hotel_block" }), ["accommodationPreference"]);
  }
});

test("A4 accommodation is stored only for accepted", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const yes = rsvpUpdateValues(rsvpSchema.parse({ rsvpStatus: "accepted", accommodationPreference: "with_family" }), now);
  assert.equal(yes.accommodationPreference, "with_family");
  for (const rsvpStatus of ["maybe", "declined"]) {
    const values = rsvpUpdateValues(rsvpSchema.parse({ rsvpStatus }), now);
    assert.equal("accommodationPreference" in values, false, rsvpStatus);
    assert.equal(values.rsvpStatus, rsvpStatus);
    assert.equal(values.numberOfGuests, 1);
  }
  assert.ok(!JSON.stringify(rsvpUpdateValues(rsvpSchema.parse({ rsvpStatus: "maybe" }), now)).includes("undecided"));
});

test("A5 the route, storage and page use this rule", () => {
  const route = read("server/routes/guest-invites.ts");
  assert.match(route, /rsvpSchema\.safeParse\(req\.body\)/);
  assert.match(route, /storage\.updateInviteRsvp\(token, rsvpUpdateValues\(validation\.data\)\)/);
  assert.doesNotMatch(route, /accommodationPreference \|\| "undecided"/);
  assert.doesNotMatch(route, /const rsvpSchema/);
  assert.match(read("server/storage.ts"), /accommodationPreference\?: string;\n\s+transportationNeeded: boolean;/);
  const page = read("client/src/pages/GuestInvitePage.tsx");
  assert.match(page, /\.\.\.\(rsvpStatus === 'accepted' \? \{ accommodationPreference \} : \{\}\)/);
  const submit = page.slice(page.indexOf("async function handleSubmitRsvp()"), page.indexOf("fetch(`/api/invites/${token}/rsvp`"));
  assert.match(submit, /if \(rsvpStatus === 'accepted' && !accommodationPreference\) \{\s+setAccommodationMissing\(true\);[\s\S]*?return;/);
  assert.match(page, /aria-invalid=\{accommodationMissing \|\| undefined\}/);
});
