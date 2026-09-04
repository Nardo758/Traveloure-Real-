/**
 * EVENT ORDER — the two readers of a plan's events agree, and the order is chronological.
 * Ledger `2026-09-04-event-order`. Decision-maker ratified Sep 4, 2026.
 *
 * WHY THIS EXISTS. `which-event.ts` rule 5 puts ordering deliberately in the SERVER's hands, so
 * that a plan's events have ONE order rather than one per surface. That held on the client and
 * failed on the server: `getUserExperiencesByTrip` (the plancard DTO → the slip's event grouping)
 * was already `event_date ASC NULLS LAST, created_at ASC`, while `getUserExperiences`
 * (`/api/user-experiences` → the which-event picker) was `created_at DESC`. The same events
 * rendered in two orders on two surfaces of the same plan.
 *
 * "The server owns ordering" is only one authority if the server has ONE answer, so these pin that
 * both readers issue the same ORDER BY. They read `server/storage.ts` as TEXT: importing it pulls
 * in the DB client, and the claim under test is about the query the file issues, not about a live
 * database.
 *
 *   O1  `getUserExperiences` orders by `event_date ASC NULLS LAST`, then `start_time ASC NULLS
 *       LAST`, then `created_at ASC`.
 *   O2  `getUserExperiencesByTrip` issues the SAME order — the two cannot drift apart.
 *   O3  neither reader orders by `created_at DESC` any more; and `which-event.ts` still does not
 *       sort, so the client has not quietly become a second authority.
 *   O4  the CLOCK is a TIE-BREAK, in the right place and in the right direction (ledger
 *       `2026-09-04-event-time-ui`, migration 282): it comes AFTER the date and BEFORE
 *       `created_at`, and it is NULLS LAST.
 *
 * Run: npx tsx --test server/__tests__/user-experience-order.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORAGE = path.resolve(HERE, "../storage.ts");
const WHICH_EVENT = path.resolve(HERE, "../../client/src/lib/which-event.ts");

const storage = readFileSync(STORAGE, "utf8");

/** The body of one async method on the storage class, up to its closing brace at method indent. */
function methodBody(name: string): string {
  const start = storage.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `method ${name} not found in server/storage.ts`);
  const end = storage.indexOf("\n  }", start);
  assert.notEqual(end, -1, `could not find the end of ${name}`);
  return storage.slice(start, end);
}

/**
 * The canonical ORDER BY, as a source pattern. Comments are allowed BETWEEN the clauses (the
 * `start_time` clause carries its rationale inline), so the gaps are `[\s\S]*?` rather than
 * `\s*` — a lazy any-run, which still cannot match a fourth `.orderBy` argument slipping in
 * between two of these because each named clause must follow the previous one in order.
 */
const CANONICAL =
  /\.orderBy\([\s\S]*?sql`\$\{userExperiences\.eventDate\} ASC NULLS LAST`[\s\S]*?sql`\$\{userExperiences\.startTime\} ASC NULLS LAST`[\s\S]*?asc\(userExperiences\.createdAt\)[\s\S]*?\)/;

describe("a plan's events have ONE canonical order", () => {
  it("O1 getUserExperiences orders event_date, then start_time, then created_at — all ASC", () => {
    assert.match(methodBody("getUserExperiences"), CANONICAL);
  });

  it("O2 getUserExperiencesByTrip issues the SAME order", () => {
    assert.match(methodBody("getUserExperiencesByTrip"), CANONICAL);
  });

  it("O3 neither reader is created_at DESC, and the client still does not sort", () => {
    for (const name of ["getUserExperiences", "getUserExperiencesByTrip"]) {
      assert.ok(
        !/desc\(userExperiences\.createdAt\)/.test(methodBody(name)),
        `${name} still orders by created_at DESC — the two surfaces would disagree again`,
      );
    }
    // Rule 5: ordering is the server's. A sort here would make the module a second authority.
    const whichEvent = readFileSync(WHICH_EVENT, "utf8");
    assert.ok(
      !/\.sort\(/.test(whichEvent),
      "which-event.ts now sorts — that makes the client a second ordering authority (§18 rule 1)",
    );
  });

  /**
   * O4 — THE CLOCK IS A TIE-BREAK, NOT A SORT KEY IN ITS OWN RIGHT.
   *
   * Migration 282 gave an event a `start_time`, and the ratified WhichEvent/TravelEvents artboards
   * read a day's events in clock order (the tee times). Two things could go wrong and both look
   * fine on a happy-path render, so both are pinned:
   *
   *  · PLACEMENT. `start_time` BEFORE `event_date` would sort a whole plan by hour and interleave
   *    its days — Sunday's 08:30 round ahead of Friday's 10:20 one. It must sit between the date
   *    and `created_at`.
   *  · DIRECTION. NULLS LAST, for the same reason the date has it: an event with NO time stated has
   *    not claimed a slot in the day's sequence (§13, Locked Decision 35 — NULL is not midnight),
   *    so it sorts after the ones that have rather than leading the day on a NULL.
   */
  it("O4 the clock sorts AFTER the date, BEFORE created_at, and NULLS LAST", () => {
    for (const name of ["getUserExperiences", "getUserExperiencesByTrip"]) {
      const body = methodBody(name);
      const date = body.indexOf("${userExperiences.eventDate} ASC NULLS LAST");
      const time = body.indexOf("${userExperiences.startTime} ASC NULLS LAST");
      const created = body.indexOf("asc(userExperiences.createdAt)");
      assert.notEqual(time, -1, `${name} does not order by start_time at all`);
      assert.ok(date < time, `${name} sorts by the clock BEFORE the day — days would interleave`);
      assert.ok(time < created, `${name} sorts by created_at before the clock`);
      // NULL is not midnight: an event with no time may not lead the day.
      assert.doesNotMatch(
        body,
        /\$\{userExperiences\.startTime\}\s+ASC\s+NULLS\s+FIRST/,
        `${name} puts untimed events FIRST — a NULL start_time is "not set", not 00:00 (§13)`,
      );
      assert.doesNotMatch(
        body,
        /\$\{userExperiences\.startTime\}\s+DESC/,
        `${name} reads the day backwards`,
      );
    }
  });
});
