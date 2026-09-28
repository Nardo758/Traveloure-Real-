/**
 * The blog's CONSOLE rules — the admin blog console and the expert review-and-sign page (Lane C.4;
 * ledger `2026-09-28-blog-consoles`, Locked Decision 57). PURE, so the rules are proven without
 * React, and every decision the two pages share has ONE home here (§18 rule 1).
 *
 * The server owns the lifecycle (`server/services/blog-posts.service.ts`). This module only decides
 * which BUTTONS to draw, and it draws a button exactly where the server's own atomic conditional can
 * succeed — a button the server will always refuse is a claim the page cannot keep (§13):
 *   expert post: draft → submit · signed (for THIS content) → publish · published → withdraw
 *   platform post (TravelPulse weekly, ruling 5): draft → publish · published → withdraw
 *   in_review waits on the expert's signature; withdrawn is kept and never acted on.
 * A button is never the guard — the route's own WHERE is (§14 posture).
 */
import { BLOG_POST_STATUSES, type BlogPostStatus } from "@shared/blog";

export type BlogConsoleAction = "submit" | "publish" | "withdraw";

/** The fields of an admin list row that decide its actions (the raw row the admin list returns). */
export interface BlogConsoleRow {
  status: string;
  authorship: string;
  contentSha256: string;
  signedContentSha256: string | null;
}

export const BLOG_STATUS_LABELS: Record<BlogPostStatus, string> = {
  draft: "Draft",
  in_review: "Awaiting expert signature",
  signed: "Signed",
  published: "Published",
  withdrawn: "Withdrawn",
};

export const BLOG_ACTION_LABELS: Record<BlogConsoleAction, string> = {
  submit: "Send to expert for review",
  publish: "Publish",
  withdraw: "Withdraw",
};

export function isBlogPostStatus(v: unknown): v is BlogPostStatus {
  return typeof v === "string" && (BLOG_POST_STATUSES as readonly string[]).includes(v);
}

export function statusLabel(status: string): string {
  return isBlogPostStatus(status) ? BLOG_STATUS_LABELS[status] : status;
}

/** A signature covers exactly one version: the signed hash must equal the current content hash. */
export function isSignedForCurrentContent(row: Pick<BlogConsoleRow, "contentSha256" | "signedContentSha256">): boolean {
  return !!row.signedContentSha256 && row.signedContentSha256 === row.contentSha256;
}

/** The actions a row offers — mirroring the server's from-states, never widening them. */
export function blogConsoleActions(row: BlogConsoleRow): BlogConsoleAction[] {
  const platform = row.authorship === "platform";
  switch (row.status) {
    case "draft":
      return platform ? ["publish"] : ["submit"];
    case "signed":
      return !platform && isSignedForCurrentContent(row) ? ["publish"] : [];
    case "published":
      return ["withdraw"];
    default:
      return [];
  }
}

/** A withdrawn post is kept and not edited — a new post is written instead (server refuses it). */
export function canEditBlogPost(status: string): boolean {
  return isBlogPostStatus(status) && status !== "withdrawn";
}

/**
 * What saving an edit does to the post, said out loud BEFORE the save (ruling 3), or null when the
 * edit moves nothing. Mirrors `editPost`'s next-status rule.
 */
export function editConsequence(row: Pick<BlogConsoleRow, "status" | "authorship">): string | null {
  const platform = row.authorship === "platform";
  if (row.status === "signed") {
    return "Saving clears the expert's signature. The post goes back to the expert, who must review and sign this new version before it can be published.";
  }
  if (row.status === "published") {
    return platform
      ? "Saving takes this post off the public blog and returns it to draft until it is published again."
      : "Saving clears the expert's signature and takes this post off the public blog until the expert signs the new version and it is published again.";
  }
  if (row.status === "in_review") {
    return "The expert has not signed yet. Saving changes the version they are asked to sign; they will see the new text.";
  }
  return null;
}

/**
 * The server's refusal, verbatim. `apiRequest` throws `"<status>: <body>"`, and the blog rails answer
 * `{ error: "<code>" }` — so the code is shown as the server wrote it, and any other body is shown
 * whole rather than replaced by a guess.
 */
export function serverErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return "Request failed";
  const m = /^\d{3}:\s*([\s\S]*)$/.exec(msg);
  const bodyText = m ? m[1].trim() : msg;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed.error === "string") return parsed.error;
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON — shown as-is
  }
  return bodyText || msg;
}

const blankToNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export interface BlogSourceForm { url: string; title: string; publisher: string; quote: string }

/** Source rows → the route's `sourceBody` shape. A row with no URL is not a source and is dropped. */
export function sourcesBody(rows: readonly BlogSourceForm[]) {
  return rows
    .filter((s) => s.url.trim())
    .map((s) => ({
      url: s.url.trim(),
      title: blankToNull(s.title),
      publisher: blankToNull(s.publisher),
      quote: blankToNull(s.quote),
    }));
}

export interface BlogCreateForm {
  contentType: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  marketSlug: string;
  occasionSlug: string;
  bylineExpertId: string;
  sources: BlogSourceForm[];
}

/** Exactly the create allowlist (`createBody`, `.strict()`) — no other key is ever sent. */
export function createPostBody(f: BlogCreateForm) {
  return {
    contentType: f.contentType,
    slug: f.slug.trim(),
    title: f.title.trim(),
    summary: blankToNull(f.summary),
    body: f.body,
    marketSlug: blankToNull(f.marketSlug),
    occasionSlug: blankToNull(f.occasionSlug),
    bylineExpertId: blankToNull(f.bylineExpertId),
    sources: sourcesBody(f.sources),
  };
}

export interface BlogDraftForm {
  contentType: string;
  slug: string;
  topic: string;
  marketSlug: string;
  occasionSlug: string;
  bylineExpertId: string;
}

/** Exactly the AI-draft allowlist (`draftBody`, `.strict()`). */
export function draftPostBody(f: BlogDraftForm) {
  return {
    contentType: f.contentType,
    slug: f.slug.trim(),
    topic: f.topic.trim(),
    marketSlug: blankToNull(f.marketSlug),
    occasionSlug: blankToNull(f.occasionSlug),
    bylineExpertId: blankToNull(f.bylineExpertId),
  };
}

export interface BlogEditForm { title: string; summary: string; body: string }

/**
 * The edit allowlist (`editBody`, `.strict()`). Sources are deliberately NOT sent: the admin list
 * does not carry them, and omitting the key is how the server keeps the existing sources.
 */
export function editPostBody(f: BlogEditForm) {
  return { title: f.title.trim(), summary: blankToNull(f.summary), body: f.body };
}

/** Sentences the expert reads before signing — one home, shared by the page and its test. */
export const BLOG_SIGN_COPY = {
  intro:
    "These posts carry your name. Read each one in full. Signing is your consent to publish this exact version under your name.",
  publishNote:
    "Signing does not publish. A post goes live only after an admin publishes it.",
  reSignNote:
    "Any later change, even a typo fix, clears your signature and the post comes back here to be signed again.",
  empty: "Nothing is waiting for your signature.",
} as const;
