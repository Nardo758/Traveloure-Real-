/**
 * CN-1e-UI (ledger `2026-11-02-cn1e-ui-task-log`): the concierge task log screens.
 *
 *   U1 the five states render with the approved words; withdrawn uses W1; "You said OK · {date}" is a calendar date
 *   U2 traveler: OK/Withdraw on requested, Withdraw on traveler_ok, nothing on terminal; expert: Mark done /
 *      Couldn't get it only on traveler_ok; neither sees the other's actions
 *   U3 request form: kinds from conciergeTasks; a kind at cap is disabled with C1; link-only kinds show taskLinkOnly;
 *      the body is { taskKindId, title, note? } exactly
 *   U4 expert done on a link-only task requires an https link; http:// is refused before posting; done posts
 *      { linkUrl, note? }
 *   U5 links render only through isHttpsLink with target _blank + rel noopener noreferrer; http shows as text
 *   U6 server codes map to the held copy; unknown code → null (generic toast); a repeat click is held by the latch
 *   U7 mount gates: inbox/my-bookings only for confirmed concierge bookings; workspace only for source concierge;
 *      the Trip Card button only while access is open
 *   U8 no "fee", "price", "$", "AI", "Booked" anywhere in the copy or on a link-only row; strings from the object
 *   U9 below 430px the dialog is a full-height sheet with no horizontal overflow (asserted on classes)
 *
 * Harness: react-dom/server renderToString, no DOM. The Radix dialog does not server-render, so the body components
 * are rendered directly.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/cn1e-ui-task-log.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { CN1_COPY } from "@shared/cn1-copy";
import { CONCIERGE_TASK_ERRORS } from "@shared/concierge-task-log";
import { siteNeverSayHits } from "@shared/banned-copy";
import { createSingleFlight } from "@/lib/concierge-hire-copy";
import {
  CONCIERGE_TASK_COPY,
  actionsFor,
  calendarDateOf,
  conciergeAccessOpen,
  conciergeBookingForTrip,
  createBody,
  doneBody,
  isConfirmedConciergeBooking,
  kindOptions,
  safeLinkProps,
  stateLabel,
  taskErrorCopy,
  type TaskView,
} from "@/lib/concierge-task-copy";
import { TASK_LOG_DIALOG_CLASS, TaskLogBody, TaskRequestForm, TaskRow, TaskLinkOrText } from "@/components/concierge-task-log";
import { workspaceMountsTaskLog } from "@/components/expert/WorkspaceConciergeTasks";

const OK_AT = new Date(2027, 3, 3, 15, 0, 0).toISOString(); // local Apr 3, 3pm
const meal = { taskKindKey: "meal", label: "Restaurant booking", domain: "meals", linkOnly: false };
const stay = { taskKindKey: "stay", label: "Stays", domain: "stays", linkOnly: true };

function task(over: Partial<TaskView> = {}): TaskView {
  return {
    id: "t1",
    bookingId: "b1",
    kind: meal,
    title: "Dinner for two",
    note: null,
    linkUrl: null,
    state: "requested",
    requestedBy: "traveler",
    requestedAt: OK_AT,
    travelerOkAt: null,
    resolvedAt: null,
    events: [],
    ...over,
  };
}

const noop = () => {};
const row = (t: TaskView, viewer: "traveler" | "expert") =>
  renderToString(<TaskRow task={t} viewer={viewer} expertFirstName="Aya" busy={false} onAction={noop} />);

describe("U1 states", () => {
  it("renders each state with its word; traveler_ok carries a calendar date, never ISO", () => {
    assert.equal(stateLabel("requested", null), CN1_COPY.taskRequested);
    assert.equal(stateLabel("done", null), CN1_COPY.taskDone);
    assert.equal(stateLabel("could_not_get", null), CN1_COPY.taskCouldNotGet);
    assert.equal(stateLabel("withdrawn", null), CONCIERGE_TASK_COPY.stateWithdrawn);
    const okLabel = stateLabel("traveler_ok", OK_AT);
    assert.equal(okLabel, CN1_COPY.taskTravelerOk.replace("{date}", "Apr 3"));
    assert.ok(!/\d{4}-\d{2}-\d{2}|T\d{2}:/.test(okLabel));
    assert.equal(calendarDateOf("not a date"), null);
    const html = row(task({ state: "traveler_ok", travelerOkAt: OK_AT }), "traveler");
    assert.ok(html.includes("You said OK · Apr 3"));
    assert.ok(!html.includes(OK_AT));
  });
});

describe("U2 actions by viewer", () => {
  it("traveler and expert see only their own moves", () => {
    assert.deepEqual(actionsFor("traveler", "requested"), ["traveler_ok", "withdrawn"]);
    assert.deepEqual(actionsFor("traveler", "traveler_ok"), ["withdrawn"]);
    assert.deepEqual(actionsFor("expert", "requested"), []);
    assert.deepEqual(actionsFor("expert", "traveler_ok"), ["done", "could_not_get"]);
    for (const s of ["done", "could_not_get", "withdrawn"] as const) {
      assert.deepEqual(actionsFor("traveler", s), []);
      assert.deepEqual(actionsFor("expert", s), []);
    }
    const tr = row(task(), "traveler");
    assert.ok(tr.includes("button-task-traveler-ok-t1") && tr.includes("button-task-withdraw-t1"));
    assert.ok(!tr.includes("button-task-done-t1") && !tr.includes("button-task-could-not-get-t1"));
    const ex = row(task({ state: "traveler_ok", travelerOkAt: OK_AT }), "expert");
    assert.ok(ex.includes("button-task-done-t1") && ex.includes("button-task-could-not-get-t1"));
    assert.ok(!ex.includes("button-task-traveler-ok-t1") && !ex.includes("button-task-withdraw-t1"));
    assert.ok(!row(task({ state: "done" }), "traveler").includes("button-task-"));
  });
});

describe("U3 request form", () => {
  it("lists the listing's kinds, disables a kind at cap with C1, and builds the exact body", () => {
    const existing = [task({ id: "a", kind: meal, state: "done" }), task({ id: "b", kind: meal, state: "withdrawn" })];
    const opts = kindOptions([{ ...meal, cap: 1 }, { ...stay, cap: null }], existing);
    assert.equal(opts[0].used, 1);
    assert.equal(opts[0].atCap, true);
    assert.equal(opts[0].capText, "1 of 1");
    assert.equal(opts[1].capText, null);
    const html = renderToString(
      <TaskRequestForm viewer="traveler" options={opts} expertFirstName="Aya" busy={false} onSubmit={noop} onCancel={noop} />,
    );
    assert.ok(/data-testid="radio-task-kind-meal"[^>]*disabled|disabled[^>]*data-testid="radio-task-kind-meal"/.test(html));
    assert.ok(html.includes("1 of 1"));
    assert.ok(html.includes(CN1_COPY.taskLinkOnly.replace("{name}", "Aya")));
    assert.deepEqual(createBody("meal", "  Dinner ", ""), { taskKindId: "meal", title: "Dinner" });
    assert.deepEqual(createBody("meal", "Dinner", " window seat "), { taskKindId: "meal", title: "Dinner", note: "window seat" });
    assert.equal(createBody("meal", "   ", ""), null);
    assert.equal(createBody("meal", "x".repeat(201), ""), null);
  });
});

describe("U4 done on a link-only task", () => {
  it("requires an https link and posts { linkUrl, note? }", () => {
    assert.deepEqual(doneBody(true, "", ""), { ok: false, error: CONCIERGE_TASK_COPY.errors[CONCIERGE_TASK_ERRORS.linkRequired] });
    assert.deepEqual(doneBody(true, "http://hotel.example", ""), { ok: false, error: CONCIERGE_TASK_COPY.errors[CONCIERGE_TASK_ERRORS.linkInvalid] });
    assert.deepEqual(doneBody(true, "https://hotel.example/r", " ok "), { ok: true, body: { linkUrl: "https://hotel.example/r", note: "ok" } });
    assert.deepEqual(doneBody(false, "", ""), { ok: true, body: {} });
    assert.deepEqual(doneBody(false, "https://x.example", "n"), { ok: true, body: { note: "n" } });
  });
});

describe("U5 links", () => {
  it("only https renders as a link, opening in a new tab with noopener noreferrer", () => {
    assert.deepEqual(safeLinkProps("https://a.example"), { href: "https://a.example", target: "_blank", rel: "noopener noreferrer" });
    assert.equal(safeLinkProps("http://a.example"), null);
    assert.equal(safeLinkProps("javascript:alert(1)"), null);
    const good = renderToString(<TaskLinkOrText url="https://a.example" />);
    assert.ok(good.includes('target="_blank"') && good.includes('rel="noopener noreferrer"') && good.includes(CONCIERGE_TASK_COPY.openLink));
    const bad = renderToString(<TaskLinkOrText url="http://a.example" />);
    assert.ok(!bad.includes("<a") && bad.includes("http://a.example"));
    const doneRow = row(task({ kind: stay, state: "done", linkUrl: "https://hotel.example" }), "traveler");
    assert.ok(doneRow.includes("link-task-open"));
  });
});

describe("U6 refusals and repeats", () => {
  it("maps server codes to held copy; unknown → null; the latch holds a double click", () => {
    const e = (code: string) => new Error(`409: ${JSON.stringify({ code })}`);
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.capReached), 2), "This listing allows 2 of these.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.accessEnded)), "Your access to this trip has ended.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.engagementNotActive)), "This hire isn't active.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.ownerOnly)), "Only the traveler can do that.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.expertOnly)), "Only your expert can do that.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.linkRequired)), "Add the https link first.");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.linkInvalid)), "That link must start with https://");
    assert.equal(taskErrorCopy(e(CONCIERGE_TASK_ERRORS.linkNotAllowed)), "That link must start with https://");
    assert.equal(taskErrorCopy(e("something_else")), null);
    assert.equal(taskErrorCopy(new Error("500: oops")), null);
    const latch = createSingleFlight();
    assert.equal(latch.tryStart(), true);
    assert.equal(latch.tryStart(), false);
    latch.settle();
    assert.equal(latch.tryStart(), true);
  });
});

describe("U7 mount gates", () => {
  it("shows the log only where the brief mounts it", () => {
    assert.equal(isConfirmedConciergeBooking({ status: "confirmed", service: { serviceType: "concierge" } }), true);
    assert.equal(isConfirmedConciergeBooking({ status: "pending", service: { serviceType: "concierge" } }), false);
    assert.equal(isConfirmedConciergeBooking({ status: "confirmed", service: { serviceType: "planning" } }), false);
    assert.equal(isConfirmedConciergeBooking({ status: "confirmed", service: null }), false);
    assert.equal(workspaceMountsTaskLog({ source: "concierge" }), true);
    assert.equal(workspaceMountsTaskLog({ source: "handoff" }), false);
    assert.equal(workspaceMountsTaskLog(null), false);
    const now = new Date();
    const later = new Date(now.getTime() + 86_400_000).toISOString();
    const earlier = new Date(now.getTime() - 86_400_000).toISOString();
    assert.equal(conciergeAccessOpen({ source: "concierge", accessUntil: later }, now), true);
    assert.equal(conciergeAccessOpen({ source: "concierge", accessUntil: null }, now), true);
    assert.equal(conciergeAccessOpen({ source: "concierge", accessUntil: earlier }, now), false);
    assert.equal(conciergeAccessOpen({ source: "handoff", accessUntil: later }, now), false);
    const rows = [
      { id: "x", tripId: "t", status: "pending", service: { serviceType: "concierge" } },
      { id: "y", tripId: "t", status: "confirmed", service: { serviceType: "concierge" } },
      { id: "z", tripId: "u", status: "confirmed", service: { serviceType: "concierge" } },
    ];
    assert.equal(conciergeBookingForTrip(rows, "t")?.id, "y");
    assert.equal(conciergeBookingForTrip(rows, "none"), null);
  });
});

describe("U8 words", () => {
  it("no fee/price/$/AI/Booked in the copy or on a link-only row", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(CONCIERGE_TASK_COPY);
    for (const s of strings) {
      assert.ok(!/\bAI\b/.test(s), s);
      assert.ok(!/\bfee\b|\bprice\b|\$|\bBooked\b/i.test(s), s);
      assert.deepEqual(siteNeverSayHits(s), [], s);
    }
    const html = row(task({ kind: stay, state: "done", linkUrl: "https://h.example", requestedBy: "expert" }), "traveler");
    assert.ok(!/\bBooked\b|\$|\bfee\b|\bprice\b/i.test(html.replace(/<[^>]+>/g, " ")));
    const empty = renderToString(
      <TaskLogBody
        tasks={[]}
        viewer="traveler"
        expertFirstName="Aya"
        options={kindOptions([{ ...meal, cap: null }], [])}
        busy={false}
        formOpen={false}
        doneTaskId={null}
        onOpenForm={noop}
        onCloseForm={noop}
        onCreate={noop}
        onAction={noop}
        onDone={noop}
        onCloseDone={noop}
      />,
    );
    assert.ok(empty.includes(CONCIERGE_TASK_COPY.empty) && empty.includes(CONCIERGE_TASK_COPY.request));
  });
});

describe("U9 390px", () => {
  it("below 430px the dialog is a full-height sheet with no horizontal overflow", () => {
    for (const cls of ["max-[429px]:h-[100dvh]", "max-[429px]:max-w-none", "max-[429px]:w-screen", "overflow-x-hidden"]) {
      assert.ok(TASK_LOG_DIALOG_CLASS.includes(cls), cls);
    }
  });
});
