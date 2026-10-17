/**
 * R312 — the browser's Google Maps key is its own variable (ledger
 * `2026-10-04-maps-session-and-browser-key`).
 *   K1  GOOGLE_MAPS_BROWSER_KEY is the one name; VITE_GOOGLE_MAPS_API_KEY is retired and ignored; unset ⇒ "" (keyless maps)
 *       (ledger `2026-10-17-maps-browser-key-one-name`, amending R312)
 *   K2  vite exposes GOOGLE_MAPS_BROWSER_* and VITE_* only — no prefix matches the server's GOOGLE_MAPS_API_KEY
 *   K3  every Maps JavaScript load reads the one module, never import.meta.env directly
 *   K4  the build and the boot warn when the retired name is set, and the warning never carries its value
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveMapsBrowserKey } from "../maps-browser-key";
import { retiredMapsBrowserKeyWarning } from "../../../../shared/maps-browser-key-retired";

test("K1: the browser key only; the retired name is ignored; unset ⇒ nothing", () => {
  assert.equal(resolveMapsBrowserKey({ GOOGLE_MAPS_BROWSER_KEY: "b", VITE_GOOGLE_MAPS_API_KEY: "v" }), "b");
  assert.equal(resolveMapsBrowserKey({ GOOGLE_MAPS_BROWSER_KEY: "  ", VITE_GOOGLE_MAPS_API_KEY: "v" }), "", "the retired name is never a fallback");
  assert.equal(resolveMapsBrowserKey({ VITE_GOOGLE_MAPS_API_KEY: "v" }), "");
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

test("K4: the retired name warns at build and boot, and the warning never carries its value", () => {
  const secret = "AIza-retired-value-123";
  const w = retiredMapsBrowserKeyWarning({ VITE_GOOGLE_MAPS_API_KEY: secret });
  assert.equal(w, "VITE_GOOGLE_MAPS_API_KEY is retired and ignored; set GOOGLE_MAPS_BROWSER_KEY");
  assert.equal(w!.includes(secret), false);
  assert.equal(retiredMapsBrowserKeyWarning({}), null);
  assert.equal(retiredMapsBrowserKeyWarning({ VITE_GOOGLE_MAPS_API_KEY: "  " }), null);
  assert.equal(retiredMapsBrowserKeyWarning({ GOOGLE_MAPS_BROWSER_KEY: "b" }), null);
  // Both call sites use the shared helper, so the text cannot drift between them.
  assert.match(readFileSync("vite.config.ts", "utf8"), /retiredMapsBrowserKeyWarning\(process\.env\)/);
  assert.match(readFileSync("server/index.ts", "utf8"), /retiredMapsBrowserKeyWarning\(process\.env\)/);
});
