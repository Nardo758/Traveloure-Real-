/**
 * Blog research + AI draft (ledger `2026-09-27-blog-draft`, Locked Decision 57; Lane C.2).
 * D1–D4 pure; D5–D8 run the pipeline with search and model INJECTED against a disposable database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { BlogError } from "../services/blog-posts.service";
import { buildDraftPrompt, draftPostFromResearch, parseDraft, selectSources, type DraftDeps } from "../services/blog-draft.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN = `bdraft-${RUN}-admin`;
const EXPERT = `bdraft-${RUN}-expert`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin'), (${EXPERT}, ${`${EXPERT}@t.test`}, 'expert')`);
});
after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE slug LIKE ${`d-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ADMIN}, ${EXPERT})`).catch(() => {});
});

const HITS = [
  { url: "https://kyoto.travel/eikando", title: "Eikando", content: "Eikando is known for autumn colours." },
  { url: "https://partner.example/deal", title: "Deal", content: "Book now" },
  { url: "https://jnto.go.jp/kyoto", title: "JNTO Kyoto", content: "x".repeat(400) },
];

async function code(p: Promise<unknown>) {
  try { await p; return "ok"; } catch (e) { return e instanceof BlogError ? e.code : `unexpected:${(e as Error).message}`; }
}

test("D1 research drops partner domains and never trims a long snippet", () => {
  const s = selectSources(HITS, ["partner.example"], 8, 300);
  assert.deepEqual(s.map((x) => x.url), ["https://kyoto.travel/eikando", "https://jnto.go.jp/kyoto"]);
  assert.equal(s[0].quote, "Eikando is known for autumn colours.");
  assert.equal(s[1].quote, null, "over-cap snippet keeps its URL, loses its quote — never cut");
});

test("D2 the prompt lists exactly the gathered sources, numbered", () => {
  const p = buildDraftPrompt({ contentType: "occasion_market_guide", topic: "autumn leaves", marketSlug: "kyoto", sources: selectSources(HITS, ["partner.example"]) });
  assert.match(p, /\[1\] Eikando — https:\/\/kyoto\.travel\/eikando/);
  assert.match(p, /\[2\] JNTO Kyoto/);
  assert.doesNotMatch(p, /partner\.example/);
});

test("D3 a draft citing nothing or an unknown source is refused whole", () => {
  assert.deepEqual(parseDraft('{"title":"T","summary":"S","body":"No cites."}', 2), { error: "draft_cites_nothing" });
  assert.deepEqual(parseDraft('{"title":"T","summary":"S","body":"Leaves [3]."}', 2), { error: "draft_cites_unknown_source" });
  assert.deepEqual(parseDraft("not json", 2), { error: "draft_malformed" });
  assert.deepEqual(parseDraft('{"title":"T","summary":"S","body":"Leaves [1][2]."}', 2), { title: "T", summary: "S", body: "Leaves [1][2]." });
});

test("D4 field knowledge and gems roundups are never web-drafted", async () => {
  const deps: DraftDeps = { search: async () => HITS, model: async () => "{}", refusedHosts: async () => [] };
  assert.equal(await code(draftPostFromResearch({ contentType: "field_knowledge", slug: `d-${RUN}-fk`, topic: "gion" }, ADMIN, deps)), "type_is_not_web_drafted");
  assert.equal(await code(draftPostFromResearch({ contentType: "gems_roundup", slug: `d-${RUN}-gr`, topic: "gion" }, ADMIN, deps)), "type_is_not_web_drafted");
});

test("D5 no search client, no model, or no sources ⇒ no draft", async () => {
  const req = { contentType: "occasion_market_guide", slug: `d-${RUN}-x`, topic: "autumn leaves", marketSlug: "kyoto", bylineExpertId: EXPERT };
  assert.equal(await code(draftPostFromResearch(req, ADMIN, { search: null, model: async () => "{}" })), "research_unavailable");
  assert.equal(await code(draftPostFromResearch(req, ADMIN, { search: async () => HITS, model: null })), "drafting_unavailable");
  assert.equal(await code(draftPostFromResearch(req, ADMIN, { search: async () => [HITS[1]], model: async () => "{}", refusedHosts: async () => ["partner.example"] })), "no_sources");
});

test("D6 a valid draft becomes an ordinary draft post with its sources in citation order", async () => {
  let seen: any = null;
  const post = await draftPostFromResearch(
    { contentType: "occasion_market_guide", slug: `d-${RUN}-ok`, topic: "autumn leaves", marketSlug: "kyoto", bylineExpertId: EXPERT },
    ADMIN,
    {
      search: async () => HITS,
      refusedHosts: async () => ["partner.example"],
      model: async (input) => { seen = input; return '{"title":"Autumn in Kyoto","summary":"Where the leaves are.","body":"Eikando glows in November [1]. JNTO lists it [2]."}'; },
    },
  );
  assert.equal(post.status, "draft", "a draft is never published or signed by the pipeline");
  assert.equal(seen.actorId, ADMIN, "the cost is attributed to the admin who asked");
  assert.equal(seen.requestId, `d-${RUN}-ok`);
  const src = await db.execute(sql`SELECT position, url FROM blog_post_sources WHERE post_id = ${post.id} ORDER BY position`);
  assert.deepEqual((src.rows as any[]).map((r) => [r.position, r.url]), [[1, "https://kyoto.travel/eikando"], [2, "https://jnto.go.jp/kyoto"]]);
});

test("D7 an invented citation writes no post", async () => {
  const slug = `d-${RUN}-bad`;
  assert.equal(await code(draftPostFromResearch(
    { contentType: "occasion_market_guide", slug, topic: "autumn leaves", marketSlug: "kyoto", bylineExpertId: EXPERT },
    ADMIN,
    { search: async () => HITS, refusedHosts: async () => ["partner.example"], model: async () => '{"title":"T","summary":"S","body":"Claim [7]."}' },
  )), "draft_cites_unknown_source");
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM blog_posts WHERE slug = ${slug}`);
  assert.equal((r.rows[0] as any).n, 0);
});
