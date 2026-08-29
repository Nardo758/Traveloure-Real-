/**
 * Coverage for the admin vendor creator-history export.
 *
 * The full route registration starts the real session store and database, so the
 * route wiring assertions intentionally inspect server/routes.ts while formatter
 * tests exercise the formatter used by that route with realistic vendor rows.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { VendorWithCreator } from "@shared/schema";
import {
  formatVendorAuditCsv,
  VENDOR_AUDIT_EXPORT_HEADERS,
} from "../../utils/vendor-export.js";

function parseCsv(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\r" && csv[index + 1] === "\n") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      index += 1;
    } else {
      cell += character;
    }
  }

  assert.equal(quoted, false, "CSV must not contain an unterminated quoted cell");
  assert.equal(cell, "", "CSV must end at a record boundary");
  assert.deepEqual(record, [], "CSV must end with CRLF");
  return records;
}

function vendor(overrides: Partial<VendorWithCreator>): VendorWithCreator {
  return {
    id: "vendor-1",
    name: "Kyoto Tea House",
    category: "food_and_drink",
    description: "Traditional tea service",
    email: "hello@example.com",
    phone: "+81 75 000 0000",
    website: "https://example.com",
    address: "1 Tea Lane",
    city: "Kyoto",
    country: "Japan",
    rating: "4.5",
    priceRange: "moderate",
    status: "active",
    createdById: null,
    createdAt: new Date("2026-08-29T12:00:00.000Z"),
    updatedAt: new Date("2026-08-29T12:00:00.000Z"),
    createdBy: null,
    ...overrides,
  };
}

describe("GET /api/admin/vendors/export", () => {
  it("keeps the endpoint authenticated and admin-only", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

    assert.match(
      source,
      /app\.get\(\s*"\/api\/admin\/vendors\/export"\s*,\s*isAuthenticated\s*,/,
      "vendor export must require an authenticated session",
    );
    assert.match(
      source,
      /if \(!userId\)\s*\{\s*return res\.status\(401\)\.json\(\{\s*message: "Authentication required"/,
      "vendor export must reject a session without a user ID",
    );
    assert.match(
      source,
      /const user = await storage\.getUser\(userId\);[\s\S]*?if \(!user \|\| user\.role !== "admin"\)\s*\{\s*return res\.status\(403\)\.json\(\{\s*message: "Admin access required"/,
      "vendor export must reject sessions whose database role is not admin",
    );
    assert.match(
      source,
      /const vendorList = await storage\.getVendors\(\);[\s\S]*?formatVendorAuditCsv\(vendorList\)/,
      "the route must export the complete creator-enriched vendor query",
    );
  });

  it("exports creator name and account email for attributed vendors", () => {
    const csv = formatVendorAuditCsv([
      vendor({
        createdById: "creator-1",
        createdBy: {
          id: "creator-1",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@example.com",
        },
      }),
    ]);
    const [headers, row] = parseCsv(csv);
    const values = new Map(headers.map((header, index) => [header, row[index]]));

    assert.equal(values.get("creator_name"), "Jane Doe");
    assert.equal(values.get("creator_email"), "jane.doe@example.com");
    assert.equal(values.get("creator_origin"), "Account");
  });

  it("marks a legacy vendor as unknown without changing createdById", () => {
    const legacyVendor = vendor({ createdById: null, createdBy: null });
    const csv = formatVendorAuditCsv([legacyVendor]);
    const [headers, row] = parseCsv(csv);
    const values = new Map(headers.map((header, index) => [header, row[index]]));

    assert.equal(values.get("creator_name"), "Unknown origin");
    assert.equal(values.get("creator_email"), "Unknown origin");
    assert.equal(values.get("creator_origin"), "Unknown origin");
    assert.equal(legacyVendor.createdById, null);
    assert.equal(legacyVendor.createdBy, null);
  });

  it("keeps commas, quotes, newlines, and formula-looking values safe and parseable", () => {
    const csv = formatVendorAuditCsv([
      vendor({
        name: 'Tea, "Quote"\nStudio',
        description: '=HYPERLINK("https://evil.example","click")',
        phone: "+15550000000",
        website: "-cmd",
        address: "Line one\r\nLine two",
        city: "@remote",
      }),
    ]);
    const [headers, row] = parseCsv(csv);

    assert.equal(headers.length, VENDOR_AUDIT_EXPORT_HEADERS.length);
    assert.equal(row.length, headers.length, "special characters must not create extra columns");
    const values = new Map(headers.map((header, index) => [header, row[index]]));

    assert.equal(values.get("name"), 'Tea, "Quote"\nStudio');
    assert.equal(values.get("description"), '\'=HYPERLINK("https://evil.example","click")');
    assert.equal(values.get("phone"), "'+15550000000");
    assert.equal(values.get("website"), "'-cmd");
    assert.equal(values.get("address"), "Line one\r\nLine two");
    assert.equal(values.get("city"), "'@remote");
  });
});