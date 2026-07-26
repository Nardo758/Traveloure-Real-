/**
 * payment-methods.routes.ts — FP-1 frictionless payments: saved-card management.
 *
 * GET    /api/me/payment-methods          — list the session user's vaulted cards (+ default)
 * POST   /api/me/payment-methods/default  — set the default card
 * DELETE /api/me/payment-methods/:id      — remove a card
 *
 * §14: everything is scoped to the SESSION user's own Stripe Customer — the service verifies a
 * payment_method belongs to that customer before default/detach (a pm id is not a capability).
 * Cards are never stored here; Stripe vaults them and we hold only users.stripe_customer_id.
 * §13: Stripe unconfigured → honest 503, never a fake empty success for mutations.
 */
import { Router } from "express";
import { z } from "zod";
import { stripePaymentService } from "../services/stripe-payment.service";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

const sessionUserId = (req: any) => req.user?.claims?.sub ?? req.user?.id;

router.get("/api/me/payment-methods", isAuthenticated, async (req: any, res) => {
  try {
    if (!stripePaymentService.isReady()) {
      // Read path: an empty, explicitly-degraded list is honest (the UI shows "unavailable").
      return res.json({ available: false, defaultPaymentMethodId: null, methods: [] });
    }
    const result = await stripePaymentService.listSavedPaymentMethods(sessionUserId(req));
    return res.json({ available: true, ...result });
  } catch (err: any) {
    console.error("[payment-methods] list failed:", err);
    return res.status(500).json({ message: "Failed to load payment methods" });
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
