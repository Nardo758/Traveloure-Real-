/**
 * Signed-out /login shows sign-in and keeps a safe returnTo.
 * Signed-in /login leaves for that path, or home.
 *
 * Run: npx tsx --test client/src/lib/__tests__/login-route.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMAIL_SIGN_IN_REQUIRED_PARAM } from "@shared/email-sign-in-required";
import { decideLoginRoute, LOGIN_ROUTE_HOME } from "../login-route";

const ORIGIN = "https://traveloure.com";

function decide(isSignedIn: boolean, search: string) {
  return decideLoginRoute({ isSignedIn, search }, ORIGIN);
}

test("signed-out /login shows sign-in and does not send the visitor home", () => {
  const decision = decide(false, "");
  assert.deepEqual(decision, {
    kind: "sign-in",
    returnTo: undefined,
    emailSignInRequired: false,
  });
});

test("signed-out /login keeps a safe returnTo", () => {
  assert.deepEqual(decide(false, "returnTo=/pricing"), {
    kind: "sign-in",
    returnTo: "/pricing",
    emailSignInRequired: false,
  });
  assert.deepEqual(decide(false, "?returnTo=/itinerary/42%3Ftab%3Dmap%23day-2"), {
    kind: "sign-in",
    returnTo: "/itinerary/42?tab=map#day-2",
    emailSignInRequired: false,
  });
});

test("signed-out /login accepts redirect when returnTo is absent", () => {
  assert.equal(decide(false, "redirect=/dashboard").kind, "sign-in");
  assert.equal(
    decide(false, "redirect=/dashboard").kind === "sign-in"
      ? decide(false, "redirect=/dashboard").returnTo
      : undefined,
    "/dashboard",
  );
  const both = decide(false, "returnTo=/pricing&redirect=/dashboard");
  assert.equal(both.kind === "sign-in" ? both.returnTo : undefined, "/pricing");
});

test("signed-out /login drops an off-site or self returnTo", () => {
  for (const search of [
    "returnTo=https://evil.com/x",
    "returnTo=//evil.com",
    "returnTo=/%5Cevil.com",
    "returnTo=/login",
    "returnTo=/login/",
    "returnTo=/Login",
    "redirect=https://evil.com",
  ]) {
    const decision = decide(false, search);
    assert.equal(decision.kind, "sign-in", search);
    assert.equal(decision.kind === "sign-in" ? decision.returnTo : "wrong", undefined, search);
  }
});

test("signed-out /login flags the existing email-sign-in notice", () => {
  const decision = decide(false, `error=${EMAIL_SIGN_IN_REQUIRED_PARAM}&returnTo=/pricing`);
  assert.equal(decision.kind, "sign-in");
  if (decision.kind !== "sign-in") return;
  assert.equal(decision.emailSignInRequired, true);
  assert.equal(decision.returnTo, "/pricing");
  assert.equal(decide(false, "error=other").kind === "sign-in"
    ? decide(false, "error=other").emailSignInRequired
    : true, false);
});

test("signed-in /login goes to a safe returnTo or home", () => {
  assert.deepEqual(decide(true, ""), { kind: "redirect", to: LOGIN_ROUTE_HOME });
  assert.deepEqual(decide(true, "returnTo=/pricing"), { kind: "redirect", to: "/pricing" });
  assert.deepEqual(decide(true, "redirect=/experts"), { kind: "redirect", to: "/experts" });
  assert.deepEqual(decide(true, "returnTo=https://evil.com"), { kind: "redirect", to: LOGIN_ROUTE_HOME });
  assert.deepEqual(decide(true, "returnTo=/login"), { kind: "redirect", to: LOGIN_ROUTE_HOME });
  assert.deepEqual(decide(true, "returnTo=/%5Cevil.com"), { kind: "redirect", to: LOGIN_ROUTE_HOME });
});

test("LoginRoute shows SignInModal for a signed-out visit and does not replace the URL with home", () => {
  const src = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
  const start = src.indexOf("function LoginRoute(");
  const end = src.indexOf("function AuthReturnToRestorer(");
  assert.ok(start >= 0 && end > start);
  const fn = src.slice(start, end);
  assert.match(fn, /decideLoginRoute\(/);
  assert.match(fn, /<SignInModal/);
  assert.match(fn, /sessionStorage\.setItem\(\s*"traveloure_return_to"/);
  assert.match(fn, /Sign in to your account/);
  assert.match(fn, /Welcome back! Sign in to continue planning your travels\./);
  assert.match(fn, /EMAIL_SIGN_IN_REQUIRED_MESSAGE/);
  assert.doesNotMatch(fn, /navigate\(\s*["']\/["']/);
  assert.doesNotMatch(fn, /SignupPage|\/signup/);
});
