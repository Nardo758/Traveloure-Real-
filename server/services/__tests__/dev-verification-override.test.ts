import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDevelopmentVerificationOverride } from "../dev-verification-override";

describe("development verification override", () => {
  it("leaves ordinary approvals unchanged when no override is requested", () => {
    assert.deepEqual(resolveDevelopmentVerificationOverride({}, "production"), { requested: false });
  });

  it("accepts and trims a reason only in development", () => {
    assert.deepEqual(
      resolveDevelopmentVerificationOverride(
        { developmentVerificationOverrideReason: "  seeded Kyoto provider cannot complete external KYB  " },
        "development",
      ),
      {
        requested: true,
        ok: true,
        reason: "seeded Kyoto provider cannot complete external KYB",
      },
    );
  });

  it("rejects blank reasons in development", () => {
    const result = resolveDevelopmentVerificationOverride(
      { developmentVerificationOverrideReason: "   " },
      "development",
    );
    assert.equal(result.requested, true);
    assert.equal(result.ok, false);
    if (result.requested && !result.ok) assert.equal(result.status, 400);
  });

  for (const environment of ["production", "test", undefined]) {
    it(`rejects an override when NODE_ENV is ${environment ?? "unset"}`, () => {
      const result = resolveDevelopmentVerificationOverride(
        { developmentVerificationOverrideReason: "must not bypass verification here" },
        environment,
      );
      assert.equal(result.requested, true);
      assert.equal(result.ok, false);
      if (result.requested && !result.ok) assert.equal(result.status, 403);
    });
  }
});