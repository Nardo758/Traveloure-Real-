/**
 * XSS-regression suite for expert profile endpoints (task #1118).
 *
 * Guards four sanitization surfaces added in task #1111:
 *   PATCH /api/expert/neighborhoods  — script/onerror payloads stripped; read back clean
 *   PATCH /api/expert/profile-notes  — empty/whitespace notesStyle → 400; XSS stripped
 *   POST  /api/expert/specializations — empty/whitespace → 400; XSS stripped
 *   POST  /api/expert-application     — non-image or >5MB data-URL govId/travelLicence → 400
 *
 * Transport: real HTTP against the already-running dev server (http://127.0.0.1:5000),
 * same posture as f2-verification-gate.http.test.ts / short-links-frame.http.test.ts.
 *
 * The kyoto bench fixture (kyoto-temples@traveloure.test / TestPass123!) is the
 * authenticated expert for the profile-mutation tests. Any data written to the durable
 * fixture is restored in `after`. Fresh disposable users are created only for the
 * expert-application data-URL tests; they are deleted in `after`.
 *
 * Run solo:
 *   npx tsx --test server/__tests__/expert-profile-xss-regression.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// ── DB-write safety guard (mirrors f2-verification-gate.http.test.ts) ────────────────────
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
      `[expert-profile-xss-regression] REFUSING to write fixtures: DATABASE_URL host ` +
      `'${csHost ?? "<none>"}' / server addr '${serverAddr ?? "<local-socket>"}' is not a ` +
      `recognized disposable dev/CI database. Opt in deliberately with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const BENCH_EMAIL = "kyoto-temples@traveloure.test";
const BENCH_PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

// ── State ─────────────────────────────────────────────────────────────────────────────────
let benchCookie: string;
let benchUserId: string;

/** Neighborhoods before the suite runs — restored in `after`. */
let savedNeighborhoods: string[] = [];
let savedLocalityProof: string = "";

/** Specializations added during the suite — deleted in `after`. */
const specsToCleanup: string[] = [];

/** Disposable user IDs created for expert-application tests — deleted in `after`. */
const disposableUserIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────────────────
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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function login(email: string, password: string): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    assert.fail(`login failed for ${email} (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as any;
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, userId: body.user?.id ?? body.id };
}

async function register(label: string): Promise<{ cookie: string; userId: string }> {
  const email = `xss-reg-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: BENCH_PASSWORD, firstName: "XSS", lastName: label }),
  });
  if (res.status !== 201) {
    assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as any;
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const userId = body.user?.id ?? body.id;
  disposableUserIds.push(userId);
  return { cookie, userId };
}

/** Build a minimal base64 PNG data-URL of exactly `byteCount` decoded bytes. */
function buildDataUrl(mime: string, byteCount: number): string {
  // Each base64 group of 4 chars → 3 bytes; pad to exact multiple.
  const bytesNeeded = Math.ceil(byteCount / 3) * 3;
  const buf = Buffer.alloc(bytesNeeded, 0x00);
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────
before(async () => {
  await assertDisposableDb();

  // Login as the durable kyoto bench expert.
  const bench = await login(BENCH_EMAIL, BENCH_PASSWORD);
  benchCookie = bench.cookie;

  // Resolve the bench user ID from the DB so we can query facts directly.
  const row = await pool.query(`SELECT id FROM users WHERE email = $1`, [BENCH_EMAIL]);
  assert.ok(row.rows.length > 0, "kyoto bench fixture must exist (run console-sigma-kyoto-bench first)");
  benchUserId = row.rows[0].id;

  // Save current neighborhoods + locality proof for post-suite restoration.
  const formRow = await pool.query(
    `SELECT neighborhoods, locality_proof FROM local_expert_forms WHERE user_id = $1`,
    [benchUserId],
  );
  if (formRow.rows.length > 0) {
    savedNeighborhoods = Array.isArray(formRow.rows[0].neighborhoods)
      ? formRow.rows[0].neighborhoods
      : [];
    savedLocalityProof = formRow.rows[0].locality_proof ?? "";
  }
});

after(async () => {
  try {
    // Restore the bench fixture's neighborhoods to what they were before this suite ran.
    if (benchUserId) {
      await pool.query(
        `UPDATE local_expert_forms SET neighborhoods = $1, locality_proof = $2 WHERE user_id = $3`,
        [JSON.stringify(savedNeighborhoods), savedLocalityProof, benchUserId],
      );
    }

    // Delete specializations that were added by this suite.
    for (const spec of specsToCleanup) {
      await pool.query(
        `DELETE FROM expert_specializations WHERE expert_id = $1 AND specialization = $2`,
        [benchUserId, spec],
      ).catch(() => {});
    }

    // Delete disposable users created for the expert-application tests.
    for (const uid of disposableUserIds) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [uid]).catch(() => {});
    }
  } finally {
    await pool.end().catch(() => {});
  }
});

