// Regression tests for the server-enforced image upload validation used by the
// expert-application routes (govId / travelLicence data-URL fields).
// Run: npx tsx --test server/__tests__/image-data-url-validation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImageDataUrl, MAX_IMAGE_UPLOAD_BYTES } from "../utils/imageValidation";

function b64OfBytes(n: number): string {
  return Buffer.alloc(n, 0x41).toString("base64");
}

test("absent / empty values pass (optional field)", () => {
  assert.equal(validateImageDataUrl(undefined, "govId"), null);
  assert.equal(validateImageDataUrl(null, "govId"), null);
  assert.equal(validateImageDataUrl("", "govId"), null);
  assert.equal(validateImageDataUrl("   ", "govId"), null);
});

test("valid small PNG data URL passes", () => {
  assert.equal(validateImageDataUrl(`data:image/png;base64,${b64OfBytes(100)}`, "govId"), null);
});

test("non-data-URL strings are rejected (no size/MIME bypass)", () => {
  assert.match(validateImageDataUrl("https://example.com/a.png", "govId")!, /data URL/);
  assert.match(validateImageDataUrl("A".repeat(10_000_000), "govId")!, /data URL/);
});

test("non-string values are rejected", () => {
  assert.match(validateImageDataUrl(123, "govId")!, /must be a string/);
});

test("missing ;base64 marker is rejected", () => {
  assert.match(validateImageDataUrl("data:image/png,plaintext", "govId")!, /data URL/);
});

test("disallowed MIME types are rejected", () => {
  assert.match(validateImageDataUrl(`data:text/html;base64,${b64OfBytes(10)}`, "govId")!, /JPEG, PNG, WebP or GIF/);
  assert.match(validateImageDataUrl(`data:image/svg+xml;base64,${b64OfBytes(10)}`, "govId")!, /JPEG, PNG, WebP or GIF/);
});

test("invalid base64 payloads are rejected", () => {
  assert.match(validateImageDataUrl("data:image/png;base64,", "govId")!, /invalid base64/);
  assert.match(validateImageDataUrl("data:image/png;base64,!!!not-base64!!!", "govId")!, /invalid base64/);
  assert.match(validateImageDataUrl("data:image/png;base64,QUJD QUJD", "govId")!, /invalid base64/);
  // wrong length (not a multiple of 4)
  assert.match(validateImageDataUrl("data:image/png;base64,QUJDR", "govId")!, /invalid base64/);
});

test("boundary sizes: exactly 5MB passes, one byte over fails", () => {
  const atLimit = `data:image/jpeg;base64,${b64OfBytes(MAX_IMAGE_UPLOAD_BYTES)}`;
  assert.equal(validateImageDataUrl(atLimit, "govId"), null);
  const overLimit = `data:image/jpeg;base64,${b64OfBytes(MAX_IMAGE_UPLOAD_BYTES + 1)}`;
  assert.match(validateImageDataUrl(overLimit, "govId")!, /under 5MB/);
});
