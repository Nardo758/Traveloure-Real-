import assert from "node:assert/strict";
import test from "node:test";
import { getCityDiscoverHref } from "../city-discover-route";

test("launch market city routes preserve display casing and encode accents", () => {
  assert.equal(getCityDiscoverHref("Kyoto"), "/discover/location/Kyoto");
  assert.equal(getCityDiscoverHref("Bogotá"), "/discover/location/Bogot%C3%A1");
});