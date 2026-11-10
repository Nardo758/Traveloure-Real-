/**
 * The header's partner trigger reads "Sign up" (Wording approved — Leon, Nov 10, 2026), replacing "Join as Partner".
 * Only the English label moved: the key, the trigger's testid, the mobile eyebrow and the Japanese value are unchanged.
 *
 * Run: npx tsx --test client/src/lib/__tests__/nav-sign-up-label.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const en = JSON.parse(read("client/src/locales/en/nav.json"));
const ja = JSON.parse(read("client/src/locales/ja/nav.json"));

test("SU1 the header trigger's English label is the approved 'Sign up'", () => {
  assert.equal(en.joinAsPartner, "Sign up");
});

test("SU2 the trigger still renders that key under its testid", () => {
  const layout = read("client/src/components/layout.tsx");
  const at = layout.indexOf('data-testid="button-become-expert-nav"');
  assert.ok(at > 0);
  assert.match(layout.slice(at, at + 600), /\{t\("joinAsPartner"\)\}/);
});

test("SU3 nothing user-facing still says 'Join as Partner'; the other strings are unchanged", () => {
  for (const f of ["client/src/locales/en/nav.json", "client/src/components/layout.tsx"]) {
    assert.equal(read(f).includes("Join as Partner"), false, f);
  }
  assert.equal(en.joinAsPartnerMobile, "Join as a Partner");
  assert.equal(ja.joinAsPartner, "パートナーになる");
});
