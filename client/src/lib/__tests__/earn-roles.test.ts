/**
 * Role-config completeness gate (earn-page role-to-offering redesign brief):
 * every service_offering_type category and every expert_offering_type row must
 * map to EXACTLY one role card — none orphaned, none double-shown.
 *
 * The config partitions by complement, so the properties asserted here are
 * structural: tier sets are disjoint and cover the canonical tier list; the
 * event category set has no duplicates; the mapping functions are total and
 * mutually exclusive over arbitrary inputs.
 *
 * The expert side gained a SECOND partition step with ledger
 * `2026-09-04-earn-planner-roles` (CLAUDE.md Locked Decision 36): the six
 * planner keys are checked BEFORE the tier, because they live inside the
 * existing `coordination` tier (no new tier — that column carries a DB CHECK).
 * Totality therefore has to be re-proved over (tier, key) pairs, not tiers
 * alone, and the key branch must be the one that wins.
 *
 * Run: npx tsx --test client/src/lib/__tests__/earn-roles.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isAffiliateCategory,
  EXPERT_TIERS,
  EVENT_CATEGORY_KEYS,
  EVENT_PLANNER_OFFERING_KEYS,
  TRIP_PLANNER_TIERS,
  LOCAL_EXPERT_TIERS,
  EARN_ROLES,
  isEventPlannerOfferingKey,
  roleForProviderCategory,
  roleForExpertOffering,
  roleForExpertTier,
} from "../earn-roles";

describe("expert tier partition", () => {
  it("trip_planner + local_expert tiers are disjoint", () => {
    for (const t of TRIP_PLANNER_TIERS) {
      assert.ok(!LOCAL_EXPERT_TIERS.includes(t), `tier ${t} appears in both roles`);
    }
  });

  it("every canonical tier maps to exactly one role", () => {
    for (const t of EXPERT_TIERS) {
      const inTrip = TRIP_PLANNER_TIERS.includes(t);
      const inLocal = LOCAL_EXPERT_TIERS.includes(t);
      assert.ok(inTrip !== inLocal, `tier ${t} must be in exactly one role (trip=${inTrip}, local=${inLocal})`);
      assert.equal(roleForExpertTier(t), inTrip ? "trip_planner" : "local_expert");
    }
  });

  it("no tier is orphaned (union covers EXPERT_TIERS)", () => {
    const union = new Set([...TRIP_PLANNER_TIERS, ...LOCAL_EXPERT_TIERS]);
    assert.equal(union.size, EXPERT_TIERS.length);
    for (const t of EXPERT_TIERS) assert.ok(union.has(t), `tier ${t} orphaned`);
  });
});

describe("expert tier membership (ledger 2026-09-04-earn-planner-roles, decision 4)", () => {
  it("specialized sits with Trip Planner, not Local Expert", () => {
    // The specialist consults — relocation, pet travel, content-creator location
    // scouting, corporate/incentive advice — are paid planning engagements for
    // people who may hold no claim on the city at all. Routing them to Local
    // Expert put them in front of a wizard whose REQUIRED steps are a locality
    // proof, a born-and-raised claim and a three-answer knowledge test.
    assert.ok(TRIP_PLANNER_TIERS.includes("specialized"));
    assert.ok(!LOCAL_EXPERT_TIERS.includes("specialized"));
    assert.equal(roleForExpertTier("specialized"), "trip_planner");
  });

  it("Local Expert keeps exactly advisory + live_support", () => {
    assert.deepEqual([...LOCAL_EXPERT_TIERS].sort(), ["advisory", "live_support"]);
  });

  it("Trip Planner keeps exactly planning + coordination + specialized", () => {
    assert.deepEqual([...TRIP_PLANNER_TIERS].sort(), ["coordination", "planning", "specialized"]);
  });
});

describe("event-planner key partition (ledger 2026-09-04-earn-planner-roles)", () => {
  it("the six planner keys are unique", () => {
    assert.equal(new Set(EVENT_PLANNER_OFFERING_KEYS).size, EVENT_PLANNER_OFFERING_KEYS.length);
    assert.equal(EVENT_PLANNER_OFFERING_KEYS.length, 6);
  });

  it("the key branch is checked BEFORE the tier and wins", () => {
    // Every planner row is seeded into `coordination` (migration 283), which maps
    // to trip_planner on tier alone. If the key branch did not run first, all six
    // would render on the Trip Planner card.
    for (const k of EVENT_PLANNER_OFFERING_KEYS) {
      assert.equal(roleForExpertTier("coordination"), "trip_planner");
      assert.equal(roleForExpertOffering("coordination", k), "event_planner");
    }
  });

  it("a planner key wins from ANY tier — the list is the rule, not the tier", () => {
    for (const t of EXPERT_TIERS) {
      assert.equal(roleForExpertOffering(t, "wedding_planner"), "event_planner");
    }
  });

  it("a non-planner coordination row is untouched — this is a split, not a move", () => {
    for (const k of ["done_for_you_booking", "group_trip_coord", "reservation_lifeline", "vendor_wrangler", "occasion_coordination"]) {
      assert.equal(roleForExpertOffering("coordination", k), "trip_planner");
      assert.ok(!isEventPlannerOfferingKey(k));
    }
  });

  it("omitting the key reproduces the tier-only answer exactly (no behaviour change for callers that hold no key)", () => {
    for (const t of EXPERT_TIERS) {
      assert.equal(roleForExpertOffering(t), roleForExpertTier(t));
    }
  });

  it("roleForExpertOffering is total over (tier, arbitrary key) pairs", () => {
    const roles = new Set(EARN_ROLES.map((r) => r.key));
    for (const t of EXPERT_TIERS) {
      for (const k of ["", "some_future_offering", "wedding_planner", "ask_me_anything"]) {
        const r = roleForExpertOffering(t, k);
        assert.ok(roles.has(r), `(${t}, ${k}) resolved to ${r}, which is not a card`);
      }
    }
  });

  it("the planner keys are EXPERT-catalog keys, and collide with provider keys only by design", () => {
    // `expert_offering_types` and `service_offering_types` are separate tables with
    // separate UNIQUE(offering_type_key) constraints (§4 — never merged), so three
    // of the six deliberately share a spelling with a provider row. The two sides
    // are told apart by which CATALOG a row came from, never by its key.
    for (const shared of ["proposal_planner", "party_planner", "date_night_designer"]) {
      assert.ok(isEventPlannerOfferingKey(shared));
      // The provider-side mapping is keyed on CATEGORY and never sees these at all.
      assert.equal(roleForProviderCategory("event_coordinator"), "event_planner");
    }
  });

  it("an event-planner key never resolves through the provider category mapping", () => {
    for (const k of EVENT_PLANNER_OFFERING_KEYS) {
      // Offering keys are not category keys; passing one to the category mapper is
      // a category it has never heard of, so the complement rule applies.
      assert.equal(roleForProviderCategory(k), "service_provider");
    }
  });
});

describe("provider category partition", () => {
  it("event category keys are unique", () => {
    assert.equal(new Set(EVENT_CATEGORY_KEYS).size, EVENT_CATEGORY_KEYS.length);
  });

  it("mapping is total and exclusive: event keys → event_planner, all others → service_provider", () => {
    for (const k of EVENT_CATEGORY_KEYS) {
      assert.equal(roleForProviderCategory(k), "event_planner");
    }
    // Complement rule: any category not in the event set — including ones
    // added to the catalog later — lands on service_provider, never orphaned.
    for (const k of ["photography", "tour_guide", "childcare_family", "some_future_category"]) {
      assert.equal(roleForProviderCategory(k), "service_provider");
    }
  });
});

describe("affiliate exclusion", () => {
  it("aff_* categories are excluded from the role mapping (partner inventory, not supply roles)", () => {
    for (const k of ["aff_activities", "aff_events", "aff_ground_transport", "aff_air_hotel"]) {
      assert.ok(isAffiliateCategory(k), `${k} must be excluded`);
    }
    assert.ok(!isAffiliateCategory("photography"));
    assert.ok(!isAffiliateCategory("event_coordinator"));
  });
});

describe("role definitions", () => {
  it("exactly four cards, two per track", () => {
    assert.equal(EARN_ROLES.length, 4);
    assert.equal(EARN_ROLES.filter((r) => r.track === "in-person").length, 2);
    assert.equal(EARN_ROLES.filter((r) => r.track === "remote").length, 2);
  });

  it("role keys are unique and every mapping target exists", () => {
    const keys = new Set(EARN_ROLES.map((r) => r.key));
    assert.equal(keys.size, 4);
    assert.ok(keys.has(roleForProviderCategory("photography")));
    assert.ok(keys.has(roleForProviderCategory("event_coordinator")));
    for (const t of EXPERT_TIERS) assert.ok(keys.has(roleForExpertTier(t)));
  });
});
