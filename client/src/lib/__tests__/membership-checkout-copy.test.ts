import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBERSHIP_CHECKOUT_REFUSALS,
  membershipCheckoutRefusalCopy,
} from "../membership-checkout";

test("M1: every named membership checkout refusal has distinct traveler copy", () => {
  const descriptions = MEMBERSHIP_CHECKOUT_REFUSALS.map(
    (reason) => membershipCheckoutRefusalCopy(reason).description,
  );

  assert.equal(descriptions.length, 6);
  assert.equal(new Set(descriptions).size, 6);
  for (const description of descriptions) assert.ok(description.trim().length > 0);
});

test("M2: operator price configuration is never blamed on the traveler", () => {
  const copy = membershipCheckoutRefusalCopy("price_not_configured");
  assert.match(copy.description, /configuring Plus checkout/i);
  assert.match(copy.description, /not charged/i);
  assert.doesNotMatch(copy.description, /card|details|payment failed/i);
});

test("M3: an existing member is told they already have Plus", () => {
  const copy = membershipCheckoutRefusalCopy("already_member");
  assert.match(`${copy.title} ${copy.description}`, /already have Plus/i);
  assert.match(copy.description, /occasions/i);
});

test("M4: the disabled-sales refusal keeps the coming-soon posture", () => {
  const copy = membershipCheckoutRefusalCopy("sales_disabled");
  assert.match(`${copy.title} ${copy.description}`, /coming soon|not open yet/i);
});