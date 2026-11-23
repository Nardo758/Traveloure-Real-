/**
 * R3 switch (Leon, Nov 22 2026): the flag is read at RUNTIME from the server, and the URL alone never switches a
 * surface on. These two rules are the whole contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { r3SurfaceOn } from "../r3-surface";

test("flag OFF ignores ?surface=r3 - the parameter alone changes nothing", () => {
  assert.equal(r3SurfaceOn("?surface=r3", false), false);
  assert.equal(r3SurfaceOn("surface=r3", false), false);
  assert.equal(r3SurfaceOn("", false), false);
});

test("flag ON plus ?surface=r3 is the only way in", () => {
  assert.equal(r3SurfaceOn("?surface=r3", true), true);
  assert.equal(r3SurfaceOn("surface=r3", true), true, "a bare search string works too");
  assert.equal(r3SurfaceOn("?view=days&surface=r3", true), true);
});

test("flag ON without the parameter keeps the old page", () => {
  assert.equal(r3SurfaceOn("", true), false);
  assert.equal(r3SurfaceOn("?view=days", true), false);
  assert.equal(r3SurfaceOn("?surface=other", true), false);
});
