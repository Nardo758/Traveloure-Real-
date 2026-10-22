/**
 * Login enumeration — visible sign-in and profile guidance
 * (ledger `2026-10-21-login-enumeration`).
 *
 * Two clean loops. Each creates its own randomized accounts, then checks that
 * the sign-in modal's guidance does not change with the email, and that an
 * unknown email, a wrong password, and a provider-only account show the same
 * error. An email account's profile does not show the provider sentence. An
 * authenticated account whose authProvider is a sign-in provider does.
 *
 * Does not complete a real provider OAuth round trip. The profile reads the
 * authProvider already on the signed-in user payload.
 */
import { test, expect } from "@playwright/test";
import crypto from "crypto";
import pg from "pg";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const MODAL_GUIDANCE = "If you normally use a sign-in provider, use its sign-in button.";
const PROFILE_GUIDANCE = "Signed in with a sign-in provider. Continue using that provider to access your account.";
const INVALID = "Invalid email or password";

function scryptHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${(key as Buffer).toString("hex")}`);
    });
  });
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to create login-enumeration accounts");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function insertUser(opts: { email: string; password: string | null; authProvider: string }): Promise<string> {
  const id = crypto.randomUUID();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO users (id, email, password, first_name, last_name, role, auth_provider, terms_accepted_at, privacy_accepted_at, email_verified, is_deleted, is_suspended)
       VALUES ($1, $2, $3, 'Enum', 'Test', 'user', $4, NOW(), NOW(), NOW(), false, false)`,
      [id, opts.email, opts.password, opts.authProvider],
    );
  });
  return id;
}

async function deleteUser(id: string) {
  await withDb(async (client) => {
    await client.query("DELETE FROM users WHERE id = $1", [id]);
  });
}

async function openSignInModal(page: import("@playwright/test").Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const btn = page.locator('[data-testid="button-sign-in"]');
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await btn.click();
  const modal = page.locator('[data-testid="modal-sign-in"]');
  await modal.waitFor({ state: "visible", timeout: 8_000 });
  return modal;
}

/** Submit the modal and require the login response itself to succeed before any navigation. */
async function signInFromModal(
  page: import("@playwright/test").Page,
  modal: import("@playwright/test").Locator,
  email: string,
  password: string,
) {
  await modal.locator('[data-testid="input-email"]').fill(email);
  await modal.locator('[data-testid="input-password"]').fill(password);
  await expect(modal.locator('[data-testid="input-email"]')).toHaveValue(email);
  const submit = modal.locator('[data-testid="button-auth-submit"]');
  await expect(submit).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
      { timeout: 20_000 },
    ),
    submit.click(),
  ]);
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

for (const loop of ["a", "b"]) {
  test(`loop ${loop}: uniform visible failure, stable guidance, profile only for a provider account`, async ({ page, request }) => {
    const tag = `${loop}-${crypto.randomBytes(4).toString("hex")}`;
    const emailUser = `enum-ui-${tag}-mail@t.test`;
    const providerOnly = `enum-ui-${tag}-fb@t.test`;
    const providerWithPassword = `enum-ui-${tag}-replit@t.test`;
    const unknown = `enum-ui-${tag}-missing@t.test`;
    const password = `correct-${tag}-Pw`;
    const hash = await scryptHash(password);
    const ids = [
      await insertUser({ email: emailUser, password: hash, authProvider: "email" }),
      await insertUser({ email: providerOnly, password: null, authProvider: "facebook" }),
      await insertUser({ email: providerWithPassword, password: hash, authProvider: "replit" }),
    ];

    try {
      const failures = [
        { email: unknown, password: "not-the-password" },
        { email: emailUser, password: "not-the-password" },
        { email: providerOnly, password },
      ];
      const bodies = [];
      for (const payload of failures) {
        const res = await request.post(`${BASE_URL}/api/auth/login`, {
          data: payload,
          headers: { "Content-Type": "application/json" },
        });
        const body = await res.json();
        expect(res.status()).toBe(401);
        expect(body).toEqual({ message: INVALID });
        bodies.push(JSON.stringify(body));
        const me = await request.get(`${BASE_URL}/api/auth/user`);
        expect(me.status()).toBe(401);
      }
      expect(new Set(bodies).size).toBe(1);

      const modal = await openSignInModal(page);
      const guidance = modal.locator('[data-testid="text-signin-provider-guidance"]');
      await expect(guidance).toHaveText(MODAL_GUIDANCE);
      await modal.locator('[data-testid="input-email"]').fill(unknown);
      await expect(guidance).toHaveText(MODAL_GUIDANCE);
      await modal.locator('[data-testid="input-email"]').fill(providerOnly);
      await expect(guidance).toHaveText(MODAL_GUIDANCE);

      for (const payload of failures) {
        await modal.locator('[data-testid="input-email"]').fill(payload.email);
        await modal.locator('[data-testid="input-password"]').fill(payload.password);
        await modal.locator('[data-testid="button-auth-submit"]').click();
        const alert = modal.locator('[data-testid="text-auth-error"]');
        await expect(alert).toHaveText(INVALID, { timeout: 15_000 });
        await expect(guidance).toHaveText(MODAL_GUIDANCE);
        await expect(page).toHaveURL(/\/$/);
        await expect(modal).toBeVisible();
      }
      await expect(page.locator('[data-testid="text-provider-account-guidance"]')).toHaveCount(0);

      await signInFromModal(page, modal, emailUser, password);
      await page.goto(`${BASE_URL}/profile`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="text-page-title"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-testid="text-provider-account-guidance"]')).toHaveCount(0);

      await page.evaluate(async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      });
      const again = await openSignInModal(page);
      await signInFromModal(page, again, providerWithPassword, password);
      await page.goto(`${BASE_URL}/profile`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="text-provider-account-guidance"]')).toHaveText(PROFILE_GUIDANCE, { timeout: 20_000 });
    } finally {
      for (const id of ids) await deleteUser(id);
    }
  });
}
