/**
 * Staging session fix (ledger `2026-11-10-signup-no-autologin`). After the neutral register answer (AUTH-1 fix 3b) the
 * sign-up forms make NO login call; they show the approved sentence (Wording approved — Leon, Nov 9, 2026, 10:27 PM ET).
 * DB-free: a fetch spy, react-dom/server and source reads.
 *
 *   NA1 a neutral 202 → exactly one request (POST /api/auth/register), checkEmail, origin kept for the verify link
 *   NA2 any other answer → still one request, no checkEmail, nothing stored
 *   NA3 no sign-up surface calls /api/auth/login after register; signInAfterSignup is gone
 *   NA4 the approved copy renders on both surfaces, verbatim
 *   NA5 the server's neutral answer is unchanged (202, the code, no sign-in in the register handler)
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/signup-no-autologin.test.tsx
 */
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  REGISTRATION_NEUTRAL_CODE,
  REGISTRATION_NEUTRAL_STATUS,
  registrationNeutralBody,
} from "@shared/registration-neutral";
import {
  SIGNUP_CHECK_EMAIL_COPY,
  SIGNUP_RETURN_TO_KEY,
  SignupCheckEmailNotice,
  submitRegistration,
} from "../../components/auth/SignupForm";

(globalThis as any).React = React;

const APPROVED =
  "Check your email to finish setting up. If you already have an account with this address, sign in or reset your password instead.";

const store = new Map<string, string>();
const origStorage = (globalThis as any).localStorage;
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
after(() => { (globalThis as any).localStorage = origStorage; });
beforeEach(() => store.clear());

function spyFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; method: string }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method ?? "GET") });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const read = (rel: string) => fs.readFileSync(rel, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("sign-up makes no login call after the neutral answer", () => {
  it("NA1 a neutral 202: one register request, checkEmail, origin kept", async () => {
    const { calls, impl } = spyFetch(REGISTRATION_NEUTRAL_STATUS, registrationNeutralBody());
    const out = await submitRegistration({ email: "new@example.com", password: "password-1" }, "/plans/new", impl);
    assert.equal(out.checkEmail, true);
    assert.deepEqual(calls, [{ url: "/api/auth/register", method: "POST" }]);
    assert.equal(calls.some((c) => c.url.includes("/api/auth/login")), false);
    assert.equal(store.get(SIGNUP_RETURN_TO_KEY), "/plans/new");
  });

  it("NA2 any other answer: one request, no checkEmail, nothing stored", async () => {
    for (const [status, body] of [
      [403, { code: "traveler_waitlist", message: "x" }],
      [400, { message: "Validation failed" }],
      [500, { message: "Failed to create account" }],
      [202, { code: "something_else" }],
    ] as const) {
      const { calls, impl } = spyFetch(status, body);
      const out = await submitRegistration({}, "/plans/new", impl);
      assert.equal(out.checkEmail, false, String(status));
      assert.equal(calls.length, 1);
      assert.equal(store.has(SIGNUP_RETURN_TO_KEY), false);
    }
  });

  it("NA3 no sign-up surface signs in after register", () => {
    const form = strip(read("client/src/components/auth/SignupForm.tsx"));
    const page = strip(read("client/src/pages/Signup.tsx"));
    const modal = strip(read("client/src/components/SignInModal.tsx"));
    for (const [name, src] of [["SignupForm.tsx", form], ["Signup.tsx", page], ["SignInModal.tsx", modal]] as const) {
      assert.equal(src.includes("signInAfterSignup"), false, name);
    }
    assert.equal(form.includes("/api/auth/login"), false, "the sign-up helper never logs in");
    assert.equal(page.includes("/api/auth/login"), false, "the sign-up page never logs in");
    const neutral = modal.slice(modal.indexOf("isRegistrationNeutral(response.status"), modal.indexOf('if (read.kind === "non-json"'));
    assert.ok(neutral.length > 0);
    assert.equal(/\bfetch\(/.test(neutral), false, "the modal's neutral branch makes no request");
    assert.match(neutral, /setSignupCheckEmail\(true\)/);
    assert.match(neutral, /setMode\("signin"\)/);
    assert.equal(/window\.location\.(href\s*=|assign\(|replace\()/.test(neutral), false, "and does not navigate");
  });

  it("NA4 the approved copy renders, verbatim, on both surfaces", async () => {
    assert.equal(SIGNUP_CHECK_EMAIL_COPY, APPROVED);
    const notice = renderToString(<SignupCheckEmailNotice />);
    assert.ok(notice.includes('data-testid="text-signup-check-email"'));
    assert.ok(notice.includes(APPROVED));
    (globalThis as any).window = { location: { search: "", replace() {}, assign() {} } };
    const { SignupCheckEmailPanel } = await import("../../pages/Signup");
    const panel = renderToString(<SignupCheckEmailPanel signInLabel="Sign in" />);
    assert.ok(panel.includes(APPROVED));
    assert.match(panel, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
    assert.equal((panel.match(/<(input|button)\b/g) ?? []).length, 0, "no form stays on screen");
    const modal = read("client/src/components/SignInModal.tsx");
    assert.match(modal, /mode === "signin" && signupCheckEmail \? <SignupCheckEmailNotice \/> : null/);
  });

  it("NA5 the server's neutral answer is unchanged", () => {
    assert.equal(REGISTRATION_NEUTRAL_STATUS, 202);
    assert.equal(REGISTRATION_NEUTRAL_CODE, "registration_received");
    const server = read("server/replit_integrations/auth/emailAuth.ts");
    const register = server.slice(server.indexOf('app.post("/api/auth/register"'), server.indexOf('app.post("/api/auth/login"'));
    assert.equal(/\.login\(|regenerate\(/.test(register), false, "register signs nobody in");
    assert.equal((register.match(/registrationNeutralBody\(\)/g) ?? []).length, 3, "existing, conflict and new address");
  });
});
