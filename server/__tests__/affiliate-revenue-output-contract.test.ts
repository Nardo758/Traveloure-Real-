import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  formatAffiliateAmount,
  summarizeAffiliateRevenue,
} from "../services/affiliate-commission-report";

test("partial affiliate output names unreadable partners and uses an em dash for unknown cells", () => {
  const summary = summarizeAffiliateRevenue([
    {
      name: "Viator",
      report: { configured: true, thisMonth: 10, lastMonth: 8, total: 10, currency: "USD" },
    },
    {
      name: "Fever",
      report: { configured: true, thisMonth: null, lastMonth: null, total: null, currency: "USD" },
    },
  ]);

  assert.deepEqual(summary, {
    total: 10,
    partial: true,
    unknownPartners: ["Fever"],
  });
  assert.equal(formatAffiliateAmount(null), "—");
});

test("dashboard, CSV, and PDF surfaces consume the shared partial/unknown contract", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const routeSource = fs.readFileSync(path.join(repoRoot, "server/routes/admin.routes.ts"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(repoRoot, "client/src/pages/admin/revenue.tsx"), "utf8");

  assert.match(routeSource, /affiliateRevenue:\s*rawAffiliateRevenue/);
  assert.match(routeSource, /AFFILIATE REVENUE \(PARTIAL\)/);
  assert.match(routeSource, /Unreadable affiliate partners:/);
  assert.ok(
    (routeSource.match(/formatAffiliateAmount\(/g) ?? []).length >= 6,
    "CSV and PDF rows must both use the shared unknown formatter",
  );
  assert.match(dashboardSource, /Unreadable affiliate partners:/);
  assert.match(dashboardSource, /text-affiliate-revenue-partial/);
});