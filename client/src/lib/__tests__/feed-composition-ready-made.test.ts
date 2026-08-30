import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendCityWideReadyMadeFill } from "../feed-composition";

function section(items: any[], neighbourhood: string) {
  return { items, neighbourhood: { slug: neighbourhood } };
}

describe("appendCityWideReadyMadeFill", () => {
  it("appends a city-wide package to the first section without a package", () => {
    const sections = [
      section([{ kind: "loose-gem", id: "gion-gem", data: {} }], "gion"),
      section([{ kind: "package", id: "existing", data: { id: "existing" } }], "arashiyama"),
      section([{ kind: "loose-gem", id: "nishiki-gem", data: {} }], "nishiki"),
    ];

    appendCityWideReadyMadeFill(sections, { id: "city-trip", title: "Kyoto in Five Days" }, "Kyoto");

    assert.deepEqual(sections[0].items.map((item) => item.id), ["gion-gem", "package-city-wide-city-trip"]);
    assert.equal(sections[0].items[1].data.cityWideLabel, "Kyoto-wide");
    assert.equal(sections[2].items.length, 1);
  });

  it("does not duplicate a city-wide package already used by another section", () => {
    const sections = [
      section([{ kind: "package", id: "package-city-trip", data: { id: "city-trip" } }], "gion"),
      section([], "arashiyama"),
    ];

    appendCityWideReadyMadeFill(sections, { id: "city-trip" }, "Kyoto");

    assert.equal(sections[1].items.length, 0);
  });
});