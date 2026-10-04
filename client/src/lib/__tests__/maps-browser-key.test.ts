/**
 * R299 — the browser's Google Maps key is its own variable (ledger
 * `2026-10-04-maps-session-and-browser-key`).
 *   K1  GOOGLE_MAPS_BROWSER_KEY wins; VITE_GOOGLE_MAPS_API_KEY is the fallback; neither ⇒ "" (keyless maps)
 *   K2  vite exposes GOOGLE_MAPS_BROWSER_* and VITE_* only — no prefix matches the server's GOOGLE_MAPS_API_KEY
 *   K3  every Maps JavaScript load reads the one module, never import.meta.env directly
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveMapsBrowserKey } from "../maps-browser-key";

test("K1: the browser key, then the older client variable, then nothing", () => {
  assert.equal(resolveMapsBrowserKey({ GOOGLE_MAPS_BROWSER_KEY: "b", VITE_GOOGLE_MAPS_API_KEY: "v" }), "b");
  assert.equal(resolveMapsBrowserKey({ GOOGLE_MAPS_BROWSER_KEY: "  ", VITE_GOOGLE_MAPS_API_KEY: "v" }), "v");
  assert.equal(resolveMapsBrowserKey({}), "");
  assert.equal(resolveMapsBrowserKey({ GOOGLE_MAPS_API_KEY: "server" }), "", "the server key is never read");
});

test("K2: the exposed prefixes cannot match the server key", () => {
  const cfg = readFileSync("vite.config.ts", "utf8");
  const m = cfg.match(/envPrefix:\s*\[([^\]]*)\]/);
  assert.ok(m, "vite.config sets envPrefix");
  const prefixes = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(prefixes, ["VITE_", "GOOGLE_MAPS_BROWSER_"]);
  assert.equal(prefixes.some((p) => "GOOGLE_MAPS_API_KEY".startsWith(p)), false);
});

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "__tests__") files(p, out);
    } else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("K3: no client file reads a Google Maps key off import.meta.env except the one module", () => {
  const offenders = files("client/src").filter(
    (f) => !f.endsWith("lib/maps-browser-key.ts") && /import\.meta\.env\.(VITE_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_BROWSER_KEY)/.test(readFileSync(f, "utf8")),
  );
  assert.deepEqual(offenders, []);
});
