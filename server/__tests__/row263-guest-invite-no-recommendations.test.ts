/**
 * row263-guest-invite-no-recommendations.test.ts — the guest invite has no recommendations
 * route, no public travel-plans writer and no SERP template (row 263, server half; ledger
 * `2026-10-28-row263-dead-recommendations-route`).
 *
 * After #1741 the guest invite page calls neither GET /api/invites/:token/recommendations nor
 * POST /api/invites/:token/travel-plans. The GET also created a guest_travel_plans row on a read.
 * Static checks only: files are read with node:fs from process.cwd(); no git, no ref, no database.
 * Comments are stripped before matching, so an explanatory comment cannot trip a check.
 *
 *   R1  guest-invites.ts names neither route nor anything only they used
 *   R2  no GET handler in guest-invites.ts writes
 *   R3  the token routes are the five that remained after row 263, plus row 210's delete-rsvp-details;
 *       /origin and /rsvp still project the invite. recommendations and travel-plans stay gone.
 *   R4  storage.ts has none of the three travel-plan methods; the schema still exports the table
 *   R5  the SERP integration template is deleted and nothing names it (the needle is built by
 *       concatenation, so this file does not match itself)
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ROUTES = stripComments(read("server/routes/guest-invites.ts"));

function routeBlocks(src: string, method: string): string[] {
  const blocks: string[] = [];
  const marker = `router.${method}(`;
  let at = src.indexOf(marker);
  while (at >= 0) {
    const end = src.indexOf("\nrouter.", at + marker.length);
    blocks.push(end < 0 ? src.slice(at) : src.slice(at, end));
    at = src.indexOf(marker, at + marker.length);
  }
  return blocks;
}

test("R1: guest-invites.ts names neither dead route nor anything only they used", () => {
  for (const gone of [
    "/recommendations",
    "needsApiIntegration",
    "needsOrigin",
    "travel-plans",
    "travelPlansSchema",
    "getTravelPlanByInviteId",
    "createTravelPlan",
    "updateTravelPlan",
  ]) {
    assert.equal(ROUTES.includes(gone), false, gone);
  }
});

test("R2: no GET handler in guest-invites.ts writes", () => {
  const gets = routeBlocks(ROUTES, "get");
  assert.ok(gets.length > 0, "the GET handlers must be locatable");
  for (const block of gets) {
    for (const write of [
      "storage.create",
      "storage.update",
      "storage.track",
      "storage.delete",
      "db.insert",
      "db.update",
      "db.delete",
    ]) {
      assert.equal(block.includes(write), false, `${block.slice(0, 70)} … ${write}`);
    }
  }
});

test("R3: token routes are the row 263 five plus delete-rsvp-details, and /origin and /rsvp still project", () => {
  const registrations = Array.from(
    ROUTES.matchAll(/router\.(get|post|put|patch|delete)\(\s*"(\/api\/invites\/:token[^"]*)"/g),
  ).map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.deepEqual(registrations.sort(), [
    "GET /api/invites/:token",
    "POST /api/invites/:token/delete-rsvp-details",
    "POST /api/invites/:token/origin",
    "POST /api/invites/:token/plan",
    "POST /api/invites/:token/rsvp",
    "POST /api/invites/:token/view",
  ]);
  for (const route of ["/api/invites/:token/origin", "/api/invites/:token/rsvp"]) {
    const block = routeBlocks(ROUTES, "post").find((b) => b.includes(`"${route}"`));
    assert.ok(block, route);
    assert.ok(block.includes("projectInviteForGuest(updated)"), route);
  }
});

test("R4: storage.ts has no travel-plan method, and the schema still exports the table", () => {
  const storage = stripComments(read("server/storage.ts"));
  for (const gone of [
    "getTravelPlanByInviteId",
    "createTravelPlan",
    "updateTravelPlan",
    "guestTravelPlans",
    "GuestTravelPlan",
  ]) {
    assert.equal(storage.includes(gone), false, gone);
  }
  assert.match(read("shared/guest-invites-schema.ts"), /export const guestTravelPlans = pgTable\(/);
});

test("R5: the SERP integration template is deleted and no source file names it", () => {
  const needle = "serp-api-" + "integration";
  assert.equal(fs.existsSync(path.join(ROOT, "server/services", `${needle}.ts`)), false);
  const hits: string[] = [];
  const walk = (dir: string) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && read(rel).includes(needle)) hits.push(rel);
    }
  };
  for (const dir of ["server", "shared", "scripts", "client/src"]) walk(dir);
  assert.deepEqual(hits, []);
});
