/**
 * Gap #16 — the photo rail's magic-byte gate (server/utils/image-sniff.ts).
 *
 * Content-Type is client-declared and untrusted (the ruling-58 PDF_MAGIC posture, extended to
 * images): the sniffer is the real gate, so its recognition set is proven here byte-for-byte.
 * A buffer it can't identify returns null and the route 400s — never a mystery file stored
 * under an image path.
 *
 * Run solo: npx tsx --test server/__tests__/image-sniff.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImageExtension, IMAGE_CONTENT_TYPES } from "../utils/image-sniff";

const pad = (bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

test("S1: JPEG magic (FF D8 FF) → jpg", () => {
  assert.equal(sniffImageExtension(pad([0xff, 0xd8, 0xff, 0xe0])), "jpg");
});

test("S2: PNG magic (89 PNG \\r\\n 1A \\n) → png", () => {
  assert.equal(sniffImageExtension(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
});

test("S3: WebP magic (RIFF....WEBP) → webp", () => {
  const buf = Buffer.alloc(20);
  buf.write("RIFF", 0, "latin1");
  buf.write("WEBP", 8, "latin1");
  assert.equal(sniffImageExtension(buf), "webp");
});

test("S4: a PDF is NOT an image — the deliverable rail's format never leaks into this one", () => {
  assert.equal(sniffImageExtension(Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(16)])), null);
});

test("S5: HTML/SVG/script bytes are refused — no stored-XSS vehicle under an image path", () => {
  assert.equal(sniffImageExtension(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

test("S6: too-short and empty buffers are refused, never sliced out of bounds", () => {
  assert.equal(sniffImageExtension(Buffer.alloc(0)), null);
  assert.equal(sniffImageExtension(Buffer.from([0xff, 0xd8])), null);
});

test("S7: every recognized extension has a content-type for the serving route", () => {
  for (const ext of ["jpg", "png", "webp"] as const) {
    assert.match(IMAGE_CONTENT_TYPES[ext], /^image\//);
  }
});
