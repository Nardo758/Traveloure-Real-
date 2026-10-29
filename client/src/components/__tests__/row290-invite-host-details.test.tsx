/**
 * Order 290 (ledger `2026-10-29-invite-host-details`): the host types the guest note, street
 * address and RSVP-by on the guest list, through the existing owner-scoped PATCH.
 *
 *   H1  prefill: the three fields show exactly what GET /api/user-experiences/:id returned, and are
 *       empty (no placeholder value) when it returned none
 *   H2  the PATCH body carries only the changed keys; an emptied field is null; untouched keys are absent
 *   H3  one PATCH per double click (a synchronous guard), disabled while in flight, nothing shown as
 *       saved before the request succeeds and the GET is refetched
 *   H4  limits are the shape authorities' (1000 / 255 / "YYYY-MM-DD"), and the date never meets new Date()
 *   H5  the address helper sits next to the address field; no bare "after you RSVP"
 *   H6  the strings come from the constants object
 *   H7  GuestInviteManager mounts the section once; the held Add Guests description is unchanged
 *   H8  390px: the fields are full width and stack
 *
 * Harness: react-dom/server renderToString with a seeded QueryClient (no jsdom), pure helpers, and
 * the source read with fs. No git, no ref, no database, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InviteHostDetails } from "../InviteHostDetails";
import { INVITE_HOST_DETAILS_COPY } from "@/lib/invite-host-details-copy";
import { hostDetailsDraft, hostDetailsPatch } from "@/lib/invite-host-details";
import { siteNeverSayHits } from "@shared/banned-copy";

(globalThis as any).React = React;

const ROOT = process.cwd();
const SECTION = fs.readFileSync(path.join(ROOT, "client/src/components/InviteHostDetails.tsx"), "utf8");
const MANAGER = fs.readFileSync(path.join(ROOT, "client/src/components/GuestInviteManager.tsx"), "utf8");
const HELPER = fs.readFileSync(path.join(ROOT, "client/src/lib/invite-host-details.ts"), "utf8");

function render(row: Record<string, unknown> | undefined): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (row) client.setQueryData(["/api/user-experiences/ux-1"], row);
  return renderToString(
    <QueryClientProvider client={client}>
      <InviteHostDetails experienceId="ux-1" />
    </QueryClientProvider>,
  );
}

function attr(html: string, testid: string, name: string): string | null {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function textarea(html: string): string {
  return html.match(/<textarea[^>]*data-testid="input-invite-host-note"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? "";
}

describe("order 290 host details", () => {
  it("H1 prefill from the GET row, and empty fields when the row has none", () => {
    const html = render({ id: "ux-1", hostNote: "Dress for the garden.", venueAddress: "12 Garden Lane", rsvpBy: "2027-03-01", items: [] });
    assert.equal(textarea(html), "Dress for the garden.");
    assert.equal(attr(html, "input-invite-venue-address", "value"), "12 Garden Lane");
    assert.equal(attr(html, "input-invite-rsvp-by", "value"), "2027-03-01");

    const empty = render({ id: "ux-1", hostNote: null, venueAddress: null, rsvpBy: null, items: [] });
    assert.equal(textarea(empty), "");
    assert.equal(attr(empty, "input-invite-venue-address", "value"), "");
    assert.equal(attr(empty, "input-invite-rsvp-by", "value"), "");
    assert.equal(attr(empty, "input-invite-venue-address", "placeholder"), null, "no placeholder posing as a value");
    assert.equal(attr(empty, "input-invite-rsvp-by", "placeholder"), null);
    assert.match(SECTION, /queryKey = \[`\/api\/user-experiences\/\$\{experienceId\}`\]/, "the GET it reads is the event's own row");
  });

  it("H2 only changed keys; emptied fields are null; untouched keys absent", () => {
    const stored = { hostNote: "Old note", venueAddress: "12 Garden Lane", rsvpBy: "2027-03-01" };
    assert.deepEqual(hostDetailsPatch(hostDetailsDraft(stored), stored), {});
    assert.deepEqual(hostDetailsPatch({ ...hostDetailsDraft(stored), hostNote: "New note" }, stored), { hostNote: "New note" });
    assert.deepEqual(hostDetailsPatch({ ...hostDetailsDraft(stored), venueAddress: "  " }, stored), { venueAddress: null });
    assert.deepEqual(hostDetailsPatch({ hostNote: "", venueAddress: "1 Main St", rsvpBy: "" }, {}), { venueAddress: "1 Main St" });
    assert.match(SECTION, /apiRequest\("PATCH", `\/api\/user-experiences\/\$\{experienceId\}`, body\)/);
    assert.match(SECTION, /save\.mutate\(patch\)/);
  });

  it("H3 one PATCH per double click; disabled in flight; saved only after the refetch", () => {
    const submit = SECTION.slice(SECTION.indexOf("const submit = () => {"), SECTION.indexOf("const set = "));
    assert.ok(submit.indexOf("inFlight.current) return") < submit.indexOf("save.mutate("), "the guard is checked first");
    assert.ok(submit.indexOf("inFlight.current = true") < submit.indexOf("save.mutate("), "and taken before the PATCH");
    assert.match(SECTION, /onSettled: \(\) => \{\s*inFlight\.current = false;/);
    assert.match(SECTION, /disabled=\{!changed \|\| save\.isPending\}/);
    const success = SECTION.slice(SECTION.indexOf("onSuccess:"), SECTION.indexOf("onError:"));
    assert.ok(success.indexOf("await queryClient.invalidateQueries({ queryKey })") < success.indexOf("COPY.saved"), "refetch first, then the saved toast");
    assert.doesNotMatch(SECTION, /setQueryData/, "no optimistic write");
    assert.doesNotMatch(SECTION.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""), /email|\/invites/i, "this section sends nothing and creates no invite");
  });

  it("H4 limits are the shape authorities'; the date never meets new Date()", () => {
    const html = render({ id: "ux-1", items: [] });
    assert.equal(attr(html, "input-invite-host-note", "maxLength"), "1000");
    assert.equal(attr(html, "input-invite-venue-address", "maxLength"), "255");
    assert.equal(attr(html, "input-invite-rsvp-by", "type"), "date");
    assert.deepEqual(hostDetailsPatch({ hostNote: "", venueAddress: "", rsvpBy: "2027-03-01" }, {}), { rsvpBy: "2027-03-01" });
    for (const src of [SECTION, HELPER]) assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /new Date\(/);
  });

  it("H5 the address helper sits next to the address field", () => {
    const html = render({ id: "ux-1", items: [] });
    assert.equal(attr(html, "input-invite-venue-address", "aria-describedby"), "invite-host-address-help-ux-1");
    assert.match(html, /id="invite-host-address-help-ux-1"[^>]*>Shown only to guests who accept</);
    assert.doesNotMatch(html, /after you RSVP(?! yes)/);
  });

  it("H6 the strings come from the constants object", () => {
    assert.deepEqual(INVITE_HOST_DETAILS_COPY, {
      heading: "Details for your guests",
      hostNote: "Note to your guests",
      venueAddress: "Street address",
      venueAddressHelper: "Shown only to guests who accept",
      rsvpBy: "RSVP by",
      save: "Save details",
      saved: "Details saved",
      saveFailed: "Couldn't save details",
    });
    const html = render({ id: "ux-1", items: [] });
    for (const s of ["Details for your guests", "Note to your guests", "Street address", "RSVP by", "Save details"]) assert.ok(html.includes(s), s);
    for (const s of Object.values(INVITE_HOST_DETAILS_COPY)) assert.deepEqual(siteNeverSayHits(s), [], s);
  });

  it("H7 one mount, between the header and the stats; the held description unchanged", () => {
    assert.equal((MANAGER.match(/<InviteHostDetails /g) ?? []).length, 1);
    assert.ok(MANAGER.indexOf("<InviteHostDetails experienceId={experienceId} />") < MANAGER.indexOf("{/* Stats Cards */}"));
    assert.ok(MANAGER.indexOf("<InviteHostDetails experienceId={experienceId} />") > MANAGER.indexOf("</Dialog>"));
    assert.ok(
      MANAGER.includes(`              <DialogDescription>
                Create personalized invite links for your guests. Adding a guest does not email them —
                use <strong>Email invite</strong> on the row (or the button above) when you're ready to send.
                Each guest gets travel recommendations based on the city they're coming from.
              </DialogDescription>`),
      "the held Add Guests description is byte-identical",
    );
  });

  it("H8 390px: full-width fields that stack", () => {
    for (const id of ["input-invite-host-note", "input-invite-venue-address", "input-invite-rsvp-by"]) {
      assert.match(attr(render({ id: "ux-1", items: [] }), id, "class") ?? "", /\bw-full\b/, id);
    }
    assert.match(SECTION, /className="min-w-0 space-y-4"/);
  });
});
