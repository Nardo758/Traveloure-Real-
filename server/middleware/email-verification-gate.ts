/**
 * S-09: a signed-in account that still has to verify its email may call the
 * verify-screen routes and nothing else. Unauthenticated requests pass through.
 * Deleted and suspended accounts pass through so isAuthenticated can say why.
 * A missing user row passes through the same way. A failure to read the account
 * is 503. A failure to read activity holds the account (the service does that).
 */
import type { RequestHandler } from "express";
import { authStorage } from "../replit_integrations/auth/storage";
import {
  emailVerificationDeniedBody,
  isEmailVerificationAllowlisted,
  EMAIL_VERIFICATION_HOLD_ENFORCED,
} from "@shared/email-verification-gate";
import {
  resolveEmailVerificationAccess,
  type EmailVerificationSession,
} from "../services/email-verification.service";

export const emailVerificationGate: RequestHandler = async (req, res, next) => {
  if (!EMAIL_VERIFICATION_HOLD_ENFORCED) return next();
  if (!req.isAuthenticated || !req.isAuthenticated()) return next();

  // The SPA document is not an API. A held session must still receive the
  // page so the client can show /verify-email. Data stays behind /api.
  if (!req.path.startsWith("/api")) return next();

  if (isEmailVerificationAllowlisted(req.method, req.path)) return next();

  const sessionUser = req.user as { claims?: { sub?: string }; id?: string } | undefined;
  const userId = sessionUser?.claims?.sub ?? sessionUser?.id;
  if (!userId) return next();

  try {
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || dbUser.isDeleted || dbUser.isSuspended) return next();
    const access = await resolveEmailVerificationAccess(
      dbUser,
      req.session as EmailVerificationSession,
    );
    if (access === "hold") {
      return res.status(403).json(emailVerificationDeniedBody());
    }
    return next();
  } catch (err) {
    console.error("[email-verification] account read failed for user", userId);
    return res.status(503).json({ message: "Authentication service temporarily unavailable" });
  }
};
