/**
 * R2-5 — Stripe.js only loads on a payment surface.
 *
 * The probe found `m.stripe.com` cookies and `js.stripe.com` on public guest pages (Kyoto, /experiences).
 *
 * Phase 0 ruled the obvious suspects OUT: all three `loadStripe` calls are already inside memoized
 * getters, so merely importing a module loads nothing — `AddCardDialog` and `SavePaymentMethodPrompt`
 * resolve the promise only in `handleOpen`. The leak was `StripeCheckout`'s mount-time effect: it
 * resolved the promise as soon as the component RENDERED, even with no payment intent, so any page
 * that mounted a closed checkout surface (the Ask-AI drawer's fee sheet, a slip rail) pulled the
 * script.
 *
 *   P1 no client secret ⇒ the loader is never asked (the early return)
 *   P2 the effect tracks the client secret, so opening a real payment loads it then
 *   P3 no module-scope `loadStripe` anywhere in the three Stripe modules
 *   P4 the add-card rail waits for the user to open it
 *
 * Run: npx tsx --test client/src/lib/__tests__/r2-5-stripe-lazy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync("client/src/components/booking/StripeCheckout.tsx", "utf8");
const addCard = fs.readFileSync("client/src/components/payment/AddCardDialog.tsx", "utf8");
const confirmPage = fs.readFileSync("client/src/pages/BookingConfirmationPage.tsx", "utf8");
const prompt = fs.readFileSync("client/src/components/payment/SavePaymentMethodPrompt.tsx", "utf8");

describe("R2-5 — Stripe.js behind the payment surface", () => {
  it("P1 no client secret ⇒ the loader is never asked", () => {
    // Behavioural, not a pretty regex: inside the mount effect, the guard must come FIRST.
    const effectAt = checkout.indexOf("useEffect(() => {", checkout.indexOf("const [stripe, setStripe]"));
    assert.ok(effectAt > 0, "the mount effect exists");
    const effectBody = checkout.slice(effectAt, checkout.indexOf("}, [paymentIntent?.clientSecret]);", effectAt));
    const guardAt = effectBody.indexOf("if (!paymentIntent?.clientSecret) return;");
    const loadAt = effectBody.indexOf("getStripePromise()");
    assert.ok(guardAt > 0, "the guard is in the effect");
    assert.ok(loadAt > guardAt, "the guard returns BEFORE the loader is asked");
  });

  it("P2 the effect tracks the client secret", () => {
    assert.match(checkout, /\}, \[paymentIntent\?\.clientSecret\]\);/, "a real payment loads it, then");
  });

  it("P3 no module-scope loadStripe in any of the three Stripe modules", () => {
    for (const [name, src] of [
      ["StripeCheckout", checkout],
      ["AddCardDialog", addCard],
      ["BookingConfirmationPage", confirmPage],
    ] as const) {
      assert.doesNotMatch(
        src,
        /^\s*(?:const|let|var)\s+\w+\s*=\s*loadStripe\(/m,
        `${name} must not call loadStripe at module scope`,
      );
      assert.match(src, /function getStripePromise|const getStripePromise|let _stripePromise/, `${name} keeps a memoized getter`);
    }
  });

  it("P4 the add-card rail waits for the user to open it", () => {
    // The dialog resolves the loader in handleOpen, not at render — and its <Elements> only exists
    // once there is both a client secret and a stripe instance.
    assert.match(addCard, /if \(!stripe\) getStripePromise\(\)\.then\(setStripe\);/, "resolved on open");
    assert.match(addCard, /clientSecret && stripe \?/, "…and Elements renders only then");
    // The prompt is a trigger over that dialog and contributes no Stripe call of its own.
    assert.match(prompt, /<AddCardDialog \/>/);
    assert.doesNotMatch(prompt, /loadStripe|getStripePromise|<Elements/, "the prompt adds no Stripe call");
  });
});
