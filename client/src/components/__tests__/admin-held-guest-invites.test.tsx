/**
 * Row 209 (ledger `2026-10-30-row209-held-guest-invites-view`): the read-only list of guest_invite rows held off the
 * allowlist, on the email outbox tab. Seeded query data, no network. Synthetic rows only.
 *
 *   H1  each held row shows its masked address, subject, invite id and stored last_error
 *   H2  V5: the section has no retry or send control
 *   H3  an empty list shows the empty state; an unloaded list draws nothing
 *   H4  the two strings come from ADMIN_OPS_COPY
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { EmailOutboxTab, HeldGuestInvitesSection } from "../admin/ops/EmailOutboxTab";
import { ADMIN_OPS_COPY as T, HELD_GUEST_INVITES_URL, outboxListUrl } from "@/lib/admin-ops";

(globalThis as any).React = React;

function render(node: React.ReactElement, seed: Array<[string, unknown]>): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of seed) client.setQueryData([key], data);
  return renderToString(<Router ssrPath="/admin/system"><QueryClientProvider client={client}>{node}</QueryClientProvider></Router>);
}

const rows = [
  {
    id: 901,
    createdAt: "2026-10-01T00:00:00Z",
    subject: "You're invited (synthetic)",
    lastError: "template guest_invite not in EMAIL_TEMPLATE_ALLOWLIST",
    inviteId: "inv-synthetic-1",
    toEmail: "j•••@example.com",
  },
];

describe("row 209 held guest invites", () => {
  it("H1 — each held row shows its masked address, subject, invite id and last error", () => {
    const html = render(<HeldGuestInvitesSection />, [[HELD_GUEST_INVITES_URL, { rows, total: 1 }]]);
    assert.ok(html.includes('data-testid="ops-held-invite-901"'));
    assert.ok(html.includes("j•••@example.com"));
    assert.ok(html.includes("inv-synthetic-1"));
    assert.ok(html.includes("template guest_invite not in EMAIL_TEMPLATE_ALLOWLIST"));
    assert.ok(html.includes(T.heldInvitesTitle));
  });

  it("H2 — no retry or send control in the section", () => {
    const html = render(<HeldGuestInvitesSection />, [[HELD_GUEST_INVITES_URL, { rows, total: 1 }]]);
    assert.equal(/<button/i.test(html), false);
    assert.equal(html.includes("ops-outbox-retry"), false);
    const tab = render(<EmailOutboxTab />, [
      [outboxListUrl(""), { rows: [], total: 0 }],
      [HELD_GUEST_INVITES_URL, { rows, total: 1 }],
    ]);
    assert.ok(tab.includes('data-testid="ops-held-invites"'));
    assert.equal(tab.includes("ops-outbox-retry-901"), false);
    const src = readFileSync("client/src/components/admin/ops/EmailOutboxTab.tsx", "utf8");
    const section = src.slice(src.indexOf("export function HeldGuestInvitesSection"));
    assert.equal(/useMutation|apiRequest|<Button/.test(section), false);
  });

  it("H3 — empty and unloaded states", () => {
    const empty = render(<HeldGuestInvitesSection />, [[HELD_GUEST_INVITES_URL, { rows: [], total: 0 }]]);
    assert.ok(empty.includes(T.heldInvitesEmpty));
    assert.equal(render(<HeldGuestInvitesSection />, []), "");
  });

  it("H4 — the strings are the held constants", () => {
    assert.equal(T.heldInvitesTitle, "Held guest invites");
    assert.equal(T.heldInvitesEmpty, "No held invites.");
    const src = readFileSync("client/src/components/admin/ops/EmailOutboxTab.tsx", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.equal(src.includes("Held guest invites"), false);
    assert.equal(src.includes("No held invites."), false);
  });
});
