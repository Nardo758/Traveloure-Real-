/**
 * Row 207, screen half (ledger `2026-10-29-invite-send-state-screen`): the organizer's guest list
 * shows the server's derived `sendState` in Leon's approved words. A held email never reads as
 * sent, and Email invite never implies a second email.
 *
 *   T1  the four states render exactly "Not sent", "Waiting to send", "Sent", "Didn't send"; no timestamp
 *   T2  a missing sendState renders "Not sent"
 *   T3  held never reads as sent, whatever inviteSentAt and lastSend say; the page names no "on the
 *       way", "Scheduled", "Queued for sending" or "Sent <date>"
 *   T4  display follows sendState only (sent with no inviteSentAt; not_sent with one)
 *   T5  the bulk button counts not_sent + failed; "All invites emailed" and its title only when every
 *       row is sent; otherwise nothing sendable ⇒ disabled "Nothing to send" with no title
 *   T6  the row button: disabled once sent or in flight, enabled for held/not_sent/failed, one label
 *       ("Email invite" / "Email this invitation", no "again"), one POST per double click (a
 *       synchronous guard), no optimistic state; the toast reports the server's counts only
 *   T7  390px: the state span never wraps, the table keeps its overflow wrapper, and the component
 *       may shrink inside its dialog (min-w-0) with a header that wraps
 *   T8  the strings come from the constants objects
 *
 * Harness: react-dom/server renderToString (the no-jsdom posture of booking-lifecycle-panels) for
 * the real cell, pure helpers for the rules, the source read with fs for the wiring. No git, no
 * ref, no database, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { InviteSendStateCell } from "../GuestInviteManager";
import { INVITE_SEND_STATES } from "@shared/invite-send-state";
import { INVITE_SEND_COPY, SEND_STATE_COPY } from "@/lib/invite-send-state-copy";
import {
  bulkSendButton,
  everyInviteSent,
  rowSendButtonDisabled,
  sendableInviteCount,
  sendResultToast,
} from "@/lib/invite-send-state-screen";

(globalThis as any).React = React;

const SRC = fs.readFileSync(path.join(process.cwd(), "client/src/components/GuestInviteManager.tsx"), "utf8");

/** The text a cell renders, tags stripped. */
function cellText(invite: Parameters<typeof InviteSendStateCell>[0]["invite"]): string {
  return renderToString(<InviteSendStateCell invite={invite} />)
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .trim();
}

const SENT_AT = "2026-10-29T09:15:00.000Z";

