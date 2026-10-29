/**
 * Row 251 (CB-R Q1 follow-up; ledger `2026-10-29-versions-restore-owner-only`): the Versions board's
 * restore strip is the trip OWNER's. A read-only viewer used to see it, and its POST answered 404 with no
 * code (string R10). DB-free: the strip under react-dom/server with a pre-filled query cache.
 *
 *   O1  only "owner" is offered a restore; every other role, and no role, is not.
 *   O2  a viewer (and an absent role) sees no strip and no restore action, with the same restorable data
 *       that the owner sees rows for — and the viewer's strip sends no GET.
 *   O3  the owner's strip is unchanged: the restorable row and its action draw as before.
 *   O4  wiring: the board passes the role to its one strip; both pages pass the plancard's tripRole; the
 *       strip adds no new words.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row251-restore-strip-owner.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VersionsRestoreStrip, restoreStripShown } from "../VersionsRestoreStrip";
import { restorableKey } from "@/lib/versions-restore";

(globalThis as any).React = React;
const read = (rel: string) => readFileSync(rel, "utf8");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const TRIP = "trip-251";
const RESTORABLE = { days: [{ day: 2, snapshotId: "s2", appliedAt: "2026-10-20T10:00:00.000Z", state: "restorable" }] };

function render(tripRole: string | null | undefined): { html: string; fetched: boolean } {
  let fetched = false;
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => { fetched = true; return RESTORABLE; } } },
  });
  client.setQueryData(restorableKey(TRIP), RESTORABLE);
  const html = renderToString(
    <QueryClientProvider client={client}>
      <VersionsRestoreStrip tripId={TRIP} tripRole={tripRole} />
    </QueryClientProvider>,
  );
  return { html, fetched };
}

describe("Row 251 — the restore strip is the owner's", () => {
  it("O1 only the owner is offered a restore", () => {
    assert.equal(restoreStripShown("owner"), true);
    for (const role of ["viewer", "expert", "delegate", "payer", "author", "admin", "", null, undefined]) {
      assert.equal(restoreStripShown(role as string | null | undefined), false, String(role));
    }
  });

  it("O2 a viewer, or no role, sees no strip and no restore action", () => {
    for (const role of ["viewer", "expert", null, undefined]) {
      const { html, fetched } = render(role);
      assert.equal(html, "", String(role));
      assert.doesNotMatch(html, /versions-restore-|<button/);
      assert.equal(fetched, false, `${String(role)}: no restorable GET`);
    }
  });

  it("O3 the owner's strip is unchanged", () => {
    const { html } = render("owner");
    assert.match(html, /versions-restore-row-2|versions-restore-go-2/);
    assert.match(html, /<button/);
  });

  it("O4 the role reaches the one strip from both pages, and no words are added", () => {
    const board = read("client/src/components/plancard/VersionsBoard.tsx");
    assert.equal(count(board, "<VersionsRestoreStrip tripId={tripId} tripRole={tripRole} />"), 1);
    assert.match(board, /tripRole = null,/);
    assert.ok(read("client/src/pages/plan-versions.tsx").includes("tripRole={plan.data.tripRole ?? null}"));
    assert.ok(read("client/src/pages/itinerary-comparison.tsx").includes("tripRole={slipPlancard.tripRole ?? null}"));
    const strip = read("client/src/components/plancard/VersionsRestoreStrip.tsx");
    assert.ok(strip.includes("if (!shownForRole) return null;"));
    assert.ok(strip.includes("enabled: shownForRole"));
  });
});
