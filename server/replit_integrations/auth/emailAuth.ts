import type { Express } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { users, passwordResetTokens, emailVerificationTokens } from "@shared/models/auth";
import { and, eq, gt, isNull, sql as drizzleSql } from "drizzle-orm";
import { trackFunnelEvent } from "../../utils/funnelTracker";
import { getPlatformFlag, FLAG_REGISTRATION_ENABLED } from "../../services/platform-flags";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@shared/legal-versions";
import { dispatchModerationEvent } from "../../automations/moderation/runtime";
import { scheduleSignup, duplicateSignup, requestVerification, requestReset, lockJourney } from "../../automations/messaging/_core-store";
import { recordPasswordAttempt, recordSuccessfulLogin, verifyJourneyToken, afterPasswordReset } from "../../automations/messaging/_core-auth";
import { runCoreJourney } from "../../automations/messaging/_core-worker";
import { SIGNUP_RESPONSE } from "../../automations/messaging/_core-policy";
import { registerJourneyUnsubscribe } from "../../automations/messaging/_core-unsubscribe";

function kickJourney(userId: string) {
  void runCoreJourney({ userId }).catch((error) => console.error("[signup-journey] immediate pass failed", error));
}

// Simple password hashing using Node's built-in crypto
// For production, consider using bcrypt or argon2
async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key || !/^[0-9a-f]{128}$/i.test(key)) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      const expected = Buffer.from(key, "hex");
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

// Note: userType is accepted in the request body for UX purposes only
// (e.g. pre-filling onboarding flows). It is NEVER used to set the DB role.
// All users are created with role='user'. Role upgrades require an approved
// application form (local_expert_forms or service_provider_forms).
const validUserTypes = [
  "user",
  "travel_expert",
  "local_expert",
  "event_planner",
  "service_provider",
  "executive_assistant",
] as const;

