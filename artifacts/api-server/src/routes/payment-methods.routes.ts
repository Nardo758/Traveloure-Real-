/**
 * payment-methods.routes.ts — FP-1 frictionless payments: saved-card management.
 *
 * GET    /api/me/payment-methods              — list the session user's vaulted cards (+ default)
 * POST   /api/me/payment-methods/default       — set the default card
 * DELETE /api/me/payment-methods/:id           — remove a card
 * POST   /api/me/payment-methods/setup-intent  — H7: start the add-card flow (Stripe SetupIntent,
 *                                                 charges nothing — §14-clean by construction, no
 *                                                 amount anywhere on this path)
 *
 * §14: everything is scoped to the SESSION user's own Stripe Customer — the service verifies a
 * payment_method belongs to that customer before default/detach (a pm id is not a capability).
 * Cards are never stored here; Stripe vaults them and we hold only users.stripe_customer_id.
 * §13: Stripe unconfigured → honest 503, never a fake empty success for mutations.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod/v4";
import { stripePaymentService } from "../services/stripe-payment.service";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

const sessionUserId = (req: any) => getUserId(req)!;

router.get("/api/me/payment-methods", isAuthenticated, async (req: any, res) => {
  try {
    if (!stripePaymentService.isReady()) {
      // Read path: an empty, explicitly-degraded list is honest (the UI shows "unavailable").
      return res.json({ available: false, defaultPaymentMethodId: null, methods: [] });
    }
    const result = await stripePaymentService.listSavedPaymentMethods(sessionUserId(req));
    return res.json({ available: true, ...result });
  } catch (err: any) {
    // A LIST failure must not break the page that embeds it (the cart's saved-card widget).
    // The `available: false` shape above already models "we can't show saved cards right now",
    // so a Stripe outage / bad key degrades into that same honest state instead of 500ing —
    // found by the Aug 2 browser sweep, where a dev-dummy Stripe key made /cart surface a 500.
    // Write paths (setup-intent, default, delete) deliberately keep their hard failures: a
    // silent no-op there would be dishonest about whether the user's action took effect.
    console.error("[payment-methods] list failed — degrading to unavailable:", err);
    return res.json({ available: false, defaultPaymentMethodId: null, methods: [] });
  }
});

router.post("/api/me/payment-methods/setup-intent", isAuthenticated, async (req: any, res) => {
  try {
    if (!stripePaymentService.isReady()) {
      return res.status(503).json({ error: "stripe_unavailable", message: "Payments are not yet configured." });
    }
    const result = await stripePaymentService.createSetupIntent(sessionUserId(req));
    if (!result) {
      return res.status(503).json({ error: "stripe_unavailable", message: "Couldn't start the add-card flow. Try again later." });
    }
    return res.json(result);
  } catch (err: any) {
    console.error("[payment-methods] setup-intent failed:", err);
    return res.status(500).json({ message: "Failed to start the add-card flow" });
  }
});

router.post("/api/me/payment-methods/default", isAuthenticated, async (req: any, res) => {
  try {
    if (!stripePaymentService.isReady()) {
      return res.status(503).json({ error: "stripe_unavailable", message: "Payments are not yet configured." });
    }
    const parsed = z.object({ paymentMethodId: z.string().min(1) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "paymentMethodId is required" });
    const ok = await stripePaymentService.setDefaultSavedPaymentMethod(
      sessionUserId(req),
      parsed.data.paymentMethodId,
    );
    if (!ok) return res.status(403).json({ message: "That payment method does not belong to your account." });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[payment-methods] set-default failed:", err);
    return res.status(500).json({ message: "Failed to update default payment method" });
  }
});

router.delete("/api/me/payment-methods/:id", isAuthenticated, async (req: any, res) => {
  try {
    if (!stripePaymentService.isReady()) {
      return res.status(503).json({ error: "stripe_unavailable", message: "Payments are not yet configured." });
    }
    const ok = await stripePaymentService.detachSavedPaymentMethod(sessionUserId(req), req.params.id);
    if (!ok) return res.status(403).json({ message: "That payment method does not belong to your account." });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[payment-methods] detach failed:", err);
    return res.status(500).json({ message: "Failed to remove payment method" });
  }
});

export default router;
