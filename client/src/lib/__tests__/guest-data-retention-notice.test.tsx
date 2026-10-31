/**
 * Row 210 — the approved retention sentence, and the rule for N.
 *
 *   N1  the sentence is Leon's, with {N} filled and no other words
 *   N2  no day count renders nothing; a non-number does not become 90 or any other default
 *   N3  the ask posts to the token route and nowhere else
 *   N4  the invite page mounts the notice from the server's retentionDays and does not restate the sentence
 *   N5  an event is due on the Nth day after it, not before; a missing day is not due
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { siteNeverSayHits } from "@shared/banned-copy";
import {
  GUEST_DATA_RETENTION_NOTICE,
  guestDataRetentionDaysRefusal,
  guestDataRetentionNotice,
  guestRetentionDue,
  parseGuestDataRetentionDays,
} from "@shared/guest-data-retention";
import {
  GuestDataRetentionNotice,
  guestDataDeletionPath,
  requestGuestDataDeletion,
} from "../../components/GuestDataRetentionNotice";

(globalThis as { React: typeof React }).React = React;

const APPROVED =
  "We keep your RSVP details only to manage this event, and delete them {N} days after it ends. You can ask us to delete them sooner at any time.";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

describe("row 210 guest data retention notice", () => {
  it("N1 the sentence is the approved one, and the ask is those words", () => {
    assert.equal(GUEST_DATA_RETENTION_NOTICE, APPROVED);
    assert.equal(
      guestDataRetentionNotice(10),
      "We keep your RSVP details only to manage this event, and delete them 10 days after it ends. You can ask us to delete them sooner at any time.",
    );
    const html = renderToString(
      <GuestDataRetentionNotice retentionDays={10} token="tok-1" onErased={() => {}} />,
    );
    assert.equal(text(html), guestDataRetentionNotice(10));
    assert.match(html, /data-testid="guest-data-retention-request"/);
    assert.equal((html.match(/delete them sooner/g) ?? []).length, 1);
    assert.deepEqual(siteNeverSayHits(guestDataRetentionNotice(10)), []);
  });

  it("N2 nothing is shown when N is unset, and there is no code default", () => {
    for (const value of [null, undefined, "", "  ", "0", "soon", "10.5"]) {
      assert.equal(parseGuestDataRetentionDays(value), null, String(value));
    }
    for (const value of [null, undefined, "", "0", "soon", 0, 10.5]) {
      const html = renderToString(
        <GuestDataRetentionNotice retentionDays={value} token="tok-1" onErased={() => {}} />,
      );
      assert.equal(html, "", String(value));
    }
    assert.equal(parseGuestDataRetentionDays("10"), 10);
    assert.equal(parseGuestDataRetentionDays(null), null);
    assert.equal(guestDataRetentionDaysRefusal(""), null);
    assert.equal(guestDataRetentionDaysRefusal("10"), null);
    assert.match(guestDataRetentionDaysRefusal("soon") ?? "", /whole number of days from 1 to 9999, or empty/);
    for (const rel of [
      "shared/guest-data-retention.ts",
      "server/jobs/guestDataRetention.ts",
      "client/src/components/GuestDataRetentionNotice.tsx",
      "client/src/pages/GuestInvitePage.tsx",
    ]) {
      assert.equal(/\b90\b/.test(fs.readFileSync(path.join(process.cwd(), rel), "utf8")), false, rel);
    }
  });

  it("N3 the ask posts once to the token route", async () => {
    assert.equal(guestDataDeletionPath("a/b"), "/api/invites/a%2Fb/delete-rsvp-details");
    const calls: { url: string; method: string }[] = [];
    const ok = await requestGuestDataDeletion("tok-1", (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: String(init?.method) });
      return new Response(null, { status: 204 });
    }) as typeof fetch);
    assert.equal(ok, true);
    assert.deepEqual(calls, [{ url: "/api/invites/tok-1/delete-rsvp-details", method: "POST" }]);
    const refused = await requestGuestDataDeletion("tok-1", (async () => new Response(null, { status: 404 })) as typeof fetch);
    assert.equal(refused, false);
  });

  it("N4 the page mounts the notice from retentionDays and does not restate the sentence", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "client/src/pages/GuestInvitePage.tsx"), "utf8");
    assert.equal((page.match(/<GuestDataRetentionNotice/g) ?? []).length, 1);
    assert.match(page, /retentionDays=\{retentionDays\}/);
    assert.match(page, /setRetentionDays\(retentionDaysFromPayload\(data\.retentionDays\)\)/);
    assert.equal(page.includes(APPROVED), false);
    assert.equal(page.includes("We keep your RSVP details"), false);
    const routes = fs.readFileSync(path.join(process.cwd(), "server/routes/internal.routes.ts"), "utf8");
    assert.match(routes, /runGuestDataRetention\(\)/);
    assert.doesNotMatch(routes, /runGuestDataRetention\(\{[^}]*experienceIds/);
  });

  it("N5 due on the Nth day after the event, and not when the day is missing", () => {
    assert.equal(guestRetentionDue("2026-01-01", 10, "2026-01-11"), true);
    assert.equal(guestRetentionDue("2026-01-01", 10, "2026-01-10"), false);
    assert.equal(guestRetentionDue("2026-01-02", 10, "2026-01-11"), false);
    assert.equal(guestRetentionDue(null, 10, "2026-01-11"), false);
    assert.equal(guestRetentionDue("2026-01-01", 0, "2030-01-01"), false);
  });
});
