/**
 * XSS sanitization integration tests for the expert application endpoints (task #1308).
 *
 * Confirms that script tags and HTML injection payloads in free-text fields
 * (bio, portfolio, certifications) are stripped before storage on BOTH submission
 * paths:
 *
 *   A) New submission   — POST /api/expert-application with a fresh user
 *   B) Resubmission    — same POST after the previous application has been admin-rejected,
 *                        which exercises the separate `updateLocalExpertForm` branch
 *
 * Strategy: real HTTP against the dev server + direct DB reads via pg.Pool so that the
 * assertions prove what ended up in the database, not just what the API echoed back.
 *
 * Same transport and DB-safety conventions as expert-profile-xss-regression.http.test.ts.
 *
 * Run solo:
 *   npx tsx --test server/__tests__/expert-application-xss-sanitize.http.test.ts
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// ── DB-write safety guard ─────────────────────────────────────────────────────
const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try { return new URL(cs).hostname.toLowerCase(); } catch { return null; }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await pool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch { /* NULL inet_server_addr() (local socket) is itself a disposable signal */ }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[expert-application-xss-sanitize] REFUSING: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
      `server addr '${serverAddr ?? "<local-socket>"}' is not a recognised disposable dev/CI ` +
      `database. Opt in deliberately with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const BENCH_PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

// Disposable user IDs created during this suite — deleted in `after`.
const disposableUserIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function apiCall(
  path: string,
  cookie: string | undefined,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Register a fresh disposable user; returns session cookie + userId. */
async function register(label: string): Promise<{ cookie: string; userId: string }> {
  const email = `xss-san-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: BENCH_PASSWORD, firstName: "XSS", lastName: label }),
  });
  if (res.status !== 201) {
    assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const userId = data.user?.id ?? data.id;
  disposableUserIds.push(userId);
  return { cookie, userId };
}

/** Minimal valid application payload that satisfies insertLocalExpertFormSchema. */
function basePayload(): Record<string, unknown> {
  return {
    expertType: "local_expert",
    firstName: "XSS",
    lastName: "Sanitize",
    email: `xss-san-${RUN}@t.test`,
    phone: "+1 555 0199",
    city: "Kyoto",
    country: "Japan",
    destinations: [],
    specialties: [],
    experienceTypes: [],
    localSpecialties: ["hidden temples"],
  };
}

/**
 * Read the local_expert_forms row for a user directly from the DB.
 * Returns null when no row exists.
 */
