/**
 * public-user-id.test.ts — LD 40 lane 2: no PUBLIC payload carries an earner's `users.id`.
 *
 * Ledger `2026-09-05-ld40-lane2-public-ids`; CLAUDE.md Locked Decision 40 and §14's read clause.
 * Pure by construction — no DB, no server, no network, no DOM — on the `contact-rails.test.ts` /
 * `earner-address.test.ts` precedent, so it runs in the same standalone `tsx --test` job.
 *
 * WHY THE ASSERTIONS READ SHIPPED SOURCE
 * ──────────────────────────────────────
 * A removed field is invisible: nothing 500s, no log line changes, and every page that stopped
 * reading it in lane 3 renders identically whether or not the server still sends it. There is no
 * runtime signal to assert on without standing up Postgres, and a test that needs a database to
 * prove a field is absent is a test that does not run in the job that would catch its return. So
 * the pins are over the payload builders themselves, scoped to the RETURNED object rather than the
 * whole function — `owner.id` is still read inside `loadStorefront`, and must be: an internal key
 * used internally is the point, it just never leaves.
 *
 * `scripts/check-public-user-id.cjs` is the other half of this and covers the CLASS (any public
 * payload, any users-shaped projection allowlist). These are the INSTANCES: the four payloads this
 * lane actually changed, plus the two exemptions, so a silent re-add fails here even if someone
 * teaches the guard to ignore it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");

/** The text between two markers, so an assertion is scoped to one payload and not a whole file. */
function between(src: string, startMarker: string, endMarker: string): string {
  const a = src.indexOf(startMarker);
  assert.ok(a >= 0, `start marker not found: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  assert.ok(b > a, `end marker not found after start: ${endMarker}`);
  return src.slice(a, b);
}

// ───────────────────────────────────────────────────────────────────────────
// R — the REMOVALS
// ───────────────────────────────────────────────────────────────────────────

test("R1 loadStorefront's earner payload carries the handle and no users.id", () => {
  const src = read("server", "routes", "storefront.routes.ts");
  const earner = between(src, "  return {\n    earner: {", "    services: resolvedServices,");
  assert.ok(/handle: owner\.handle/.test(earner), "the earner's public identity is missing");
  assert.ok(!/\bid: owner\.id\b/.test(earner), "the earner payload still publishes users.id");
  // The id is still READ inside the builder — that is what internal means.
  assert.ok(/owner\.id/.test(src), "owner.id should still be usable server-side");
});

test("R2 the provider directory row is keyed by handle, not by users.id", () => {
  const src = read("server", "routes", "storefront.routes.ts");
  const row = between(src, "return Promise.all(rows.map(async (row) => ({", "})));");
  assert.ok(/handle: row\.handle/.test(row), "the directory row lost its handle");
  assert.ok(!/\bid: row\.id\b/.test(row), "the directory row still publishes users.id");
  // Every row here HAS a handle by construction, which is why handle can be the identity at all.
  assert.ok(
    /isNotNull\(users\.handle\)/.test(src),
    "the directory query must still filter to handled providers — otherwise handle: null rows " +
      "would appear with no identity and no honest fallback (§13)",
  );

  // The client type must not re-declare the field the server stopped sending.
  const clientType = read("client", "src", "lib", "provider-directory-presentation.ts");
  const iface = between(clientType, "export interface ProviderStorefrontListing {", "}");
  assert.ok(!/^\s*id\s*[?:]/m.test(iface), "ProviderStorefrontListing still declares an id");
  assert.ok(/handle: string;/.test(iface));

  const page = read("client", "src", "pages", "providers-directory.tsx");
  assert.ok(
    /key=\{provider\.handle\}/.test(page) && !/key=\{provider\.id\}/.test(page),
    "the directory list must key on handle now that no id is sent",
  );
});

test("R3 the public service detail strips the owner's userId (every product shape)", () => {
  const src = read("server", "routes", "content.routes.ts");
  const handler = between(src, 'router.get("/api/services/:id", async (req, res) => {', 'router.get("/api/services/:id/availability"');

  // ONE strip, up front, so all four product-shape branches inherit it — each one spreads
  // `...service` (or a jittered derivative), so a per-branch strip would be four decisions.
  assert.ok(/"userId",/.test(handler), "userId is not in the detail read's omit list");
  assert.ok(/const ownerUserId = rawService\.userId;/.test(handler), "no internal owner handle");
  assert.ok(
    !/service\.userId/.test(handler),
    "the handler still reads service.userId — it must read ownerUserId, or the strip is a lie " +
      "waiting to be reverted by the next person who needs the owner",
  );

  // The rate-bearing column stays stripped here too (§18) — unchanged by this lane, pinned so a
  // refactor of the omit list cannot drop it.
  assert.ok(/"revenueShareRate",/.test(handler));
});

test("R4 the public service browse strips userId and the commission rate", () => {
  const src = read("server", "routes.ts");
  const handler = between(src, 'app.get("/api/provider-services", async (req, res) => {', 'app.get("/api/provider/services"');
  assert.ok(/"userId"/.test(handler), "public browse still publishes the owner's users.id");
  // §18: a rate-bearing column is never expose-able, in either direction. This was the THIRD
  // public read carrying it — the write rails (ruling 42) and the two other reads (ledger
  // 2026-09-05-experts-public-projection) were fixed; this one was missed by both.
  assert.ok(/"revenueShareRate"/.test(handler), "public browse still publishes revenueShareRate");
  // The §16 vacation gate reads s.userId BEFORE the strip; if that moved after it, away owners
  // would silently reappear on the public browse.
  assert.ok(
    handler.indexOf("filterOutAwayOwners") < handler.indexOf('"userId"'),
    "filterOutAwayOwners must read userId before the strip",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// V — the route that FORCED an id into a public payload
// ───────────────────────────────────────────────────────────────────────────

test("V1 provider verification is addressed by the LISTING, with one implementation", () => {
  const src = read("server", "routes.ts");
  assert.ok(
    /async function loadPublicVerification\(ownerUserId: string\)/.test(src),
    "the DTO must have ONE implementation (§18 rule 1)",
  );
  assert.equal(
    (src.match(/loadPublicVerification\(/g) ?? []).length,
    3,
    "expected one definition and exactly two callers — a third copy is the drift class §18 names",
  );
  assert.ok(/app\.get\("\/api\/services\/:id\/provider-verification"/.test(src));
  assert.ok(/app\.get\("\/api\/providers\/:userId\/public-verification"/.test(src));
});

test("V2 the service-addressed route applies the same F2 read-gate and one 404", () => {
  const src = read("server", "routes.ts");
  const route = between(
    src,
    'app.get("/api/services/:id/provider-verification"',
    'app.get("/api/providers/:userId/public-verification"',
  );
  assert.ok(/approvalStatus !== "approved"/.test(route), "no F2 gate on the new route");
  assert.ok(/status !== "active"/.test(route), "a paused listing must not answer either");
  // "no such listing" and "not a public listing" are ONE sentence, so this cannot be used to probe
  // which listings exist (the posture POST /api/conversations/start takes for its three kinds).
  assert.equal((route.match(/res\.status\(404\)/g) ?? []).length, 1);
  assert.ok(!/res\.status\(403\)/.test(route), "a 403 would answer a question a 404 refuses");
});

test("V3 the client reads the service-addressed route and no longer holds an owner id", () => {
  const page = read("client", "src", "pages", "service-detail.tsx");
  assert.ok(
    /queryKey: \["\/api\/services", id, "provider-verification"\]/.test(page),
    "service-detail still addresses verification by the owner's user id",
  );
  assert.ok(!/service\?\.userId/.test(page), "service-detail still reads service.userId");
  const iface = between(page, "interface Service {", "\n}");
  assert.ok(!/^\s*userId\s*[?:]/m.test(iface), "the Service type still declares userId");
});

// ───────────────────────────────────────────────────────────────────────────
// G — the guard, and the debt it prints
// ───────────────────────────────────────────────────────────────────────────

test("G1 the guard exists, self-tests, and is wired into CI", () => {
  const guard = read("scripts", "check-public-user-id.cjs");
  assert.ok(/--self-test/.test(guard), "§18d: a predicate change ships with fixtures");
  assert.ok(/NEGATIVE SPACE/.test(guard), "§18d: a guard states what it does not cover");
  const wf = read(".github", "workflows", "build.yml");
  assert.ok(
    /check-public-user-id\.cjs --self-test/.test(wf) && /check-public-user-id\.cjs\s*$/m.test(wf),
    "the guard must run in CI, self-test first — an unrun guard is not a guard",
  );
});

test("G2 both remaining exemptions are ANNOTATED with a reason, not silently allowed", () => {
  // Ruling 32's second disposition, the one phase2-fee-gate.sh applies to fee-literal-debt: an
  // exemption is printed on every run so filed debt never becomes a silent baseline. These two are
  // LD 40's own stated lane-2 preconditions, recorded in CLAUDE.md — they are not new debt.
  const schema = read("shared", "schema.ts");
  const list = between(schema, "export const EXPERT_PUBLIC_FIELDS = [", "] as const;");
  assert.ok(/"id",\s*\/\/ public-user-id-ok:/.test(list), "EXPERT_PUBLIC_FIELDS.id is unannotated");
  assert.ok(/"handle"/.test(list), "the public identity must be in the allowlist");

  const readyMade = read("server", "routes", "ready-made.routes.ts");
  assert.ok(/authorId: r\.authorId, \/\/ public-user-id-ok:/.test(readyMade));
  assert.ok(/authorHandle: r\.authorHandle \?\? null/.test(readyMade), "the preferred address is missing");
});

test("G3 CLAUDE.md records all three lanes as landed and names the standing rule", () => {
  const claude = read("CLAUDE.md");
  const ld40 = between(claude, "40. **`users.id` IS INTERNAL", "\n\n### §13");
  assert.ok(/check-public-user-id/.test(ld40), "the standing rule must name its guard");
  assert.ok(/LANE 2 HAS LANDED/.test(ld40));
  assert.ok(/LANE 3 HAS LANDED/.test(ld40));
});
