import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { Pool } from "pg";
import { BASE_URL, uid, assertDisposableDb } from "./_journey-helpers";

/**
 * S1-d-3b — the LiteAPI SANDBOX book-and-cancel (ledger `2026-10-11-s1-d3b-stay-book-ui`; S1-d-3 rulings).
 * Re-proves in CI the field names the founder's Oct 9 sandbox run verified (d-3a).
 *
 * RULES OF THIS TEST (ruled): sandbox only, a QA-domain account only, and the booking is cancelled
 * IMMEDIATELY. It never runs against production (the server refuses every booking step outside sandbox,
 * `liteapiBookingEnabled`), and the production smoke clicks nothing priced.
 *
 * WHAT IT DRIVES, AND WHAT IT DOES NOT (§18d):
 *   · UI: the stay's item sheet draws "Book"; the server's re-quoted price is shown BEFORE the SDK opens;
 *     "Continue to payment" mounts Nuitée's Payment SDK in the dialog.
 *   · It pays in Nuitée's SDK as a traveler would, typing LiteAPI's public SANDBOX test card into the SDK's own
 *     fields (no field is ours). Sandbox refused a book sent without the card step (run 38274998493, `failed`).
 *     The SDK returns to `/plans/:tripId/stays/:itemId/booked`, which posts book once; the test reads that answer.
 *   · Then the slip's existing booking line reads "booked · #<code>", and the immediate cancel clears it.
 *
 * Skipped unless LITEAPI_SANDBOX_E2E=1 (the job sets it only when the sandbox key is configured).
 */
/** LiteAPI's public sandbox test card (Payment SDK docs). Never a real card; the SDK only accepts it in sandbox. */
const SANDBOX_CARD = { number: "4242424242424242", expiry: "1234", cvc: "123", postal: "10001" };

/**
 * Types the sandbox test card into whichever frame of the SDK holds the card number, then presses the SDK's pay
 * button. The selectors are the common card-field names (name / autocomplete), not a claim about the SDK's markup:
 * on a miss it prints the frames and the container's buttons so the next run can name them.
 */
async function payWithSandboxCard(page: import("@playwright/test").Page, container: string): Promise<void> {
  const numberSel = 'input[name="number"], input[name="cardnumber"], input[autocomplete="cc-number"]';
  const deadline = Date.now() + 60_000;
  let cardFrame: import("@playwright/test").Frame | null = null;
  // The SDK is a Stripe Payment Element in an accordion: when it offers more than one method (run 38279220948
  // showed Klarna and Amazon Pay beside card), the card fields exist only once "Card" is selected.
  const paymentFrames = () => page.frames().filter((f) => f.url().includes("componentName=payment"));
  while (!cardFrame && Date.now() < deadline) {
    for (const f of page.frames()) {
      if (await f.locator(numberSel).count().catch(() => 0)) {
        cardFrame = f;
        break;
      }
    }
    if (!cardFrame) {
      for (const f of paymentFrames()) {
        const card = f.locator('[data-value="card"], button:has-text("Card"), [role="radio"]:has-text("Card"), [role="button"]:has-text("Card")').first();
        if (await card.count().catch(() => 0)) await card.click({ timeout: 5_000 }).catch(() => {});
      }
      await page.waitForTimeout(1_000);
    }
  }
  if (!cardFrame) {
    console.log(`[sandbox-pay] no card-number field in any frame; frames: ${page.frames().map((f) => f.url().slice(0, 120)).join(" | ")}`);
    for (const f of paymentFrames()) console.log(`[sandbox-pay] payment frame text: ${(await f.locator("body").innerText().catch(() => "")).slice(0, 600)}`);
    console.log(`[sandbox-pay] container: ${(await page.locator(container).innerHTML().catch(() => "")).slice(0, 2000)}`);
    throw new Error("the Payment SDK drew no card-number field within 60 s");
  }
  const fill = async (sel: string, value: string) => {
    const el = cardFrame!.locator(sel).first();
    if (await el.count()) await el.fill(value);
  };
  await fill(numberSel, SANDBOX_CARD.number);
  await fill('input[name="expiry"], input[name="exp-date"], input[autocomplete="cc-exp"]', SANDBOX_CARD.expiry);
  await fill('input[name="cvc"], input[name="cvv"], input[autocomplete="cc-csc"]', SANDBOX_CARD.cvc);
  await fill('input[name="postalCode"], input[name="postal"], input[autocomplete="postal-code"]', SANDBOX_CARD.postal);
  // The pay button is the SDK's; look in the container first, then in every frame.
  const payName = /pay|book|confirm|complete|submit/i;
  const inPage = page.locator(container).getByRole("button", { name: payName });
  if (await inPage.count()) return inPage.last().click({ timeout: 30_000 });
  for (const f of page.frames()) {
    const b = f.getByRole("button", { name: payName });
    if (await b.count().catch(() => 0)) return b.last().click({ timeout: 30_000 });
  }
  console.log(`[sandbox-pay] no pay button; container: ${(await page.locator(container).innerHTML().catch(() => "")).slice(0, 2000)}`);
  throw new Error("the Payment SDK drew no pay button");
}

