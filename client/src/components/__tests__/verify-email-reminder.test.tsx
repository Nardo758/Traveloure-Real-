/**
 * Row 149: the site-wide verify-email reminder.
 *   VR1  shows for a signed-in account with emailVerified null; hides for a timestamp; hides when signed out
 *   VR2  Resend posts to /api/auth/send-verification (no body); 200 ⇒ the server's message verbatim; 429 ⇒ wait;
 *        any other answer, or no message ⇒ error
 *   VR3  the banner renders each outcome
 *   VR4  it reads only emailVerified (never the hold flags), is mounted once in App.tsx, and does not use the hold
 *        lib's resend helper
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VerifyEmailReminderBanner } from "../auth/VerifyEmailReminderBanner";
import { VERIFY_REMINDER_COPY as T, resendVerification, showVerifyReminder, type ResendOutcome } from "@/lib/verify-reminder";

(globalThis as any).React = React;

function render(user: unknown, initialOutcome: ResendOutcome | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["/api/auth/user"], user);
  return renderToString(<QueryClientProvider client={client}><VerifyEmailReminderBanner initialOutcome={initialOutcome} /></QueryClientProvider>);
}
const fakeFetch = (status: number, body: unknown) => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
};

test("VR1 — who sees it", () => {
  assert.ok(render({ id: "u1", emailVerified: null }).includes('data-testid="banner-verify-email"'));
  assert.equal(render({ id: "u1", emailVerified: "2026-10-01T00:00:00.000Z" }).includes("banner-verify-email"), false);
  assert.equal(render(null).includes("banner-verify-email"), false);
  assert.equal(showVerifyReminder({ emailVerified: undefined }), true);
});

test("VR2 — Resend", async () => {
  const ok = fakeFetch(200, { message: "Server sentence, verbatim." });
  assert.deepEqual(await resendVerification(ok.impl), { kind: "sent", message: "Server sentence, verbatim." });
  assert.equal(ok.calls[0].url, "/api/auth/send-verification");
  assert.equal(ok.calls[0].init?.method, "POST");
  assert.equal(ok.calls[0].init?.body, undefined);
  assert.deepEqual(await resendVerification(fakeFetch(429, { message: "Too many" }).impl), { kind: "wait" });
  assert.deepEqual(await resendVerification(fakeFetch(401, { message: "x" }).impl), { kind: "error" });
  assert.deepEqual(await resendVerification(fakeFetch(500, undefined).impl), { kind: "error" });
  assert.deepEqual(await resendVerification(fakeFetch(200, {}).impl), { kind: "error" });
});

test("VR3 — outcomes render", () => {
  const user = { id: "u1", emailVerified: null };
  assert.ok(render(user, { kind: "sent", message: "Server sentence, verbatim." }).includes("Server sentence, verbatim."));
  assert.ok(render(user, { kind: "wait" }).includes(T.wait));
  assert.ok(render(user, { kind: "error" }).includes(T.error.replace("'", "&#x27;")));
});

test("VR4 — reads only emailVerified, mounted once", () => {
  const lib = fs.readFileSync("client/src/lib/verify-reminder.ts", "utf8");
  const banner = fs.readFileSync("client/src/components/auth/VerifyEmailReminderBanner.tsx", "utf8");
  for (const src of [lib, banner]) {
    assert.doesNotMatch(src, /emailVerificationRequired|nextStep|email-verification-hold|resendVerificationEmail/);
  }
  const app = fs.readFileSync("client/src/App.tsx", "utf8");
  assert.equal(app.match(/<VerifyEmailReminderBanner \/>/g)?.length, 1);
  assert.match(app, /<EmailVerificationHoldRedirect \/>\s*\{\/\*[^}]*\*\/\}\s*<VerifyEmailReminderBanner \/>\s*<PaymentMethodSetupGate \/>/);
});
