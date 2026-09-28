/**
 * Lane C.4 console rules (ledger `2026-09-28-blog-consoles`, Locked Decision 57). Pure, plus source
 * checks on the two console pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { BLOG_POST_STATUSES } from "@shared/blog";
import {
  BLOG_STATUS_LABELS,
  blogConsoleActions,
  canEditBlogPost,
  createPostBody,
  draftPostBody,
  editConsequence,
  editPostBody,
  isSignedForCurrentContent,
  serverErrorText,
} from "../blog-console";

const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const H = "a".repeat(64);
const H2 = "b".repeat(64);
const expert = (status: string, signed: string | null = null) =>
  ({ status, authorship: "expert", contentSha256: H, signedContentSha256: signed });
const platform = (status: string) => ({ status, authorship: "platform", contentSha256: H, signedContentSha256: null });

test("C1 expert actions follow the server lifecycle: draft→submit, signed→publish, published→withdraw", () => {
  assert.deepEqual(blogConsoleActions(expert("draft")), ["submit"]);
  assert.deepEqual(blogConsoleActions(expert("in_review")), [], "in_review waits on the expert");
  assert.deepEqual(blogConsoleActions(expert("signed", H)), ["publish"]);
  assert.deepEqual(blogConsoleActions(expert("published", H)), ["withdraw"]);
  assert.deepEqual(blogConsoleActions(expert("withdrawn")), [], "withdrawn is kept, never acted on");
});

test("C2 publish is offered only when the signature covers THIS content", () => {
  assert.equal(isSignedForCurrentContent({ contentSha256: H, signedContentSha256: H }), true);
  assert.equal(isSignedForCurrentContent({ contentSha256: H, signedContentSha256: H2 }), false);
  assert.equal(isSignedForCurrentContent({ contentSha256: H, signedContentSha256: null }), false);
  assert.deepEqual(blogConsoleActions(expert("signed", H2)), []);
  assert.deepEqual(blogConsoleActions(expert("signed", null)), []);
});

test("C3 a platform post (ruling 5) is never submitted for review: draft→publish", () => {
  assert.deepEqual(blogConsoleActions(platform("draft")), ["publish"]);
  assert.deepEqual(blogConsoleActions(platform("published")), ["withdraw"]);
  assert.deepEqual(blogConsoleActions(platform("withdrawn")), []);
});

test("C4 every status is labelled; withdrawn is not editable; editing a signed/published post says it clears the signature", () => {
  for (const s of BLOG_POST_STATUSES) assert.ok(BLOG_STATUS_LABELS[s]);
  assert.equal(canEditBlogPost("withdrawn"), false);
  assert.equal(canEditBlogPost("published"), true);
  assert.match(editConsequence(expert("signed", H)) ?? "", /clears the expert's signature/);
  assert.match(editConsequence(expert("published", H)) ?? "", /clears the expert's signature/);
  assert.equal(editConsequence(expert("draft")), null);
});

test("C5 bodies carry exactly the route allowlists; the server's refusal is shown verbatim", () => {
  const create = createPostBody({
    contentType: "field_knowledge", slug: " kyoto-dawn ", title: "T", summary: "", body: "B",
    marketSlug: "kyoto", occasionSlug: "", bylineExpertId: "u1",
    sources: [{ url: "https://x.test/a", title: "", publisher: "P", quote: "" }, { url: " ", title: "t", publisher: "", quote: "" }],
  });
  assert.deepEqual(Object.keys(create).sort(),
    ["body", "bylineExpertId", "contentType", "marketSlug", "occasionSlug", "slug", "sources", "summary", "title"]);
  assert.equal(create.slug, "kyoto-dawn");
  assert.equal(create.summary, null);
  assert.deepEqual(create.sources, [{ url: "https://x.test/a", title: null, publisher: "P", quote: null }]);
  assert.deepEqual(Object.keys(draftPostBody({ contentType: "x", slug: "s", topic: "t", marketSlug: "", occasionSlug: "", bylineExpertId: "" })).sort(),
    ["bylineExpertId", "contentType", "marketSlug", "occasionSlug", "slug", "topic"]);
  assert.deepEqual(Object.keys(editPostBody({ title: "a", summary: "", body: "b" })).sort(), ["body", "summary", "title"],
    "the edit never sends sources — the server keeps the existing ones");
  assert.equal(serverErrorText(new Error('409: {"error":"not_signed_for_this_content"}')), "not_signed_for_this_content");
  assert.equal(serverErrorText(new Error("500: Internal Server Error")), "Internal Server Error");
});

test("C6 the console pages render no HTML, and the expert signs the SERVER's contentSha256", () => {
  const admin = read("../../pages/admin/blog.tsx");
  const review = read("../../pages/expert/blog-review.tsx");
  for (const src of [admin, review]) {
    assert.ok(!/dangerouslySetInnerHTML/.test(src), "a console page renders HTML");
    assert.match(src, /bodyParagraphs/, "bodies render as plain paragraphs");
  }
  assert.match(review, /\{\s*contentSha256:\s*post\.contentSha256\s*\}/, "sign sends the hash the review endpoint returned");
  assert.ok(!/crypto\.subtle|createHash|sha256\(/i.test(review), "the page never computes a hash");
  assert.match(admin, /BLOG_POST_STATUSES/, "the status filter reads the shared value set");
  assert.match(admin, /blogConsoleActions/, "actions come from the one pure rule");
});