const registerSchema = z.object({
  email: z.string().email("Invalid email address").max(254, "Email is too long"),
  // Cap password length too: bcrypt only reads the first 72 bytes, and an unbounded
  // password is a cheap CPU-DoS vector (hashing a multi-MB string). 8..200 is ample.
  password: z.string().min(8, "Password must be at least 8 characters").max(200, "Password is too long"),
  firstName: z.string().trim().min(1, "First name is required").max(100, "First name is too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "Last name is too long"),
  userType: z.enum(validUserTypes).optional().default("user"), // accepted but ignored server-side
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Do NOT .trim() the password: registration stores it verbatim (no trim), so trimming
  // here both (a) lets a whitespace-padded variant of a correct password authenticate and
  // (b) locks out anyone whose real password has leading/trailing spaces. Compare exactly.
  password: z.string().min(1, "Password is required"),
});

export function setupEmailAuth(app: Express): void {
  registerJourneyUnsubscribe(app);
  // Register new user with email/password
  app.post("/api/auth/register", async (req, res) => {
    const started = Date.now();
    try {
      // Admin-controlled kill switch (/admin/system → "New User Registration").
      // platform_settings.new_user_registration_enabled = 'false' blocks signups.
      const registrationEnabled = await getPlatformFlag(FLAG_REGISTRATION_ENABLED, true);
      if (!registrationEnabled) {
        return res.status(403).json({
          message: "New user registration is temporarily disabled. Please try again later.",
        });
      }

      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { email, password, firstName, lastName } = validation.data;
      // userType from request body is intentionally ignored — all new accounts
      // start as role='user'. Role upgrades happen via approved application forms.

      // Both new and existing addresses pay the same scrypt cost. No new account
      // receives a session or an identifying response before verification.
      const hashedPassword = await hashPassword(password);
      const existingUser = await db
        .select()
        .from(users)
        .where(drizzleSql`lower(${users.email})=lower(${email})`)
        .then((r) => r[0]);

      if (existingUser) {
        await duplicateSignup(existingUser.id);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 850 - (Date.now() - started))));
        res.status(200).json(SIGNUP_RESPONSE);
        kickJourney(existingUser.id);
        return;
      }

      // Create user with terms accepted at registration time
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          role: 'user' as const, // SECURITY: always 'user' — role upgrades require approved application
          authProvider: "email",
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        })
        .onConflictDoNothing({ target: users.email })
        .returning();

      // A concurrent registration can win after the initial read. It receives
      // precisely the same response, not a unique-constraint privacy leak.
      if (!newUser) {
        const [owner] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
        if (owner) await duplicateSignup(owner.id);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 850 - (Date.now() - started))));
        res.status(200).json(SIGNUP_RESPONSE);
        if (owner) kickJourney(owner.id);
        return;
      }

      // Fire-and-forget: T1 funnel event (includes paid-acquisition attribution)
      trackFunnelEvent({
        userId: newUser.id,
        eventType: "account_created",
        funnelStage: "T1_ACCOUNT_CREATED",
        source: (req.body.source as string) || "direct",
        refToken: (req.body.refToken as string) || undefined,
      }).catch(() => { /* fire-and-forget funnel event — never blocks signup */ });

      await scheduleSignup(newUser.id);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 850 - (Date.now() - started))));
      res.status(200).json(SIGNUP_RESPONSE);
      kickJourney(newUser.id);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Login with email/password
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { email, password } = validation.data;

      // Find user
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .then((r) => r[0]);

      if (!user) {
        return res.status(401).json({
          message: "Invalid email or password",
        });
      }

      // Check if user has a password (might be OAuth-only or seeded user)
      if (!user.password) {
        const providerHint = user.authProvider === "replit" 
          ? "Replit" 
          : user.authProvider === "facebook" 
            ? "Facebook/Instagram" 
            : null;
        const message = providerHint
          ? `This account was created via ${providerHint}. Please sign in using ${providerHint} instead, or set a password first.`
          : "This account does not have a password set. Please sign in using Replit or set a password.";
        return res.status(401).json({ message });
      }

      // Verify password
      const isValid = await verifyPassword(password, user.password);
      const attempt = await recordPasswordAttempt(user.id, isValid);
      if (!attempt.allowed) {
        if (attempt.locked) kickJourney(user.id);
        return res.status(401).json({
          message: attempt.locked ? "Your account is temporarily locked. Try again in 30 minutes or reset your password." : "Invalid email or password",
        });
      }

      // Defense-in-depth: block soft-deleted and suspended accounts before a session
      // is ever created (isAuthenticated middleware is the primary gate for active sessions).
      if (user.isDeleted) {
        return res.status(403).json({
          message: "This account has been deleted. Please contact support if you believe this is an error.",
        });
      }
      if (user.isSuspended) {
        return res.status(403).json({
          message: "Your account has been suspended. Please contact support.",
          reason: user.suspensionReason ?? undefined,
        });
      }

      // Create session
      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          role: user.role,
        },
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      };

      // Explicitly regenerate the session ID before binding credentials to it.
      // This prevents session-fixation: an attacker who planted a known session
      // cookie before login cannot use that same ID after authentication.
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error("Session regeneration error:", regenErr);
          return res.status(500).json({ message: "Failed to create session" });
        }
        (req as any).login(sessionUser, async (err: any) => {
          if (err) {
            console.error("Login error:", err);
            return res.status(500).json({ message: "Failed to create session" });
          }

          try {
            await recordSuccessfulLogin(user.id, req);
            kickJourney(user.id);
          } catch (error) {
            req.logout(() => {});
            console.error("[auth/login] journey persistence failed", error);
            return res.status(500).json({ message: "Failed to finish sign-in. Please try again." });
          }
          res.json({
            message: "Logged in successfully",
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
            },
          });
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  // ─── Token-based password reset (LB-P1) ────────────────────────────────────
  // Replaces the tokenless `{email, newPassword}` endpoint that allowed any
  // caller to reset any account. The flow is now: POST /forgot-password
  // generates a single-use token, emails the raw token via Resend, and stores
  // ONLY the sha256 hash; POST /reset-password validates the token, sets the
  // new password through the existing scrypt hashPassword(), invalidates the
  // user's existing sessions, and marks the token used.

  function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address").max(254, "Email is too long"),
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        // Same generic 200 to avoid leaking whether the body was even shaped right.
        return res.status(200).json({
          message: "If an account exists for that email, we've sent a reset link.",
        });
      }
      const email = parsed.data.email.toLowerCase();

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .then((r) => r[0]);

      if (user && user.password) {
        // Skip OAuth-only accounts (no password set) — generating a reset for
        // them would be a no-op + signal that the email exists in another way.
        await requestReset(user.id, `minute:${Math.floor(Date.now() / 60000)}`);
        kickJourney(user.id);
      }

      // Always 200 with a generic message — no account enumeration.
      return res.status(200).json({
        message: "If an account exists for that email, we've sent a reset link.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      // Still 200 — no enumeration via 500.
      return res.status(200).json({
        message: "If an account exists for that email, we've sent a reset link.",
      });
    }
  });

  const resetPasswordSchema = z.object({
    token: z.string().min(32, "Invalid reset token").max(128, "Invalid reset token"),
    // Cap length: hashPassword runs scrypt on this verbatim — an unbounded value is a
    // CPU/memory DoS vector on this public endpoint. Matches the register cap; no trim.
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(200, "Password is too long"),
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { token, newPassword } = validation.data;
      const tokenHash = hashToken(token);
      const now = new Date();

      const hashedPassword = await hashPassword(newPassword);
      const resetApplied = await db.transaction(async (tx) => {
        const [identity] = await tx.select({ userId: passwordResetTokens.userId })
          .from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
        if (!identity) return false;
        const { user: current } = await lockJourney(tx, identity.userId);
        if (current.is_deleted || current.is_suspended) return false;
        // Claim the token atomically. Concurrent replays race on this conditional
        // UPDATE; exactly one can transition used_at from NULL.
        const [claimed] = await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now),
          ))
          .returning({ userId: passwordResetTokens.userId });
        if (!claimed) return false;

        await tx.update(users).set({ password: hashedPassword }).where(eq(users.id, claimed.userId));
        await afterPasswordReset(tx, claimed.userId, tokenHash);
        // Session invalidation is part of the same transaction and covers both
        // Passport user shapes. A failure rolls back the password/token change.
        await dispatchModerationEvent(
          "moderation.password-reset-session-purge",
          "password_reset.password_persisted",
          { userId: claimed.userId, resetTokenClaimed: true },
          { userId: claimed.userId, resetTokenClaimed: true },
          () => tx.execute(drizzleSql`
            DELETE FROM sessions
            WHERE sess->'passport'->'user'->'claims'->>'sub' = ${claimed.userId}
               OR sess->'passport'->'user'->>'id' = ${claimed.userId}
          `),
        );
        return claimed.userId;
      });
      if (!resetApplied) {
        return res.status(400).json({
          message: "This reset link is invalid or has expired. Please request a new one.",
        });
      }

      res.json({
        message: "Password has been reset successfully. You can now sign in.",
      });
      kickJourney(resetApplied);
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ─── Email verification on signup ──────────────────────────────────────────
  // Same token shape + storage pattern as the password-reset flow: raw token
  // sent via email, only the sha256 hash persisted, single-use + TTL.

  // POST /api/auth/send-verification — authenticated; (re)issues a token to the
  // caller's email. Used by the "Resend verification email" UI button.
  app.post("/api/auth/send-verification", async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.email) {
        return res.status(404).json({ message: "Account not found" });
      }
      if (user.emailVerified) {
        return res.status(200).json({ message: "Email already verified." });
      }
      const queued = await requestVerification(userId, `minute:${Math.floor(Date.now() / 60000)}`);
      if (queued === "limited") return res.status(429).json({ message: "At most 3 verification emails per hour. Please try later." });
      kickJourney(userId);
      return res.status(200).json({
        message: "Verification email sent. Check your inbox.",
      });
    } catch (error) {
      console.error("Send verification error:", error);
      return res.status(500).json({ message: "Failed to send verification email" });
    }
  });

  const verifyEmailSchema = z.object({
    token: z.string().min(32, "Invalid verification token").max(128, "Invalid verification token"),
  });

  // POST /api/auth/verify-email — public; client posts the raw token from the
  // /verify-email?token=… URL. On success, stamps users.emailVerified.
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.errors,
        });
      }
      const tokenHash = hashToken(parsed.data.token);
      const verifiedUserId = await verifyJourneyToken(tokenHash);
      if (!verifiedUserId) {
        return res.status(400).json({
          message: "This verification link is invalid or has expired. Please request a new one.",
        });
      }
      res.json({ message: "Email verified successfully." });
      kickJourney(verifiedUserId);
      return;
    } catch (error) {
      console.error("Verify email error:", error);
      return res.status(500).json({ message: "Failed to verify email" });
    }
  });

  app.get("/api/auth/logout", (_req, res) => {
    res.status(405).json({ error: "Method Not Allowed", message: "Use POST /api/auth/logout" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid", { path: "/" });
        res.json({ message: "Logged out successfully" });
      });
    });
  });
}
