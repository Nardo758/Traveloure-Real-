import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveResendKey, RESEND_KEY_VARS } from "../resend-key";

const NEW = "re_fixture_new_name_not_a_real_credential";
const OLD = "re_fixture_old_name_not_a_real_credential";

test("the new name wins when both are set", () => {
  assert.deepEqual(
    resolveResendKey({ TRAVELOURE_RESEND_API_KEY: NEW, RESEND_API_KEY: OLD }),
    { key: NEW, source: "TRAVELOURE_RESEND_API_KEY" },
  );
});

test("the old name is the fallback when the new one is unset or empty", () => {
  for (const env of [{ RESEND_API_KEY: OLD }, { TRAVELOURE_RESEND_API_KEY: "", RESEND_API_KEY: OLD }, { TRAVELOURE_RESEND_API_KEY: undefined, RESEND_API_KEY: OLD }]) {
    assert.deepEqual(resolveResendKey(env), { key: OLD, source: "RESEND_API_KEY" });
  }
});

test("neither present yields no key and no source", () => {
  for (const env of [{}, { TRAVELOURE_RESEND_API_KEY: "", RESEND_API_KEY: "" }, { RESEND_API_KEY: undefined }]) {
    assert.deepEqual(resolveResendKey(env), { key: undefined, source: null });
  }
});

test("a set value is never repaired, and a malformed new value does not fall back", () => {
  for (const value of [" " + NEW, NEW + "\n", `"${NEW}"`, "   ", "not a key"]) {
    assert.deepEqual(
      resolveResendKey({ TRAVELOURE_RESEND_API_KEY: value, RESEND_API_KEY: OLD }),
      { key: value, source: "TRAVELOURE_RESEND_API_KEY" },
    );
  }
});

test("the lookup order is the new name, then the old", () => {
  assert.deepEqual([...RESEND_KEY_VARS], ["TRAVELOURE_RESEND_API_KEY", "RESEND_API_KEY"]);
});

test("every runtime reader goes through the lookup, not the bare variable", () => {
  for (const file of [
    "server/services/email.service.ts",
    "server/services/resend-diagnostic.ts",
    "server/routes/resend-diagnostic.ts",
    "server/routes/admin.routes.ts",
    "server/services/admin-digest-scheduler.service.ts",
    "server/index.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.ok(!/process\.env\.RESEND_API_KEY|env\.RESEND_API_KEY/.test(src), `${file} reads RESEND_API_KEY directly`);
    assert.ok(/resolveResendKey|diagnoseLoadedResendKey/.test(src), `${file} does not use the shared lookup`);
  }
});
