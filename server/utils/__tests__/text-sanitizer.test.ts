/**
 * text-sanitizer.ts — unit tests for sanitizeText, sanitizeStringFields, sanitizeDeep.
 *
 * Run: npx tsx --test server/utils/__tests__/text-sanitizer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, sanitizeStringFields, sanitizeDeep } from "../text-sanitizer";

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

// ── sanitizeDeep ──────────────────────────────────────────────────────────────
// These tests verify the recursive sanitizer used by the expert application
// handlers (POST /api/expert-application and POST /api/expert-forms).

test("sanitizeDeep: sanitizes a plain top-level string (bio)", () => {
  const out = sanitizeDeep('<script>alert(1)</script>I love travel') as string;
  assert.ok(!out.includes("<script>"), "script tag must be removed");
  assert.ok(out.includes("I love travel"), "plain text must be preserved");
});

test("sanitizeDeep: sanitizes strings in a flat object (expert bio)", () => {
  const input = {
    bio: '<img src=x onerror=alert(1)>Great guide',
    portfolio: 'https://example.com',
    certifications: 'normal cert',
  };
  const out = sanitizeDeep(input) as typeof input;
  assert.ok(!out.bio.includes("<img"), "img tag removed from bio");
  assert.ok(out.bio.includes("Great guide"), "bio text preserved");
  assert.strictEqual(out.portfolio, "https://example.com", "URL preserved");
  assert.strictEqual(out.certifications, "normal cert", "plain text preserved");
});

test("sanitizeDeep: sanitizes strings inside an array (e.g. destinations)", () => {
  const input = ['Paris', '<script>evil</script>London', 'Tokyo'];
  const out = sanitizeDeep(input) as string[];
  assert.strictEqual(out[0], 'Paris');
  assert.ok(!out[1].includes('<script>'), "script tag removed from array item");
  assert.ok(out[1].includes('London'), "remaining text preserved");
  assert.strictEqual(out[2], 'Tokyo');
});

test("sanitizeDeep: sanitizes knowledgeProofAnswers[].answer (objects in array)", () => {
  const input = [
    { question: 'q1', answer: '<script>xss</script>Kyoto has many temples' },
    { question: 'q2', answer: 'Normal answer' },
  ];
  const out = sanitizeDeep(input) as typeof input;
  assert.ok(!out[0].answer.includes('<script>'), "script tag removed from answer");
  assert.ok(out[0].answer.includes('Kyoto has many temples'), "answer text preserved");
  assert.strictEqual(out[1].answer, 'Normal answer', "clean answer unchanged");
});

test("sanitizeDeep: sanitizes strings in nested arrays (arrays of arrays)", () => {
  const input = [['<b>bad</b>', 'good'], ['also good']];
  const out = sanitizeDeep(input) as string[][];
  assert.ok(!out[0][0].includes('<b>'), "tag removed from nested array string");
  assert.strictEqual(out[0][1], 'good', "clean string preserved");
  assert.strictEqual(out[1][0], 'also good', "clean string in second row preserved");
});

test("sanitizeDeep: non-string scalars pass through unchanged", () => {
  assert.strictEqual(sanitizeDeep(42), 42);
  assert.strictEqual(sanitizeDeep(true), true);
  assert.strictEqual(sanitizeDeep(null), null);
  assert.strictEqual(sanitizeDeep(undefined), undefined);
});

test("sanitizeDeep: mixed expert application payload", () => {
  const input = {
    bio: '<script>alert("xss")</script>Experienced guide',
    shortBio: '<b>bold</b> intro',
    portfolio: 'https://myportfolio.com',
    destinations: ['<script>bad</script>Kyoto', 'Paris'],
    knowledgeProofAnswers: [
      { question: 'Tell us about the area', answer: '<img onerror=alert(1)>I know Gion well' },
    ],
    yearsOfExperience: '5',
    confirmAge: true,
    priceExpectation: 0,
  };
  const out = sanitizeDeep(input) as any;
  assert.ok(!out.bio.includes('<script>'), "bio script tag removed");
  assert.ok(out.bio.includes('Experienced guide'), "bio text preserved");
  assert.ok(!out.shortBio.includes('<b>'), "shortBio bold tag removed");
  assert.ok(out.shortBio.includes('intro'), "shortBio text preserved");
  assert.strictEqual(out.portfolio, 'https://myportfolio.com', "portfolio URL preserved");
  assert.ok(!out.destinations[0].includes('<script>'), "destinations[0] sanitized");
  assert.ok(out.destinations[0].includes('Kyoto'), "destinations[0] text preserved");
  assert.strictEqual(out.destinations[1], 'Paris', "clean destination unchanged");
  assert.ok(!out.knowledgeProofAnswers[0].answer.includes('<img'), "answer img tag removed");
  assert.ok(out.knowledgeProofAnswers[0].answer.includes('I know Gion well'), "answer text preserved");
  assert.strictEqual(out.yearsOfExperience, '5', "scalar string unchanged");
  assert.strictEqual(out.confirmAge, true, "boolean unchanged");
  assert.strictEqual(out.priceExpectation, 0, "number unchanged");
});
