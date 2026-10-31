/**
 * 299b — /kyoto#experts scrolls to the expert form on a cold load and after
 * an in-app navigation. The page wires useScrollToHash, which reads the hash
 * on mount (cold) and again when wouter's location changes or hashchange fires.
 *
 * Run: npx tsx --test client/src/lib/__tests__/kyoto-hash-scroll.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hashElementId, scrollToLocationHash } from "../hash-scroll";

const PAGE = readFileSync(path.join(process.cwd(), "client/src/pages/launch-waitlist.tsx"), "utf8");
const HOOK = readFileSync(path.join(process.cwd(), "client/src/lib/use-hash-scroll.ts"), "utf8");

function doc() {
  const calls: string[] = [];
  return {
    calls,
    getElementById(id: string) {
      if (id !== "experts" && id !== "providers") return null;
      return { scrollIntoView: () => calls.push(id) };
    },
  };
}

test("a cold load with #experts scrolls to the expert form", () => {
  const page = doc();
  assert.equal(hashElementId("#experts"), "experts");
  assert.equal(scrollToLocationHash({ hash: "#experts" }, page), true);
  assert.deepEqual(page.calls, ["experts"]);
  assert.equal(scrollToLocationHash({ hash: "" }, page), false);
  assert.deepEqual(page.calls, ["experts"]);
});

test("an in-app navigation to #experts scrolls again, and a bare path does not", () => {
  const page = doc();
  assert.equal(scrollToLocationHash({ hash: "" }, page), false);
  assert.equal(scrollToLocationHash({ hash: "#experts" }, page), true);
  assert.deepEqual(page.calls, ["experts"]);
});

test("the waitlist page scrolls on location and on hashchange, and the form has id=experts", () => {
  assert.match(PAGE, /useScrollToHash\(\)/);
  assert.match(PAGE, /id="experts"/);
  assert.match(PAGE, /id="providers"/);
  assert.match(HOOK, /useLocation\(\)/);
  assert.match(HOOK, /scrollToLocationHash\(window\.location, document\)/);
  assert.match(HOOK, /hashchange/);
  const experts = PAGE.indexOf('id="experts"');
  const form = PAGE.indexOf("<ExpertWaitlistForm");
  assert.ok(experts > 0 && form > experts, "the expert form sits inside section#experts");
});