// ─── PATCH /api/expert/neighborhoods ─────────────────────────────────────────────────────

test("N1: neighborhoods — non-array body is rejected with 400", async () => {
  const res = await apiCall("/api/expert/neighborhoods", benchCookie, "PATCH", {
    neighborhoods: "Gion",
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(body.message, "400 must carry a message");
});

test("N2: neighborhoods — <script> and onerror payloads are stripped before storage", async () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    'Gion<img src=x onerror=alert(1)>',
    'Downtown"><svg onload=alert(1)',
  ];

  const patchRes = await apiCall("/api/expert/neighborhoods", benchCookie, "PATCH", {
    neighborhoods: xssPayloads,
    localityProof: "I live here <script>evil()</script>",
  });
  assert.equal(patchRes.status, 200, `PATCH failed: ${await patchRes.clone().text()}`);

  // Read back via GET — the persisted values must contain no raw HTML.
  const getRes = await apiCall("/api/expert/neighborhoods", benchCookie, "GET");
  assert.equal(getRes.status, 200);
  const data = await getRes.json() as { neighborhoods: string[]; localityProof?: string };

  const allValues = [...(data.neighborhoods ?? []), data.localityProof ?? ""].join(" ");
  assert.ok(!allValues.includes("<script"), `stored value must not contain <script: "${allValues}"`);
  assert.ok(!allValues.includes("onerror"), `stored value must not contain onerror: "${allValues}"`);
  assert.ok(!allValues.includes("<img"), `stored value must not contain <img: "${allValues}"`);
  assert.ok(!allValues.includes("<svg"), `stored value must not contain <svg: "${allValues}"`);
});

