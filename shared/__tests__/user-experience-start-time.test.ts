/**
 * user-experience-start-time.test.ts — an EVENT'S OWN wall-clock time.
 * Migration 282, ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 35.
 *
 * WHAT IS BEING PROVED. `user_experiences.start_time` carries NO DB CHECK (publish-trap posture),
 * so `userExperienceStartTimeSchema` in shared/schema.ts is the ONLY thing standing between the
 * wire and the row. These assertions run against that REAL exported artifact and against the real
 * `insertUserExperienceSchema` it narrows — never a copy reconstructed here, which is the failure
 * the user-experience mass-assignment suite calls out (a copy keeps passing while the route drifts).
 *
 * WHY THE ROUTE'S OWN `userExperienceBodySchema` IS NOT IMPORTED HERE. It lives in
 * `server/routes/content.routes.ts`, which transitively imports `server/db.ts`, and that module
 * THROWS at import time when `DATABASE_URL` is unset — i.e. in the DB-free lane CI runs unit tests
 * in. So the route's wiring is asserted the way this codebase already asserts route wiring without
 * booting it: by reading the source text (the `D5` technique in
 * server/routes/__tests__/user-experience-mass-assignment.test.ts). That is a weaker proof than an
 * import and is stated as such rather than dressed up.
 *
 *   S1  the schema admits a wall-clock "HH:MM"
 *   S2  it admits an explicit null — that is how a traveler CLEARS a time
 *   S3  it admits absence — "not mentioned" stays a different answer from "cleared"
 *   S4  it refuses "3pm", "1500", "5:00", a number, and an empty string
 *   S5  RANGE IS DELIBERATELY NOT VALIDATED — "25:00" parses, and this test pins that choice
 *   S6  the column is pickable off the real insert schema, and the pick strips unknown keys
 *   S7  the route's ONE shared allowlist names startTime and narrows it with the shared authority
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import { insertUserExperienceSchema, userExperienceStartTimeSchema } from "../schema";

test("S1: a wall-clock HH:MM is admitted, verbatim", () => {
  for (const value of ["15:00", "07:40", "00:00", "19:30"]) {
    const parsed = userExperienceStartTimeSchema.parse(value);
    assert.equal(parsed, value, "the string is stored exactly as entered — never converted");
  }
});

test("S2: an explicit null is admitted — that is how a set time gets cleared", () => {
  assert.equal(userExperienceStartTimeSchema.parse(null), null);
});

test("S3: absence is admitted, and stays distinct from null", () => {
  assert.equal(userExperienceStartTimeSchema.parse(undefined), undefined);
  // The two are different answers and must not be collapsed: absent means the caller never
  // mentioned the field (under the PATCH's .partial(), leave it alone); null means clear it.
  assert.notEqual(userExperienceStartTimeSchema.parse(undefined), null);
});

test("S4: anything that is not HH:MM is refused", () => {
  for (const value of ["3pm", "1500", "5:00", "15:00:00", "", "  ", 900, true, {}]) {
    assert.equal(
      userExperienceStartTimeSchema.safeParse(value as unknown).success,
      false,
      `${JSON.stringify(value)} must be refused`,
    );
  }
});

test("S5: range is NOT validated — the schema is a SHAPE check, and this pins that choice", () => {
  // "25:00" and "07:99" are well-formed and meaningless. They parse ON PURPOSE: nothing in this
  // lane reads or does arithmetic on the value, and a range rule invented by an admission schema
  // becomes a second authority the day a real time model arrives. When a reader needs one it
  // belongs with that reader, stated once. If that changes, this assertion is the thing to update
  // deliberately rather than a silent tightening nobody notices.
  assert.equal(userExperienceStartTimeSchema.safeParse("25:00").success, true);
  assert.equal(userExperienceStartTimeSchema.safeParse("07:99").success, true);
});

test("S6: startTime is pickable off the real insert schema, and the pick strips unknown keys", () => {
  const picked = insertUserExperienceSchema
    .pick({ title: true, startTime: true })
    .extend({ startTime: userExperienceStartTimeSchema });

  const parsed = picked.parse({
    title: "Ceremony",
    startTime: "15:00",
    userId: "victim-user-id",
    trackingNumber: "TRV-0001",
  } as Record<string, unknown>);

  assert.equal(parsed.startTime, "15:00");
  assert.equal((parsed as Record<string, unknown>).userId, undefined, "an allowlist admits nothing it did not name");
  assert.equal((parsed as Record<string, unknown>).trackingNumber, undefined);
});

test("S7: the route's ONE shared allowlist names startTime and narrows it with the shared authority", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  const start = src.indexOf("export const userExperienceBodySchema");
  assert.ok(start >= 0, "the shared user-experience allowlist must be locatable");
  const block = src.slice(start, src.indexOf('router.post("/api/user-experiences"', start));

  assert.match(block, /startTime:\s*true/, "startTime must be admitted through the SHARED pick, not a second rail");
  assert.match(
    block,
    /startTime:\s*userExperienceStartTimeSchema/,
    "the route must narrow with the shared format authority, never a re-stated regex (§18 rule 1)",
  );
  assert.doesNotMatch(
    block,
    /\\d\{2\}\s*:\s*\\d\{2\}/,
    "a second copy of the HH:MM regex in the route is the drift this pins against",
  );
});
