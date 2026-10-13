/**
 * AP-1 (ledger `2026-10-13-ap1-save-then-warn`; L1 sanctioned Oct 13, 2026): the admin "Places lookup outcomes"
 * card lists the two new reasons by name — `official_fact` (skipped) and `plan_day_cap` (capped) — exactly as the
 * server stores them (the card derives nothing; a reason with no rows in the window is not listed).
 *
 *   LR1 the counts table names both reasons
 *
 * Run: npx tsx --test client/src/components/__tests__/ap1-lookup-outcome-reasons.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LookupOutcomesCard } from "@/pages/admin/content-sources";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function render(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <LookupOutcomesCard />
    </QueryClientProvider>,
  );
}

describe("AP-1 lookup outcome reasons on the admin card", () => {
  it("LR1 the counts table names official_fact and plan_day_cap", () => {
    const html = render((qc) =>
      qc.setQueryData(["/api/admin/content-sources/lookup-outcomes"], {
        days: 7,
        since: "2026-10-06T00:00:00.000Z",
        counts: [
          { outcome: "skipped", reason: "official_fact", count: 2 },
          { outcome: "capped", reason: "plan_day_cap", count: 1 },
        ],
      }),
    );
    assert.match(html, /data-testid="table-lookup-counts"/);
    const t = text(html);
    assert.ok(t.includes("skipped official_fact 2"), t);
    assert.ok(t.includes("capped plan_day_cap 1"), t);
  });
});
