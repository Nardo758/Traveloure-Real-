/**
 * CN-1a-UI (ledger `2026-11-01-cn1a-ui-listing-type`): the expert listing form's type choice.
 *
 *   T1  a local_expert's concierge choice is sent as serviceType "concierge"
 *   T2  a new listing starts as planning and a planning choice is sent as planning
 *   T3  an edit that leaves the type alone sends back the stored type, so it never flips
 *   T4  local_expert sees the live-support tier and the concierge choice; the choice reads CN-1's held keys
 *   T5  a provider listing sends no type at all
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/cn1a-listing-type.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CN1_COPY } from "@shared/cn1-copy";
import { DEFAULT_LISTING_TYPE, LISTING_TYPE_CHOICES, listingTypeFromStored, listingTypePayload } from "../listing-type";
import { LOCAL_EXPERT_TIERS } from "../earn-roles";

const form = readFileSync("client/src/components/ServiceForm.tsx", "utf8");

describe("CN-1a-UI: listing type choice", () => {
  it("T1 a concierge choice is sent as concierge", () => {
    assert.deepEqual(listingTypePayload("expert", "concierge"), { serviceType: "concierge" });
  });

  it("T2 a new listing starts as planning, and planning is sent as planning", () => {
    assert.equal(DEFAULT_LISTING_TYPE, "planning");
    assert.match(form, /serviceType: DEFAULT_LISTING_TYPE,/);
    assert.deepEqual(listingTypePayload("expert", DEFAULT_LISTING_TYPE), { serviceType: "planning" });
  });

  it("T3 an untouched edit sends back the stored type", () => {
    for (const stored of ["concierge", "planning"]) {
      assert.deepEqual(listingTypePayload("expert", listingTypeFromStored(stored)), { serviceType: stored });
    }
    assert.equal(listingTypeFromStored(null), "planning");
    assert.equal(listingTypeFromStored(""), "planning");
    assert.match(form, /serviceType: listingTypeFromStored\(s\.serviceType\),/);
  });

  it("T4 local_expert sees live support and the concierge choice, labelled from CN-1's keys", () => {
    assert.ok((LOCAL_EXPERT_TIERS as readonly string[]).includes("live_support"));
    assert.deepEqual(
      LISTING_TYPE_CHOICES.map((c) => [c.value, c.label]),
      [["planning", CN1_COPY.listingTypePlanning], ["concierge", CN1_COPY.listingTypeConcierge]],
    );
    // The choice renders for every expert-family listing (the form's `expert` role), local_expert included.
    assert.match(form, /\{role === "expert" \? \(\s*<div data-testid="listing-type-choice">/);
    assert.match(form, /Object\.assign\(payload, listingTypePayload\(role, formData\.serviceType\)\)/);
    // No literal copy of the two labels in the form.
    assert.equal(form.includes(CN1_COPY.listingTypeConcierge), false);
    assert.equal(form.includes(CN1_COPY.listingTypePlanning), false);
  });

  it("T5 a provider listing sends no type", () => {
    assert.deepEqual(listingTypePayload("provider", "concierge"), {});
  });
});
