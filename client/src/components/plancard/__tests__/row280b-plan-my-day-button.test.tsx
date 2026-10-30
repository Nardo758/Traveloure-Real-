/**
 * Row 280b (ledger `2026-10-29-guest-plan-my-day-button`): "Plan my day around this" on the guest
 * invite page, over row 280a's POST /api/invites/:token/plan.
 *
 *   P1  a signed-out guest sees no button
 *   P2  a signed-in guest who has not accepted (maybe, declined, pending) sees no button
 *   P3  a signed-in guest who has accepted sees exactly "Plan my day around this"
 *   P4  a press sends one POST to /api/invites/:token/plan, no body, with credentials; a second
 *       press while it is in flight sends nothing (a synchronous guard)
 *   P5  201 {tripId} and 200 {tripId} open /trip/:tripId
 *   P6  403, 404, 409, 5xx and a network failure open nothing; the button re-enables and shows the
 *       one held line "Couldn't open your plan. Try again."
 *   P7  the guest page mounts the button once, on the confirmed step beside the post-RSVP card;
 *       GR1-GR3 hold (no recommendations, two setCurrentStep('confirmed'), no new JSX text)
 *
 * Pure: react-dom/server and a fake fetch; no git, no network.
 */
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { GuestPlanMyDayButton } from "../../GuestPlanMyDayButton";
import { guestPlanPath, requestGuestPlan, showPlanMyDayButton } from "@/lib/guest-plan";
import { GUEST_CARD_COPY } from "@/lib/guest-card-copy";

(globalThis as any).React = React;
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const PAGE = read("client/src/pages/GuestInvitePage.tsx");
const BUTTON = read("client/src/components/GuestPlanMyDayButton.tsx");

function render(user: object | null, rsvpStatus: string): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/auth/user"], user);
  return renderToString(
    <Router ssrPath="/invite/t">
      <QueryClientProvider client={qc}>
        <GuestPlanMyDayButton token="tok-1" rsvpStatus={rsvpStatus} />
      </QueryClientProvider>
    </Router>,
  );
}
const GUEST = { id: "u-guest", email: "guest@example.test" };

function fakeFetch(status: number, body: unknown, calls: Array<{ url: string; init: RequestInit | undefined }>) {
  return (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { status, ok: status < 300, json: async () => body } as Response;
  }) as typeof fetch;
}

describe("row 280b — Plan my day around this", () => {
  it("P1 a signed-out guest sees no button", () => {
    assert.equal(render(null, "accepted"), "");
    assert.equal(showPlanMyDayButton(false, "accepted"), false);
  });

  it("P2 a signed-in guest who has not accepted sees no button", () => {
    for (const status of ["maybe", "declined", "pending", ""]) {
      assert.equal(render(GUEST, status), "", status);
      assert.equal(showPlanMyDayButton(true, status), false, status);
    }
    assert.equal(showPlanMyDayButton(true, null), false);
  });

  it("P3 a signed-in guest who has accepted sees exactly the approved label", () => {
    const html = render(GUEST, "accepted");
    assert.ok(html.includes('data-testid="button-plan-my-day"'));
    const label = html.match(/data-testid="button-plan-my-day"[^>]*>([^<]*)</)?.[1];
    assert.equal(label, "Plan my day around this");
    assert.equal(GUEST_CARD_COPY.planButton, "Plan my day around this");
    assert.ok(!html.includes("text-plan-my-day-error"), "no error before a press");
  });

  it("P4 one POST, no body, with credentials; an in-flight press sends nothing", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    await requestGuestPlan("tok-1", fakeFetch(201, { tripId: "trip-9" }, calls));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/invites/tok-1/plan");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.credentials, "include");
    assert.equal(calls[0].init?.body, undefined);
    const press = BUTTON.slice(BUTTON.indexOf("async function open()"), BUTTON.indexOf("return (\n"));
    assert.match(press, /if \(inFlight\.current\) return;\s+inFlight\.current = true;/, "the guard is set before the request");
    assert.equal((BUTTON.match(/requestGuestPlan\(/g) ?? []).length, 1, "one call site");
  });

  it("P5 201 and 200 open /trip/:tripId", async () => {
    for (const status of [201, 200]) {
      assert.equal(await requestGuestPlan("tok-1", fakeFetch(status, { tripId: "trip-9" }, [])), "/trip/trip-9", String(status));
    }
    assert.equal(guestPlanPath("a b"), "/trip/a%20b");
    assert.equal(await requestGuestPlan("tok-1", fakeFetch(201, {}, [])), null, "no tripId, nothing to open");
    assert.match(BUTTON, /if \(path\) \{\s+navigate\(path\);/);
  });

  it("P6 refusals and failures open nothing; the button re-enables with the held line", async () => {
    for (const status of [403, 404, 409, 500, 503]) {
      assert.equal(await requestGuestPlan("tok-1", fakeFetch(status, { reason: "x", tripId: "trip-9" }, [])), null, String(status));
    }
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    assert.equal(await requestGuestPlan("tok-1", offline), null);
    const press = BUTTON.slice(BUTTON.indexOf("async function open()"), BUTTON.indexOf("return (\n"));
    assert.match(press, /inFlight\.current = false;\s+setBusy\(false\);\s+setFailed\(true\);/);
    assert.equal(GUEST_CARD_COPY.planError, "Couldn't open your plan. Try again.");
    assert.match(BUTTON, /\{GUEST_CARD_COPY\.planError\}/);
    assert.match(BUTTON, /disabled=\{busy\}/);
  });

  it("P7 one mount on the confirmed step; the row 263 pins hold", () => {
    assert.equal((PAGE.match(/<GuestPlanMyDayButton /g) ?? []).length, 1);
    const confirmed = PAGE.slice(PAGE.indexOf("currentStep === 'confirmed' &&"));
    assert.ok(confirmed.includes("<GuestPlanMyDayButton token={token} rsvpStatus={invite.rsvpStatus} />"));
    assert.ok(confirmed.indexOf("<GuestPlanMyDayButton") > confirmed.indexOf("<GuestPostRsvpCard"), "beside the card");
    assert.equal((PAGE.match(/setCurrentStep\('confirmed'\)/g) ?? []).length, 2);
    assert.ok(!confirmed.includes("CardDescription"));
    for (const src of [PAGE, BUTTON]) assert.doesNotMatch(src, /recommendation/i);
    const code = BUTTON.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!code.includes("Plan my day around this") && !code.includes("Couldn't open"), "no literal of its own");
  });
});