async function readFormFromDb(
  userId: string,
): Promise<{ bio: string | null; portfolio: string | null; certifications: string | null } | null> {
  const res = await pool.query(
    `SELECT bio, portfolio, certifications FROM local_expert_forms WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return res.rows[0] ?? null;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
before(async () => {
  await assertDisposableDb();
});

after(async () => {
  for (const uid of disposableUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]).catch(() => {});
  }
  await pool.end().catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// PATH A: New submission
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/expert-application (new submission) — XSS sanitization", () => {
  test("A1: script tag in bio is stripped before storage", async () => {
    const { cookie, userId } = await register("a1");
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>alert("xss")</script>Experienced guide in Kyoto.',
    });
    assert.ok(
      res.status === 201,
      `expected 201 from POST /api/expert-application; got ${res.status}: ${await res.clone().text()}`,
    );

    // Verify what actually landed in the DB, not just the API response.
    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "local_expert_forms row must exist after submission");
    assert.ok(
      !row.bio?.includes("<script>"),
      `bio must not contain <script>; stored: ${row.bio}`,
    );
    assert.ok(
      !row.bio?.includes("</script>"),
      `bio must not contain </script>; stored: ${row.bio}`,
    );
    assert.ok(
      row.bio?.includes("Experienced guide in Kyoto."),
      `bio must preserve non-tag text; stored: ${row.bio}`,
    );
  });

  test("A2: img onerror injection in portfolio is stripped before storage", async () => {
    const { cookie, userId } = await register("a2");
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      portfolio: '<img src=x onerror=alert(1)>Portfolio description here.',
    });
    assert.ok(res.status === 201, `expected 201; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");
    assert.ok(
      !row.portfolio?.includes("<img"),
      `portfolio must not contain <img; stored: ${row.portfolio}`,
    );
    assert.ok(
      row.portfolio?.includes("Portfolio description here."),
      `portfolio must preserve non-tag text; stored: ${row.portfolio}`,
    );
  });

  test("A3: script tag in certifications is stripped before storage", async () => {
    const { cookie, userId } = await register("a3");
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      certifications: 'Certified Guide<script>evil()</script>. JNTO Licensed.',
    });
    assert.ok(res.status === 201, `expected 201; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");
    assert.ok(
      !row.certifications?.includes("<script>"),
      `certifications must not contain <script>; stored: ${row.certifications}`,
    );
    assert.ok(
      !row.certifications?.includes("</script>"),
      `certifications must not contain </script>; stored: ${row.certifications}`,
    );
    assert.ok(
      row.certifications?.includes("Certified Guide"),
      `certifications must preserve non-tag text; stored: ${row.certifications}`,
    );
    assert.ok(
      row.certifications?.includes("JNTO Licensed."),
      `certifications must preserve text after stripped tag; stored: ${row.certifications}`,
    );
  });

  test("A4: multiple injection vectors in bio + portfolio + certifications all stripped in one submission", async () => {
    const { cookie, userId } = await register("a4");
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>alert(1)</script>Expert bio.',
      portfolio: '<a href="javascript:void(0)">Click me</a> — portfolio link.',
      certifications: '<!-- hidden comment --><b>Certified</b> since 2020.',
    });
    assert.ok(res.status === 201, `expected 201; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");

    // bio
    assert.ok(!row.bio?.includes("<script>"), `bio: <script> must be stripped; got: ${row.bio}`);
    assert.ok(row.bio?.includes("Expert bio."), `bio: text must survive; got: ${row.bio}`);

    // portfolio
    assert.ok(!row.portfolio?.includes("<a"), `portfolio: <a> must be stripped; got: ${row.portfolio}`);
    assert.ok(!row.portfolio?.includes("</a>"), `portfolio: </a> must be stripped; got: ${row.portfolio}`);
    assert.ok(row.portfolio?.includes("portfolio link."), `portfolio: text must survive; got: ${row.portfolio}`);

    // certifications
    assert.ok(!row.certifications?.includes("<!--"), `certifications: HTML comment must be stripped; got: ${row.certifications}`);
    assert.ok(!row.certifications?.includes("<b>"), `certifications: <b> must be stripped; got: ${row.certifications}`);
    assert.ok(row.certifications?.includes("Certified"), `certifications: text must survive; got: ${row.certifications}`);
    assert.ok(row.certifications?.includes("since 2020."), `certifications: trailing text must survive; got: ${row.certifications}`);
  });

  test("A5: API response also reflects sanitized values (not just DB)", async () => {
    const { cookie } = await register("a5");
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>alert("xss")</script>Clean bio text.',
      certifications: '<svg onload=alert(1)>Cert text.</svg>',
    });
    assert.ok(res.status === 201, `expected 201; got ${res.status}: ${await res.clone().text()}`);
    const body = (await res.json()) as any;

    assert.ok(
      typeof body.bio === "string" && !body.bio.includes("<script>"),
      `API response bio must not echo <script>; got: ${body.bio}`,
    );
    assert.ok(
      body.bio?.includes("Clean bio text."),
      `API response bio must contain text content; got: ${body.bio}`,
    );
    assert.ok(
      typeof body.certifications === "string" && !body.certifications.includes("<svg"),
      `API response certifications must not echo <svg>; got: ${body.certifications}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATH B: Resubmission after rejection
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/expert-application (resubmission after rejection) — XSS sanitization", () => {
  /**
   * Helper: submit an initial clean application, then admin-reject it via direct
   * DB update (mimicking the admin rejection endpoint's DB effect), and return the
   * user's session cookie and userId for the resubmission test.
   */
  async function setupRejected(label: string): Promise<{ cookie: string; userId: string }> {
    const { cookie, userId } = await register(`r-${label}`);

    // First clean submission.
    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: "Initial clean bio.",
    });
    assert.ok(
      res.status === 201,
      `initial submission failed (${res.status}): ${await res.clone().text()}`,
    );

    // Simulate admin rejection by flipping status directly in DB.
    await pool.query(
      `UPDATE local_expert_forms
          SET status = 'rejected', rejection_message = 'Rejected for testing purposes.'
        WHERE user_id = $1`,
      [userId],
    );

    return { cookie, userId };
  }

  test("B1: script tag in bio stripped on resubmission after rejection", async () => {
    const { cookie, userId } = await setupRejected("b1");

    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>stealCookies()</script>Resubmitted bio.',
    });
    assert.ok(
      res.status === 200,
      `expected 200 on resubmission; got ${res.status}: ${await res.clone().text()}`,
    );

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist after resubmission");
    assert.ok(
      !row.bio?.includes("<script>"),
      `bio must not contain <script> after resubmission; stored: ${row.bio}`,
    );
    assert.ok(
      !row.bio?.includes("</script>"),
      `bio must not contain </script> after resubmission; stored: ${row.bio}`,
    );
    assert.ok(
      row.bio?.includes("Resubmitted bio."),
      `bio must preserve text on resubmission; stored: ${row.bio}`,
    );
  });

  test("B2: img onerror in portfolio stripped on resubmission", async () => {
    const { cookie, userId } = await setupRejected("b2");

    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      portfolio: '<img src="x" onerror="fetch(evil)">Portfolio resubmit.',
    });
    assert.ok(res.status === 200, `expected 200; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");
    assert.ok(
      !row.portfolio?.includes("<img"),
      `portfolio must not contain <img on resubmission; stored: ${row.portfolio}`,
    );
    assert.ok(
      row.portfolio?.includes("Portfolio resubmit."),
      `portfolio text must survive resubmission; stored: ${row.portfolio}`,
    );
  });

  test("B3: script tag in certifications stripped on resubmission", async () => {
    const { cookie, userId } = await setupRejected("b3");

    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      certifications: 'Recertified<script>document.location="http://evil.example"</script>.',
    });
    assert.ok(res.status === 200, `expected 200; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");
    assert.ok(
      !row.certifications?.includes("<script>"),
      `certifications must not contain <script> on resubmission; stored: ${row.certifications}`,
    );
    assert.ok(
      row.certifications?.includes("Recertified"),
      `certifications text must survive resubmission; stored: ${row.certifications}`,
    );
  });

  test("B4: all three fields sanitized together on resubmission", async () => {
    const { cookie, userId } = await setupRejected("b4");

    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>evil()</script>Updated bio.',
      portfolio: '<iframe src="evil.html"></iframe>Updated portfolio.',
      certifications: '<object data="evil"></object>Updated certifications.',
    });
    assert.ok(res.status === 200, `expected 200; got ${res.status}: ${await res.clone().text()}`);

    const row = await readFormFromDb(userId);
    assert.ok(row !== null, "row must exist");

    assert.ok(!row.bio?.includes("<script>"), `bio: <script> stripped on resubmit; got: ${row.bio}`);
    assert.ok(row.bio?.includes("Updated bio."), `bio: text preserved on resubmit; got: ${row.bio}`);

    assert.ok(!row.portfolio?.includes("<iframe"), `portfolio: <iframe> stripped on resubmit; got: ${row.portfolio}`);
    assert.ok(row.portfolio?.includes("Updated portfolio."), `portfolio: text preserved; got: ${row.portfolio}`);

    assert.ok(!row.certifications?.includes("<object"), `certifications: <object> stripped on resubmit; got: ${row.certifications}`);
    assert.ok(row.certifications?.includes("Updated certifications."), `certifications: text preserved; got: ${row.certifications}`);
  });

  test("B5: status is reset to pending after resubmission (sanitization does not corrupt workflow)", async () => {
    const { cookie, userId } = await setupRejected("b5");

    const res = await apiCall("/api/expert-application", cookie, "POST", {
      ...basePayload(),
      bio: '<script>bad()</script>Clean resubmit.',
    });
    assert.ok(res.status === 200, `expected 200; got ${res.status}: ${await res.clone().text()}`);

    // Confirm status was reset to pending in the DB.
    const statusRes = await pool.query(
      `SELECT status FROM local_expert_forms WHERE user_id = $1`,
      [userId],
    );
    assert.ok(statusRes.rows.length > 0, "row must exist");
    assert.equal(
      statusRes.rows[0].status,
      "pending",
      "status must be reset to 'pending' on resubmission",
    );
  });
});
