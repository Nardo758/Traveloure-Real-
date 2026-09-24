/**
 * A bundle's city comes from its components (Phase 3, remote/bundle listings on city pages). Pure.
 *   C1 all components share a city ⇒ that city.
 *   C2 any component without a city, or two different cities ⇒ NULL, never a guess.
 * Run: npx tsx --test shared/__tests__/bundle-city.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBundleCity } from "../bundle-city";

test("C1: a shared city is the bundle's city", () => {
  assert.equal(deriveBundleCity([{ city: "Kyoto" }, { city: " kyoto " }]), "Kyoto");
});

test("C2: missing or mixed cities give no city", () => {
  assert.equal(deriveBundleCity([{ city: "Kyoto" }, { city: null }]), null);
  assert.equal(deriveBundleCity([{ city: "Kyoto" }, { city: "Osaka" }]), null);
  assert.equal(deriveBundleCity([]), null);
});