describe("row 207 guest list send state", () => {
  it("T1 the four states render exactly the approved words, with no timestamp", () => {
    assert.equal(cellText({ sendState: "not_sent" }), "Not sent");
    assert.equal(cellText({ sendState: "held" }), "Waiting to send");
    assert.equal(cellText({ sendState: "sent" }), "Sent");
    assert.equal(cellText({ sendState: "failed", lastSend: { status: "failed", errorMessage: "bounce" } }), "Didn't send");
    for (const s of INVITE_SEND_STATES) assert.doesNotMatch(cellText({ sendState: s }), /\d/, `${s}: no date or time`);
    assert.match(renderToString(<InviteSendStateCell invite={{ sendState: "failed", lastSend: { status: "failed", errorMessage: "bounce" } }} />), /title="bounce"/);
  });

  it("T2 a missing sendState renders Not sent", () => {
    assert.equal(cellText({}), "Not sent");
    assert.equal(cellText({ sendState: undefined, lastSend: { status: "sent", sentAt: SENT_AT } }), "Not sent");
  });

  it("T3 held never reads as sent", () => {
    const held = { sendState: "held" as const, inviteSentAt: SENT_AT, lastSend: { status: "sent", sentAt: SENT_AT } };
    assert.equal(cellText(held), "Waiting to send");
    for (const gone of ["on the way", "Scheduled", "Queued for sending", "Never sent", "Send failed", "Email invite again", "Email this invitation again", "toLocaleString"]) {
      assert.ok(!SRC.includes(gone), gone);
    }
    assert.doesNotMatch(SRC, /Sent \{/, "no 'Sent <date>' render");
    assert.equal(bulkSendButton([held, held], false).label, "Nothing to send", "all held: no 'emailed' claim");
  });

  it("T4 display follows sendState only", () => {
    assert.equal(cellText({ sendState: "sent" }), "Sent");
    assert.equal(cellText({ sendState: "not_sent" }), "Not sent");
    assert.doesNotMatch(SRC, /\b(invite|i)\.inviteSentAt\b/, "no display, count or label keys off inviteSentAt");
  });

  it("T5 the bulk button", () => {
    const rows = [{ sendState: "not_sent" as const }, { sendState: "failed" as const }, { sendState: "held" as const }, { sendState: "sent" as const }, {}];
    assert.equal(sendableInviteCount(rows), 3, "not_sent + failed + missing");
    assert.deepEqual(bulkSendButton(rows, false), { kind: "send", label: "Email 3 un-sent invites", disabled: false });
    assert.equal(bulkSendButton([{ sendState: "failed" }], false).label, "Email 1 un-sent invite");

    const allHeld = bulkSendButton([{ sendState: "held" }, { sendState: "sent" }], false);
    assert.deepEqual(allHeld, { kind: "nothing_to_send", label: "Nothing to send", disabled: true });
    assert.equal(allHeld.title, undefined, "no title when not every row is sent");

    const allSent = bulkSendButton([{ sendState: "sent" }, { sendState: "sent" }], false);
    assert.deepEqual(allSent, {
      kind: "all_sent",
      label: "All invites emailed",
      disabled: true,
      title: "Every guest has already been emailed their invitation",
    });
    assert.equal(everyInviteSent([]), false);
    assert.equal(bulkSendButton(rows, true).label, "Sending…");
    assert.match(SRC, /disabled=\{bulkButton\.disabled\}/);
    assert.match(SRC, /title=\{bulkButton\.title\}/);
    assert.match(SRC, /\{bulkButton\.label\}/);
  });

  it("T6 the row button, the in-flight guard and the toast", () => {
    assert.equal(rowSendButtonDisabled({ sendState: "sent" }, false), true);
    for (const s of ["held", "not_sent", "failed"] as const) assert.equal(rowSendButtonDisabled({ sendState: s }, false), false, s);
    assert.equal(rowSendButtonDisabled({ sendState: "held" }, true), true, "in flight");

    assert.match(SRC, /title="Email this invitation"/);
    assert.match(SRC, /<span className="sr-only">Email invite<\/span>/);
    assert.match(SRC, /disabled=\{rowSendButtonDisabled\(invite, sendingIds\.includes\(invite\.id\)\)\}/);
    assert.match(SRC, /onClick=\{\(\) => sendInvites\(\[invite\.id\]\)\}/);
    assert.match(SRC, /body: JSON\.stringify\(inviteIds \? \{ inviteIds \} : \{\}\)/);
    const send = SRC.slice(SRC.indexOf("async function sendInvites("), SRC.indexOf("async function copyInviteLink("));
    assert.ok(send.indexOf("inFlightIds.current.has(id)") < send.indexOf("await fetch("), "the guard runs before the POST");
    assert.ok(send.indexOf("inFlightIds.current.add(id)") < send.indexOf("await fetch("), "and is taken before it");
    assert.match(send, /inFlightIds\.current\.delete\(id\)/);
    assert.doesNotMatch(send, /setInvites\(/, "no optimistic state; the refetch moves the cell");
    assert.match(send, /fetchInvites\(\);\s*fetchStats\(\);/);

    assert.deepEqual(sendResultToast({ enqueued: 0, skipped: 1, failed: 0, leftSent: 0, ambiguous: 0 }), {
      title: "Nothing to send",
      description: "1 updated moments ago, try again in a few minutes.",
    });
    const leftSent = sendResultToast({ enqueued: 0, skipped: 0, failed: 0, leftSent: 1, ambiguous: 0 });
    assert.deepEqual(leftSent, { title: "Nothing to send", description: "" });
    for (const t of [leftSent.title, leftSent.description]) assert.doesNotMatch(t, /Queued|on the way/);
    assert.deepEqual(sendResultToast({ enqueued: 2, skipped: 1, failed: 1, leftSent: 1, ambiguous: 1 }), {
      title: "Invites updated",
      description: "1 skipped (updated moments ago). 1 could not be queued. 1 could not be checked. Try again later.",
    });
    assert.deepEqual(sendResultToast({ enqueued: 0, failed: 2 }), {
      title: "Couldn't send",
      description: "2 could not be queued.",
      variant: "destructive",
    });
    assert.deepEqual(sendResultToast({}), { title: "Nothing to send", description: "No guests were selected." });
    assert.equal(sendResultToast({ enqueued: 3 }).description, "", "N2: no 'on the way' line");
  });

  it("T7 390px: the state never wraps and the table keeps its scroll wrapper", () => {
    for (const s of INVITE_SEND_STATES) {
      assert.match(renderToString(<InviteSendStateCell invite={{ sendState: s }} />), /class="[^"]*whitespace-nowrap/, s);
    }
    const table = fs.readFileSync(path.join(process.cwd(), "client/src/components/ui/table.tsx"), "utf8");
    assert.match(table, /overflow-auto/);
    assert.match(SRC, /<Table>/);
    // The mounting dialogs make this component's root a grid item; without min-w-0 the table
    // stretched the dialog to 922px at a 390px viewport instead of scrolling in its wrapper.
    assert.match(SRC, /<div className="min-w-0 space-y-6">/);
    assert.match(SRC, /<div className="flex flex-wrap justify-between items-start gap-3">/);
  });

  it("T8 the strings come from the constants objects", () => {
    assert.deepEqual(SEND_STATE_COPY, { not_sent: "Not sent", held: "Waiting to send", sent: "Sent", failed: "Didn't send" });
    assert.deepEqual(Object.keys(SEND_STATE_COPY).sort(), [...INVITE_SEND_STATES].sort());
    assert.equal(INVITE_SEND_COPY.updatedTitle, "Invites updated");
    assert.equal(INVITE_SEND_COPY.couldNotCheck(2), "2 could not be checked. Try again later.");
    assert.equal(
      INVITE_SEND_COPY.stateExplainer,
      '"Sent" means the email has gone out. "Waiting to send" means it is saved and has not gone out yet. We can\'t tell you whether a guest opened it. You can still copy a link and share it yourself.',
    );
    assert.equal(INVITE_SEND_COPY.skippedNothingToSend(1), "1 updated moments ago, try again in a few minutes.");
    assert.equal(INVITE_SEND_COPY.skippedLine(1), "1 skipped (updated moments ago).");
    assert.match(SRC, /\{SEND_STATE_COPY\[state\]\}/);
    assert.match(SRC, /\{INVITE_SEND_COPY\.stateExplainer\}/);
    assert.ok(SRC.includes("Each guest gets travel recommendations based on the city they're coming from."), "the held dialog line is untouched");
  });
});
