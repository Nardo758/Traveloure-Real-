/**
 * FP-2 / Package A item 5 — Catalog mutation errors in human words (pure unit).
 *
 * The defect: `apiRequest` throws `Error("<status>: <raw body>")` and every Catalog card mutation
 * rendered that string, so a refused activation showed the provider the server's JSON envelope.
 * The server's SENTENCE was already honest — this maps, it does not rewrite.
 *
 * NEGATIVES FIRST, because the risk in "friendlier errors" is always the same one: softening or
 * losing a real refusal. A refusal must survive the mapping intact, and a body that is not JSON
 * at all must never be turned into an invented reason (§13).
 *
 * Run: npx tsx --test client/src/lib/__tests__/catalog-error-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCatalogRefusal, refusalCode, EDITOR_FIXABLE_CODES } from "../catalog-error-copy";

/** Exactly what queryClient's throwIfResNotOk builds. */
const thrown = (status: number, body: unknown) =>
  new Error(`${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);

// ── NEGATIVES ────────────────────────────────────────────────────────────────────────────────

test("N1: the server's own sentence survives the mapping, word for word", () => {
  const serverMessage = "In-person services need a meeting point before publishing. Save as draft to finish later.";
  const copy = describeCatalogRefusal("activate", thrown(400, { message: serverMessage, code: "MEETING_POINT_REQUIRED" }));
  assert.equal(copy.description, serverMessage);
  // …and nothing of the raw envelope leaks into what the provider reads.
  assert.ok(!copy.description.includes("{"));
  assert.ok(!copy.description.includes("400:"));
  assert.ok(!copy.title.includes("{"));
});

test("N2: a NON-JSON body is never turned into an invented reason", () => {
  // A proxy 502 / an HTML error page: the raw text is shown, not a fabricated explanation.
  const copy = describeCatalogRefusal("delete", thrown(502, "<html>Bad Gateway</html>"));
  assert.equal(copy.code, null);
  assert.equal(copy.fixInEditor, false);
  assert.ok(copy.description.includes("Bad Gateway"));
});

test("N3: an UNRECOGNISED code gets no 'fix it' affordance and is not guessed at", () => {
  const copy = describeCatalogRefusal("activate", thrown(409, { message: "Something else refused this.", code: "SOME_NEW_CODE" }));
  assert.equal(copy.code, "SOME_NEW_CODE");
  assert.equal(copy.fixInEditor, false);
  assert.equal(copy.description, "Something else refused this.");
});

test("N4: a network error with no status still produces a usable, non-empty toast", () => {
  const copy = describeCatalogRefusal("duplicate", new TypeError("Failed to fetch"));
  assert.ok(copy.title.length > 0);
  assert.ok(copy.description.length > 0);
  assert.equal(copy.fixInEditor, false);
});

// ── POSITIVES ────────────────────────────────────────────────────────────────────────────────

test("P1: each action names ITSELF, so the toast says what failed", () => {
  const err = thrown(400, { message: "nope" });
  const titles = new Set(
    (["activate", "pause", "display", "delete", "duplicate"] as const).map((a) => describeCatalogRefusal(a, err).title),
  );
  assert.equal(titles.size, 5, "each action must have its own title");
  assert.match(describeCatalogRefusal("delete", err).title, /delete/i);
  assert.match(describeCatalogRefusal("duplicate", err).title, /duplicate/i);
});

test("P2: every publish gate a provider fixes in the editor is flagged fixInEditor", () => {
  // These are the codes routes.ts returns from POST/PATCH /api/provider/services.
  for (const code of ["MEETING_POINT_REQUIRED", "PRICE_REQUIRED", "DELIVERABLE_FILE_REQUIRED", "INVALID_LOCATION_POINT", "ATTESTATION_GATE"]) {
    const copy = describeCatalogRefusal("activate", thrown(400, { message: "…", code }));
    assert.equal(copy.fixInEditor, true, `${code} should offer the editor`);
    assert.ok(EDITOR_FIXABLE_CODES.includes(code));
  }
});

test("P3: a VERIFICATION refusal is not 'fixable in the editor' — it is fixed on Provider Status", () => {
  const copy = describeCatalogRefusal("activate", thrown(422, {
    message: "This category requires background verification before publishing. Save as draft and complete your provider verification first.",
    code: "VERIFICATION_REQUIRED",
  }));
  assert.equal(copy.fixInEditor, false);
  // The server's instruction still reaches the provider — that IS the way out.
  assert.match(copy.description, /verification/i);
});

test("P4: refusalCode reads the envelope, and only the envelope", () => {
  assert.equal(refusalCode(thrown(400, { code: "PRICE_REQUIRED" })), "PRICE_REQUIRED");
  assert.equal(refusalCode(thrown(400, { message: "no code here" })), null);
  assert.equal(refusalCode(thrown(400, "PRICE_REQUIRED")), null, "a bare string body is not a code");
  assert.equal(refusalCode("not an error"), null);
});
