/**
 * #302 — the shared validation-failure body.
 *
 * The lane's whole safety claim is that `message` is UNCHANGED: 45 call sites previously answered
 * `{ message: err.errors[0].message }` (or a `?? fallback` variant) and now answer
 * `zodErrorBody(err)`. If `message` moved, every consumer, surface and copy assertion keyed on it
 * would move with it — so these tests assert byte-identity against the OLD expression, computed
 * from the same error, rather than against a hand-copied literal.
 *
 * Run with: npx tsx --test server/utils/__tests__/zod-error-body.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { zodErrorBody } from "../zod-error-body";

function errorFrom(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, false, "fixture must actually fail to parse");
  return (parsed as { success: false; error: z.ZodError }).error;
}

test("message is byte-identical to the old errors[0].message expression", () => {
  const schema = z.object({ name: z.string(), age: z.number() });
  const err = errorFrom(schema, { name: 123, age: "x" });

  // The exact expression 31 of the converted sites used.
  const legacyMessage = err.errors[0].message;
  assert.equal(zodErrorBody(err).message, legacyMessage);
});

test("every issue is reported, not just the first — the defect this lane exists for", () => {
  const schema = z.object({ a: z.string(), b: z.string(), c: z.string() });
  const err = errorFrom(schema, { a: 1, b: 2, c: 3 });

  const body = zodErrorBody(err);
  assert.equal(err.errors.length, 3, "fixture produces three issues");
  assert.equal(body.errors.length, 3, "all three are reported");
  assert.deepEqual(body.errors.map((e) => e.field).sort(), ["a", "b", "c"]);
});

test("field is the dotted path, and a nested path is joined", () => {
  const schema = z.object({ outer: z.object({ inner: z.string() }) });
  const err = errorFrom(schema, { outer: { inner: 5 } });

  assert.equal(zodErrorBody(err).errors[0].field, "outer.inner");
});

test("errors carries ONLY field and message — no schema internals", () => {
  const schema = z.object({ token: z.string() });
  const err = errorFrom(schema, { token: 1 });

  const [issue] = zodErrorBody(err).errors;
  assert.deepEqual(Object.keys(issue).sort(), ["field", "message"]);
  // `code`/`expected`/`received` describe the admission schema; on a §19 allowlist rail that
  // describes which privileged fields exist, so the projection must not carry them.
  for (const leaked of ["code", "expected", "received", "path"]) {
    assert.equal((issue as Record<string, unknown>)[leaked], undefined, `${leaked} must not be published`);
  }
});

test("the fallback is used only when there are no issues at all", () => {
  const schema = z.object({ x: z.string() });
  const err = errorFrom(schema, { x: 1 });

  // A real error has issues, so the fallback must NOT win.
  assert.notEqual(zodErrorBody(err, "FALLBACK").message, "FALLBACK");

  // An issue-less ZodError is the only case the fallback answers — it is stated rather than
  // letting `undefined` reach the wire as {"message": null}.
  const empty = new z.ZodError([]);
  assert.equal(zodErrorBody(empty, "Invalid capture").message, "Invalid capture");
  assert.deepEqual(zodErrorBody(empty).errors, []);
  assert.equal(zodErrorBody(empty).message, "Invalid input", "documented default");
});
