import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveSavedCardChargeId } from "../services/saved-card-choice";

const methods = [{ id: "pm_old" }, { id: "pm_new" }];

test("a named card that belongs to the vault is the one charged", () => {
  assert.equal(resolveSavedCardChargeId(methods, "pm_old", "pm_new"), "pm_new");
});

test("no request uses the default, never the first listed card", () => {
  assert.equal(resolveSavedCardChargeId(methods, "pm_old", null), "pm_old");
  assert.equal(resolveSavedCardChargeId(methods, null, undefined), null);
});

test("a card that is not in the vault is refused rather than swapped", () => {
  assert.equal(resolveSavedCardChargeId(methods, "pm_old", "pm_other"), null);
});

test("the payment service asks this helper and does not charge methods[0]", () => {
  const src = readFileSync(new URL("../services/stripe-payment.service.ts", import.meta.url), "utf8");
  assert.match(src, /resolveSavedCardChargeId/);
  assert.equal(src.includes("methods[0]"), false);
  assert.match(src, /limit:\s*100/);
});
