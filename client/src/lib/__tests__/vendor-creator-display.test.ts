import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getVendorCreatorLabel } from "../vendor-creator";

describe("vendor creator attribution display", () => {
  it("renders an attributed creator account when provenance resolves", () => {
    assert.equal(
      getVendorCreatorLabel({
        id: "creator-1",
        firstName: "Aiko",
        lastName: "Tanaka",
        email: "aiko@example.com",
      }),
      "Aiko Tanaka",
    );
    assert.equal(
      getVendorCreatorLabel({
        id: "creator-2",
        firstName: null,
        lastName: null,
        email: "creator@example.com",
      }),
      "creator@example.com",
    );
  });

  it("renders an explicit unknown-origin label for legacy rows", () => {
    assert.equal(getVendorCreatorLabel(null), "Unknown origin");
    assert.equal(getVendorCreatorLabel(undefined), "Unknown origin");
  });

  it("does not expose creator provenance as an editable form field", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "client/src/pages/vendors.tsx"),
      "utf8",
    );
    assert.doesNotMatch(source, /name="createdById"/);
    assert.match(source, /Creator provenance is read-only/);
  });
});