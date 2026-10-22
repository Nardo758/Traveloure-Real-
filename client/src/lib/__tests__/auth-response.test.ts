/**
 * Auth forms must not surface a JSON parser error when a proxy answers with
 * plain text or an empty body.
 *
 * Run: npx tsx --test client/src/lib/__tests__/auth-response.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { AUTH_GENERIC_ERROR, authFailureMessage, readAuthResponse } from "../auth-response";
import { resendVerificationEmail } from "../email-verification-hold";
import { isRegistrationNeutral, REGISTRATION_NEUTRAL_CODE } from "@shared/registration-neutral";

const enAuth = JSON.parse(
  readFileSync(new URL("../../locales/en/auth.json", import.meta.url), "utf8"),
) as { signupPage: { genericError: string } };

function readSrc(rel: string): string {
  return readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");
}

test("the generic sentence is the one already in the auth locale", () => {
  assert.equal(enAuth.signupPage.genericError, AUTH_GENERIC_ERROR);
  assert.equal(AUTH_GENERIC_ERROR, "Something went wrong");
});

test("a text/plain 500 is not parsed and shows the generic error", async () => {
  const res = new Response("Internal Server Error", {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
  await assert.rejects(() => res.clone().json(), (err: unknown) => {
    assert.ok(err instanceof SyntaxError);
    assert.match((err as SyntaxError).message, /not valid JSON/);
    return true;
  });

  const read = await readAuthResponse(res);
  assert.equal(read.kind, "non-json");
  const shown = authFailureMessage(read, AUTH_GENERIC_ERROR, "Authentication failed");
  assert.equal(shown, AUTH_GENERIC_ERROR);
  assert.equal(shown.includes("Unexpected token"), false);
  assert.equal(shown.includes("Internal Server Error"), false);
  assert.equal(shown.includes("not valid JSON"), false);
});

test("an empty 502 is not parsed and shows the generic error", async () => {
  const res = new Response("", { status: 502 });
  await assert.rejects(() => res.clone().json(), SyntaxError);

  const read = await readAuthResponse(res);
  assert.equal(read.kind, "non-json");
  assert.equal(read.status, 502);
  const shown = authFailureMessage(read, AUTH_GENERIC_ERROR, "Signup failed");
  assert.equal(shown, AUTH_GENERIC_ERROR);
  assert.equal(shown.includes("502"), false);
});

test("a JSON error keeps the server message", async () => {
  const res = new Response(JSON.stringify({ message: "Invalid email or password" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  const read = await readAuthResponse(res);
  assert.equal(read.kind, "json");
  assert.equal(
    authFailureMessage(read, AUTH_GENERIC_ERROR, "Authentication failed"),
    "Invalid email or password",
  );
});

test("a neutral registration body still parses", async () => {
  const res = new Response(
    JSON.stringify({ code: REGISTRATION_NEUTRAL_CODE, message: "If this address can be used, check your email." }),
    { status: 202, headers: { "content-type": "application/json" } },
  );
  const read = await readAuthResponse(res);
  assert.equal(read.kind, "json");
  if (read.kind !== "json") return;
  assert.equal(isRegistrationNeutral(res.status, read.data), true);
});

test("auth forms read through the helper and do not parse the body themselves", () => {
  const files = [
    "client/src/components/SignInModal.tsx",
    "client/src/pages/Signup.tsx",
    "client/src/pages/reset-password.tsx",
    "client/src/pages/verify-email.tsx",
    "client/src/lib/email-verification-hold.ts",
    "client/src/lib/auth-response.ts",
  ];
  for (const rel of files) {
    const src = readSrc(rel);
    assert.equal(/\.(json)\s*\(/.test(src), false, `${rel} parses a response body directly`);
    if (rel.endsWith("auth-response.ts")) continue;
    assert.match(src, /readAuthResponse/, `${rel} does not use readAuthResponse`);
  }
  for (const rel of [
    "client/src/components/SignInModal.tsx",
    "client/src/pages/Signup.tsx",
    "client/src/pages/verify-email.tsx",
  ]) {
    assert.match(readSrc(rel), /signupPage\.genericError/);
  }
  assert.match(readSrc("client/src/pages/reset-password.tsx"), /AUTH_GENERIC_ERROR/);
});

test("resend treats a text/plain 500 and an empty 502 as errors", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    assert.equal(await resendVerificationEmail("a@b.c"), "error");

    globalThis.fetch = async () => new Response("", { status: 502 });
    assert.equal(await resendVerificationEmail("a@b.c"), "error");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "If an account exists, we've sent a link." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    assert.equal(await resendVerificationEmail("a@b.c"), "sent");

    globalThis.fetch = async () => new Response("", { status: 429 });
    assert.equal(await resendVerificationEmail("a@b.c"), "rate_limited");
  } finally {
    globalThis.fetch = previous;
  }
});
