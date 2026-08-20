// Regression tests for the server-enforced image upload validation used by the
// expert-application routes (govId / travelLicence data-URL fields).
// Run: npx tsx --test server/__tests__/image-data-url-validation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { encode as encodeJpeg } from "jpeg-js";
import { validateImageDataUrl, MAX_IMAGE_UPLOAD_BYTES } from "../utils/imageValidation";

function b64OfBytes(n: number): string {
  return Buffer.alloc(n, 0x41).toString("base64");
}

const VALID_TINY_JPEG = encodeJpeg({
  data: Buffer.from([255, 64, 32, 255]),
  width: 1,
  height: 1,
}, 80).data;

function jpegBytes(n: number): Buffer {
  const tiny = VALID_TINY_JPEG;
  if (n <= tiny.length) return tiny;
  const chunks: Buffer[] = [tiny.subarray(0, 2)];
  let remaining = n - tiny.length;
  const segmentSizes: number[] = [];
  while (remaining > 65537) {
    segmentSizes.push(65537);
    remaining -= 65537;
  }
  if (remaining > 0 && remaining < 4) {
    const borrow = 4 - remaining;
    segmentSizes[segmentSizes.length - 1] -= borrow;
    remaining += borrow;
  }
  if (remaining > 0) segmentSizes.push(remaining);
  for (const totalSize of segmentSizes) {
    const payload = totalSize - 4;
    const app = Buffer.alloc(totalSize, 0);
    app.set([0xff, 0xef], 0);
    app.writeUInt16BE(payload + 2, 2);
    chunks.push(app);
  }
  chunks.push(tiny.subarray(2));
  return Buffer.concat(chunks);
}

function pngBytes(n = 32): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function invalidFilterPng(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  // Filter byte 5 is prohibited by the PNG specification. Its CRC is valid, so
  // this regression proves the decoder validates semantic scanline structure.
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([5, 0]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("absent / empty values pass (optional field)", () => {
  assert.equal(validateImageDataUrl(undefined, "govId"), null);
  assert.equal(validateImageDataUrl(null, "govId"), null);
  assert.equal(validateImageDataUrl("", "govId"), null);
  assert.equal(validateImageDataUrl("   ", "govId"), null);
});

test("valid small PNG data URL passes", () => {
  assert.equal(validateImageDataUrl(`data:image/png;base64,${pngBytes().toString("base64")}`, "govId"), null);
});

test("PNG with valid checksums but an invalid scanline filter is rejected", () => {
  assert.match(
    validateImageDataUrl(`data:image/png;base64,${invalidFilterPng().toString("base64")}`, "govId")!,
    /content does not match/,
  );
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
  assert.match(validateImageDataUrl(`data:text/html;base64,${b64OfBytes(10)}`, "govId")!, /JPEG, PNG or GIF/);
  assert.match(validateImageDataUrl(`data:image/svg+xml;base64,${b64OfBytes(10)}`, "govId")!, /JPEG, PNG or GIF/);
});

test("invalid base64 payloads are rejected", () => {
  assert.match(validateImageDataUrl("data:image/png;base64,", "govId")!, /invalid base64/);
  assert.match(validateImageDataUrl("data:image/png;base64,!!!not-base64!!!", "govId")!, /invalid base64/);
  assert.match(validateImageDataUrl("data:image/png;base64,QUJD QUJD", "govId")!, /invalid base64/);
  // wrong length (not a multiple of 4)
  assert.match(validateImageDataUrl("data:image/png;base64,QUJDR", "govId")!, /invalid base64/);
});

test("boundary sizes: exactly 5MB passes, one byte over fails", () => {
  const atLimit = `data:image/jpeg;base64,${jpegBytes(MAX_IMAGE_UPLOAD_BYTES).toString("base64")}`;
  assert.equal(validateImageDataUrl(atLimit, "govId"), null);
  const overLimit = `data:image/jpeg;base64,${jpegBytes(MAX_IMAGE_UPLOAD_BYTES + 1).toString("base64")}`;
  assert.match(validateImageDataUrl(overLimit, "govId")!, /under 5MB/);
});

test("renamed executable and truncated images are rejected", () => {
  const spoofed = `data:image/png;base64,${Buffer.from("MZ\\0\\0fake-executable").toString("base64")}`;
  assert.match(validateImageDataUrl(spoofed, "govId")!, /content does not match/);
  const truncated = Buffer.from([0xff, 0xd8, 0xff, 0x41, 0x41]);
  assert.match(
    validateImageDataUrl(`data:image/jpeg;base64,${truncated.toString("base64")}`, "govId")!,
    /content does not match/,
  );
});

test("marker-only pseudo-images are rejected", () => {
  assert.match(
    validateImageDataUrl(`data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]).toString("base64")}`, "govId")!,
    /content does not match/,
  );
  assert.match(
    validateImageDataUrl(`data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0x41, 0x41, 0xff, 0xd9]).toString("base64")}`, "govId")!,
    /content does not match/,
  );
  const malformedJpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x01, 0x00, 0x01, 0x00,
    0xff, 0xda, 0x00, 0x02,
    0xff, 0xd9,
  ]);
  assert.match(
    validateImageDataUrl(`data:image/jpeg;base64,${malformedJpeg.toString("base64")}`, "govId")!,
    /content does not match/,
  );
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${Buffer.from("GIF89a;").toString("base64")}`, "govId")!,
    /content does not match/,
  );
  assert.match(
    validateImageDataUrl("data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAUAAAAvAAAAAAA=", "govId")!,
    /JPEG, PNG or GIF/,
  );
  const missingColorTable = Buffer.concat([
    Buffer.from("GIF89a"),
    Buffer.from([1, 0, 1, 0, 0, 0, 0]),
    Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0xff, 0, 0x3b]),
  ]);
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${missingColorTable.toString("base64")}`, "govId")!,
    /content does not match/,
  );
  const invalidLzw = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAf8AOw==", "base64");
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${invalidLzw.toString("base64")}`, "govId")!,
    /content does not match/,
  );
});

test("valid minimal GIF passes decoded structural validation", () => {
  assert.equal(
    validateImageDataUrl("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=", "govId"),
    null,
  );
});
