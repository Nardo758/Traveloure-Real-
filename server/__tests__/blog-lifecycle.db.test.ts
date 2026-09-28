/**
 * Expert-signed blog lifecycle (ledger `2026-09-27-blog-lifecycle`, Locked Decision 57; Lane C rulings).
 *
 * L1–L2 are pure (the byline decision, source admission). L3–L10 run the service against a disposable
 * database with the byline gate and the partner-host list INJECTED, so the state machine is proven
 * without the storefront graph. Every assertion is a database fact read back after the call.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { decideBylineEligibility } from "../services/blog-byline-gate.service";
import {
  BlogError,
  computeContentSha256,
  createPost,
  editPost,
  getPublishedBySlug,
  publishPost,
  signPost,
  sourceRefusal,
  submitForReview,
  withdrawPost,
  type BlogDeps,
} from "../services/blog-posts.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN = `blog-${RUN}-admin`;
const EXPERT = `blog-${RUN}-expert`;
const OTHER = `blog-${RUN}-other`;
const eligible: BlogDeps = { gate: async () => ({ eligible: true }), refusedHosts: async () => ["partner.example"] };
const slug = (s: string) => `t-${RUN}-${s}`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, handle) VALUES
    (${ADMIN}, ${`${ADMIN}@t.test`}, 'Ad', 'Min', 'admin', NULL),
    (${EXPERT}, ${`${EXPERT}@t.test`}, 'Aiko', 'Tanaka', 'expert', ${`aiko${RUN}`}),
    (${OTHER}, ${`${OTHER}@t.test`}, 'Ot', 'Her', 'expert', NULL)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE slug LIKE ${`t-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ADMIN}, ${EXPERT}, ${OTHER})`).catch(() => {});
});

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return "ok"; } catch (e) { return e instanceof BlogError ? e.code : `unexpected:${(e as Error).message}`; }
}
async function row(id: string): Promise<any> {
  return (await db.execute(sql`SELECT * FROM blog_posts WHERE id = ${id}`)).rows[0];
}
function expertInput(s: string, extra: Record<string, unknown> = {}) {
  return {
    contentType: "occasion_market_guide", slug: slug(s), title: "Kyoto in November", summary: "Leaves and lanes",
    body: "Start early at Eikando.", marketSlug: "kyoto", bylineExpertId: EXPERT,
    sources: [{ url: "https://kyoto.travel/en/eikando", title: "Eikando", quote: "Famous for autumn leaves." }],
    ...extra,
  };
}

test("L1 the byline decision names the first missing fact", () => {
  const ok = { marketSlug: "kyoto", approved: true, handle: "aiko", storefrontLive: true, verifiedMarkets: ["kyoto"] };
  assert.deepEqual(decideBylineEligibility(ok), { eligible: true });
  assert.deepEqual(decideBylineEligibility({ ...ok, marketSlug: null }), { eligible: false, reason: "no_market" });
  assert.deepEqual(decideBylineEligibility({ ...ok, approved: false }), { eligible: false, reason: "not_approved" });
  assert.deepEqual(decideBylineEligibility({ ...ok, handle: null }), { eligible: false, reason: "no_handle" });
  assert.deepEqual(decideBylineEligibility({ ...ok, storefrontLive: false }), { eligible: false, reason: "storefront_not_live" });
  assert.deepEqual(decideBylineEligibility({ ...ok, verifiedMarkets: ["goa"] }), { eligible: false, reason: "no_verified_neighborhood_in_market" });
});

test("L2 a partner-domain source and an over-cap quote are refused, never trimmed", () => {
  assert.equal(sourceRefusal({ url: "https://www.partner.example/x" }, ["partner.example"]), "source_on_partner_domain");
  assert.equal(sourceRefusal({ url: "https://deals.partner.example/x" }, ["partner.example"]), "source_on_partner_domain");
  assert.equal(sourceRefusal({ url: "https://kyoto.travel/a", quote: "x".repeat(301) }, [], 300), "quote_over_300_chars");
  assert.equal(sourceRefusal({ url: "https://kyoto.travel/a", quote: "x".repeat(300) }, [], 300), null);
  assert.equal(sourceRefusal({ url: "javascript:alert(1)" }, []), "source_url_invalid");
});

test("L3 authorship rules and the unique slug", async () => {
  assert.equal(await code(createPost({ ...expertInput("nobyline"), bylineExpertId: null }, ADMIN, eligible)), "byline_required");
  assert.equal(await code(createPost({ contentType: "travelpulse_weekly", slug: slug("tp-byline"), title: "t", body: "b", bylineExpertId: EXPERT }, ADMIN, eligible)), "platform_post_has_no_byline");
  assert.equal(await code(createPost(expertInput("partner", { sources: [{ url: "https://partner.example/a" }] }), ADMIN, eligible)), "source_on_partner_domain");
  await createPost(expertInput("dup"), ADMIN, eligible);
  assert.equal(await code(createPost(expertInput("dup"), ADMIN, eligible)), "slug_taken");
});

test("L4–L6 sign exactly what was reviewed; any edit voids the signature; publish only a matching hash", async () => {
  const p = await createPost(expertInput("flow"), ADMIN, eligible);
  await submitForReview(p.id, eligible);
  const r0 = await row(p.id);
  assert.equal(r0.status, "in_review");
  assert.equal(r0.content_sha256, computeContentSha256({
    title: "Kyoto in November", summary: "Leaves and lanes", body: "Start early at Eikando.",
    sources: [{ url: "https://kyoto.travel/en/eikando", title: "Eikando", quote: "Famous for autumn leaves." }],
  }), "the hash covers title, summary, body and sources");

  assert.equal(await code(signPost(p.id, OTHER, r0.content_sha256, eligible)), "not_found", "another expert cannot sign");
  assert.equal(await code(signPost(p.id, EXPERT, "0".repeat(64), eligible)), "content_changed_since_review");
  await signPost(p.id, EXPERT, r0.content_sha256, eligible);
  const r1 = await row(p.id);
  assert.equal(r1.status, "signed");
  assert.ok(r1.consent_at, "the signature is the per-post consent (ruling 2)");
  assert.equal(r1.signed_content_sha256, r0.content_sha256);

  // Ruling 3: an admin typo fix after signing returns it to review and clears the signature.
  await editPost(p.id, { title: "Kyoto in November." }, ADMIN, eligible);
  const r2 = await row(p.id);
  assert.equal(r2.status, "in_review");
  assert.equal(r2.signed_content_sha256, null);
  assert.equal(r2.consent_at, null);
  assert.equal(await code(publishPost(p.id, ADMIN, eligible)), "not_signed_for_this_content");

  await signPost(p.id, EXPERT, r2.content_sha256, eligible);
  // The gate is re-checked at publish: an expert who lost eligibility is not published.
  assert.equal(await code(publishPost(p.id, ADMIN, { gate: async () => ({ eligible: false, reason: "storefront_not_live" }) })), "byline_storefront_not_live");
  assert.equal((await row(p.id)).status, "signed");
  await publishPost(p.id, ADMIN, eligible);
  const pub = await getPublishedBySlug(slug("flow"));
  assert.ok(pub);
  assert.deepEqual(pub!.byline, { handle: `aiko${RUN}`, displayName: "Aiko Tanaka" });
  assert.equal(JSON.stringify(pub).includes(EXPERT), false, "no user id on the public read (LD 40)");
  assert.equal(pub!.platformLabel, null);
});

test("L7–L8 editing a published post takes it down; withdraw keeps the row", async () => {
  const p = await createPost(expertInput("live"), ADMIN, eligible);
  await submitForReview(p.id, eligible);
  await signPost(p.id, EXPERT, (await row(p.id)).content_sha256, eligible);
  await publishPost(p.id, ADMIN, eligible);
  await editPost(p.id, { body: "Start early at Eikando. Arrive by 8." }, ADMIN, eligible);
  assert.equal((await row(p.id)).status, "in_review");
  assert.equal(await getPublishedBySlug(slug("live")), null, "an unsigned edit is never public");

  await signPost(p.id, EXPERT, (await row(p.id)).content_sha256, eligible);
  await publishPost(p.id, ADMIN, eligible);
  await withdrawPost(p.id, ADMIN, "outdated");
  const w = await row(p.id);
  assert.equal(w.status, "withdrawn");
  assert.equal(w.withdraw_reason, "outdated");
  assert.equal(await getPublishedBySlug(slug("live")), null);
  assert.equal(await code(editPost(p.id, { title: "x" }, ADMIN, eligible)), "withdrawn_posts_are_not_edited");
  assert.equal(await code(withdrawPost(p.id, ADMIN, null)), "not_published");
});

test("L9 TravelPulse weekly is platform-authored, labelled, and needs no signature", async () => {
  const p = await createPost({ contentType: "travelpulse_weekly", slug: slug("tp"), title: "Kyoto this week", body: "Signal.", marketSlug: "kyoto" }, ADMIN, eligible);
  assert.equal(p.authorship, "platform");
  assert.equal(await code(submitForReview(p.id, eligible)), "platform_posts_are_not_reviewed");
  await publishPost(p.id, ADMIN, eligible);
  const pub = await getPublishedBySlug(slug("tp"));
  assert.equal(pub!.byline, null);
  assert.equal(pub!.platformLabel, "AI signal from public data");
});

test("L10 submission is refused when the byline gate refuses", async () => {
  const p = await createPost(expertInput("gate"), ADMIN, eligible);
  assert.equal(await code(submitForReview(p.id, { gate: async () => ({ eligible: false, reason: "no_verified_neighborhood_in_market" }) })), "byline_no_verified_neighborhood_in_market");
  assert.equal((await row(p.id)).status, "draft");
});
