/**
 * expert-hireable.db.test.ts — `isExpertHireable` (server/services/booking-actions.service.ts).
 *
 * ONE predicate, two callers (ledger `2026-09-23-storefront-booking-panel`): the advisors rail's
 * approval check (`POST /api/trips/:tripId/advisors`) and the storefront loader's
 * `acceptsPlanShares`, which decides whether the booking panel may offer "Share my plan". If the two
 * disagreed, the panel would draw a share button the server then refuses.
 *
 *   H1  an approved expert profile is hireable
 *   H2  an expert whose profile is not approved is not
 *   H3  an account with no expert profile at all is not
 *   H4  the platform's reserved concierge account is not, even with an approved profile — the one
 *       advisor-row author refuses it (Locked Decision 51), so the rail must answer 404 first
 *       instead of letting the author throw
 *   H5  the storefront loader publishes the same answer as `acceptsPlanShares`
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, localExpertForms, providerServices } = await import("../../shared/schema");
const { isExpertHireable } = await import("../services/booking-actions.service");
const { loadStorefront } = await import("../routes/storefront.routes");
const { PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } = await import("../services/platform-concierge.service");

const RUN = crypto.randomBytes(3).toString("hex");
const created: string[] = [];
const services: string[] = [];
let previousPlatformSetting: string | null | undefined;

async function createExpert(label: string, formStatus: string | null): Promise<{ id: string; handle: string }> {
  const id = crypto.randomUUID();
  const handle = `hire-${label}-${RUN}`;
  await db.insert(users).values({
    id,
    email: `hire-${label}-${RUN}@test.invalid`,
    firstName: "Hire",
    lastName: label,
    role: "local_expert",
    handle,
  } as any);
  created.push(id);
  if (formStatus) {
    await db.insert(localExpertForms).values({ id: crypto.randomUUID(), userId: id, status: formStatus } as any);
  }
  const serviceId = crypto.randomUUID();
  await db.insert(providerServices).values({
    id: serviceId,
    userId: id,
    serviceName: `${label} service`,
    price: "85.00",
    status: "active",
    approvalStatus: "approved",
    deliveryMethod: "pdf",
  } as any);
  services.push(serviceId);
  return { id, handle };
}

describe("isExpertHireable — who can be invited onto a plan", () => {
  let approved: { id: string; handle: string };
  let pending: { id: string; handle: string };
  let noForm: { id: string; handle: string };
  let platform: { id: string; handle: string };

  before(async () => {
    approved = await createExpert("approved", "approved");
    pending = await createExpert("pending", "pending");
    noForm = await createExpert("noform", null);
    platform = await createExpert("platform", "approved");
    const current = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
    previousPlatformSetting = (current.rows?.[0] as any)?.setting_value;
    // Point the reserved-account setting at this run's fixture; restored in `after`. The service
    // caches the setting briefly, so H4 reads it through the same function the rail uses.
    await db.execute(sql`
      INSERT INTO platform_settings (setting_key, setting_value)
      VALUES (${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}, ${platform.id})
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
    `);
  });

  after(async () => {
    if (previousPlatformSetting === undefined) {
      await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
    } else {
      await db.execute(sql`UPDATE platform_settings SET setting_value = ${previousPlatformSetting} WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
    }
    if (services.length) await db.delete(providerServices).where(inArray(providerServices.id, services));
    if (created.length) {
      await db.delete(localExpertForms).where(inArray(localExpertForms.userId, created));
      await db.delete(users).where(inArray(users.id, created));
    }
    await pool.end();
  });

  it("H1: an approved expert profile is hireable", async () => {
    assert.equal(await isExpertHireable(approved.id), true);
  });

  it("H2: a profile that is not approved is not", async () => {
    assert.equal(await isExpertHireable(pending.id), false);
  });

  it("H3: an account with no expert profile is not", async () => {
    assert.equal(await isExpertHireable(noForm.id), false);
  });

  it("H4: the platform's reserved concierge account is not, even when approved", async () => {
    // The settings read is cached for a short TTL; poll until this run's value is visible.
    let answer = await isExpertHireable(platform.id);
    for (let i = 0; i < 20 && answer; i++) {
      await new Promise((r) => setTimeout(r, 500));
      answer = await isExpertHireable(platform.id);
    }
    assert.equal(answer, false);
    assert.equal(
      (await db.select({ status: localExpertForms.status }).from(localExpertForms).where(eq(localExpertForms.userId, platform.id)))[0]?.status,
      "approved",
      "fixture sanity: the refusal comes from the reserved-account rule, not an unapproved profile",
    );
  });

  it("H5: the storefront publishes the same answer as acceptsPlanShares", async () => {
    assert.equal((await loadStorefront(approved.handle))?.earner.acceptsPlanShares, true);
    assert.equal((await loadStorefront(pending.handle))?.earner.acceptsPlanShares, false);
    assert.equal((await loadStorefront(noForm.handle))?.earner.acceptsPlanShares, false);
    assert.equal((await loadStorefront(platform.handle))?.earner.acceptsPlanShares, false);
  });
});
