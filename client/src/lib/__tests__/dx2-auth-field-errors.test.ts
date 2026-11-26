/**
 * DX-2: authFieldErrors keeps the server's per-field messages.
 *
 * Run: npx tsx --test client/src/lib/__tests__/dx2-auth-field-errors.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { authFieldErrors, readAuthResponse } from "../auth-response";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

test("maps each field's first message", async () => {
  const read = await readAuthResponse(
    jsonResponse({
      message: "Validation failed",
      errors: [
        { path: ["email"], message: "Invalid email address" },
        { path: ["firstName"], message: "First name is required" },
        { path: ["consent"], message: "You must agree to the Terms of Service and Privacy Policy" },
      ],
    }),
  );
  assert.deepEqual(authFieldErrors(read), {
    email: "Invalid email address",
    firstName: "First name is required",
    consent: "You must agree to the Terms of Service and Privacy Policy",
  });
});

test("two issues on one field keep the first message", async () => {
  const read = await readAuthResponse(
    jsonResponse({
      message: "Validation failed",
      errors: [
        { path: ["email"], message: "Invalid email address" },
        { path: ["email"], message: "Email is too long" },
      ],
    }),
  );
  assert.deepEqual(authFieldErrors(read), { email: "Invalid email address" });
});

test("a non-array errors value is not parsed", async () => {
  const read = await readAuthResponse(jsonResponse({ message: "Validation failed", errors: "nope" }));
  assert.deepEqual(authFieldErrors(read), {});
});

test("a non-JSON read has no field errors", async () => {
  const read = await readAuthResponse(
    new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain" } }),
  );
  assert.deepEqual(authFieldErrors(read), {});
});
