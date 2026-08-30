import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnTo } from "../safe-return-to";

const ORIGIN = "https://app.example.com";

test("accepts plain same-origin relative paths", () => {
  assert.equal(sanitizeReturnTo("/pricing", ORIGIN), "/pricing");
  assert.equal(
    sanitizeReturnTo("/itinerary/42?tab=map#day-2", ORIGIN),
    "/itinerary/42?tab=map#day-2",
  );
});

test("accepts same-origin absolute URLs, returning path only", () => {
  assert.equal(
    sanitizeReturnTo(`${ORIGIN}/dashboard?x=1`, ORIGIN),
    "/dashboard?x=1",
  );
});

test("rejects missing or empty values", () => {
  assert.equal(sanitizeReturnTo(null, ORIGIN), undefined);
  assert.equal(sanitizeReturnTo(undefined, ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("", ORIGIN), undefined);
});

test("rejects cross-origin absolute URLs", () => {
  assert.equal(sanitizeReturnTo("https://evil.com/x", ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("http://app.example.com/x", ORIGIN), undefined); // scheme mismatch
});

test("rejects protocol-relative URLs", () => {
  assert.equal(sanitizeReturnTo("//evil.com", ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("//evil.com/path", ORIGIN), undefined);
});

test("rejects backslash authority tricks", () => {
  // Browsers normalize "/\evil.com" to "//evil.com" (authority delimiter)
  assert.equal(sanitizeReturnTo("/\\evil.com", ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("\\/evil.com", ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("\\\\evil.com", ORIGIN), undefined);
});

test("rejects dangerous schemes", () => {
  assert.equal(sanitizeReturnTo("javascript:alert(1)", ORIGIN), undefined);
  assert.equal(sanitizeReturnTo("data:text/html,x", ORIGIN), undefined);
});

test("encoded separators stay same-origin (percent-encoding is not decoded into structure)", () => {
  // %2F%2Fevil.com parses as a path on our origin, not a new authority
  const out = sanitizeReturnTo("/%2F%2Fevil.com", ORIGIN);
  assert.ok(out === undefined || out.startsWith("/%2F"));
  assert.equal(sanitizeReturnTo("/pa%20th", ORIGIN), "/pa%20th");
});

test("userinfo trick cannot escape origin", () => {
  assert.equal(
    sanitizeReturnTo("https://app.example.com@evil.com/", ORIGIN),
    undefined,
  );
});
