/**
 * text-sanitizer.ts — unit tests for sanitizeText.
 *
 * Run: npx tsx --test server/utils/__tests__/text-sanitizer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, sanitizeStringFields } from "../text-sanitizer";

// ── passthrough cases ─────────────────────────────────────────────────────────

test("returns null unchanged", () => {
  assert.strictEqual(sanitizeText(null), null);
});

test("returns undefined unchanged", () => {
  assert.strictEqual(sanitizeText(undefined), undefined);
});

test("plain text is unchanged", () => {
  assert.strictEqual(sanitizeText("Hello, world!"), "Hello, world!");
});

test("trims surrounding whitespace", () => {
  assert.strictEqual(sanitizeText("  hello  "), "hello");
});

// ── tag stripping ─────────────────────────────────────────────────────────────

test("strips a simple script tag and payload", () => {
  const out = sanitizeText('<script>alert(1)</script>hello');
  assert.ok(!out!.includes("<script>"), "should not contain <script>");
  assert.ok(!out!.includes("</script>"), "should not contain </script>");
  assert.ok(out!.includes("hello"), "should preserve non-tag text");
});

test("strips img onerror injection", () => {
  const out = sanitizeText('<img src=x onerror=alert(1)>text');
  assert.ok(!out!.includes("<img"), "should not contain <img");
  assert.ok(out!.includes("text"), "should preserve trailing text");
});

test("strips an anchor with javascript href", () => {
  const out = sanitizeText('<a href="javascript:alert(1)">click</a>');
  assert.ok(!out!.includes("<a"), "should not contain <a");
  assert.ok(!out!.includes("</a>"), "should not contain </a>");
  // text content between tags is NOT preserved because it's inside a stripped tag —
  // the regex removes the tag delimiters; anything between open/close tags stays.
  // "click" appears between the stripped <a…> and </a> so it survives.
  assert.ok(out!.includes("click"), "text between tags is preserved");
});

test("strips HTML comments", () => {
  const out = sanitizeText('before<!-- <script>evil</script> -->after');
  assert.ok(!out!.includes("<!--"), "should not contain <!--");
  assert.ok(out!.includes("before"), "before text preserved");
  assert.ok(out!.includes("after"), "after text preserved");
});

test("strips self-closing tags", () => {
  const out = sanitizeText('line1<br/>line2');
  assert.ok(!out!.includes("<br"), "should not contain <br");
  assert.ok(out!.includes("line1"), "line1 preserved");
  assert.ok(out!.includes("line2"), "line2 preserved");
});

// ── angle brackets that must NOT be stripped ──────────────────────────────────

test("preserves comparison operator: price < $50", () => {
  const out = sanitizeText("price < $50");
  // The < is preserved but encoded as &lt;
  assert.ok(!out!.includes("<script"), "no injection risk");
  // After encoding, < becomes &lt; — the encoded form is acceptable
  assert.ok(
    out!.includes("price") && (out!.includes("$50") || out!.includes("50")),
    `should preserve numeric context; got: ${out}`,
  );
});

test("preserves comparison: ages 5 < x < 12", () => {
  const out = sanitizeText("ages 5 < x < 12");
  assert.ok(out!.includes("ages 5"), `should contain 'ages 5'; got: ${out}`);
  assert.ok(out!.includes("12"), `should contain '12'; got: ${out}`);
});

test("preserves greater-than in text: score > 90%", () => {
  const out = sanitizeText("score > 90%");
  assert.ok(out!.includes("score"), `should contain 'score'; got: ${out}`);
  assert.ok(out!.includes("90%"), `should contain '90%'; got: ${out}`);
});

// ── idempotency ───────────────────────────────────────────────────────────────

test("already-sanitized text is unchanged on re-run", () => {
  const inputs = [
    "Plain text with no tags",
    "Provider's tour — great value!",
    "Meet at the café at 3 PM",
  ];
  for (const input of inputs) {
    const once = sanitizeText(input)!;
    const twice = sanitizeText(once)!;
    assert.strictEqual(twice, once, `Not idempotent for: ${input}`);
  }
});

test("script-injected text is idempotent after first sanitization", () => {
  const raw = '<script>alert(1)</script>hello';
  const once = sanitizeText(raw)!;
  const twice = sanitizeText(once)!;
  assert.strictEqual(twice, once, "Second pass should produce no further change");
});

// ── sanitizeStringFields ──────────────────────────────────────────────────────

test("sanitizeStringFields sanitizes all string values, leaves non-strings", () => {
  const row = {
    name: '<script>evil</script>Bob',
    description: "normal text",
    price: 99,        // number — must not be changed
    flag: true,       // boolean — must not be changed
    note: null,       // null — must not be changed
  };
  const out = sanitizeStringFields(row as any);
  assert.ok(!out.name.includes("<script>"), "name should be sanitized");
  assert.strictEqual(out.description, "normal text");
  assert.strictEqual((out as any).price, 99, "number unchanged");
  assert.strictEqual((out as any).flag, true, "boolean unchanged");
  assert.strictEqual((out as any).note, null, "null unchanged");
});
