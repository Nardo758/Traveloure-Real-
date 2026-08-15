/**
 * #1118 / #1123 — Stored-XSS regression suite for expert-editable text fields.
 *
 * Drives the REAL routes over HTTP (server on :5000 — the 'Start application'
 * workflow) with the exact payloads verified during the #1111/#1112 audit, then
 * asserts DIRECTLY against the DB rows that no executable markup survived.
 * The #1111→#1112 regression happened at the ROUTE level (sanitizeInput dropped
 * from the handler), so a unit test of sanitizeInput alone would not catch it —
 * these tests must go through the HTTP handlers.
 *
 * Coverage:
 *   1. PATCH /api/expert/profile — bio, headline, displayName, city, country
 *      (users row + local_expert_forms row both checked).
 *   2. PATCH /api/trips/:tripId/expert-notes — private trips.expertNotes
 *      (assignment seeded directly in DB; sanitized even though self-XSS only).
 *
 * Requires: dev server on :5000 and DATABASE_URL. Cleans up all rows it creates.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

const BASE = process.env.XSS_TEST_BASE_URL || "http://127.0.0.1:5000";

// The audit-verified payload set — do not trim: each exercises a distinct vector.
const XSS_PAYLOADS = [
  `<script>alert(1)</script>`,
  `<img src=x onerror=alert(1)>`,
  `<svg onload=alert(1)>`,
  `<iframe src="javascript:alert(1)"></iframe>`,
];

/** A stored value is safe when no tag survived and raw angle brackets are gone. */
function assertSanitized(value: string | null, label: string) {
  expect(value, `${label} must be stored`).not.toBeNull();
  expect(value!, `${label} must not contain executable markup`).not.toMatch(/<[a-zA-Z!/]/);
  expect(value!.toLowerCase(), `${label} must not retain onerror/onload handlers with tags`).not.toContain("<img");
  expect(value!.toLowerCase(), `${label}`).not.toContain("<script");
  expect(value!.toLowerCase(), `${label}`).not.toContain("<svg");
  expect(value!.toLowerCase(), `${label}`).not.toContain("<iframe");
}

const uniq = crypto.randomUUID().slice(0, 8);
const EMAIL = `xss-regress-${uniq}@traveloure.test`;
const PASSWORD = "TestPass123!";
let cookie = "";
let userId = "";
const TRIP_ID = `test-xss-${crypto.randomUUID()}`;
const SERVICE_ID = `test-xss-svc-${crypto.randomUUID()}`;
const REVIEW_ID = `test-xss-rev-${crypto.randomUUID()}`;
const BOOKING_ID = `test-xss-bkg-${crypto.randomUUID()}`;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
}

beforeAll(async () => {
  // Fail loudly (not vacuously green) if the dev server is down.
  const ping = await fetch(`${BASE}/api/auth/user`).catch(() => null);
  if (!ping) throw new Error(`Dev server unreachable at ${BASE} — start the 'Start application' workflow`);

  const reg = await api("POST", "/api/auth/register", {
    email: EMAIL, password: PASSWORD, firstName: "Xss", lastName: "Regress",
  });
  if (reg.status >= 400) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
  await api("POST", "/api/auth/accept-terms", {});
  const me = await (await api("GET", "/api/auth/user")).json();
  userId = me.id;
  if (!userId) throw new Error("could not resolve test user id");

  // The profile route sits behind the expert RBAC middleware (users.role check).
  await db.execute(sql`UPDATE users SET role = 'local_expert' WHERE id = ${userId}`);

  // Seed a trip + advisory assignment so the expert-notes route authorizes us.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination, status)
    VALUES (${TRIP_ID}, ${userId}, 'XSS regression trip', '2026-09-01', '2026-09-05', 'Testville', 'planning')
  `);
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${crypto.randomUUID()}, ${TRIP_ID}, ${userId}, 'active')
  `);

  // Seed a provider service + review owned by the test user so the review-reply
  // route (ownership joined through provider_services.user_id) authorizes us.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name)
    VALUES (${SERVICE_ID}, ${userId}, 'XSS regression service')
  `);
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount)
    VALUES (${BOOKING_ID}, ${SERVICE_ID}, ${userId}, ${userId}, 'completed', 100.00)
  `);
  await db.execute(sql`
    INSERT INTO service_reviews (id, booking_id, service_id, provider_id, traveler_id, rating, review_text, status)
    VALUES (${REVIEW_ID}, ${BOOKING_ID}, ${SERVICE_ID}, ${userId}, ${userId}, 5, 'great', 'approved')
  `);
}, 30000);

