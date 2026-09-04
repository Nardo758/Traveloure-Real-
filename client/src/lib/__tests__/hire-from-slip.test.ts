/**
 * HIRE FROM THE SLIP — what the expert picker asks for, and the four different ways it can have
 * no roles to show. Ledger `2026-09-04-hire-from-slip`; CLAUDE.md Locked Decisions 31 and 29.
 *
 * WHY THIS EXISTS. The chain slip -> event -> occasion -> `roles_needed` -> picker breaks at four
 * separate links, and every break renders the SAME way on screen: a picker with no chips. On
 * happy-path data (an occasion with a full `roles_needed`) all four bugs are invisible. The
 * dangerous one is the last: Locked Decision 31 says NULL means NOT SET and must never be read as
 * "this occasion needs nobody" — a picker that renders "no experts needed" for a NULL column is
 * making a planning claim out of a missing value.
 *
 * The other invariant held here is the honest limit: `GET /api/experts` accepts no
 * `service_categories.category_key` filter, so a role list must ALWAYS ship beside a line saying
 * the experts below are not narrowed by it, and the query params must carry destination only. A
 * silent client-side narrowing would be a filter claim the server never made.
 *
 * What these hold:
 *   H1  roles present  ⇒ the roles, the occasion-named note, AND the not-narrowed line; params
 *       carry `location` and nothing else.
 *   H2  `roles_needed` NULL (and the empty array, which Decision 31 refused as a second empty
 *       state) ⇒ no roles, "No roles suggested for this occasion.", and NO filter line.
 *   H3  the other three absences — no event, no occasion on the event, occasion not loaded — each
 *       give their OWN reason, and no two of them are the same sentence.
 *   H4  no destination ⇒ no `location` param at all, and the list says it is not narrowed to one.
 *   H5  role labels come from the catalog; the fallback is the key made readable, never invented.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/hire-from-slip.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildExpertPickerFilter,
  roleLabel,
  EXPERT_ROLE_FILTERING_SUPPORTED,
  NO_DESTINATION_NOTE,
  NO_EVENT_NOTE,
  NO_OCCASION_ON_EVENT_NOTE,
  NO_ROLES_FOR_OCCASION_NOTE,
  OCCASION_NOT_LOADED_NOTE,
  ROLE_FILTER_UNSUPPORTED_NOTE,
  type HireEvent,
  type HireOccasion,
} from "../hire-from-slip";

const WEDDING: HireOccasion = {
  id: "occ-wedding",
  name: "Wedding",
  rolesNeeded: ["florist", "photography", "caterer", "officiant"],
};
const REUNION_NULL: HireOccasion = { id: "occ-reunion", name: "Family reunion", rolesNeeded: null };
const REUNION_EMPTY: HireOccasion = { id: "occ-reunion", name: "Family reunion", rolesNeeded: [] };

const CEREMONY: HireEvent = { id: "ev-1", title: "Ceremony", experienceTypeId: "occ-wedding" };

describe("H1 — an occasion with roles", () => {
  it("returns the roles, names the occasion, and asks the server for the destination only", () => {
    const f = buildExpertPickerFilter("Kyoto", CEREMONY, [WEDDING]);
    assert.deepEqual(f.roles, ["florist", "photography", "caterer", "officiant"]);
    assert.deepEqual(f.params, { location: "Kyoto" });
    assert.match(f.rolesNote, /wedding/i);
    assert.equal(f.destinationNote, null);
  });

  it("always ships the not-narrowed line beside a role list", () => {
    const f = buildExpertPickerFilter("Kyoto", CEREMONY, [WEDDING]);
    assert.equal(f.roleFilterNote, ROLE_FILTER_UNSUPPORTED_NOTE);
    // The whole reason the line exists: the read has no category filter to send.
    assert.equal(EXPERT_ROLE_FILTERING_SUPPORTED, false);
    assert.deepEqual(Object.keys(f.params), ["location"]);
  });
});

describe("H2 — roles_needed NULL is NOT SET, never 'needs nobody'", () => {
  it("gives no roles and says only that none are suggested", () => {
    const f = buildExpertPickerFilter("Kyoto", { ...CEREMONY, experienceTypeId: "occ-reunion" }, [
      REUNION_NULL,
    ]);
    assert.equal(f.roles, null);
    assert.equal(f.rolesNote, NO_ROLES_FOR_OCCASION_NOTE);
    // No claim about what the occasion does or does not need.
    assert.doesNotMatch(f.rolesNote, /nobody|no experts|not needed|none needed/i);
  });

  it("offers the picker anyway — no roles is not a reason to refuse to hire", () => {
    const f = buildExpertPickerFilter("Kyoto", { ...CEREMONY, experienceTypeId: "occ-reunion" }, [
      REUNION_NULL,
    ]);
    assert.deepEqual(f.params, { location: "Kyoto" });
    // With no roles on screen there is nothing for the filter line to qualify.
    assert.equal(f.roleFilterNote, null);
  });

  it("treats the empty array identically — Decision 31 refused it as a second empty state", () => {
    const a = buildExpertPickerFilter("Kyoto", { ...CEREMONY, experienceTypeId: "occ-reunion" }, [
      REUNION_NULL,
    ]);
    const b = buildExpertPickerFilter("Kyoto", { ...CEREMONY, experienceTypeId: "occ-reunion" }, [
      REUNION_EMPTY,
    ]);
    assert.deepEqual(b, a);
  });
});

describe("H3 — the other three absences each say their own reason", () => {
  it("no event (the plan's implicit unnamed event)", () => {
    const f = buildExpertPickerFilter("Kyoto", null, [WEDDING]);
    assert.equal(f.roles, null);
    assert.equal(f.rolesNote, NO_EVENT_NOTE);
  });

  it("an event that names no occasion", () => {
    const f = buildExpertPickerFilter("Kyoto", { id: "ev-2", experienceTypeId: null }, [WEDDING]);
    assert.equal(f.roles, null);
    assert.equal(f.rolesNote, NO_OCCASION_ON_EVENT_NOTE);
  });

  it("an occasion id whose row is not in hand — never read as 'no roles'", () => {
    const f = buildExpertPickerFilter("Kyoto", CEREMONY, []);
    assert.equal(f.roles, null);
    assert.equal(f.rolesNote, OCCASION_NOT_LOADED_NOTE);
    assert.notEqual(f.rolesNote, NO_ROLES_FOR_OCCASION_NOTE);
  });

  it("all four reasons are distinct sentences", () => {
    const notes = new Set([
      NO_EVENT_NOTE,
      NO_OCCASION_ON_EVENT_NOTE,
      OCCASION_NOT_LOADED_NOTE,
      NO_ROLES_FOR_OCCASION_NOTE,
    ]);
    assert.equal(notes.size, 4);
  });
});

describe("H4 — a plan with no destination", () => {
  it("sends no location param and says the list is not narrowed", () => {
    for (const d of [null, undefined, "", "   "]) {
      const f = buildExpertPickerFilter(d, CEREMONY, [WEDDING]);
      assert.deepEqual(f.params, {});
      assert.equal(f.destinationNote, NO_DESTINATION_NOTE);
      // The roles still show — the two absences are independent.
      assert.deepEqual(f.roles, ["florist", "photography", "caterer", "officiant"]);
    }
  });
});

describe("H5 — role labels come from the catalog", () => {
  const cats = [
    { categoryKey: "photography", name: "Photography" },
    { categoryKey: "private_chef", name: "Private Chef" },
  ];

  it("uses the catalog's own name when it has one", () => {
    assert.equal(roleLabel("private_chef", cats), "Private Chef");
  });

  it("falls back to the key made readable, never a nicer invented name", () => {
    assert.equal(roleLabel("hair_makeup", cats), "hair makeup");
    assert.equal(roleLabel("hair_makeup", null), "hair makeup");
  });
});
