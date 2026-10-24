/**
 * Fix-queue row 102 — the admin approvals screen shows listing wording hits.
 * Source pin: no DOM, no server. The hits themselves are data from the shared list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PAGE = join(ROOT, "client/src/pages/admin/service-approvals.tsx");

test("approvals screen lists flagged wording when the server sends hits", () => {
  const src = readFileSync(PAGE, "utf8");
  assert.match(src, /bannedWording\?: string\[\]/);
  assert.match(src, /Flagged wording:/);
  assert.match(src, /s\.bannedWording\.length > 0/);
  assert.match(src, /data-testid=\{`badge-banned-wording-\$\{s\.id\}`\}/);
  assert.doesNotMatch(src, /disabled=\{[^}]*bannedWording/);
});
