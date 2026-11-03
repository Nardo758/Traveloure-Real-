/**
 * HO-1 (ledger `2026-11-03-ho1-expert-deliver-controls`): the expert inbox shows accepted handoffs with
 * Deliver and Can't do this; delivered rows wait on the traveler; server refusals are shown verbatim.
 *
 *   T1 an accepted and a delivered row render under "In progress"; the accepted one has Deliver, Can't do
 *      this, Open the plan and the on-trip support checkbox; the delivered one has the waiting line and Open
 *      the plan only
 *   T2 Deliver posts { offerOnTripSupport: false } (or true when ticked) and the list is refetched
 *   T3 Can't do this offers "I'm withdrawing" for polish and both reasons for book; Confirm posts the reason
 *   T4 a 409 surfaces the server's exact sentence under "Not yet", and nothing is claimed delivered
 *   T5 every string: no never-say phrase, no "AI", no "$" and no digit
 *   T6 with no working rows the section is absent
 *
 * Harness: react-dom/server renderToString with a pre-filled QueryClient (no jsdom, no network), the
 * posture of client/src/components/__tests__/booking-lifecycle-panels.test.tsx. Clicks are proven
 * through the exported action runner and the card's props, since there is no DOM to click.
 *
 * Run: npx tsx --test client/src/pages/expert/__tests__/row-ho1-deliver.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { siteNeverSayHits } from "@shared/banned-copy";
import {
  HANDOFF_WORKING_COPY,
  HandoffsSection,
  WorkingHandoffCard,
  cannotDoReasons,
  runHandoffWorkAction,
} from "../inbox";

(globalThis as any).React = React;

const row = (over: Record<string, unknown>): any => ({
  id: "h1",
  tripId: "t1",
  kind: "book",
  status: "accepted",
  scopeItemIds: ["a", "b"],
  feeCents: 5000,
  prepaid: false,
  acceptedAt: "2026-11-01T10:00:00.000Z",
  deliveredAt: null,
  ...over,
});

function renderSection(data: { proposed: unknown[]; working: unknown[] }): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["/api/expert/handoffs"], data);
  return renderToString(
    <Router ssrPath="/expert/inbox">
      <QueryClientProvider client={client}>
        <HandoffsSection />
      </QueryClientProvider>
    </Router>,
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function cardHtml(over: Partial<React.ComponentProps<typeof WorkingHandoffCard>> & { handoff: any }): string {
  const noop = () => {};
  return renderToString(
    <Router ssrPath="/expert/inbox">
      <WorkingHandoffCard
        pending={false}
        offerOnTripSupport={false}
        onOfferChange={noop}
        confirming={false}
        reason={null}
        onReasonChange={noop}
        onCannotDo={noop}
        onConfirm={noop}
        onDeliver={noop}
        {...over}
      />
    </Router>,
  );
}

function fakeRequest(respond: (url: string, body: unknown) => { status: number; body: unknown }) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const request = (async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    const r = respond(url, body);
    if (r.status >= 400) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as any;
  const invalidated: string[] = [];
  return { calls, request, invalidated, invalidate: (k: string) => void invalidated.push(k) };
}

describe("T1 the In progress section", () => {
  it("accepted rows carry Deliver, Can't do this, Open the plan and the checkbox; delivered rows only wait", () => {
    const html = renderSection({
      proposed: [],
      working: [row({ id: "acc", status: "accepted" }), row({ id: "del", status: "delivered", deliveredAt: "2026-11-02T10:00:00.000Z" })],
    });
    assert.match(html, /data-testid="section-inbox-handoffs-working"/);
    assert.ok(text(html).includes(HANDOFF_WORKING_COPY.heading));
    for (const id of ["inbox-working-acc", "button-handoff-deliver-acc", "button-handoff-cannot-acc", "button-handoff-open-acc", "checkbox-handoff-support-acc"]) {
      assert.match(html, new RegExp(`data-testid="${id}"`), id);
    }
    assert.match(html, /href="\/expert\/workspace\/t1"/);
    assert.match(html, /data-testid="inbox-working-del"/);
    assert.match(html, /data-testid="button-handoff-open-del"/);
    assert.match(html, /data-testid="text-handoff-delivered-del"/);
    assert.ok(text(html).includes(HANDOFF_WORKING_COPY.deliveredWaiting));
    for (const id of ["button-handoff-deliver-del", "button-handoff-cannot-del", "checkbox-handoff-support-del"]) {
      assert.doesNotMatch(html, new RegExp(`data-testid="${id}"`), id);
    }
    assert.match(html, /data-testid="section-inbox-handoffs"/, "Handoffs to accept is still drawn");
  });
});

describe("T2 Deliver", () => {
  it("posts offerOnTripSupport false, or true when ticked, and refetches the list", async () => {
    for (const offer of [false, true]) {
      const f = fakeRequest(() => ({ status: 200, body: { handoff: {} } }));
      const r = await runHandoffWorkAction("h1", { type: "deliver", offerOnTripSupport: offer }, f);
      assert.deepEqual(f.calls, [{ method: "POST", url: "/api/handoffs/h1/deliver", body: { offerOnTripSupport: offer } }]);
      assert.deepEqual(r, { ok: true, title: HANDOFF_WORKING_COPY.deliveredTitle, description: HANDOFF_WORKING_COPY.deliveredBody });
      assert.deepEqual(f.invalidated, ["/api/expert/handoffs", "/api/expert/assigned-trips"]);
    }
    const checked = cardHtml({ handoff: row({}), offerOnTripSupport: true });
    assert.match(checked, /checked=""[^>]*data-testid="checkbox-handoff-support-h1"|data-testid="checkbox-handoff-support-h1"[^>]*checked=""/);
  });
});

describe("T3 Can't do this", () => {
  it("polish offers only I'm withdrawing; book offers both; Confirm posts the reason", async () => {
    assert.deepEqual(cannotDoReasons("polish"), ["withdrew"]);
    assert.deepEqual(cannotDoReasons("book"), ["withdrew", "unbookable"]);
    assert.deepEqual(cannotDoReasons("plan_all"), ["withdrew", "unbookable"]);

    const closed = cardHtml({ handoff: row({ kind: "book" }) });
    assert.doesNotMatch(closed, /form-handoff-cannot-h1/, "the reasons appear only after Can't do this");

    const polish = text(cardHtml({ handoff: row({ kind: "polish" }), confirming: true }));
    assert.ok(polish.includes(HANDOFF_WORKING_COPY.why));
    assert.ok(polish.includes(HANDOFF_WORKING_COPY.reasonWithdrew));
    assert.ok(!polish.includes(HANDOFF_WORKING_COPY.reasonUnbookable));
    const book = text(cardHtml({ handoff: row({ kind: "book" }), confirming: true }));
    assert.ok(book.includes(HANDOFF_WORKING_COPY.reasonWithdrew) && book.includes(HANDOFF_WORKING_COPY.reasonUnbookable));
    assert.ok(book.includes(HANDOFF_WORKING_COPY.confirm));

    const f = fakeRequest(() => ({ status: 200, body: { handoff: {} } }));
    const r = await runHandoffWorkAction("h1", { type: "cannot-book", reason: "unbookable" }, f);
    assert.deepEqual(f.calls, [{ method: "POST", url: "/api/handoffs/h1/cannot-book", body: { reason: "unbookable" } }]);
    assert.deepEqual(r, { ok: true, title: HANDOFF_WORKING_COPY.recordedTitle, description: HANDOFF_WORKING_COPY.recordedBody });
  });
});

describe("T4 a refusal is the server's sentence", () => {
  it("a 409 surfaces the exact message under Not yet, and the row stays", async () => {
    const sentence = "The traveler still has suggestions to answer.";
    const f = fakeRequest(() => ({ status: 409, body: { message: sentence } }));
    const r = await runHandoffWorkAction("h1", { type: "deliver", offerOnTripSupport: false }, f);
    assert.deepEqual(r, { ok: false, title: HANDOFF_WORKING_COPY.refusedTitle, description: sentence });
    assert.deepEqual(f.invalidated, ["/api/expert/handoffs", "/api/expert/assigned-trips"], "the list refetches, so the row stays as the server has it");
    const html = renderSection({ proposed: [], working: [row({ id: "h1", status: "accepted" })] });
    assert.match(html, /data-testid="button-handoff-deliver-h1"/);
  });
});

describe("T5 the strings", () => {
  it("no never-say phrase, no AI, no $ and no digit", () => {
    for (const [k, v] of Object.entries(HANDOFF_WORKING_COPY)) {
      assert.deepEqual(siteNeverSayHits(v), [], k);
      assert.doesNotMatch(v, /\bAI\b/, k);
      assert.doesNotMatch(v, /[$\d]/, k);
    }
  });
});

describe("T6 no working rows", () => {
  it("the In progress section is absent", () => {
    const html = renderSection({ proposed: [], working: [] });
    assert.doesNotMatch(html, /section-inbox-handoffs-working/);
    assert.ok(!text(html).includes(HANDOFF_WORKING_COPY.heading));
  });
});
