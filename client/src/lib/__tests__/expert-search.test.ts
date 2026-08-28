import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expertSearchMatches } from "../expert-search.ts";

describe("expertSearchMatches", () => {
  it("keeps a city-filtered planner visible for a destination URL", () => {
    const rajPatel = {
      firstName: "Raj",
      lastName: "Patel",
      expertForm: {
        city: "Mumbai",
        country: "India",
        destinations: ["Mumbai, India"],
      },
    };

    assert.equal(expertSearchMatches(rajPatel, "Mumbai"), true);
  });

  it("matches destination coverage even when the expert lives elsewhere", () => {
    const planner = {
      firstName: "Aiko",
      lastName: "Sato",
      expertForm: {
        city: "Osaka",
        destinations: ["Kyoto, Japan"],
      },
    };

    assert.equal(expertSearchMatches(planner, "Kyoto"), true);
    assert.equal(expertSearchMatches(planner, "Tokyo"), false);
  });

  it("retains name, specialty, and neighborhood matching", () => {
    const expert = {
      firstName: "Maya",
      lastName: "Chen",
      specialties: ["Food & Wine"],
      expertForm: { neighborhoods: ["Bandra West"] },
    };

    assert.equal(expertSearchMatches(expert, "Maya"), true);
    assert.equal(expertSearchMatches(expert, "food"), true);
    assert.equal(expertSearchMatches(expert, "Bandra"), true);
  });
});