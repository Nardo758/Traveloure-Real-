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
 *   O1  `getUserExperiences` orders by `event_date ASC NULLS LAST` then `created_at ASC`.
 *   O2  `getUserExperiencesByTrip` issues the SAME order — the two cannot drift apart.
 *   O3  neither reader orders by `created_at DESC` any more; and `which-event.ts` still does not
 *       sort, so the client has not quietly become a second authority.
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

const CANONICAL = /\.orderBy\(\s*sql`\$\{userExperiences\.eventDate\} ASC NULLS LAST`\s*,\s*asc\(userExperiences\.createdAt\)\s*\)/;

describe("a plan's events have ONE canonical order", () => {
  it("O1 getUserExperiences orders event_date ASC NULLS LAST, then created_at ASC", () => {
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
});
