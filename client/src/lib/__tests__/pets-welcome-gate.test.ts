/**
 * Row 187 (ledger `2026-10-30-row187-pets-welcome-gate`; Architect, Oct 30, 2026): "Pets welcome" shows on the slip's
 * stay panel ONLY when the stay carries a pet-policy fact with a source and a checked date; otherwise no mark at all.
 * No "unknown" or "Ask a local" mark. Content sourcing only — never Google Places or OTA data.
 *
 *   PW1  a fact with a source and verified_at renders the mark
 *   PW2  a fact missing the source, or verified_at, renders nothing (and Google/OTA origins and a stale fact never pass)
 *   PW3  no fact renders nothing, and no other pet text appears
 *   PW4  the 358 pets pair (the traveler's own pets) behaves exactly as on main
 *   PW5  the writer and the read: `recordFacts` admits a pet policy through the one rule, the slip's fact view
 *        carries `verifiedAt`, and the pet-policy TTL is 180 days
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/pets-welcome-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { PETS_WELCOME_LABEL, admitPetPolicyFact, petsWelcomeShown, type FactView } from "@shared/content-facts";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../components/plan/AnchorPanel";
import { partyPanelBody } from "../../components/plan/SlipAnchorPanels";
import { factTtlDays } from "../../../../server/config/content-facts.config";

(globalThis as any).React = React;

const fact = (over: Partial<FactView> = {}): FactView => ({
  factType: "pet_policy",
  need: "lodging",
  value: { petsWelcome: true },
  origin: "crawled",
  sourceUrl: "https://hotel.example.com/policies",
  provenance: "Checked 1 Oct · Source: Example Hotel",
  checkedAt: "2026-10-01T00:00:00.000Z",
  verifiedAt: "2026-10-01T00:00:00.000Z",
  stale: false,
  publishable: true,
  ...over,
});

const render = (stayFacts: FactView[] | null | undefined) =>
  renderToString(
    React.createElement(AnchorPanelView, {
      stage: "change",
      question: "Where are you staying?",
      anchorKind: "lodging",
      canChoose: true,
      lodgingSet: { id: "set-1", status: "chosen" },
      stayFacts,
    } as AnchorPanelViewProps),
  );

describe("row 187: Pets welcome gate", () => {
  it("PW1: a sourced, checked pet-policy fact renders the mark", () => {
    assert.equal(PETS_WELCOME_LABEL, "Pets welcome");
    assert.equal(petsWelcomeShown([fact()]), true);
    const html = render([fact()]);
    assert.match(html, /data-testid="where-to-stay-pets-welcome"/);
    assert.ok(html.includes("Pets welcome"));
  });

  it("PW2: missing source or checked date, a Google/OTA origin, a stale fact or a non-welcome value renders nothing", () => {
    const refused: Array<[Partial<FactView>, string]> = [
      [{ sourceUrl: null }, "no_source"],
      [{ sourceUrl: "  " }, "no_source"],
      [{ verifiedAt: null }, "not_checked"],
      [{ verifiedAt: undefined }, "not_checked"],
      [{ origin: "places_api" }, "refused_origin"],
      [{ origin: "hotel_cache" }, "refused_origin"],
      [{ value: { petsWelcome: false } }, "bad_value"],
      [{ value: {} }, "bad_value"],
    ];
    for (const [over, reason] of refused) {
      const f = fact(over);
      assert.deepEqual(admitPetPolicyFact(f), { ok: false, reason }, JSON.stringify(over));
      assert.equal(petsWelcomeShown([f]), false, JSON.stringify(over));
      assert.doesNotMatch(render([f]), /Pets welcome|where-to-stay-pets-welcome/);
    }
    assert.equal(petsWelcomeShown([fact({ stale: true })]), false);
    assert.equal(petsWelcomeShown([fact({ factType: "description" })]), false);
  });

  it("PW3: no fact renders nothing, and no other pet text appears", () => {
    for (const facts of [undefined, null, [], [fact({ factType: "hours", value: { weekdayDescriptions: [] } })]]) {
      assert.equal(petsWelcomeShown(facts as any), false);
      const html = render(facts as any);
      assert.doesNotMatch(html, /pet/i);
      assert.doesNotMatch(html, /Ask a local|not known/i);
    }
  });

  it("PW4: the traveler's pets pair (migration 358) is unchanged", () => {
    assert.equal(partyPanelBody({ adults: "", kids: "", petKind: "", petCount: "" }), null);
    assert.deepEqual(partyPanelBody({ adults: "2", kids: "", petKind: " dog ", petCount: "1" }), { adults: 2, petKind: "dog", petCount: 1 });
    assert.deepEqual(partyPanelBody({ adults: "", kids: "", petKind: "", petCount: "0" }), { petCount: 0 });
  });

  it("PW5: the writer admits through the one rule, the view carries verifiedAt, and the TTL is 180 days", () => {
    const svc = fs.readFileSync(path.resolve("server/services/content-facts/place-facts.service.ts"), "utf8");
    assert.match(svc, /d\.factType === "pet_policy"[\s\S]{0,120}admitPetPolicyFact\(d\)/);
    assert.match(svc, /verifiedAt: r\.verifiedAt \? new Date\(r\.verifiedAt as any\)\.toISOString\(\) : null/);
    assert.equal(factTtlDays("pet_policy"), 180);
  });
});
