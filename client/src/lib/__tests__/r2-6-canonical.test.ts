/**
 * R2-6 — the client head manager must not rewrite a page's canonical to the site root.
 *
 * The defect: `components/seo-head.tsx:46` built `fullUrl` as `url ? SITE_ORIGIN + url : SITE_ORIGIN`,
 * so every page that did not pass `url` — `/earn` and `/pricing` among them — had its canonical
 * rewritten to `https://www.traveloure.com/` once JS ran, contradicting the server's own head.
 *
 *   C1 an explicit `url` still wins (a page may declare itself a duplicate)
 *   C2 without one, the page's own path is the canonical — self-referential, as the server sends it
 *   C3 the root is "/", never an empty tail
 *   C4 trailing slashes are normalized (query and fragment never reach here — the caller passes a path)
 *   C5 an absolute URL given as `url` is reduced to its path, so a canonical is ONE shape
 *   C6 the component asks this helper and no longer falls back to the bare origin
 *
 * Run: npx tsx --test client/src/lib/__tests__/r2-6-canonical.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalPath } from "../canonical";

const HEAD = fs.readFileSync("client/src/components/seo-head.tsx", "utf8");

describe("R2-6 — the canonical path", () => {
  it("C1 an explicit url wins", () => {
    assert.equal(canonicalPath("/pricing", "/earn"), "/pricing");
    assert.equal(canonicalPath("/experiences", "/pricing"), "/experiences");
  });

  it("C2 without a url, the page is canonical to itself", () => {
    assert.equal(canonicalPath(undefined, "/earn"), "/earn", "the reported case");
    assert.equal(canonicalPath(null, "/pricing"), "/pricing");
    assert.equal(canonicalPath("", "/experiences"), "/experiences");
  });

  it("C3 the root is '/', never an empty tail", () => {
    assert.equal(canonicalPath(undefined, "/"), "/");
    assert.equal(canonicalPath(undefined, ""), "/");
    assert.equal(canonicalPath(undefined, null), "/");
  });

  it("C4 trailing slashes are normalized", () => {
    assert.equal(canonicalPath(undefined, "/earn/"), "/earn");
    assert.equal(canonicalPath(undefined, "/pricing///"), "/pricing");
    assert.equal(canonicalPath("/experiences/", "/x"), "/experiences");
  });

  it("C5 an absolute url is reduced to its path", () => {
    assert.equal(canonicalPath("https://www.traveloure.com/pricing", "/earn"), "/pricing");
    assert.equal(canonicalPath("https://www.traveloure.com/", "/earn"), "/");
  });
});

describe("R2-6 — the component uses it", () => {
  it("C6 the head manager asks the helper and no longer falls back to the bare origin", () => {
    assert.match(HEAD, /import \{ canonicalPath \} from "@\/lib\/canonical";/);
    assert.match(HEAD, /const fullUrl = `\$\{SITE_ORIGIN\}\$\{canonicalPath\(url, pathname\)\}`;/, "one shape, from the helper");
    assert.match(HEAD, /window\.location\.pathname/, "the current path is what a page without `url` names");
    assert.doesNotMatch(HEAD, /url \? `\$\{SITE_ORIGIN\}\$\{url\}` : SITE_ORIGIN/, "the root fallback is gone");
  });
});
