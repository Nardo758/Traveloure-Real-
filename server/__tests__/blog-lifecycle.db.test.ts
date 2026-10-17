/**
 * Expert-signed blog lifecycle (ledger `2026-09-27-blog-lifecycle`, Locked Decision 57; Lane C rulings).
 *
 * L1–L2 are pure (the byline decision, source admission). L3–L10 run the service against a disposable
 * database with the byline gate and the partner-host list INJECTED, so the state machine is proven
 * without the storefront graph. Every assertion is a database fact read back after the call.
 * L11–L14 are the editorial guide (ED-1a); L15–L17 the Traveloure Editorial house account (ED-1b,
 * migration 385), which earns nothing, advises no plan and is never ranked.
 */
import { test, before, after, mock } from "node:test";
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
import { getEditorialUserId, invalidateEditorialAccountCache } from "../services/editorial-account.service";
import { insertRoutableExpertForm } from "./helpers/routable-expert";

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
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${ADMIN} AND action = 'blog_editorial_publish'`).catch(() => {});
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
  assert.equal(pub!.platformLabel, "AI-drafted from public and licensed data sources");
});

test("L10 submission is refused when the byline gate refuses", async () => {
  const p = await createPost(expertInput("gate"), ADMIN, eligible);
  assert.equal(await code(submitForReview(p.id, { gate: async () => ({ eligible: false, reason: "no_verified_neighborhood_in_market" }) })), "byline_no_verified_neighborhood_in_market");
  assert.equal((await row(p.id)).status, "draft");
});

// ── ED-1a: editorial guides (decision-maker, Oct 16, 2026) ───────────────────────────────────
const CHECKED = new Date("2026-10-01T00:00:00Z");
function editorialInput(s: string, extra: Record<string, unknown> = {}) {
  return {
    contentType: "editorial_guide", slug: slug(s), title: "Kyoto foliage: closed days and last admission",
    body: "Check the closed day before you go.", marketSlug: "kyoto",
    sources: [{ url: "https://kyoto.travel/en/eikando", title: "Eikando", publisher: "Kyoto City", retrievedAt: CHECKED }],
    ...extra,
  } as any;
}

test("L11 an editorial guide is authored by editorial and carries no expert byline", async () => {
  const p = await createPost(editorialInput("ed-create"), ADMIN, eligible);
  assert.equal(p.authorship, "editorial");
  assert.equal(p.bylineExpertId, null);
  assert.equal(p.status, "draft");
  assert.equal(await code(createPost(editorialInput("ed-byline", { bylineExpertId: EXPERT }), ADMIN, eligible)), "editorial_post_has_no_expert_byline");
  assert.equal(await code(submitForReview(p.id, eligible)), "editorial_posts_are_not_reviewed");
});

test("L12 an editorial source without a checked date is refused, never published undated", async () => {
  const undated = editorialInput("ed-undated", { sources: [{ url: "https://kyoto.travel/en/eikando", title: "Eikando" }] });
  assert.equal(await code(createPost(undated, ADMIN, eligible)), "source_checked_date_required");
  const p = await createPost(editorialInput("ed-edit-undated"), ADMIN, eligible);
  assert.equal(await code(editPost(p.id, { sources: [{ url: "https://kyoto.travel/en/x" }] }, ADMIN, eligible)), "source_checked_date_required");
  // Other types keep their rules: an expert source still needs no date.
  await createPost(expertInput("ed-expert-undated"), ADMIN, eligible);
});

test("L13 Publish is the audited approval; an edit after publish returns the post to draft", async () => {
  const p = await createPost(editorialInput("ed-publish"), ADMIN, eligible);
  await publishPost(p.id, ADMIN, eligible, { ipAddress: "127.0.0.1", userAgent: "ed1-test" });
  const r = await row(p.id);
  assert.equal(r.status, "published");
  assert.equal(r.published_by, ADMIN);
  const audit = (await db.execute(sql`SELECT * FROM access_audit_logs
    WHERE action = 'blog_editorial_publish' AND resource_type = 'blog_post' AND resource_id = ${p.id}`)).rows as any[];
  assert.equal(audit.length, 1, "exactly one approval row");
  assert.equal(audit[0].actor_id, ADMIN);
  assert.equal(audit[0].metadata.contentSha256, r.content_sha256, "the row names the version approved");
  assert.equal(await code(publishPost(p.id, ADMIN, eligible)), "not_a_draft", "a published post is not approved twice");

  await editPost(p.id, { body: "Closed on Wednesdays in November." }, ADMIN, eligible);
  assert.equal((await row(p.id)).status, "draft");
  assert.equal(await getPublishedBySlug(slug("ed-publish")), null, "an edited editorial post leaves the public read");
});

test("L14 the public read: plain editorial byline, no storefront, no platform label, dated sources", async () => {
  const p = await createPost(editorialInput("ed-public"), ADMIN, eligible);
  await publishPost(p.id, ADMIN, eligible);
  const pub = await getPublishedBySlug(slug("ed-public")) as any;
  assert.equal(pub.byline, null, "no expert byline, so no storefront link and no Ask the local");
  assert.equal(pub.editorialByline, "Traveloure Editorial");
  assert.equal(pub.platformLabel, null);
  assert.equal(pub.sources.length, 1);
  assert.equal(pub.sources[0].url, "https://kyoto.travel/en/eikando");
  assert.equal(pub.sources[0].checkedAt, CHECKED.toISOString());
  assert.equal(JSON.stringify(pub).includes(ADMIN), false, "no user id on the public read (LD 40)");
});

// ── ED-1b: the Traveloure Editorial house account (migration 385) ──────────────────────────────────
async function editorialId(): Promise<string> {
  invalidateEditorialAccountCache();
  const id = await getEditorialUserId();
  assert.ok(id, "migration 385 seeds platform_settings.editorial_user_id");
  const u = (await db.execute(sql`SELECT password, role, handle FROM users WHERE id = ${id}`)).rows[0] as any;
  assert.ok(u, "the house account row exists");
  assert.equal(u.password, null, "never a login");
  assert.equal(u.role, "user", "not an expert or provider role");
  assert.equal(u.handle, null, "no storefront handle");
  return id!;
}

test("L15 the earnings mint refuses the editorial house account", async () => {
  const id = await editorialId();
  const { storage } = await import("../storage");
  const { logger } = await import("../infrastructure/logger");
  const warn = mock.method(logger, "warn");
  try {
    const bookingId = `blog-${RUN}-booking`;
    const minted = await storage.mintCompletionEarningsForBooking({
      id: bookingId, providerId: id, serviceId: `blog-${RUN}-service`, status: "completed",
      totalAmount: "100.00", platformFee: "10.00", providerEarnings: "90.00", bookingDetails: {},
      stripePaymentIntentId: "pi_test_editorial",
    } as any);
    assert.equal(minted, false);
    assert.ok(
      warn.mock.calls.some((c) => String(c.arguments[1] ?? "").includes("editorial house account")),
      "refused by the editorial check, not by a later gate",
    );
    const earned = await db.execute(sql`SELECT 1 FROM expert_earnings WHERE booking_id = ${bookingId}`).catch(() => ({ rows: [] }));
    assert.equal(earned.rows.length, 0);
  } finally {
    warn.mock.restore();
  }
});

test("L16 the advisor-row author refuses the editorial house account", async () => {
  const id = await editorialId();
  const { upsertTripAdvisorRow } = await import("../services/booking-actions.service");
  await assert.rejects(
    upsertTripAdvisorRow({ tripId: `blog-${RUN}-trip`, localExpertId: id, status: "pending" } as any),
    /Traveloure Editorial house account advises no plan/,
  );
  const rows = await db.execute(sql`SELECT 1 FROM trip_expert_advisors WHERE local_expert_id = ${id}`);
  assert.equal(rows.rows.length, 0);
});

test("L17 the editorial account never appears in the expert directory or lead scoring", async () => {
  const id = await editorialId();
  const { directoryExperts, routableUserIds } = await import("../services/expert-routability");
  const { leadRoutingService } = await import("../services/lead-routing.service");
  // Even given a routable application (which migration 385 never creates), it is excluded by id.
  // OTHER, given the same application, is the control: the exclusion is the account, not the form.
  await insertRoutableExpertForm(id);
  await insertRoutableExpertForm(OTHER);
  await db.execute(sql`UPDATE local_expert_forms SET destinations = '["Kyoto"]'::jsonb WHERE user_id IN (${id}, ${OTHER})`);
  try {
    const routable = await routableUserIds([id, OTHER]);
    assert.equal(routable.has(OTHER), true, "control is routable");
    assert.equal(routable.has(id), false, "directory/routing filter excludes the editorial account");
    const listed = await directoryExperts([{ id }, { id: OTHER }]);
    assert.deepEqual(listed.map((e) => e.id), [OTHER]);
    for (const requireRoutable of [true, false]) {
      const scored = await leadRoutingService.scoreExperts({ destination: "kyoto", requireRoutable } as any);
      assert.equal(scored.some((s: any) => s.expertId === OTHER), true, `control scored (requireRoutable=${requireRoutable})`);
      assert.equal(scored.some((s: any) => s.expertId === id), false, `editorial never scored (requireRoutable=${requireRoutable})`);
    }
  } finally {
    await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id IN (${id}, ${OTHER})`);
  }
});
