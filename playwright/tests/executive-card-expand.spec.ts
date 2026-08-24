/**
 * Executive card expand/collapse behavior tests.
 *
 * Verifies that:
 *  1. After saving a profile edit the card stays expanded with updated values.
 *  2. After cancelling the edit dialog the card remains expanded.
 *
 * The EA test account (test-ea@traveloure.test) is used for all interactions.
 * Each test creates its own executive via API so tests are independent and
 * self-cleaning.
 */
import { test, expect } from "@playwright/test";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const EA_EMAIL = "test-ea@traveloure.test";
const EA_PASSWORD = "TestPass123!";

function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

async function loginAsEA(page: any) {
  const res = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: EA_EMAIL, password: EA_PASSWORD },
  });
  if (res.status() !== 200) {
    throw new Error(`Login failed: ${res.status()} – ${await res.text()}`);
  }
}

async function createExecutive(
  page: any,
  name: string,
): Promise<{ id: string }> {
  const res = await page.request.post(`${BASE_URL}/api/ea/executives`, {
    data: { name, status: "active" },
  });
  if (res.status() !== 201) {
    throw new Error(
      `Failed to create executive: ${res.status()} – ${await res.text()}`,
    );
  }
  return res.json();
}

async function deleteExecutive(page: any, id: string) {
  await page.request.delete(`${BASE_URL}/api/ea/executives/${id}`);
}

// ── Test 1: Save path — card stays open with updated values ──────────────────

test("[EA] executive card stays expanded after saving profile edit", async ({
  page,
}) => {
  const tag = uid();
  const execName = `Test Exec Save ${tag}`;

  await loginAsEA(page);
  const exec = await createExecutive(page, execName);

  try {
    await page.goto(`${BASE_URL}/ea/executives`);
    await page.waitForLoadState("networkidle");

    const card = page.locator(`[data-testid="executive-${exec.id}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const cardHeader = card.locator(".cursor-pointer").first();
    await cardHeader.click();

    const editBtn = card.locator(
      `[data-testid="button-edit-profile-${exec.id}"]`,
    );
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    const dialog = page.locator('[data-testid="dialog-edit-profile"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const newPhone = `+1 555 ${tag}`;
    await page.locator('[data-testid="input-edit-phone"]').fill(newPhone);

    await page.locator('[data-testid="button-save-profile"]').click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await expect(card.locator("text=Profile Information")).toBeVisible({
      timeout: 10_000,
    });

    await expect(card.locator(`text=${newPhone}`)).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await deleteExecutive(page, exec.id);
  }
});

// ── Test 2: Cancel path — card stays open unchanged ──────────────────────────

test("[EA] executive card stays expanded when edit dialog is cancelled", async ({
  page,
}) => {
  const tag = uid();
  const execName = `Test Exec Cancel ${tag}`;

  await loginAsEA(page);
  const exec = await createExecutive(page, execName);

  try {
    await page.goto(`${BASE_URL}/ea/executives`);
    await page.waitForLoadState("networkidle");

    const card = page.locator(`[data-testid="executive-${exec.id}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const cardHeader = card.locator(".cursor-pointer").first();
    await cardHeader.click();

    const editBtn = card.locator(
      `[data-testid="button-edit-profile-${exec.id}"]`,
    );
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    const dialog = page.locator('[data-testid="dialog-edit-profile"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page
      .locator('[data-testid="input-edit-phone"]')
      .fill("+1 999 000 0000");

    await page.locator('[data-testid="button-cancel-edit"]').click();

    await expect(dialog).toBeHidden({ timeout: 5_000 });

    await expect(card.locator("text=Profile Information")).toBeVisible({
      timeout: 5_000,
    });
  } finally {
    await deleteExecutive(page, exec.id);
  }
});
