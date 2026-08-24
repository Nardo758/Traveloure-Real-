/**
 * Ruling 60 Phase B — provider CONTENT translation (service_translations).
 * docs/DECISIONS.md ruling 60 / ruling 73; QA_PUNCH_LIST I18N-4; CLAUDE.md §13/§14/§19.
 *
 * System B (the provider's OWN traveler-facing content) — NOT system A (chrome). §13's honesty
 * rule is the heart of this lane and is what these proofs pin:
 *   P1  PUT stores an APPROVED HUMAN translation; the traveler read under ?locale=ja returns the
 *       translated content, translation.status='approved', shownInEnglish=false.
 *   P2  A service with NO ja translation returns the ORIGINAL English + an explicit fallback flag
 *       (shownInEnglish=true) — labeled, never silent, never machine-translated at read time.
 *   P3  An ai_draft/draft row is NEVER returned to the traveler read (a draft's content is hidden;
 *       the read shows the honest fallback instead).
 *   P4  Provider APPROVAL flips a draft to approved/human, and the content THEN shows to travelers.
 *   P5  A non-owner cannot write / read / approve a translation (404 — ownership, §14).
 *   P6  A client-supplied status / source / updatedBy / timestamp in the PUT body is IGNORED —
 *       the row is approved/human, updatedBy is the session user (§14/§19).
 *   P7  The AI-draft endpoint DEGRADES HONESTLY with no translation provider configured (503,
 *       a clear AI_DRAFT_UNAVAILABLE state) and creates NO row — never a fabricated/echoed
 *       translation (§13). (The draft LIFECYCLE is proven via a directly-seeded draft in P3/P4,
 *       exactly as the build brief authorizes for a bench with no live AI key.)
 *   P8  The en (source-language) read carries translation: null — no label on the original.
 *   P9  An unsupported translation target (en, or an unshipped locale) is rejected (400).
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000, same
 * posture as short-links-frame.http.test.ts — fixtures via the app's own auth API for users
 * (real FK-safe ids + session cookies), direct disposable-DB-guarded SQL for provider_services and
 * the seeded ai_draft row (no live LLM needed for the lifecycle).
 *
 * Run solo: npx tsx --test server/__tests__/service-content-translation.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors short-links-frame.http.test.ts; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await readPool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-content-translation] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `sct-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Xlate", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  // The provider-translation endpoints live under /api/provider/services/* and are correctly
  // gated by isEarner (the shared offering surface, CLAUDE.md §5). Grant the stored provider role
  // so the gate is satisfied — and so P5 proves OWNERSHIP (404) rather than the role gate (403):
  // a stranger who IS an earner but not the owner must still be turned away.
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [body.user.id]);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const EN_NAME = "Kyoto private tea ceremony";
const EN_DESC = "A ninety-minute guided tea ceremony in a machiya townhouse.";
const EN_MEET = "Meet at the north gate of Nishiki Market.";

async function makeService(ownerId: string, label: string): Promise<string> {
  const id = `sct-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, short_description, description, meeting_point,
        price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, 'A calm hour of matcha.', $4, $5,
             '80.00', 'active', 'approved', 'in_person')`,
    [id, ownerId, EN_NAME, EN_DESC, EN_MEET],
  );
  createdServiceIds.push(id);
  return id;
}

let owner: Actor;
let stranger: Actor;
let svcHuman: string;
let svcFallback: string;
let svcDraft: string;
let svcNoKey: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  owner = await registerActor("owner");
  stranger = await registerActor("stranger");
  svcHuman = await makeService(owner.id, "human");
  svcFallback = await makeService(owner.id, "fallback");
  svcDraft = await makeService(owner.id, "draft");
  svcNoKey = await makeService(owner.id, "nokey");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      // service_translations cascades from provider_services, but delete explicitly first so a
      // partial failure never orphans fixture rows.
      await readPool.query(`DELETE FROM service_translations WHERE service_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── P1: PUT an approved human translation; traveler ja read returns it ───────────────────────
const JA_NAME = "京都・お茶会（プライベート）";
const JA_DESC = "町家で行う90分のガイド付きお茶会です。";
const JA_MEET = "錦市場の北門でお待ち合わせします。";

test("P1a: PUT stores an approved human translation for ja", async () => {
  const res = await api(`/api/provider/services/${svcHuman}/translations/ja`, owner.cookie, "PUT", {
    serviceName: JA_NAME,
    description: JA_DESC,
    meetingPoint: JA_MEET,
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.locale, "ja");
  assert.equal(body.translation.status, "approved");
  assert.equal(body.translation.source, "human");
  assert.equal(body.translation.serviceName, JA_NAME);
  assert.equal(body.translation.updatedBy, owner.id, "updatedBy is the session user (§14)");
});

test("P1b: traveler read ?locale=ja returns the TRANSLATED content, no fallback label", async () => {
  const res = await api(`/api/services/${svcHuman}?locale=ja`, undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.serviceName, JA_NAME, "name is the translated string");
  assert.equal(body.description, JA_DESC, "description is the translated string");
  assert.equal(body.meetingPoint, JA_MEET, "meeting point is the translated string");
  assert.equal(body.translation.status, "approved");
  assert.equal(body.translation.shownInEnglish, false, "no fallback label on an approved translation");
});

test("P1c: an untranslated field (shortDescription) falls back to the ORIGINAL, never blanked", async () => {
  // P1a deliberately omitted shortDescription — an approved partial translation must show the
  // original English for the untranslated field, not null (§13 honesty).
  const res = await api(`/api/services/${svcHuman}?locale=ja`, undefined);
  const body = await res.json();
  assert.equal(body.shortDescription, "A calm hour of matcha.");
});

// ── P2: no translation → original + honest fallback label ────────────────────────────────────
test("P2: a service with NO ja translation returns the original + shownInEnglish=true (labeled)", async () => {
  const res = await api(`/api/services/${svcFallback}?locale=ja`, undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.serviceName, EN_NAME, "original English name is shown");
  assert.equal(body.description, EN_DESC);
  assert.ok(body.translation, "a non-en read always carries the translation meta");
  assert.equal(body.translation.status, "fallback");
  assert.equal(body.translation.shownInEnglish, true, "the label flag is set — honest, not silent");
});

// ── P3 + P4: draft is hidden from travelers; approval reveals it ──────────────────────────────
const JA_DRAFT_NAME = "京都・お茶会（AI下書き）";
const JA_DRAFT_DESC = "これは機械翻訳による下書きです。";

test("P3a: seed an ai_draft/draft row directly (the lifecycle without a live LLM)", async () => {
  await readPool.query(
    `INSERT INTO service_translations
       (id, service_id, locale, service_name, description, status, source, updated_by)
     VALUES ($1, $2, 'ja', $3, $4, 'draft', 'ai_draft', $5)`,
    [crypto.randomUUID(), svcDraft, JA_DRAFT_NAME, JA_DRAFT_DESC, owner.id],
  );
  // Owner can read it and sees it LABELED as a machine draft (review surface).
  const res = await api(`/api/provider/services/${svcDraft}/translations/ja`, owner.cookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.translation.status, "draft");
  assert.equal(body.translation.source, "ai_draft", "an AI draft is labeled by construction");
});

test("P3b: the draft is NEVER returned to a traveler — read shows the honest fallback", async () => {
  const res = await api(`/api/services/${svcDraft}?locale=ja`, undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.notEqual(body.serviceName, JA_DRAFT_NAME, "draft content must not leak to a traveler");
  assert.equal(body.serviceName, EN_NAME, "the original English is shown instead");
  assert.equal(body.translation.status, "fallback");
  assert.equal(body.translation.shownInEnglish, true);
});

test("P4a: provider approval flips the draft to approved/human", async () => {
  const res = await api(`/api/provider/services/${svcDraft}/translations/ja/approve`, owner.cookie, "POST");
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.translation.status, "approved");
  assert.equal(body.translation.source, "human", "approval transfers authorship to the reviewing provider");
  assert.equal(body.translation.serviceName, JA_DRAFT_NAME, "approval keeps the reviewed content verbatim");
});

test("P4b: the approved (formerly draft) content NOW shows to travelers", async () => {
  const res = await api(`/api/services/${svcDraft}?locale=ja`, undefined);
  const body = await res.json();
  assert.equal(body.serviceName, JA_DRAFT_NAME);
  assert.equal(body.translation.status, "approved");
  assert.equal(body.translation.shownInEnglish, false);
});

// ── P5: non-owner cannot touch a translation ─────────────────────────────────────────────────
test("P5a: a non-owner PUT is 404 (ownership, §14)", async () => {
  const res = await api(`/api/provider/services/${svcHuman}/translations/ja`, stranger.cookie, "PUT", {
    serviceName: "hijacked",
  });
  assert.equal(res.status, 404);
});

test("P5b: a non-owner GET is 404, and a non-owner approve is 404", async () => {
  const g = await api(`/api/provider/services/${svcHuman}/translations/ja`, stranger.cookie);
  assert.equal(g.status, 404);
  const a = await api(`/api/provider/services/${svcHuman}/translations/ja/approve`, stranger.cookie, "POST");
  assert.equal(a.status, 404);
  // And the owner's row is intact (the non-owner PUT changed nothing).
  const chk = await api(`/api/services/${svcHuman}?locale=ja`, undefined);
  const body = await chk.json();
  assert.equal(body.serviceName, JA_NAME, "the stranger's write never landed");
});

// ── P6: client-supplied privileged fields are ignored ────────────────────────────────────────
test("P6: a PUT body carrying status/source/updatedBy/timestamps is stripped (§14/§19)", async () => {
  const res = await api(`/api/provider/services/${svcFallback}/translations/ja`, owner.cookie, "PUT", {
    serviceName: "客が設定した名前",
    // Privileged fields a crafted request might try to smuggle in:
    status: "draft",
    source: "ai_draft",
    updatedBy: stranger.id,
    updated_by: stranger.id,
    createdAt: "1999-01-01T00:00:00.000Z",
    updatedAt: "1999-01-01T00:00:00.000Z",
    id: "attacker-chosen-id",
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.translation.status, "approved", "status is server-set by the path, not the body");
  assert.equal(body.translation.source, "human", "source is server-set, not the body's ai_draft");
  assert.equal(body.translation.updatedBy, owner.id, "updatedBy is the session user, not the body");
  assert.notEqual(body.translation.id, "attacker-chosen-id");
  // The DB row confirms the timestamp was server-stamped, not the 1999 the body asked for.
  const row = await readPool.query(
    `SELECT updated_at, updated_by, status, source FROM service_translations WHERE service_id = $1 AND locale = 'ja'`,
    [svcFallback],
  );
  assert.equal(row.rows[0].updated_by, owner.id);
  assert.equal(row.rows[0].status, "approved");
  assert.ok(new Date(row.rows[0].updated_at).getFullYear() >= 2026, "updated_at is server-stamped, not 1999");
});

// ── P7: AI-draft endpoint degrades honestly with no key ──────────────────────────────────────
test("P7: the AI-draft endpoint returns 503 AI_DRAFT_UNAVAILABLE and creates NO row (no key on bench)", async () => {
  assert.ok(!process.env.ANTHROPIC_API_KEY, "this proof assumes the bench has no live AI key");
  const res = await api(`/api/provider/services/${svcNoKey}/translations/ja/draft`, owner.cookie, "POST");
  const body = await res.json();
  assert.equal(res.status, 503, JSON.stringify(body));
  assert.equal(body.code, "AI_DRAFT_UNAVAILABLE");
  // No fabricated translation was persisted (§13).
  const row = await readPool.query(
    `SELECT count(*)::int AS n FROM service_translations WHERE service_id = $1`,
    [svcNoKey],
  );
  assert.equal(row.rows[0].n, 0, "no draft row is written when the provider is unavailable");
  // And the traveler read still shows the honest English fallback, never a half-translation.
  const trav = await api(`/api/services/${svcNoKey}?locale=ja`, undefined);
  const tbody = await trav.json();
  assert.equal(tbody.serviceName, EN_NAME);
  assert.equal(tbody.translation.shownInEnglish, true);
});

// ── P8: en (source language) read carries no translation label ───────────────────────────────
test("P8: the en read carries translation: null (no label on the original)", async () => {
  const res = await api(`/api/services/${svcHuman}?locale=en`, undefined);
  const body = await res.json();
  assert.equal(body.serviceName, EN_NAME);
  assert.equal(body.translation, null, "no label under the source language");
  // Omitting ?locale entirely is en by default — same result.
  const res2 = await api(`/api/services/${svcHuman}`, undefined);
  const body2 = await res2.json();
  assert.equal(body2.translation, null);
});

// ── P9: an unsupported translation target is rejected ────────────────────────────────────────
test("P9: en as a translation TARGET and an unshipped locale are both rejected (400)", async () => {
  const en = await api(`/api/provider/services/${svcHuman}/translations/en`, owner.cookie, "PUT", { serviceName: "x" });
  assert.equal(en.status, 400, "en is the source language, never a translation target");
  const es = await api(`/api/provider/services/${svcHuman}/translations/es`, owner.cookie, "PUT", { serviceName: "x" });
  assert.equal(es.status, 400, "es is not a shipped content locale");
});
