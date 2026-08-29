/**
 * _persona-helpers.ts — shared plumbing for the Persona Lane B suites.
 *
 * Reuses the Journey Wave 1 primitives from ../journeys/_journey-helpers (the read-only DB
 * pool, the disposable-DB write guard, the Stripe-test-mode resolver, BASE_URL) rather than
 * rebuilding them — see docs/testing/PERSONA_LANE_B_HANDOFF.md. This file adds ONLY what the
 * persona suites need beyond that: fixed persona/admin credentials, login, the journey report
 * JSON writer (the handoff's `{journey, steps, failures}` shape — no shared writer existed
 * before this lane), and a generic multi-step ServiceForm UI driver (the form is a large,
 * offering-gated wizard; see client/src/components/ServiceForm.tsx).
 */
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  BASE_URL,
  rows,
  scalar,
  pool,
  closePool,
  assertDisposableDb,
  hasStripeTestKey,
  confirmPaymentIntentTestMode,
  STRIPE_UNAVAILABLE,
  registerUser,
  createTrip,
  createCatalogItem,
  pickCatalogService,
  routeItem,
  assertCheckoutAccepted,
  assertCheckoutCommittedNothing,
} from "../journeys/_journey-helpers";

export {
  BASE_URL,
  rows,
  scalar,
  pool,
  closePool,
  assertDisposableDb,
  hasStripeTestKey,
  confirmPaymentIntentTestMode,
  STRIPE_UNAVAILABLE,
  registerUser,
  createTrip,
  createCatalogItem,
  pickCatalogService,
  routeItem,
  assertCheckoutAccepted,
  assertCheckoutCommittedNothing,
};

// ── Fixed persona credentials (docs/testing/PERSONA_JOURNEYS.md) ────────────────────────────
// Seeded by `npx tsx scripts/seed-personas.ts --apply` — Lane B never creates these accounts.
export const PERSONA_PASSWORD = "TestPass123!";

export const PERSONAS = {
  gionExpert: "persona-gion-expert@traveloure.test",
  kyotoPlanner: "persona-kyoto-planner@traveloure.test",
  kyotoEventPlanner: "persona-kyoto-event-planner@traveloure.test",
  kyotoProvider: "persona-kyoto-provider@traveloure.test",
  freeTraveler: "persona-kyoto-free-traveler@traveloure.test",
  tripPassTraveler: "persona-kyoto-trip-pass@traveloure.test",
  plusMember: "persona-kyoto-plus@traveloure.test",
} as const;

// The CI-seeded admin (scripts/seed-ci-test-users.ts, wired into persona-nightly.yml via the
// shared ci-db-setup composite action with seed-ci-users:true). Reused rather than inventing a
// new admin rail (dispatch instruction).
export const CI_ADMIN_EMAIL = "ci-admin@traveloure.test";
export const CI_ADMIN_PASSWORD = "CITestAdmin!99";

/** Canonical Kyoto market string (docs/testing/PERSONA_LANE_B_HANDOFF.md supply-pass finding #3). */
export const KYOTO = "Kyoto";

/** Log in via the app's own email/password endpoint; the request context's cookie jar carries
 *  the session for both further `request.*` calls and `page` navigation (j1/j13 pattern). */
export async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string = PERSONA_PASSWORD,
): Promise<{ id: string; email: string; role: string }> {
  const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { email, password } });
  expect(res.status(), `login failed for ${email} (${res.status()}): ${await res.text()}`).toBe(200);
  const body = await res.json();
  return body.user;
}

// ── Journey report JSON (docs/testing/PERSONA_LANE_B_HANDOFF.md "Reporting") ────────────────
export type StepVerdict = "PASS" | "FAIL" | "UNSUPPORTED" | "EXTERNAL";
export type Step = {
  n: number;
  action: string;
  ui: string;
  db: string;
  verdict: StepVerdict;
  note?: string;
};

export class JourneyReport {
  private steps: Step[] = [];
  private failures: string[] = [];
  constructor(private readonly journey: string) {}

  record(step: Omit<Step, "n">): Step {
    const full: Step = { n: this.steps.length + 1, ...step };
    this.steps.push(full);
    if (full.verdict === "FAIL") this.failures.push(`step ${full.n} (${full.action}): ${full.note ?? "failed"}`);
    console.log(
      `[${this.journey}] step ${full.n} ${full.verdict} — ${full.action} | ui: ${full.ui} | db: ${full.db}` +
        (full.note ? ` | note: ${full.note}` : ""),
    );
    return full;
  }

  /** Writes playwright-report/persona-<journey>.json — the same artifact dir journey-suite.yml
   *  already uploads, so persona-nightly.yml's summary step can read it back without a new path. */
  write(): void {
    const dir = path.resolve(process.cwd(), "playwright-report");
    fs.mkdirSync(dir, { recursive: true });
    const out = { journey: this.journey, steps: this.steps, failures: this.failures };
    fs.writeFileSync(path.join(dir, `persona-${this.journey}.json`), JSON.stringify(out, null, 2));
  }

