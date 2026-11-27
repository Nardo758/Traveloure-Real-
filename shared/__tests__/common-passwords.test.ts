import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { COMMON_PASSWORD_ERROR, isCommonPassword } from "../common-passwords";

test("a listed password is refused after trimming and lower-casing", () => {
  assert.equal(isCommonPassword("password123"), true);
  assert.equal(isCommonPassword("PASSWORD123"), true);
  assert.equal(isCommonPassword("  password123  "), true);
});

test("an unlisted 8-character password is allowed", () => {
  assert.equal(isCommonPassword("vN7!qZ2@"), false);
});

test("empty and short values are not common-password matches", () => {
  assert.equal(isCommonPassword(""), false);
  assert.equal(isCommonPassword("   "), false);
  assert.equal(isCommonPassword("short"), false);
});

test("the error string is the stamped one", () => {
  assert.equal(COMMON_PASSWORD_ERROR, "This password is too common. Choose a different one.");
});

test("the helper and data file make no network call", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "shared/common-passwords.ts"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|node:https?|from ["']axios["']|from ["']node:http/);
});
