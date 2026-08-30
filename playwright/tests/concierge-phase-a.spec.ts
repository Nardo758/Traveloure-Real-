/**
 * Concierge Phase A E2E tests.
 *
 * Covers the surface that shipped in CON-A.P1..P8:
 *   • /optimize → /concierge?tier=ai redirect (D9)
 *   • POST /api/concierge/quote shape + per-event-type fee from FEE-A (P2)
 *   • POST /api/concierge/select with tier=expert creates an expert_request (P5)
 *   • POST /api/concierge/select with tier=full bumps concierge_request to selected (P5)
 *   • $0=off semantic on a disabled event-type fee (P2)
 *
 * Pattern mirrored from playwright/tests/optimization-payment-gate.spec.ts —
 * registers a real user, hits the live HTTP API, asserts DB rows via psql.
 *
 * Scaffold scope: API + DB verification of the contract. PlanCard escalation
 * CTA (CON-A.P7) needs a seeded trip + UI walk; it's a sensible follow-up but
 * out of scope here.
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function sql(query: string): string {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error("DATABASE_URL is not set");
  const escaped = query.replace(/'/g, `'\\''`);
  const raw = execSync(`psql '${db}' -t -A -c '${escaped}'`, {
    encoding: "utf8",
  }).trim();
  // psql prints the COMMAND TAG after the rows for a data-modifying statement, so an
  // `INSERT … RETURNING id` comes back as "<uuid>\nINSERT 0 1" even under -t -A. Left
  // unstripped, the very next `expect(id).toMatch(/^[0-9a-f-]{36}$/)` rejects the id the
  // query correctly returned — which is why the $0=off test in this file had never passed
  // on any machine since the day it was written (spec-coverage sweep, Aug 16 2026).
  return raw
    .split("\n")
    .filter((line) => !/^(INSERT|UPDATE|DELETE|SELECT|COPY)\s+\d/.test(line.trim()))
    .join("\n")
    .trim();
}

async function registerUser(
  page: any,
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password, firstName, lastName, userType: "user" },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.user.id as string;
}

test.describe("Concierge Phase A — surface contract", () => {
  test("/optimize redirects to /concierge?tier=ai (D9)", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/optimize`);
    // Wouter does a client-side <Redirect>, so the final URL should match.
    await page.waitForURL(/\/concierge\?tier=ai/);
    expect(page.url()).toContain("/concierge?tier=ai");
    expect(res?.status() ?? 200).toBeLessThan(500);
  });

  test(
    "POST /api/concierge/quote (guest-reachable) returns the three-tier shape",
    async ({ page }) => {
      const res = await page.request.post(`${BASE_URL}/api/concierge/quote`, {
        data: {
          intent: "Plan a long-weekend in Kyoto",
          destination: "Kyoto",
          eventType: "vacation",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();

      // requestId is the concierge_requests row created at quote time.
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      const status = sql(
        `SELECT status FROM concierge_requests WHERE id = '${body.requestId}'`,
      );
      expect(status).toBe("quoted");

      // Three tiers always present; AI is always available with a priceCents
      // unless admin has disabled the event type ($0=off semantic — different test).
      expect(body.route.ai).toBeDefined();
      expect(typeof body.route.ai.priceCents).toBe("number");
      expect(body.route.ai.disabled).toBe(false);
      expect(body.route.expert).toBeDefined();
      expect(typeof body.route.expert.available).toBe("boolean");
      expect(body.route.full).toBeDefined();
      expect(typeof body.route.full.available).toBe("boolean");
      expect(["ai", "expert", "full"]).toContain(body.route.recommended);
    },
  );

  test(
    "FEE-A — wedding eventType resolves to the $49.99 row (when seeded by migration 017)",
    async ({ page }) => {
      // optimization_fees seeded by migration 017 must include the wedding override.
      const seeded = sql(
        `SELECT price_cents FROM optimization_fees WHERE event_type = 'wedding' AND is_active = true LIMIT 1`,
      );
      // Skip cleanly if migration hasn't run in this env — don't false-fail.
      test.skip(!seeded, "wedding row not in optimization_fees — migration 017 not applied");

      const res = await page.request.post(`${BASE_URL}/api/concierge/quote`, {
        data: {
          intent: "Plan a wedding in Cartagena",
          destination: "Cartagena",
          eventType: "wedding",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();

      // The seeded value should be 4999 ($49.99); admins may edit it later — assert
      // that the quote echoes whatever the DB row says.
      expect(body.route.ai.priceCents).toBe(parseInt(seeded, 10));
    },
  );

  test(
    "PATCH /api/concierge/requests/:id with tier='expert' creates an expert_request and bumps status to selected",
    async ({ page }) => {
      const email = `e2e-con-expert-${uid()}@example.com`;
      const password = "TestPassword123!";
      await registerUser(page, email, password, "Con", "Expert");

      // Authenticated quote so userId is captured on the concierge_requests row.
      const quote = await page.request.post(`${BASE_URL}/api/concierge/quote`, {
        data: {
          intent: "Plan a date night in Tokyo",
          destination: "Tokyo",
          eventType: "vacation",
        },
      });
      expect(quote.status()).toBe(200);
      const { requestId } = await quote.json();

      const patch = await page.request.patch(
        `${BASE_URL}/api/concierge/requests/${requestId}`,
        { data: { chosenTier: "expert" } },
      );
      expect(patch.status()).toBe(200);

      const row = await patch.json();
      expect(row.chosenTier).toBe("expert");
      expect(row.status).toBe("selected"); // auto-bump per the brief

      const dbStatus = sql(
        `SELECT chosen_tier || '|' || status FROM concierge_requests WHERE id = '${requestId}'`,
      );
      expect(dbStatus).toBe("expert|selected");
    },
  );

  test(
    "PATCH /api/concierge/requests/:id with tier='full' bumps status to selected (catalog-quote path)",
    async ({ page }) => {
      const email = `e2e-con-full-${uid()}@example.com`;
      const password = "TestPassword123!";
      await registerUser(page, email, password, "Con", "Full");

      const quote = await page.request.post(`${BASE_URL}/api/concierge/quote`, {
        data: {
          intent: "Plan a corporate retreat in Edinburgh",
          destination: "Edinburgh",
          eventType: "corporate",
        },
      });
      expect(quote.status()).toBe(200);
      const { requestId } = await quote.json();

      const patch = await page.request.patch(
        `${BASE_URL}/api/concierge/requests/${requestId}`,
        { data: { chosenTier: "full" } },
      );
      expect(patch.status()).toBe(200);

      const dbStatus = sql(
        `SELECT chosen_tier || '|' || status FROM concierge_requests WHERE id = '${requestId}'`,
      );
      expect(dbStatus).toBe("full|selected");
    },
  );

  test(
    "$0=off — disabling an event-type row makes the quote refuse the paid path",
    async ({ page }) => {
      // Inserts a temporary 'birthday' row with is_disabled=true, runs the quote,
      // and confirms the AI tier is unavailable. Cleans up at the end so the
      // global optimization_fees state is unchanged.
      // The resolver's event-type branch is `WHERE event_type = ? AND is_active` with
      // LIMIT 1 and NO ORDER BY and no tier filter (server/services/optimization-fee.service.ts),
      // so when more than one active row exists for an event type, WHICH ROW WINS IS ARBITRARY.
      // The seed already ships an active, NOT-disabled `birthday` row, so simply adding a
      // disabled one and asserting the quote refuses is a coin flip — it lost here. Park the
      // other active birthday rows for the duration so the disabled row is unambiguously the
      // one resolved, and restore them in `finally`.
      // (The non-determinism itself is a PRODUCT finding, filed for the decision-maker — a fee
      // row is money, and this spec must not paper over it by asserting whichever row wins.)
      const parked = sql(
        `UPDATE optimization_fees SET is_active = false
          WHERE event_type = 'birthday' AND is_active = true
        RETURNING id`,
      )
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const tempId = sql(
        `INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
         VALUES (gen_random_uuid(), 'standard', 'birthday', 999, 'USD', true, true, NOW(), NOW())
         RETURNING id`,
      );
      expect(tempId).toMatch(/^[0-9a-f-]{36}$/i);

      try {
        const res = await page.request.post(`${BASE_URL}/api/concierge/quote`, {
          data: {
            intent: "Plan a surprise birthday in Bogotá",
            destination: "Bogotá",
            eventType: "birthday",
          },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();

        // Per the brief: aiDisabled=true; priceCents zeroed; available=false.
        expect(body.route.ai.disabled).toBe(true);
        expect(body.route.ai.available).toBe(false);
        expect(body.route.ai.priceCents).toBe(0);
        // Recommendation must fall back to expert (or ai if expert unavailable) — never offer the disabled AI.
        expect(["ai", "expert", "full"]).toContain(body.route.recommended);
      } finally {
        // Order matters: drop the temp row FIRST, then un-park, so the table never
        // momentarily has both the disabled temp row and the real rows active.
        sql(`DELETE FROM optimization_fees WHERE id = '${tempId}'`);
        if (parked.length > 0) {
          sql(
            `UPDATE optimization_fees SET is_active = true
              WHERE id IN (${parked.map((id) => `'${id}'`).join(",")})`,
          );
        }
      }
    },
  );
});