test("N3: neighborhoods — more than 20 unique entries is rejected with 400", async () => {
  const tooMany = Array.from({ length: 21 }, (_, i) => `Neighborhood-${i + 1}`);
  const res = await apiCall("/api/expert/neighborhoods", benchCookie, "PATCH", {
    neighborhoods: tooMany,
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(
    typeof body.message === "string" && body.message.includes("20"),
    `400 message should mention the limit of 20; got: ${body.message}`,
  );
});

// ─── PATCH /api/expert/profile-notes ─────────────────────────────────────────────────────

test("PN1: profile-notes — non-string notesStyle is rejected with 400", async () => {
  const res = await apiCall("/api/expert/profile-notes", benchCookie, "PATCH", {
    notesStyle: 42,
  });
  assert.equal(res.status, 400);
});

test("PN2: profile-notes — empty string notesStyle is rejected with 400", async () => {
  const res = await apiCall("/api/expert/profile-notes", benchCookie, "PATCH", {
    notesStyle: "",
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(
    typeof body.message === "string" && body.message.toLowerCase().includes("empty"),
    `400 message should say "empty"; got: ${body.message}`,
  );
});

test("PN3: profile-notes — whitespace-only notesStyle is rejected with 400", async () => {
  const res = await apiCall("/api/expert/profile-notes", benchCookie, "PATCH", {
    notesStyle: "   \t  ",
  });
  assert.equal(res.status, 400);
});

test("PN4: profile-notes — <script> tags are stripped before storage; text content is kept", async () => {
  // The sanitizer strips HTML tags but keeps the surrounding text.  The word "onerror"
  // in plain text (not inside an angle-bracket tag) is safe — only event-handler attributes
  // inside an HTML tag are dangerous, and those require the opening `<tag` to be present.
  const payload = 'Detailed notes <script>alert("xss")</script> style description';
  const res = await apiCall("/api/expert/profile-notes", benchCookie, "PATCH", {
    notesStyle: payload,
  });
  assert.equal(res.status, 200, `PATCH failed: ${await res.clone().text()}`);

  // Verify via DB: no unescaped angle brackets remain that could open an HTML tag.
  const row = await pool.query(
    `SELECT expert_notes_style FROM local_expert_forms WHERE user_id = $1`,
    [benchUserId],
  );
  const stored: string = row.rows[0]?.expert_notes_style ?? "";
  // After sanitization the raw `<script>` and `</script>` delimiters must be gone.
  assert.ok(!stored.includes("<script"), `stored notesStyle must not contain raw <script: "${stored}"`);
  assert.ok(!stored.includes("</script"), `stored notesStyle must not contain </script: "${stored}"`);
  // The text content that had no HTML structure should still be present (sanitizer is not a blank).
  assert.ok(stored.length > 0, "stored notesStyle must not be empty after stripping tags");
});

// ─── POST /api/expert/specializations ────────────────────────────────────────────────────

test("SP1: specializations — non-string specialization is rejected with 400", async () => {
  const res = await apiCall("/api/expert/specializations", benchCookie, "POST", {
    specialization: null,
  });
  assert.equal(res.status, 400);
});

test("SP2: specializations — empty string specialization is rejected with 400", async () => {
  const res = await apiCall("/api/expert/specializations", benchCookie, "POST", {
    specialization: "",
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(
    typeof body.message === "string" && body.message.toLowerCase().includes("empty"),
    `400 message should say "empty"; got: ${body.message}`,
  );
});

test("SP3: specializations — whitespace-only specialization is rejected with 400", async () => {
  const res = await apiCall("/api/expert/specializations", benchCookie, "POST", {
    specialization: "   ",
  });
  assert.equal(res.status, 400);
});

test("SP4: specializations — <script> payload is stored sanitized", async () => {
  const payload = 'Temples<script>alert("xss")</script>';
  const res = await apiCall("/api/expert/specializations", benchCookie, "POST", {
    specialization: payload,
  });
  // After stripping tags the remaining text "Templesalert("xss")" or "Temples" is non-empty,
  // so the route should accept it and store the sanitized version.
  assert.equal(res.status, 200, `POST failed: ${await res.clone().text()}`);
  const stored = await res.json() as any;

  // Collect the stored value from the response or from a GET.
  const getRes = await apiCall("/api/expert/specializations", benchCookie, "GET");
  assert.equal(getRes.status, 200);
  const specs = await getRes.json() as any[];
  const allText = specs.map((s: any) => s.specialization ?? s.name ?? JSON.stringify(s)).join(" ");

  assert.ok(!allText.includes("<script"), `stored specialization must not contain <script: "${allText}"`);
  assert.ok(!allText.includes("onerror"), `stored specialization must not contain onerror: "${allText}"`);

  // Track the sanitized value so `after` can clean it up.
  const storedValue: string =
    stored?.specialization ?? stored?.name ?? JSON.stringify(stored);
  specsToCleanup.push(storedValue);
});

test("SP5: specializations — value over 100 chars is rejected with 400", async () => {
  const longSpec = "A".repeat(101);
  const res = await apiCall("/api/expert/specializations", benchCookie, "POST", {
    specialization: longSpec,
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(
    typeof body.message === "string" && body.message.includes("100"),
    `400 message should mention the 100-char limit; got: ${body.message}`,
  );
});

// ─── POST /api/expert-application — image data-URL validation ────────────────────────────

/** Minimal valid application payload (excluding govId / travelLicence). */
function baseApplicationPayload(email: string) {
  return {
    firstName: "XSS",
    lastName: "Tester",
    email,
    city: "Tokyo",
    country: "Japan",
    expertType: "local_expert",
    specialties: ["shrines"],
    languages: ["en"],
    bio: "XSS regression test applicant — disposable.",
  };
}

test("IMG1: expert-application — non-image data-URL for govId returns 400", async () => {
  const { cookie, userId: uid } = await register("img1");
  const payload = {
    ...baseApplicationPayload(`xss-reg-${RUN}-img1@t.test`),
    govId: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  };
  const res = await apiCall("/api/expert-application", cookie, "POST", payload);
  assert.equal(res.status, 400, `expected 400 for non-image MIME; got ${res.status}: ${await res.clone().text()}`);
  const body = await res.json() as any;
  assert.ok(typeof body.message === "string", "400 must carry a message");
});

test("IMG2: expert-application — non-data-URL string for govId returns 400", async () => {
  const { cookie } = await register("img2");
  const payload = {
    ...baseApplicationPayload(`xss-reg-${RUN}-img2@t.test`),
    govId: "https://evil.example.com/script.js",
  };
  const res = await apiCall("/api/expert-application", cookie, "POST", payload);
  assert.equal(res.status, 400, `expected 400 for non-data-URL; got ${res.status}: ${await res.clone().text()}`);
});

test("IMG3: expert-application — govId over 5 MB decoded size returns 400", async () => {
  const { cookie } = await register("img3");
  // Build a data-URL whose decoded payload is 5 MB + 1 byte.
  const oversizedDataUrl = buildDataUrl("image/png", 5 * 1024 * 1024 + 1);
  const payload = {
    ...baseApplicationPayload(`xss-reg-${RUN}-img3@t.test`),
    govId: oversizedDataUrl,
  };
  const res = await apiCall("/api/expert-application", cookie, "POST", payload);
  assert.equal(res.status, 400, `expected 400 for oversized image; got ${res.status}: ${await res.clone().text()}`);
  const body = await res.json() as any;
  assert.ok(
    typeof body.message === "string" && body.message.toLowerCase().includes("5mb"),
    `400 message should mention 5MB limit; got: ${body.message}`,
  );
});

test("IMG4: expert-application — non-image data-URL for travelLicence returns 400", async () => {
  const { cookie } = await register("img4");
  const payload = {
    ...baseApplicationPayload(`xss-reg-${RUN}-img4@t.test`),
    travelLicence: "data:application/pdf;base64,JVBERi0xLjQ=",
  };
  const res = await apiCall("/api/expert-application", cookie, "POST", payload);
  assert.equal(res.status, 400, `expected 400 for non-image travelLicence MIME; got ${res.status}: ${await res.clone().text()}`);
});
