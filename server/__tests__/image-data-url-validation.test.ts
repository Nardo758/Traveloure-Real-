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

function packedZeroGifLzw(pixelCount: number): Buffer {
  const clearCode = 4;
  const endCode = 5;
  let codeSize = 3;
  let nextCode = 6;
  let previousCode: number | undefined;
  let previousEntry: number[] | undefined;
  const dictionary: Array<number[] | undefined> = new Array(4096);
  for (let index = 0; index < 4; index++) dictionary[index] = [index];
  const codes: Array<[number, number]> = [];

  const push = (code: number) => {
    codes.push([code, codeSize]);
    if (code === clearCode) {
      codeSize = 3;
      nextCode = 6;
      previousCode = undefined;
      previousEntry = undefined;
      return;
    }
    if (code === endCode) return;
    const entry = dictionary[code] ?? (
      code === nextCode && previousEntry ? [...previousEntry, previousEntry[0]] : undefined
    );
    if (!entry) throw new Error("invalid generated GIF LZW");
    if (previousCode !== undefined && nextCode < 4096) {
      dictionary[nextCode++] = [...previousEntry!, entry[0]];
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    previousCode = code;
    previousEntry = entry;
  };

  push(clearCode);
  push(0);
  for (let remaining = pixelCount - 1; remaining > 0;) {
    let bestCode = 0;
    for (let code = 0; code < nextCode; code++) {
      const candidate = dictionary[code];
      if (candidate && candidate.length <= remaining
        && candidate.length > dictionary[bestCode]!.length) bestCode = code;
    }
    push(bestCode);
    remaining -= dictionary[bestCode]!.length;
  }
  push(endCode);

  let accumulator = 0;
  let bits = 0;
  const output: number[] = [];
  for (const [code, size] of codes) {
    accumulator |= code << bits;
    bits += size;
    while (bits >= 8) {
      output.push(accumulator & 0xff);
      accumulator >>>= 8;
      bits -= 8;
    }
  }
  if (bits) output.push(accumulator);
  return Buffer.from(output);
}

function gifAggregateBomb(frames = 2): Buffer {
  const width = 4000;
  const height = 4000;
  const lzw = packedZeroGifLzw(width * height);
  const descriptor = Buffer.alloc(10);
  descriptor[0] = 0x2c;
  descriptor.writeUInt16LE(width, 5);
  descriptor.writeUInt16LE(height, 7);
  const subBlocks: Buffer[] = [];
  for (let offset = 0; offset < lzw.length; offset += 255) {
    subBlocks.push(Buffer.from([Math.min(255, lzw.length - offset)]), lzw.subarray(offset, offset + 255));
  }
  const frame = Buffer.concat([descriptor, Buffer.from([2]), ...subBlocks, Buffer.from([0])]);
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0x80;
  return Buffer.concat([
    Buffer.from("GIF89a"),
    screen,
    Buffer.from([0, 0, 0, 255, 255, 255]),
    ...Array<Buffer>(frames).fill(frame),
    Buffer.from([0x3b]),
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

test("GIF with a tiny frame but a decompression-bomb logical canvas is rejected", () => {
  const oversizedCanvas = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=", "base64");
  oversizedCanvas.writeUInt16LE(0xffff, 6);
  oversizedCanvas.writeUInt16LE(0xffff, 8);
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${oversizedCanvas.toString("base64")}`, "govId")!,
    /content does not match/,
  );
});

test("GIF with malformed extension syntax is rejected", () => {
  assert.match(
    validateImageDataUrl(
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBACEBADs=",
      "govId",
    )!,
    /content does not match/,
  );
});

test("GIF transparent color index must exist in the active palette", () => {
  assert.match(
    validateImageDataUrl(
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAIALAAAAAABAAEAAAICRAEAOw==",
      "govId",
    )!,
    /content does not match/,
  );
});

test("multi-frame GIF cumulative decode work is capped", () => {
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${gifAggregateBomb().toString("base64")}`, "govId")!,
    /content does not match/,
  );
});
