import { describe, it } from "node:test";
import assert from "node:assert";
import { formatExpertResponseTime } from "../expert-response-time.ts";

describe("formatExpertResponseTime", () => {
  it("humanizes snake_case response windows", () => {
    assert.strictEqual(
      formatExpertResponseTime("under_2_hours"),
      "Under 2 hours",
    );
  });

  it("preserves already-human response text", () => {
    assert.strictEqual(
      formatExpertResponseTime("Within 2 hours"),
      "Within 2 hours",
    );
    assert.strictEqual(formatExpertResponseTime("Same day"), "Same day");
  });

  it("omits empty response windows", () => {
    assert.strictEqual(formatExpertResponseTime(null), null);
    assert.strictEqual(formatExpertResponseTime("  "), null);
  });
});