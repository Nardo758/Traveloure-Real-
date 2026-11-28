import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { offeringNamesById } from "../expert-application-review";

test("offeringNamesById maps known offerings", () => {
  const names = offeringNamesById([
    { offerings: [{ id: "off-1", name: "Tea ceremony" }] },
    { offerings: [{ id: "off-2", name: "  Walking tour  " }, { id: "off-3" }] },
  ]);
  assert.equal(names.get("off-1"), "Tea ceremony");
  assert.equal(names.get("off-2"), "Walking tour");
  assert.equal(names.has("off-3"), false);
});

test("offeringNamesById omits an id with no name", () => {
  const names = offeringNamesById([{ offerings: [{ id: "off-1" }, { id: "off-2", name: "" }] }]);
  assert.equal(names.size, 0);
});

test("offeringNamesById handles empty and malformed categories", () => {
  assert.equal(offeringNamesById([]).size, 0);
  assert.equal(offeringNamesById(undefined).size, 0);
  assert.equal(offeringNamesById([{ offerings: null }, {}] as any).size, 0);
});

test("the three review paragraphs carry [overflow-wrap:anywhere] (D6)", () => {
  const checks = [
    { file: "client/src/pages/travel-experts.tsx", needle: "ans.trim().slice(0, 120)" },
    { file: "client/src/pages/admin/experts.tsx", needle: "qa.answer.trim().slice(0, 200)" },
    { file: "client/src/pages/admin/providers.tsx", needle: "app.description.slice(0, 150)" },
  ];
  for (const check of checks) {
    const source = fs.readFileSync(path.join(process.cwd(), check.file), "utf8");
    const lines = source.split(/\r?\n/);
    const at = lines.findIndex((line) => line.includes(check.needle));
    assert.ok(at >= 0, `${check.file}: missing ${check.needle}`);
    const block = lines.slice(Math.max(0, at - 1), at + 2).join("\n");
    assert.match(block, /\[overflow-wrap:anywhere\]/, `${check.file}: paragraph does not carry the wrap class`);
  }
});
