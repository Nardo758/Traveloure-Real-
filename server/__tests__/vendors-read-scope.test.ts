/**
 * vendors-read-scope.test.ts — ledger `2026-09-05-vendors-read-scope`.
 *
 * CLAUDE.md §14 applied to READS, and §19's allowlist posture applied to a RESPONSE.
 * `GET /api/vendors` had no `isAuthenticated`, read `createdById` off the query string, and its
 * storage reader JOINED `users` — so any caller at all, with no session, received every vendor row
 * carrying the CREATING ACCOUNT'S EMAIL, and could enumerate one named account's creations. Found
 * by the sweep that landed `2026-09-05-custom-venues-owner-scope`, which named this exact route as
 * a known unfixed site of the same class.
 *
 * SHAPE CHOSEN (and why it is not the custom-venues shape): the rows are SHARED business listings,
 * not user-owned private rows, so the list is authenticated but deliberately NOT owner-scoped —
 * hiding listings a signed-in traveler is entitled to browse would be a §13 lie by omission. The
 * privileged part is the CREATOR, so the creator leaves the browse route entirely and its filter
 * moves to `GET /api/admin/vendors`, under §2's blanket `adminApiGuard`.
 *
 * No DB and no HTTP here: the projection is a pure function (P*), and everything else the fix
 * decides is a fact about the shipped route/storage/guard/client artifacts (A*, S*, G*, C*), both
 * checkable without either. `server/routes.ts` imports the entire server; an HTTP test would need
 * a database this lane cannot reach and would prove nothing the assertions below do not.
 *
 * Run: npx tsx --test server/__tests__/vendors-read-scope.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectVendorForDirectory } from "../utils/vendor-read-scope";
import { VENDOR_DIRECTORY_FIELDS } from "@shared/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(ROOT, "server", "routes.ts"), "utf-8");
const storageSrc = readFileSync(join(ROOT, "server", "storage.ts"), "utf-8");
const guardSrc = readFileSync(join(ROOT, "scripts", "check-query-userid-reads.cjs"), "utf-8");
const pageSrc = readFileSync(join(ROOT, "client", "src", "pages", "vendors.tsx"), "utf-8");

const BROWSE_MARKER = 'app.get("/api/vendors", ';
const ADMIN_MARKER = 'app.get("/api/admin/vendors", ';

/**
 * One route registration block, up to the next registration, with `//` comment lines removed.
 *
 * The comments are stripped because the next route's own explanatory header sits inside this
 * span, and a prose mention of a field name is not a read of it — asserting over the prose would
 * make these tests fail on documentation.
 */