afterAll(async () => {
  await db.execute(sql`DELETE FROM service_reviews WHERE id = ${REVIEW_ID}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${BOOKING_ID}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${SERVICE_ID}`);
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${TRIP_ID}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP_ID}`);
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

describe("#1118 PATCH /api/expert/profile stored-XSS regression", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`sanitizes bio/headline/displayName/city/country for payload ${payload.slice(0, 20)}...`, async () => {
      const res = await api("PATCH", "/api/expert/profile", {
        firstName: `First ${payload}`,
        lastName: `Last ${payload}`,
        bio: `about me ${payload}`,
        headline: `headline ${payload}`,
        displayName: `Name ${payload}`,
        city: `City ${payload}`,
        country: `Country ${payload}`,
        languages: [`English ${payload}`.slice(0, 50)],
      });
      expect(res.status, await res.clone().text()).toBe(200);

      const u = await db.execute(sql`SELECT first_name, last_name, bio FROM users WHERE id = ${userId}`);
      const uRow = u.rows[0] as any;
      assertSanitized(uRow.first_name, "users.first_name");
      assertSanitized(uRow.last_name, "users.last_name");
      assertSanitized(uRow.bio, "users.bio");

      // The route must persist the form row — a missing row is itself a
      // regression (form persistence silently skipped), never a green pass.
      const f = await db.execute(sql`
        SELECT first_name, last_name, bio, headline, display_name, city, country, languages
        FROM local_expert_forms WHERE user_id = ${userId} LIMIT 1
      `);
      const row = f.rows[0] as any;
      expect(row, "local_expert_forms row must exist after profile PATCH").toBeDefined();
      for (const k of ["first_name", "last_name", "bio", "headline", "display_name", "city", "country"]) {
        assertSanitized(row[k], `local_expert_forms.${k}`);
      }
      const langs = Array.isArray(row.languages) ? row.languages : JSON.parse(row.languages ?? "[]");
      expect(langs.length, "languages must persist").toBeGreaterThan(0);
      for (const lang of langs) assertSanitized(lang, "local_expert_forms.languages[]");
    });
  }
});

describe("#1123 PATCH /api/trips/:tripId/expert-notes sanitization", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`sanitizes private expertNotes for payload ${payload.slice(0, 20)}...`, async () => {
      const res = await api("PATCH", `/api/trips/${TRIP_ID}/expert-notes`, {
        expertNotes: `note ${payload} end`,
      });
      expect(res.status, await res.clone().text()).toBe(200);

      const t = await db.execute(sql`SELECT expert_notes FROM trips WHERE id = ${TRIP_ID}`);
      assertSanitized((t.rows[0] as any).expert_notes, "trips.expert_notes");
    });
  }
});

describe("PATCH /api/me/storefront bio sanitization (defense-in-depth)", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`sanitizes storefront bio for payload ${payload.slice(0, 20)}...`, async () => {
      const res = await api("PATCH", "/api/me/storefront", { bio: `intro ${payload} end` });
      expect(res.status, await res.clone().text()).toBe(200);

      const u = await db.execute(sql`SELECT bio FROM users WHERE id = ${userId}`);
      assertSanitized((u.rows[0] as any).bio, "users.bio (storefront patch)");
    });
  }
});

describe("PATCH /api/me/reviews/:id/reply sanitization (defense-in-depth)", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`sanitizes provider reply for payload ${payload.slice(0, 20)}...`, async () => {
      const res = await api("PATCH", `/api/me/reviews/${REVIEW_ID}/reply`, {
        reply: `thanks ${payload} end`,
      });
      expect(res.status, await res.clone().text()).toBe(200);
      const body = await res.json();

      const r = await db.execute(sql`SELECT provider_reply FROM service_reviews WHERE id = ${REVIEW_ID}`);
      const stored = (r.rows[0] as any).provider_reply;
      assertSanitized(stored, "service_reviews.provider_reply");
      // Response/storage parity: the API must echo the sanitized (canonical) value.
      expect(body.providerReply, "response must match stored sanitized reply").toBe(stored);
    });
  }
});
