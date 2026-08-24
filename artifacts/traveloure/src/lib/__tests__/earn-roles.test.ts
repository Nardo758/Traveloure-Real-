/**
 * Role-config completeness gate (earn-page role-to-offering redesign brief):
 * every service_offering_type category and every expert_offering_type tier
 * must map to EXACTLY one role card — none orphaned, none double-shown.
 *
 * The config partitions by complement, so the properties asserted here are
 * structural: tier sets are disjoint and cover the canonical tier list; the
 * event category set has no duplicates; the mapping functions are total and
 * mutually exclusive over arbitrary inputs.
 *
 * Run: npx tsx --test client/src/lib/__tests__/earn-roles.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isAffiliateCategory,
  EXPERT_TIERS,
  EVENT_CATEGORY_KEYS,
  TRIP_PLANNER_TIERS,
  LOCAL_EXPERT_TIERS,
  EARN_ROLES,
  roleForProviderCategory,
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