function routeBlock(marker: string): string {
  const start = routesSrc.indexOf(marker);
  assert.notEqual(start, -1, `route not found in routes.ts: ${marker}`);
  const rest = routesSrc.slice(start + marker.length);
  const next = rest.search(/\n\s*app\s*\.\s*(get|post|put|patch|delete)\s*\(/);
  return rest
    .slice(0, next === -1 ? undefined : next)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

/**
 * A row exactly as the OLD joined reader produced it: every `vendors` column plus the `createdBy`
 * object built from the `users` join. Addresses and emails are example.com by policy.
 */
const JOINED_ROW = {
  id: "vendor-1",
  name: "Aiko Events",
  category: "coordination",
  description: "Kyoto planning",
  email: "hello@aiko-events.example.com",
  phone: "+81-00-0000-0000",
  website: "https://aiko-events.example.com",
  address: "1 Somewhere Street",
  city: "Kyoto",
  country: "Japan",
  rating: "4.80",
  priceRange: "moderate",
  imageUrl: "https://cdn.example.com/aiko.jpg",
  status: "active",
  metadata: { internalNote: "do not publish" },
  createdById: "creator-a",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdBy: {
    id: "creator-a",
    email: "creator-a@example.com",
    firstName: "Aiko",
    lastName: "Tanaka",
  },
};

// ── P: the public projection ─────────────────────────────────────────────────────────────────────

test("P1: the projection carries NO creator identity of any kind", () => {
  const projected = projectVendorForDirectory(JOINED_ROW as any) as Record<string, unknown>;
  assert.equal("createdBy" in projected, false, "creator object survived the projection");
  assert.equal("createdById" in projected, false, "raw creator user id survived the projection");
  // The email that actually leaked, asserted on the SERIALIZED response rather than key-by-key: a
  // nested copy under any future key name would still fail this.
  assert.equal(JSON.stringify(projected).includes("creator-a@example.com"), false);
  assert.equal(JSON.stringify(projected).includes("Tanaka"), false);
});

test("P2: `createdBy` is ABSENT, not null — an undisclosed creator is not an unknown one (§13)", () => {
  const projected = projectVendorForDirectory(JOINED_ROW as any) as Record<string, unknown>;
  // `createdBy: null` already means "this vendor predates the provenance column". Emitting it for
  // a non-admin would render "Unknown origin" over a creator the platform knows perfectly well.
  assert.equal(Object.prototype.hasOwnProperty.call(projected, "createdBy"), false);
});

test("P3: the vendor's OWN business contact details are kept — they are what a directory is for", () => {
  const projected = projectVendorForDirectory(JOINED_ROW as any) as Record<string, unknown>;
  assert.equal(projected.email, "hello@aiko-events.example.com");
  assert.equal(projected.phone, "+81-00-0000-0000");
  assert.equal(projected.name, "Aiko Events");
  assert.equal(projected.city, "Kyoto");
});

test("P4: the free-form `metadata` blob is not published", () => {
  const projected = projectVendorForDirectory(JOINED_ROW as any) as Record<string, unknown>;
  assert.equal("metadata" in projected, false);
  assert.equal(JSON.stringify(projected).includes("do not publish"), false);
});

test("P5: it is an ALLOWLIST — an unnamed key is dropped, so a NEW column is not published by default", () => {
  // §19's posture: under a denylist a column added later is exposed BY DEFAULT, and nobody edits a
  // strip list for a field that did not exist when it was written.
  const projected = projectVendorForDirectory({
    ...JOINED_ROW,
    internalRiskScore: 0.97,
    ownerTaxId: "not-a-real-value",
  } as any) as Record<string, unknown>;
  assert.equal("internalRiskScore" in projected, false);
  assert.equal("ownerTaxId" in projected, false);
  assert.deepEqual(Object.keys(projected).sort(), [...VENDOR_DIRECTORY_FIELDS].sort());
});

test("P6: an ABSENT column is omitted, never invented as null", () => {
  const projected = projectVendorForDirectory({ id: "v", name: "n", category: "c" } as any) as Record<
    string,
    unknown
  >;
  assert.deepEqual(Object.keys(projected).sort(), ["category", "id", "name"]);
  assert.equal("city" in projected, false);
});

test("P7: the field list itself names no creator column", () => {
  const fields = [...VENDOR_DIRECTORY_FIELDS] as string[];
  assert.equal(fields.includes("createdById"), false);
  assert.equal(fields.includes("createdBy"), false);
  assert.equal(fields.includes("metadata"), false);
});

// ── A: the shipped route artifacts ───────────────────────────────────────────────────────────────

test("A1: the browse route is gated by isAuthenticated", () => {
  assert.ok(routesSrc.includes(`${BROWSE_MARKER}isAuthenticated`), "GET /api/vendors is not gated");
});

test("A2: the browse route reads NO creator id from the query string", () => {
  const block = routeBlock(BROWSE_MARKER);
  // The defect, verbatim: `const { category, city, createdById } = req.query;`
  assert.equal(/\{[^}]*\bcreatedById\b[^}]*\}\s*=\s*req\.query/.test(block), false);
  assert.equal(/req\.query[?.[\s]*["']?createdById/.test(block), false);
  assert.equal(/\bcreatedById\b/.test(block), false, "the browse route still mentions createdById");
});

test("A3: the browse route uses the non-joining reader and projects every row through the allowlist", () => {
  const block = routeBlock(BROWSE_MARKER);
  assert.match(block, /storage\.getVendorsForDirectory\(/);
  assert.match(block, /projectVendorForDirectory\(/);
  // The joined reader must not be reachable from the browse branch at all.
  assert.equal(/getVendorsWithCreator/.test(block), false);
});

test("A4: the creator filter lives on an /api/admin path, where §2's blanket guard is the gate", () => {
  const block = routeBlock(ADMIN_MARKER);
  assert.match(block, /createdById/);
  assert.match(block, /storage\.getVendorsWithCreator\(/);
  // The blanket guard the admin path relies on is really mounted.
  assert.match(routesSrc, /app\.use\("\/api\/admin", adminApiGuard\)/);
});

test("A5: the admin CSV export reads the creator-bearing reader by its explicit name", () => {
  // It legitimately needs the creator email; the rename is what makes that an explicit choice
  // rather than the default a browse surface inherits.
  assert.match(routesSrc, /getVendorsWithCreator\(\);\n\s*const csv = formatVendorAuditCsv/);
});

test("A6: no vendor WRITE route lost its gate, and no new read route slipped in ungated", () => {
  // #776 checked PATCH/DELETE on custom venues; vendors has neither. POST keeps isAuthenticated +
  // isEarner and still stamps the creator from the SESSION (§14), never from req.body.
  assert.match(routesSrc, /app\.get\("\/api\/vendors", isAuthenticated,/);
  assert.match(routesSrc, /app\.post\("\/api\/vendors", isAuthenticated, isEarner,/);
  assert.match(routesSrc, /const creatorId = getUserId\(req\);/);
  assert.equal(/app\.(patch|put|delete)\("\/api\/vendors/.test(routesSrc), false);
  // There is no GET /api/vendors/:id to fix — asserted so that adding one ungated is a red test.
  assert.equal(/app\.get\("\/api\/vendors\/:/.test(routesSrc), false);
});

// ── S: the storage layer ─────────────────────────────────────────────────────────────────────────

test("S1: the reader the browse surface calls does NOT join users", () => {
  const start = storageSrc.indexOf("async getVendorsForDirectory(");
  assert.notEqual(start, -1, "getVendorsForDirectory not found");
  const body = storageSrc.slice(start, storageSrc.indexOf("async getVendorsWithCreator("));
  assert.ok(body.length > 0, "the two readers are not in the expected order");
  assert.equal(/leftJoin\(users/.test(body), false, "the directory reader still joins users");
  assert.equal(/users\.email/.test(body), false, "the directory reader still selects an email");
});

test("S2: exactly ONE reader joins users, and it is the one named for it", () => {
  const start = storageSrc.indexOf("async getVendorsWithCreator(");
  assert.notEqual(start, -1, "getVendorsWithCreator not found");
  const body = storageSrc.slice(start, start + 1600);
  assert.match(body, /leftJoin\(users, eq\(vendors\.createdById, users\.id\)\)/);
  // The old undifferentiated name is retired, so no existing call site keeps the join silently.
  assert.equal(/async getVendors\(/.test(storageSrc), false, "the old getVendors is still present");
  assert.equal(/\bgetVendors\(category\?: string/.test(storageSrc), false);
});

test("S3: both readers are declared on the IStorage interface", () => {
  assert.match(
    storageSrc,
    /getVendorsForDirectory\(category\?: string, city\?: string, createdById\?: string\): Promise<Vendor\[\]>;/,
  );
  assert.match(
    storageSrc,
    /getVendorsWithCreator\(category\?: string, city\?: string, createdById\?: string\): Promise<VendorWithCreator\[\]>;/,
  );
});

// ── G: the guard extension ───────────────────────────────────────────────────────────────────────

test("G1: the ownership-name list now covers the creator spellings", () => {
  for (const name of ["createdById", "created_by_id", "creatorId", "creator_id"]) {
    assert.ok(
      new RegExp(`"${name}"`).test(guardSrc),
      `${name} is missing from check-query-userid-reads.cjs OWNER_NAMES`,
    );
  }
});

test("G2: the guard grew no query-side allowlist to hide this route behind", () => {
  // An allowlisted route is invisible to its predicate forever; exempting the very route a lane
  // exists to fix buys silence, not safety. The filter moved to an admin path instead.
  assert.equal(/ALLOWED_QUERY_ROUTES\s*=/.test(guardSrc), false);
  assert.equal(/"GET \/api\/vendors":/.test(guardSrc), false);
});

// ── C: the client surface ────────────────────────────────────────────────────────────────────────

test("C1: the page renders creator attribution only when the server disclosed it", () => {
  assert.match(
    pageSrc,
    /function hasCreatorProvenance\(vendor: Vendor\): boolean \{\n\s*return "createdBy" in vendor;/,
  );
  assert.equal(
    /(?<!hasCreatorProvenance\(vendor\) && )<VendorCreatorAttribution vendor=\{vendor\} \/>/.test(pageSrc),
    false,
    "an ungated <VendorCreatorAttribution> remains",
  );
});

test("C2: a non-admin browser calls the browse endpoint; only an admin calls the admin one", () => {
  assert.match(pageSrc, /const vendorsEndpoint = isAdmin \? "\/api\/admin\/vendors" : "\/api\/vendors";/);
  assert.match(pageSrc, /queryKey: \[vendorsEndpoint,/);
});
