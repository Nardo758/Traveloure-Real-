/**
 * The Terms version a user is RECORDED as accepting is the version the Terms page DISPLAYS
 * (ledger `2026-09-27-cancel-preview-equals-refund`). Before this pin the page read "Version 1.1"
 * while every acceptance was stored as "1.0" from a server-local literal. Both sides now read
 * `shared/legal-versions.ts`; these proofs fail if either side stops reading it or grows a literal.
 *
 * Run: npx tsx --test shared/__tests__/legal-versions.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "../legal-versions";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const IMPORT = /import\s*\{[^}]*CURRENT_TERMS_VERSION[^}]*\}\s*from\s*"@shared\/legal-versions"/;

test("V1 the Terms page renders its version from the shared constant, and names no version literal", () => {
  const page = read("client/src/pages/terms.tsx");
  assert.match(page, IMPORT);
  assert.ok(page.includes("Version {CURRENT_TERMS_VERSION}"), "the footer reads the constant");
  assert.doesNotMatch(page, /Version\s+\d+(\.\d+)+/, "no hard-coded version on the page");
});

test("V2 every acceptance writer records the shared constant, never a literal", () => {
  for (const rel of ["server/replit_integrations/auth/routes.ts", "server/replit_integrations/auth/emailAuth.ts"]) {
    const src = read(rel);
    assert.match(src, IMPORT, `${rel} imports the shared constant`);
    assert.doesNotMatch(src, /const\s+CURRENT_(TERMS|PRIVACY)_VERSION\s*=/, `${rel} declares no local copy`);
    assert.doesNotMatch(src, /(termsVersion|privacyVersion)\s*:\s*["'`]/, `${rel} writes no version literal`);
  }
});

test("V3 no other server file writes a terms/privacy version literal", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(p); continue; }
      if (!p.endsWith(".ts")) continue;
      if (/(termsVersion|privacyVersion)\s*:\s*["'`]\d/.test(fs.readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk(path.join(process.cwd(), "server"));
  assert.deepEqual(offenders, []);
});

test("V4 the recorded Terms version is the one the page shows today (1.1), unchanged by this fix", () => {
  assert.equal(CURRENT_TERMS_VERSION, "1.1");
  assert.equal(CURRENT_PRIVACY_VERSION, "1.0");
});
