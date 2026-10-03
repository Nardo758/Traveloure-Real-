/**
 * Lane C.3b reader rules (ledger `2026-09-27-blog-pages`). Pure, plus source checks on the two pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { BLOG_REACTION_KINDS } from "@shared/blog";
import {
  BLOG_REACTION_LABELS,
  authorLine,
  blogIndexNoindex,
  blogPostNoindex,
  bodyParagraphs,
  blogSourceView,
  bylinePath,
  canAskTheLocal,
  publishedLabel,
} from "../blog-view";

const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const byline = { handle: "aiko", displayName: "Aiko Tanaka" };

test("B1 the index is noindex until at least one post has LOADED", () => {
  assert.equal(blogIndexNoindex(undefined), true);
  assert.equal(blogIndexNoindex(null), true);
  assert.equal(blogIndexNoindex([]), true);
  assert.equal(blogIndexNoindex([{}]), false);
  assert.equal(blogPostNoindex(null), true);
});

test("B2 the byline is a handle link, and only an expert post can Ask the local", () => {
  assert.equal(bylinePath(byline), "/s/aiko");
  assert.equal(bylinePath(null), null);
  assert.equal(canAskTheLocal({ byline }), true);
  assert.equal(canAskTheLocal({ byline: null }), false, "a platform post has no local to ask");
  assert.equal(authorLine({ byline: null, platformLabel: "AI-drafted from public and licensed data sources" }), "AI-drafted from public and licensed data sources");
});

test("B3 every reaction kind has a label; body is paragraphs; a missing date says nothing", () => {
  for (const k of BLOG_REACTION_KINDS) assert.ok(BLOG_REACTION_LABELS[k]);
  assert.deepEqual(bodyParagraphs("a\n\n  b \n\n\n"), ["a", "b"]);
  assert.equal(publishedLabel(null), null);
  assert.equal(publishedLabel("not a date"), null);
});

test("B4 the pages show no counts, render no HTML, and never address a person by id", () => {
  for (const page of ["../../pages/blog.tsx", "../../pages/blog-post.tsx"]) {
    const src = read(page);
    assert.ok(!/dangerouslySetInnerHTML/.test(src), `${page} renders HTML`);
    assert.ok(!/count|impressions/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${page} mentions a count`);
    assert.ok(!/userId|expertId|bylineExpertId/.test(src), `${page} names a user id`);
  }
  const post = read("../../pages/blog-post.tsx");
  assert.match(post, /blogPostSlug/, "Ask the local uses the blogPostSlug address");
  assert.match(post, /blogSourceView\(s\)/, "every source line renders from the one view (which carries BLOG_SOURCE_LINK_REL)");
});

test("B5 render: an official-source fact's source line reads 'from <source> — checked <date>' and links to the fact's URL (ruling R-p)", () => {
  const v = blogSourceView({ url: "https://kyoto.travel/en/x", title: "from Kyoto City Official Travel Guide", publisher: "checked 2 Oct 2026" });
  assert.deepEqual(v, {
    href: "https://kyoto.travel/en/x",
    text: "from Kyoto City Official Travel Guide",
    detail: "checked 2 Oct 2026",
    rel: "nofollow noopener noreferrer",
  });
  assert.equal(blogSourceView({ url: "https://x.example/" }).text, "https://x.example/", "no title ⇒ the URL itself");
  assert.equal(blogSourceView({ url: "https://x.example/", publisher: "  " }).detail, null);
  const post = read("../../pages/blog-post.tsx");
  assert.match(post, /href=\{v\.href\}/);
  assert.match(post, /rel=\{v\.rel\}/);
  assert.match(post, /\{v\.text\}/);
  assert.match(post, /— \{v\.detail\}/);
});