  get hasFailures(): boolean {
    return this.failures.length > 0;
  }
}

// ── Screenshots (handoff: "Capture screenshots at manual-check checkpoints and on failures") ─
export async function checkpoint(page: Page, name: string): Promise<void> {
  const dir = path.resolve(process.cwd(), "playwright-report", "persona-screenshots");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true }).catch(() => {});
}

// ── ServiceForm UI driver (client/src/components/ServiceForm.tsx) ───────────────────────────
// The wizard is large and offering/category-gated. This driver is deliberately GENERIC — it
// fills whichever of these fields is visible on the CURRENT step and advances — rather than
// hardcoding an exact step order, so it tolerates step reordering. Delivery method defaults to
// "call" (phone call): it needs no meeting pin (in_person/hybrid) and no deliverable file (pdf),
// which keeps the persona fixtures decoupled from those two extra gated flows.
export type ServiceFormInput = {
  name: string;
  description: string;
  price: number;
  duration: string;
  offeringSearchTerm: string;
  deliveryMethod?: "call" | "video-call" | "in-person" | "hybrid" | "pdf" | "voice_notes" | "async_messaging";
};

/** Opens the offering/category picker (provider Dialog OR the plain expert <Select>) and picks
 *  the first match for `searchTerm`. Best-effort: some roles/categories may not expose a picker
 *  on the current step, in which case this is a documented no-op (the caller's step verdict
 *  should reflect it, not this helper). */
async function pickOfferingOrCategory(page: Page, searchTerm: string): Promise<boolean> {
  const chooseOffering = page.getByTestId("button-choose-offering");
  if (await chooseOffering.isVisible().catch(() => false)) {
    await chooseOffering.click();
    const search = page.getByTestId("input-offering-search");
    if (await search.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await search.fill(searchTerm);
      await page.waitForTimeout(300);
    }
    const firstOption = page.locator('[data-testid^="option-offering-"]').first();
    if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstOption.click();
      return true;
    }
    // No match for the search term — clear it and take whatever the catalog opened with.
    if (await search.isVisible().catch(() => false)) await search.fill("");
    await page.waitForTimeout(300);
    if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstOption.click();
      return true;
    }
    return false;
  }
  const categoryTrigger = page.locator("#category");
  if (await categoryTrigger.isVisible().catch(() => false)) {
    await categoryTrigger.click();
    const firstOpt = page.getByRole("option").first();
    if (await firstOpt.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstOpt.click();
      return true;
    }
  }
  return false;
}

/**
 * Expert-only "Service Tier *" picker (client/src/components/ServiceForm.tsx, the
 * `role === "expert"` tile grid, `option-tier-${offeringTypeKey}`) — a SEPARATE required field
 * from `#category`/the offering picker above: it sets `formData.expertOfferingTypeId`, which
 * gates `button-submit-service` directly on a fresh create
 * (`disabled={... || (!isEditMode && !formData.expertOfferingTypeId)}`). Missing this was the
 * root cause of the submit button staying disabled — driveServiceFormToSubmit filled name,
 * description and category, but never this tile grid, so expertOfferingTypeId stayed "" and the
 * button could never enable no matter how long the caller waited on it.
 * No-op (returns false) for a provider create, where this block does not render at all.
 */
async function pickExpertTierIfPresent(page: Page): Promise<boolean> {
  const firstTier = page.locator('[data-testid^="option-tier-"]').first();
  // The tiles render after the /api/expert/offering-types fetch resolves. Locator.isVisible()
  // does NOT wait (its `timeout` option is deprecated/ignored — Playwright checks the CURRENT
  // DOM state only), so a genuine bounded wait needs waitFor(), not isVisible({timeout}) — the
  // pattern used elsewhere in this file for already-settled (post-networkidle) content, which is
  // fine there but would be wrong for a tile that can still be mid-fetch.
  try {
    await firstTier.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    return false; // role !== "expert" (block never renders) or the fetch never resolved.
  }
  await firstTier.click();
  return true;
}

/** Fills whichever known fields are visible on the wizard's CURRENT step. Never fails if a
 *  field is absent (steps render conditionally on delivery method / role). */
