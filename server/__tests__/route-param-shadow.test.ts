/**
 * No route in server/routes/content.routes.ts is registered after a `/:param` sibling that answers it first
 * (ledger `2026-10-18-by-location-deleted`; decision-maker, Oct 18, 2026).
 *
 * Express matches in registration order, so `GET /api/x/:id` registered before `GET /api/x/by-location` answers
 * every by-location call with `id = "by-location"` — the later handler never runs, and nothing errors or logs.
 * That is how `/api/affiliate/products/by-location` stayed dead; it was deleted, and this pins the class.
 *
 *   RS1 the scanner flags a literal path registered after a same-verb `/:param` sibling of the same depth
 *   RS2 the scanner passes the same pair in the safe order, a different verb, and a different depth
 *   RS3 content.routes.ts has no shadowed route
 *
 * Negative space: it reads string-literal paths passed to `router.<verb>(` / `app.<verb>(` in ONE file. It does
 * not see a path built at run time, a regex path, a sub-router mounted with `router.use`, `*` wildcards,
 * optional params (`:id?`), or a sibling registered in another file.
 *
 * Run: npx tsx --test server/__tests__/route-param-shadow.test.ts
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

export interface Shadow {
  verb: string;
  path: string;
  line: number;
  by: string;
  byLine: number;
}

const REGISTRATION = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`$]+)["'`]/g;

/** Every route registered after an earlier same-verb route that matches it through a `:param` segment. */
export function findParamShadows(src: string): Shadow[] {
  const seen: { verb: string; path: string; line: number }[] = [];
  const shadows: Shadow[] = [];
  for (const m of src.matchAll(REGISTRATION)) {
    const verb = m[1];
    const path = m[2];
    const line = src.slice(0, m.index).split("\n").length;
    const segs = path.split("/");
    for (const prior of seen) {
      if (prior.verb !== verb || prior.path === path) continue;
      const p = prior.path.split("/");
      if (p.length !== segs.length) continue;
      const hides = p.every((s, i) => s === segs[i] || (s.startsWith(":") && !s.endsWith("?") && !segs[i].startsWith(":")));
      if (hides) shadows.push({ verb, path, line, by: prior.path, byLine: prior.line });
    }
    seen.push({ verb, path, line });
  }
  return shadows;
}

test("RS1: a literal path after a same-verb /:param sibling is flagged", () => {
  const src = `router.get("/api/x/:id", h);\nrouter.get("/api/x/by-location", h);\n`;
  assert.deepEqual(findParamShadows(src), [{ verb: "get", path: "/api/x/by-location", line: 2, by: "/api/x/:id", byLine: 1 }]);
});

test("RS2: the safe order, another verb and another depth pass", () => {
  assert.deepEqual(findParamShadows(`router.get("/api/x/by-location", h);\nrouter.get("/api/x/:id", h);\n`), []);
  assert.deepEqual(findParamShadows(`router.get("/api/x/:id", h);\nrouter.post("/api/x/by-location", h);\n`), []);
  assert.deepEqual(findParamShadows(`router.get("/api/x/:id", h);\nrouter.get("/api/x/by-location/all", h);\n`), []);
});

test("RS3: content.routes.ts registers no route after a /:param sibling that answers it", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  const shadows = findParamShadows(src);
  assert.deepEqual(
    shadows.map((s) => `${s.verb.toUpperCase()} ${s.path} (line ${s.line}) is answered by ${s.by} (line ${s.byLine})`),
    [],
  );
});
