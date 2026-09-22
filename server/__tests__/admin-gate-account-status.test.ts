/**
 * admin-gate-account-status.test.ts — board #1434
 *
 * THE DEFECT THIS PINS. Three middlewares answer one question — "may this session
 * act?" — and before this test they gave three different answers:
 *
 *   isAuthenticated   (replitAuth.ts)      refused deleted AND suspended
 *   requireAdminLocal (admin.routes.ts)    refused suspended only
 *   adminApiGuard     (routes.ts, §2)      refused neither
 *
 * That only matters where a gate is the ONLY gate on a route, and it is: 15 of the
 * 248 `/api/admin/*` routes carry no per-route middleware and ride the blanket
 * `app.use("/api/admin", adminApiGuard)` alone (six of them mutations), and 13 of
 * admin.routes.ts's 16 `requireAdminLocal` routes carry no `isAuthenticated` in front.
 *
 * It is not hypothetical that a bad session survives: the suspend handler's session
 * purge is deliberately non-fatal (`admin.routes.ts`, "session purge failed
 * (non-fatal)"), so a purge that throws leaves the row and logs a warning.
 *
 * WHY THIS IS A SOURCE ASSERTION rather than an HTTP one. The defect was DIVERGENCE
 * between copies, not a wrong answer in any single one — an HTTP test proves one gate
 * on one route, and a fourth copy written next month would pass it. This asserts the
 * property that was actually violated: every middleware that can be the sole gate on
 * an /api/admin route refuses both account states.
 *
 * STATED NEGATIVE SPACE (§18d). It reads source text, so it proves the check is
 * PRESENT, never that it is correct or correctly ordered; it covers `/api/admin/*`
 * only, and says nothing about the non-admin routes that resolve a session user
 * outside `isAuthenticated` (see docs/briefs/SUSPENDED_SESSION_REACH.md).
 *
 * Run with: npx tsx --test server/__tests__/admin-gate-account-status.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Slice a named `const <name> = async (req...` middleware out of a file. */
function middlewareBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = async (req`);
  assert.notEqual(start, -1, `middleware ${name} not found — was it renamed?`);
  // Everything up to the next top-level `};` that closes the arrow function.
  const end = source.indexOf("\n};", start);
  const endAlt = source.indexOf("\n  };", start);
  const stop = end === -1 ? endAlt : endAlt === -1 ? end : Math.min(end, endAlt);
  assert.notEqual(stop, -1, `could not find the end of ${name}`);
  return source.slice(start, stop);
}

const GATES: Array<{ name: string; file: string; body: string }> = [
  { name: "adminApiGuard", file: "server/routes.ts", body: "" },
  { name: "requireAdminLocal", file: "server/routes/admin.routes.ts", body: "" },
].map((g) => ({ ...g, body: middlewareBody(read(g.file), g.name) }));

describe("#1434 — every sole gate on /api/admin refuses a deleted or suspended account", () => {
  it("A1: adminApiGuard and requireAdminLocal both refuse isDeleted and isSuspended", () => {
    for (const gate of GATES) {
      assert.match(
        gate.body,
        /user\.isDeleted/,
        `${gate.name} (${gate.file}) does not refuse a DELETED account`,
      );
      assert.match(
        gate.body,
        /user\.isSuspended/,
        `${gate.name} (${gate.file}) does not refuse a SUSPENDED account`,
      );
    }
  });

  it("A2: isAuthenticated — the gate the other 233 admin routes also carry — still refuses both", () => {
    const src = read("server/replit_integrations/auth/replitAuth.ts");
    const start = src.indexOf("export const isAuthenticated");
    assert.notEqual(start, -1, "isAuthenticated not found — was it renamed?");
    const body = src.slice(start);
    assert.match(body, /dbUser\??\.isDeleted/, "isAuthenticated stopped refusing deleted accounts");
    assert.match(body, /dbUser\??\.isSuspended/, "isAuthenticated stopped refusing suspended accounts");
  });

  it("A3: every admin-gated route is covered by something that checks account status", () => {
    // The invariant, stated as the three ways a route can be covered:
    //   (a) its path is under /api/admin — the blanket `adminApiGuard` runs, pinned by A1; or
    //   (b) its chain carries `isAuthenticated`, pinned by A2; or
    //   (c) every admin-shaped gate in its chain checks both flags itself.
    // A route matching none of the three is reachable by a deleted or suspended admin.
    const files = ["server/routes.ts", ...fs
      .readdirSync(path.join(ROOT, "server/routes"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `server/routes/${f}`)];

    /** Does a file define an admin-shaped gate of this name that checks both flags? */
    const gateChecksStatus = (file: string, name: string): boolean => {
      const src = read(file);
      const idx = Math.max(
        src.indexOf(`const ${name} = async (req`),
        src.indexOf(`function ${name}(req`),
      );
      if (idx === -1) return false;
      // Look only at the definition, not the rest of the file.
      const window = src.slice(idx, idx + 2000);
      return /\.isDeleted/.test(window) && /\.isSuspended/.test(window);
    };

    const ADMIN_GATE = /^(requireAdmin|adminApiGuard|isEA)/;
    const violations: string[] = [];
    for (const file of files) {
      const lines = read(file).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(
          /^\s*(?:app|router)\.(?:get|post|put|patch|delete)\(\s*(["\'`])(\/[^"\'`]*)\1\s*,?/,
        );
        if (!m) continue;
        const routePath = m[2];
        if (routePath.startsWith("/api/admin")) continue; // (a)
        const head = lines.slice(i, i + 4).join(" ");
        const hIdx = head.search(/(?:async\s*)?\(\s*req\b/);
        const mws = hIdx >= 0 ? head.slice(0, hIdx) : head;
        const after = mws.slice(mws.indexOf(routePath) + routePath.length);
        const ids = (after.match(/[A-Za-z_$][\w$]*/g) ?? []).filter((id) => ADMIN_GATE.test(id));
        if (ids.length === 0) continue; // not an admin-gated route
        if (/\bisAuthenticated\b/.test(after)) continue; // (b)
        for (const id of ids) {
          if (!gateChecksStatus(file, id)) {
            violations.push(`${file}:${i + 1} ${routePath} — gated by ${id}, which checks no account status`);
          }
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `admin-gated route(s) reachable by a deleted or suspended session:\n${violations.join("\n")}`,
    );
  });

  it("A4: the blanket-guard-only inventory is non-empty — if it ever reaches zero, A1's adminApiGuard case has stopped being load-bearing and this test should say so rather than pass silently", () => {
    const files = ["server/routes.ts", ...fs
      .readdirSync(path.join(ROOT, "server/routes"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `server/routes/${f}`)];
    let blanketOnly = 0;
    for (const file of files) {
      const lines = read(file).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(
          /^\s*(?:app|router)\.(?:get|post|put|patch|delete)\(\s*(["'`])(\/api\/admin[^"'`]*)\1\s*,?/,
        );
        if (!m) continue;
        const head = lines.slice(i, i + 4).join(" ");
        const hIdx = head.search(/(?:async\s*)?\(\s*req\b/);
        const mws = hIdx >= 0 ? head.slice(0, hIdx) : head;
        if (!/isAuthenticated|requireAdminLocal/.test(mws)) blanketOnly++;
      }
    }
    assert.ok(
      blanketOnly > 0,
      "no /api/admin route rides the blanket guard alone any more — re-read this test's premise",
    );
  });
});