async function fillCurrentStep(page: Page, input: ServiceFormInput): Promise<void> {
  // service-name / service-description / service-duration are focused data-testids added to
  // ServiceForm.tsx for this lane (handoff-sanctioned — no stable testid existed on these three
  // inputs before). service-price does not exist as a literal testid: the live equivalent is
  // priceType-dependent (input-base-price / input-hourly-rate / input-event-rate), used below.
  const nameInput = page.getByTestId("service-name");
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(input.name);

  const descInput = page.getByTestId("service-description");
  if (await descInput.isVisible().catch(() => false)) await descInput.fill(input.description);

  const method = input.deliveryMethod ?? "call";
  const methodTile = page.getByTestId(`method-tile-${method}`);
  if (await methodTile.isVisible().catch(() => false)) await methodTile.click();

  const durationInput = page.getByTestId("service-duration");
  if (await durationInput.isVisible().catch(() => false)) await durationInput.fill(input.duration);

  const priceInput = page
    .getByTestId("input-base-price")
    .or(page.getByTestId("input-event-rate"))
    .or(page.getByTestId("input-hourly-rate"));
  if (await priceInput.isVisible().catch(() => false)) await priceInput.fill(String(input.price));

  // Attestations (client/src/components/provider/service-attestations-card.tsx): affirm
  // every applicable one so the attestation publish gate never blocks a fixture service.
  const attestBoxes = page.locator('[data-testid^="checkbox-attestation-"]');
  const attestCount = await attestBoxes.count().catch(() => 0);
  for (let i = 0; i < attestCount; i++) {
    const box = attestBoxes.nth(i);
    if (!(await box.isChecked().catch(() => true))) await box.check().catch(() => {});
  }

  await pickOfferingOrCategory(page, input.offeringSearchTerm);
  await pickExpertTierIfPresent(page);
}

/**
 * Discards a restored autosave checkpoint, if the wizard opened with one (client/src/components
 * /ServiceForm.tsx: `traveloure:new-service-autosave:v1:${role}` in localStorage, keyed by role
 * only — NOT per-service). This is the STALE-STATE FIX for creating more than one service in the
 * same browser context: `readAutosave()` runs synchronously at mount (`useRef(readAutosave())`),
 * seeding `formData` with the PREVIOUS service's name/category/tier and — critically —
 * `currentStep` with whatever step that previous session last saved at (frequently the final
 * step, since the debounced 800ms autosave keeps checkpointing as the driver advances through
 * steps). A second `/expert|provider/services/new` visit therefore does not start clean: it can
 * land straight on the final (submit) step with an ALREADY-VALID, ALREADY-ENABLED submit button
 * carrying the FIRST service's data — so fillCurrentStep never gets a chance to run (Basics,
 * where name/description/category/tier live, was skipped entirely) and the second create writes
 * a row named after the first service. Clicking `button-discard-autosave` ("Start fresh") is the
 * product's own reset path — it clears the checkpoint, empties formData, and resets to step 1 —
 * so this calls it BEFORE any fill, every time driveServiceFormToSubmit is invoked, whether or
 * not a banner is currently visible (idempotent: a no-op when there is nothing to discard).
 */
async function discardAutosaveIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId("banner-autosave-restored");
  if (await banner.isVisible().catch(() => false)) {
    await page.getByTestId("button-discard-autosave").click();
    await banner.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

/**
 * Drives the ServiceForm wizard from its current (first) step through to the final submit
 * button, filling recognized fields on each step as they become visible. Clicks
 * `button-step-next` until either `button-submit-service` (expert) or `button-publish-service`
 * (provider) is visible, then clicks it. Bounded to 12 steps (the wizard has far fewer).
 * Returns the button's final testid clicked, or null if neither ever appeared (a FINDING the
 * caller should record as its own step verdict, not silently swallow).
 */
export async function driveServiceFormToSubmit(
  page: Page,
  input: ServiceFormInput,
  publishStatus: "draft" | "submit",
): Promise<"button-submit-service" | "button-publish-service" | null> {
  await discardAutosaveIfPresent(page);
  for (let guard = 0; guard < 12; guard++) {
    await fillCurrentStep(page, input);

    const submitBtn = page.getByTestId("button-submit-service");
    const publishBtn = page.getByTestId("button-publish-service");
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    const publishVisible = await publishBtn.isVisible().catch(() => false);
    if (submitVisible || publishVisible) {
      if (publishStatus === "draft") {
        const draftBtn = page.getByTestId("button-save-draft");
        if (await draftBtn.isVisible().catch(() => false)) {
          await draftBtn.click();
          return null;
        }
      }
      const target = submitVisible ? submitBtn : publishBtn;
      const testid = submitVisible ? "button-submit-service" : "button-publish-service";
      // FAIL FAST (not Playwright's default actionability retry, which — with no timeout
      // override on a bare .click() — retried against this test's whole 240s budget before
      // reporting anything). A DISABLED submit/publish button means the required-field set
      // (name, category, and for a fresh expert create also expertOfferingTypeId — see
      // pickExpertTierIfPresent above) is not fully satisfied; that is a form-completeness bug
      // in THIS driver (or a real product regression), and it should say so in ~15s, not 4
      // minutes x however many retries the test config allows.
      try {
        await expect(
          target,
          `${testid} stayed disabled — form incomplete (required: name, category, and ` +
            `expertOfferingTypeId on a fresh expert create; see pickExpertTierIfPresent)`,
        ).toBeEnabled({ timeout: 15_000 });
      } catch (err) {
        console.error(`[driveServiceFormToSubmit] ${(err as Error).message}`);
        return null;
      }
      await target.click();
      return testid;
    }

    const nextBtn = page.getByTestId("button-step-next");
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(400);
    } else {
      break;
    }
  }
  return null;
}
