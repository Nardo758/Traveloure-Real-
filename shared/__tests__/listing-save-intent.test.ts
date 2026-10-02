/**
 * Save-as-Draft admission and the post-terms home pin.
 * Run: npx tsx --test shared/__tests__/listing-save-intent.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { admitListingSaveIntent } from "../listing-save-intent";

const REPO_ROOT = process.cwd();

test("S1 an absent saveIntent is not a draft", () => {
  assert.deepEqual(admitListingSaveIntent({ status: "draft", serviceName: "x" }), {
    ok: true,
    draft: false,
    submit: false,
  });
  assert.deepEqual(admitListingSaveIntent(null), { ok: true, draft: false, submit: false });
});

test("S2 draft and submit are the only admitted values", () => {
  assert.deepEqual(admitListingSaveIntent({ saveIntent: "draft", price: "0" }), {
    ok: true,
    draft: true,
    submit: false,
  });
  assert.deepEqual(admitListingSaveIntent({ saveIntent: "submit" }), {
    ok: true,
    draft: false,
    submit: true,
  });
  const refused = admitListingSaveIntent({ saveIntent: "approved" });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "INVALID_SAVE_INTENT");
  }
});

test("S3 accept-terms sends each role home through getRoleHomePath", () => {
  const src = readFileSync(path.join(REPO_ROOT, "client/src/pages/accept-terms.tsx"), "utf8");
  assert.match(src, /getRoleHomePath\(user\?\.role \?\? ""\)/);
  assert.equal(src.includes('setLocation("/dashboard")'), false);
});
