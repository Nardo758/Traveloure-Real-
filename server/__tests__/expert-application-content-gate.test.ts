/**
 * CC-5 pin: insertLocalExpertFormSchema must reject a near-empty application (the `{}` body
 * exploit — every field on the table was independently optional, so an empty POST created a
 * fully-valid PENDING row and could flood the admin review queue) while still accepting every
 * shape the real client (client/src/pages/travel-experts.tsx) and existing regression fixtures
 * actually send.
 *
 * Pure zod parse, no DB/network required. Run with:
 *   npx tsx --test server/__tests__/expert-application-content-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertLocalExpertFormSchema } from "@shared/schema";

describe("insertLocalExpertFormSchema — minimum-content gate (CC-5)", () => {
  it("rejects a bare {} body", () => {
    assert.throws(() => insertLocalExpertFormSchema.parse({}));
  });

  it("rejects expertType-only with no other content", () => {
    assert.throws(() => insertLocalExpertFormSchema.parse({ expertType: "travel_expert" }));
  });

  it("rejects a body with expertType + city but no country and no expertise content", () => {
    assert.throws(() => insertLocalExpertFormSchema.parse({ expertType: "local_expert", city: "Kyoto" }));
  });

  it("accepts the REAL default-flow (travel_expert) client payload shape", () => {
    // Mirrors travel-experts.tsx's applicationData for the default flow: destinations/
    // specialties/experienceTypes are populated; city/country may or may not be filled in
    // (canProceed() never gates on either for this flow).
    const payload = {
      expertType: "travel_expert",
      firstName: "Jamie",
      lastName: "Doe",
      email: "jamie@example.com",
      phone: "+1 555 0100",
      country: "",
      city: "",
      destinations: ["Paris"],
      specialties: ["Food & Wine"],
      languages: ["English"],
      experienceTypes: ["exp-1"],
    };
    assert.doesNotThrow(() => insertLocalExpertFormSchema.parse(payload));
  });

  it("accepts the REAL local_expert-flow client payload shape (localSpecialties, no destinations/specialties/experienceTypes)", () => {
    // The local_expert flow's steps NEVER populate destinations/specialties/experienceTypes —
    // only localSpecialties (gated by canProceed() step 4). A gate that required the three
    // default-flow arrays would reject every real local_expert submission.
    const payload = {
      expertType: "local_expert",
      firstName: "Jamie",
      lastName: "Doe",
      email: "jamie@example.com",
      phone: "+1 555 0100",
      city: "Kyoto",
      country: "Japan",
      destinations: [],
      specialties: [],
      experienceTypes: [],
      localSpecialties: ["hidden temples"],
      neighborhoods: ["Gion"],
      knowledgeProofAnswers: [{ question: "Q1", answer: "a real fifty-plus word answer ..." }],
    };
    assert.doesNotThrow(() => insertLocalExpertFormSchema.parse(payload));
  });

  it("accepts the existing regression fixtures' minimal city+country payload (N11 / K1)", () => {
    // journey-suite-negatives.http.test.ts (N11) and console-sigma-kyoto-bench.http.test.ts
    // (K1) both submit exactly this shape — city+country+expertType, no expertise arrays —
    // and expect a 201. city+country-together is a deliberate alternative satisfying
    // condition so those fixtures keep passing.
    const payload = {
      firstName: "Neg",
      lastName: "Applicant",
      email: "neg@example.com",
      city: "Kyoto",
      country: "Japan",
      expertType: "local_expert",
    };
    assert.doesNotThrow(() => insertLocalExpertFormSchema.parse(payload));
  });

  it("rejects city-without-country and country-without-city when no expertise content is present", () => {
    assert.throws(() =>
      insertLocalExpertFormSchema.parse({ expertType: "travel_expert", city: "Paris" }),
    );
    assert.throws(() =>
      insertLocalExpertFormSchema.parse({ expertType: "travel_expert", country: "France" }),
    );
  });

  it("still rejects an out-of-enum expertType (pre-existing privilege-escalation clamp, unaffected)", () => {
    assert.throws(() => insertLocalExpertFormSchema.parse({ expertType: "admin", city: "X", country: "Y" }));
  });
});
