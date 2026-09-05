/**
 * Regression coverage for creator-scoped vendor directory queries.
 *
 * The database chain is replaced with a small Drizzle-shaped test double. It
 * applies the creator parameter encoded in the generated WHERE expression to
 * fixture rows, making an omitted creator condition return both creators and
 * fail the scoped assertion. No database rows are created or deleted.
 *
 * UPDATED by ledger `2026-09-05-vendors-read-scope`. The reader under test was renamed
 * `getVendors` → `getVendorsWithCreator` when it was split from the browse reader (which does not
 * join `users` at all), and the creator filter moved off `GET /api/vendors` onto
 * `GET /api/admin/vendors`, under CLAUDE.md §2's blanket `adminApiGuard`. The third case
 * previously asserted the DEFECT verbatim — that the public route must read `createdById` off
 * `req.query` — and now asserts the fixed shape; the browse-route half is pinned in
 * `server/__tests__/vendors-read-scope.test.ts`.
 */

import { after, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test";

const { db } = await import("../db.js");
const { storage } = await import("../storage.js");

const CREATOR_A = "creator-a";
const CREATOR_B = "creator-b";

const ROWS = [
  {
    vendor: {
      id: "vendor-a",
      name: "Aiko Events",
      category: "coordination",
      city: "Kyoto",
      createdById: CREATOR_A,
    },
    creator: {
      id: CREATOR_A,
      email: "aiko@example.com",
      firstName: "Aiko",
      lastName: "Tanaka",
    },
  },
  {
    vendor: {
      id: "vendor-b",
      name: "Ben Events",
      category: "coordination",
      city: "Osaka",
      createdById: CREATOR_B,
    },
    creator: {
      id: CREATOR_B,
      email: "ben@example.com",
      firstName: "Ben",
      lastName: "Sato",
    },
  },
  {
    vendor: {
      id: "vendor-legacy",
      name: "Legacy Events",
      category: "coordination",
      city: "Tokyo",
      createdById: null,
    },
    creator: null,
  },
];

const originalSelect = (db as any).select;

function findBoundValues(node: any): unknown[] {
  if (!node || typeof node !== "object") return [];
  const values: unknown[] = [];

  if ("value" in node && "encoder" in node) {
    values.push(node.value);
  }

  if (Array.isArray(node.queryChunks)) {
    for (const chunk of node.queryChunks) {
      values.push(...findBoundValues(chunk));
    }
  }

  return values;
}

function installSelectMock() {
  (db as any).select = () => {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: (condition: any) => {
        const boundValues = findBoundValues(condition);
        const creatorId = [CREATOR_A, CREATOR_B].find((id) => boundValues.includes(id));
        const rows = creatorId
          ? ROWS.filter((row) => row.vendor.createdById === creatorId)
          : ROWS;
        return Promise.resolve(rows);
      },
    };
    return chain;
  };
}

afterEach(() => {
  (db as any).select = originalSelect;
});

after(() => {
  (db as any).select = originalSelect;
});

describe("vendor creator filtering", () => {
  it("returns only records owned by the requested creator", async () => {
    installSelectMock();

    const result = await storage.getVendorsWithCreator(undefined, undefined, CREATOR_A);

    assert.deepEqual(
      result.map((vendor) => vendor.id),
      ["vendor-a"],
    );
    assert.equal(result[0].createdBy?.id, CREATOR_A);
  });

  it("keeps non-admin/public browsing unfiltered when no creator is supplied", async () => {
    installSelectMock();

    const result = await storage.getVendorsWithCreator();

    assert.deepEqual(
      result.map((vendor) => vendor.id),
      ["vendor-a", "vendor-b", "vendor-legacy"],
    );
  });

  it("forwards the creator query parameter through the ADMIN route, and not the browse one", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

    assert.match(
      source,
      /app\.get\("\/api\/admin\/vendors", isAuthenticated, async \(req, res\) => \{\s*const \{ category, city, createdById \} = req\.query;/,
      "GET /api/admin/vendors must read createdById from the request query",
    );
    assert.match(
      source,
      /storage\.getVendorsWithCreator\(\s*category as string \| undefined,\s*city as string \| undefined,\s*createdById as string \| undefined/,
      "GET /api/admin/vendors must pass createdById to storage.getVendorsWithCreator",
    );
    assert.match(
      source,
      /app\.use\("\/api\/admin", adminApiGuard\)/,
      "the admin path relies on the blanket guard actually being mounted",
    );
  });
});