const QA_DOMAIN = process.env.QA_ACCOUNT_EMAIL_DOMAIN ?? "";
const ON = process.env.LITEAPI_SANDBOX_E2E === "1";

/**
 * THE PUBLIC MARGIN IS THE SEEDED ONE (decision-maker, Oct 11, 2026). Without it the shown price is the bare
 * retail rate, which sits below LiteAPI's suggested selling price, and every stay is refused below SSP. The value
 * is read from migration 366's own INSERT — the seed of record — never typed here (LD 8: no margin literal).
 */
function seededPublicMargin(): number {
  const sql = readFileSync("server/migrations/366_hotel_margin_bands.sql", "utf8");
  const m = /\('hotel_margin_public',\s*'percent',\s*([0-9.]+)/.exec(sql);
  if (!m) throw new Error("migration 366 no longer seeds hotel_margin_public — read the seed of record");
  return Number(m[1]);
}
let marginInForce: number | null = null;

test.describe("stay booking — LiteAPI sandbox book then immediate cancel", () => {
  test.skip(!ON, "LITEAPI_SANDBOX_E2E is not set — the sandbox key is not configured for this run");
  test.setTimeout(10 * 60_000);

  test.beforeAll(async () => {
    if (!ON) return;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await assertDisposableDb(pool);
      const rate = seededPublicMargin();
      const upd = await pool.query(
        `UPDATE fee_bands SET default_rate = $1, rate_type = 'percent', is_active = true WHERE band_key = 'hotel_margin_public'`,
        [rate],
      );
      if (upd.rowCount === 0) {
        await pool.query(
          `INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, is_active) VALUES ('hotel_margin_public', 'percent', $1, 'Hotel margin — public rate', true)`,
          [rate],
        );
      }
      const r = await pool.query(`SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands WHERE band_key = 'hotel_margin_public' AND is_active = true AND rate_type = 'percent'`);
      marginInForce = r.rows[0]?.rate ?? null;
      expect(marginInForce, "hotel_margin_public is the seeded rate for this run").toBe(rate);
    } finally {
      await pool.end();
    }
  });

  test("Book shows the server's price, books in sandbox, and is cancelled at once", async ({ page }) => {
    expect(QA_DOMAIN, "QA_ACCOUNT_EMAIL_DOMAIN must be set — QA accounts only").not.toBe("");
    const api = page.request;
    const email = `stay-book-${uid()}@${QA_DOMAIN}`;
    const reg = await api.post(`${BASE_URL}/api/auth/register`, {
      data: { email, password: process.env.E2E_TEST_PASSWORD || "TestPass123!", firstName: "Sandbox", lastName: "Traveler", userType: "user" },
    });
    expect(reg.status(), await reg.text()).toBe(201);

    // One FRESH Kyoto plan per hotel tried: a comparison holds a capped number of places and a chosen place
    // becomes the plan's own, so a new plan is the honest way to offer the next hotel.
    // A weekday night 60–90 days out (S1-d-3c): the first Tuesday on or after day 60, checking out Wednesday.
    // The Oct 12 runs drew a Friday 60 days out and three of six hotels had no offer for it; the gate is not loosened.
    const start = new Date(Date.now() + 60 * 86_400_000);
    start.setUTCDate(start.getUTCDate() + ((2 - start.getUTCDay() + 7) % 7));
    const end = new Date(start.getTime() + 86_400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    async function planWithItem(): Promise<{ tripId: string; itemId: string; setId: string }> {
      const trip = await api.post(`${BASE_URL}/api/trips`, { data: { title: "Sandbox stay", destination: "Kyoto, Japan", startDate: d(start), endDate: d(end) } });
      expect(trip.status(), await trip.text()).toBe(201);
      const tripId = (await trip.json()).id as string;
      // The owner's re-date rail stamps the dates confirmed; the party is two adults.
      const redate = await api.patch(`${BASE_URL}/api/trips/${tripId}`, { data: { startDate: d(start), endDate: d(end) } });
      expect(redate.ok(), await redate.text()).toBeTruthy();
      const party = await api.patch(`${BASE_URL}/api/trips/${tripId}/occasion`, { data: { adults: 2 } });
      expect(party.ok(), await party.text()).toBeTruthy();
      const item = await api.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: { title: "Hotel", dayNumber: 1, itemType: "accommodation" } });
      expect(item.status(), await item.text()).toBe(201);
      const itemId = (await item.json()).id as string;
      const set = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, { data: { itineraryItemId: itemId, categoryKey: "accommodation", label: "Where to stay" } });
      expect(set.status(), await set.text()).toBe(201);
      return { tripId, itemId, setId: (await set.json()).set.id as string };
    }

    const first = await planWithItem();
    const search = await api.get(`${BASE_URL}/api/trips/${first.tripId}/option-sets/search?q=`);
    expect(search.ok(), await search.text()).toBeTruthy();
    const hotels = (await search.json()).results as Array<{ id: string; name: string }>;
    expect(hotels.length, "the Kyoto LiteAPI sync gave the plan's city hotels").toBeGreaterThan(0);

    // Try hotels until the SERVER prices one. Below its suggested selling price a stay is REFUSED (decision-maker,
    // Oct 11, 2026), and the sheet says so.
    let priced: { tripId: string; itemId: string } | null = null;
    const tried: string[] = [];
    let belowSspShown = false;
    for (const [i, h] of hotels.slice(0, 6).entries()) {
      const { tripId, itemId, setId } = i === 0 ? first : await planWithItem();
      const opt = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, { data: { source: { kind: "hotel_cache", hotelCacheId: h.id } } });
      if (!opt.ok()) {
        tried.push(`${h.name}: add option ${opt.status()}`);
        continue;
      }
      const optionId = (await opt.json()).option.id as string;
      const chose = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/choose`, { data: { optionId } });
      if (!chose.ok()) {
        tried.push(`${h.name}: choose ${chose.status()}`);
        continue;
      }
      const view = await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json();
      if (!view.bookable) {
        tried.push(`${h.name}: not bookable`);
        continue;
      }
      // Only a refundable rate can be "cancelled at once" for free (ledger `2026-10-15-liteapi-cancel-with-charges`):
      // read the stay's live rate first and pass over one that is not stated refundable.
      const quote = await (await api.get(`${BASE_URL}/api/trips/${tripId}/stays/${h.id}/rates`)).json().catch(() => null);
      if (quote?.state !== "ok" || quote.offer?.refundable !== true) {
        tried.push(`${h.name}: ${quote?.state === "ok" ? "non-refundable" : `rates ${quote?.state ?? "unread"}`}`);
        continue;
      }

      await page.goto(`${BASE_URL}/plans/${tripId}`);
      await page.getByTestId(`slip-item-name-${itemId}`).first().click();
      const book = page.getByTestId(`item-sheet-stay-book-${itemId}`);
      await expect(book).toBeVisible();
      const prebook = page.waitForResponse((r) => r.url().endsWith(`/items/${itemId}/stay-booking/prebook`));
      await book.click();
      const pre = await (await prebook).json();
      if (pre.state !== "prebooked") {
        tried.push(`${h.name}: ${pre.state}${pre.reason ? ` (${pre.reason}${pre.status ? ` ${pre.status}` : ""})` : ""}`);
        const refusal = page.getByTestId(`stay-book-refusal-${itemId}`);
        await expect(refusal).toBeVisible();
        if (pre.reason === "below_ssp") {
          await expect(refusal).toContainText("price available right now");
          belowSspShown = true;
        }
        // Nothing was stored for a refused prebook.
        expect((await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json()).booking).toBeNull();
        await page.keyboard.press("Escape");
        continue;
      }
      // The price shown is the server's, before the SDK opens.
      await expect(page.getByTestId(`stay-book-price-${itemId}`)).toBeVisible();
      expect(pre.env).toBe("sandbox");
      await page.getByTestId(`stay-book-continue-${itemId}`).click({ timeout: 30_000 });
      await expect(page.getByTestId(`stay-book-sdk-${itemId}`).locator("*").first()).toBeAttached({ timeout: 30_000 });
      priced = { tripId, itemId };
      break;
    }
    if (!priced) {
      // §18d: a run where every hotel tried was refused below SSP has proven the refusal path, NOT booking. It is
      // marked SKIPPED (never passed), naming what was not exercised, so a green job is never read as "booked".
      const onlyBelowSsp = tried.length > 0 && tried.every((t) => t.endsWith("(below_ssp)"));
      const onlyNonRefundable = tried.length > 0 && tried.every((t) => t.endsWith(": non-refundable"));
      if (onlyNonRefundable) {
        test.skip(true, `BOOK AND CANCEL NOT EXERCISED: every sandbox hotel tried offered only a non-refundable rate for the plan's dates, which cannot be cancelled free. Tried: ${tried.join("; ")}`);
        return;
      }
      expect(onlyBelowSsp && belowSspShown, `no Kyoto sandbox hotel priced the plan's dates — tried: ${tried.join("; ") || "none"}`).toBe(true);
      test.skip(
        true,
        `BOOK AND CANCEL NOT EXERCISED: every sandbox hotel tried was below its suggested selling price and was refused (ruled Oct 11, 2026), with hotel_margin_public at ${marginInForce} (the seeded margin). Tried: ${tried.join("; ")}`,
      );
      return;
    }
    const { tripId, itemId } = priced;

    // Pay in Nuitée's SDK with LiteAPI's public sandbox test card, then the return page books ONCE through our rail
    // (TRANSACTION_ID only — the server builds the body). The booking is cancelled at once.
    const bookAnswer = page.waitForResponse((r) => r.url().endsWith(`/items/${itemId}/stay-booking/book`), { timeout: 180_000 });
    await payWithSandboxCard(page, `#liteapi-payment-${itemId}`);
    const booked = await (await bookAnswer).json();
    let chargesApply: Record<string, unknown> | null = null;
    await expect(page.getByTestId("stay-booked-result")).toHaveAttribute("data-state", booked.state);
    try {
      expect(booked.state, JSON.stringify(booked)).toBe("confirmed");
      expect(typeof booked.hotelConfirmationCode === "string" || booked.hotelConfirmationCode === null).toBe(true);
      await page.goto(`${BASE_URL}/plans/${tripId}`);
      if (booked.hotelConfirmationCode) await expect(page.getByText(`booked · #${booked.hotelConfirmationCode}`).first()).toBeVisible();
    } finally {
      if (booked.state === "confirmed" || booked.state === "pending") {
        // Never sends acknowledgeCharges: CI does not consent to a charge on anyone's behalf.
        const res = await api.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking/cancel`, { data: {} });
        const cancelled = await res.json();
        if (res.status() === 422) {
          // The booking's re-quote came back non-refundable after the rate read said refundable. The consent gate
          // must refuse without a LiteAPI call; the live sandbox booking is cancelled by the job's cleanup step.
          expect(cancelled.code, JSON.stringify(cancelled)).toBe("charges_apply");
          chargesApply = cancelled;
        } else {
          expect(cancelled.state, JSON.stringify(cancelled)).toBe("cancelled");
        }
      }
    }
    if (chargesApply) {
      expect((await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json()).booking.status).toBe("confirmed");
      test.skip(true, `FREE CANCEL NOT EXERCISED: the booked rate's stored policy says cancelling now has a charge (${JSON.stringify(chargesApply)}); the 422 consent gate was proven and the job's cleanup step cancels the sandbox booking.`);
      return;
    }
    const after = await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json();
    expect(after.booking.status).toBe("cancelled");
  });
});
