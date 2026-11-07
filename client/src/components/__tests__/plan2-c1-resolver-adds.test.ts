/**
 * PLAN-2 Lane C1 (ledger `2026-11-06-plan2-c1-resolver-adds`): every add names its row through a PlanItemRef.
 *   R1  planItemRefFromSavedItem: the resolver's kinds are a ref; any other saved kind, or no id/city, is null
 *   R2  the slip's saved places send that ref (never a client point); a kind with no row, or an id the resolver finds no
 *       row for (unknown_source), is free text with no point
 *   R3  Saved places' "+ Trip" hands the dialog the row's id, so the dialog's own planItemRefFromFeedItem builds the ref
 *   R4  an add with no point says so: the add-checks notice ("… isn't on the map"), else A-18's approved line
 *   R5  the map's candidates: My services names its row (a listing), which the server resolves, dropping the body's
 *       point. Content library, DMO places, Google transport and the live partner feeds name no PlanItemRef kind — held
 *       for a ruling (new kinds, or free text with no point), recorded in the ledger row.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/plan2-c1-resolver-adds.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createdItemIsLocated, planItemRefFromFeedItem, planItemRefFromSavedItem } from "@shared/plan-item-ref";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PLAN-2 C1: adds go through PlanItemRef", () => {
  it("R1 a saved row → its ref", () => {
    for (const kind of ["gem", "event", "city_event", "hotel", "activity"]) {
      assert.deepEqual(planItemRefFromSavedItem({ contentType: kind, contentId: "x1", city: "Kyoto" }), {
        kind, source_id: "x1", city: "Kyoto", placement: { day_number: 1 },
      });
    }
    assert.equal(planItemRefFromSavedItem({ contentType: "service", contentId: "svc1", city: "Kyoto" })?.kind, "listing", "a saved service is its listing");
    assert.equal(planItemRefFromSavedItem({ contentType: "gem", contentId: "g1", city: null }, "Kyoto, Japan")?.city, "Kyoto", "falls back to the plan's city");
    for (const kind of ["attraction", "field_knowledge", "viator", ""]) assert.equal(planItemRefFromSavedItem({ contentType: kind, contentId: "x", city: "Kyoto" }), null, kind);
    assert.equal(planItemRefFromSavedItem({ contentType: "gem", contentId: "", city: "Kyoto" }), null);
    assert.equal(planItemRefFromSavedItem({ contentType: "gem", contentId: "g", city: null }, null), null);
    assert.equal(createdItemIsLocated({ latitude: "35.0", longitude: "135.7" }), true);
    assert.equal(createdItemIsLocated({ latitude: null, longitude: "135.7" }), false);
  });

  it("R2 the slip's saved places send the ref and no point", async () => {
    const { savedPlaceAddBody } = await import("../plancard/SlipSavedPlaces");
    const gem = savedPlaceAddBody({ id: "s1", contentType: "gem", contentId: "kyoto-gem-x", contentName: "A gem", city: "Kyoto" } as any, "Kyoto, Japan");
    assert.deepEqual((gem as any).ref, { kind: "gem", source_id: "kyoto-gem-x", city: "Kyoto", placement: { day_number: 1 } });
    const free = savedPlaceAddBody({ id: "s2", contentType: "attraction", contentId: "a1", contentName: "Somewhere", city: "Kyoto" } as any, "Kyoto, Japan");
    assert.equal("ref" in free, false);
    const fallback = savedPlaceAddBody({ id: "s3", contentType: "activity", contentId: "booking_com:9", contentName: "Partner result", city: "Kyoto" } as any, "Kyoto, Japan", { freeText: true });
    assert.equal("ref" in fallback, false, "an unknown_source fallback is free text");
    assert.match(read("client/src/components/plancard/SlipSavedPlaces.tsx"), /if \(refusal\?\.code === "unknown_source"\) \{/);
    for (const b of [gem, free, fallback]) for (const k of ["latitude", "longitude", "coordSource", "providerServiceId", "affiliateProductId"]) assert.equal(k in b, false, k);
  });

  it("R3 Saved places' + Trip hands the dialog the row id; the dialog's builder turns it into the ref", () => {
    const src = read("client/src/components/dashboard/WishlistSection.tsx");
    assert.match(src, /\.\.\.\(planItemRefFromSavedItem\(item, item\.city\) \? \{ sourceContentId: item\.contentId \} : \{\}\)/);
    assert.deepEqual(planItemRefFromFeedItem({ type: "gem", sourceContentId: "kyoto-gem-x", title: "A gem" }, "Kyoto"), { kind: "gem", source_id: "kyoto-gem-x", city: "Kyoto" });
    assert.match(read("client/src/components/add-to-experience-dialog.tsx"), /planItemRefFromFeedItem\(item,/, "the dialog builds the ref (not edited here)");
  });

  it("R4 an add with no point says so", () => {
    for (const f of ["client/src/components/plancard/SlipSavedPlaces.tsx", "client/src/components/plancard/SlipItemTools.tsx"]) {
      assert.match(read(f), /else if \(out\?\.id && !createdItemIsLocated\(out\)\) toast\(\{ title: GUEST_PLAN_COPY\.savedNotOnMap \}\);/, f);
    }
  });

  it("R5 the map's candidates name their row where one exists", () => {
    assert.match(read("client/src/components/expert/my-services-picker.tsx"), /providerServiceId: s\.id,/);
    // The server resolves a listing / partner link through the same resolver and drops the body's point (ruling 4).
    const routes = read("server/routes.ts");
    assert.match(routes, /\? \{ kind: "listing" as const, source_id: itemData\.providerServiceId as string \}/);
    assert.match(routes, /\/\/ Ruling 4: the point is the row's, never the body's\.\s*delete itemData\.latitude;\s*delete itemData\.longitude;/);
  });
});
