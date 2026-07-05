import type { Express } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { users, passwordResetTokens, emailVerificationTokens } from "@shared/models/auth";
import { and, eq, gt, isNull, sql as drizzleSql } from "drizzle-orm";
import { sendPasswordResetEmail, sendEmailVerificationEmail, sendWelcomeEmail, getAppBaseUrl } from "../../services/email.service";
import { trackFunnelEvent } from "../../utils/funnelTracker";

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
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString("hex"));
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
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  userType: z.enum(validUserTypes).optional().default("user"), // accepted but ignored server-side
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export function setupEmailAuth(app: Express): void {
  // Register new user with email/password
  app.post("/api/auth/register", async (req, res) => {
    try {
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

      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .then((r) => r[0]);

      if (existingUser) {
        return res.status(400).json({
          message: "An account with this email already exists",
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

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
          termsVersion: "1.0",
          privacyVersion: "1.0",
        })
        .returning();

      // Fire-and-forget: T1 funnel event (includes paid-acquisition attribution)
      trackFunnelEvent({
        userId: newUser.id,
        eventType: "account_created",
        funnelStage: "T1_ACCOUNT_CREATED",
        source: (req.body.source as string) || "direct",
        refToken: (req.body.refToken as string) || undefined,
      }).catch(() => {});

      // Fire-and-forget verification email. Failure here MUST NOT block signup —
      // the user can request a resend later. RESEND_API_KEY absence is logged
      // inside sendEmailVerificationEmail.
      issueAndSendVerification(newUser.id, newUser.email!, newUser.firstName ?? null).catch(
        (err) => console.error("[auth/register] verification email issue failed:", err)
      );

      // Fire-and-forget welcome email. Sent after verification so the two emails
      // don't race into the same inbox second. Failure is non-fatal.
      sendWelcomeEmail({ toEmail: newUser.email!, firstName: newUser.firstName ?? null }).catch(
        (err) => console.error("[auth/register] welcome email failed (non-fatal):", err)
      );

      // Log the user in
      const sessionUser = {
        claims: {
          sub: newUser.id,
          email: newUser.email,
          first_name: newUser.firstName,
          last_name: newUser.lastName,
          role: newUser.role,
        },
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      };

      (req as any).login(sessionUser, (err: any) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        res.status(201).json({
          message: "Account created successfully",
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
          },
        });
      });
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
      if (!isValid) {
        return res.status(401).json({
          message: "Invalid email or password",
        });
      }

      // Defense-in-depth: also block soft-deleted accounts at the login handler so
      // no session is ever created for them (isAuthenticated middleware is the
      // primary gate for already-active sessions).
      if (user.isDeleted) {
        return res.status(403).json({
          message: "This account has been deleted. Please contact support if you believe this is an error.",
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

      (req as any).login(sessionUser, (err: any) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Failed to create session" });
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

  const RESET_TOKEN_TTL_MIN = 60;

  function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address"),
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
        const raw = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(raw);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt,
        });

        const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(raw)}`;
        try {
          await sendPasswordResetEmail({
            toEmail: user.email!,
            firstName: user.firstName ?? null,
            resetUrl,
            expiresInMinutes: RESET_TOKEN_TTL_MIN,
          });
        } catch (emailErr) {
          // Don't surface delivery state to the client. Log for ops; the token
          // row remains in the DB so retries are possible.
          console.error("[auth/forgot-password] email delivery failed:", emailErr);
        }
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
    token: z.string().min(32, "Invalid reset token"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
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

      // Look up by hash; must be unused and unexpired.
      const tokenRow = await db
        .select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ))
        .then((r) => r[0]);

      if (!tokenRow) {
        return res.status(400).json({
          message: "This reset link is invalid or has expired. Please request a new one.",
        });
      }

      const hashedPassword = await hashPassword(newPassword);
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, tokenRow.userId));

      // Mark token used (single-use) — keep the row for audit, just flag it.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, tokenRow.id));

      // Invalidate ALL existing sessions for this user — anyone who knew the
      // old password (or stole a session) is now locked out.
      try {
        await db.execute(drizzleSql`
          DELETE FROM sessions
          WHERE sess->'passport'->'user'->'claims'->>'sub' = ${tokenRow.userId}
        `);
      } catch (sessErr) {
        // Non-fatal — password is already changed; session-kill is defense-in-depth.
        console.warn("[auth/reset-password] session invalidation failed:", sessErr);
      }

      res.json({
        message: "Password has been reset successfully. You can now sign in.",
      });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ─── Email verification on signup ──────────────────────────────────────────
  // Same token shape + storage pattern as the password-reset flow: raw token
  // sent via email, only the sha256 hash persisted, single-use + TTL.

  const VERIFY_TOKEN_TTL_HOURS = 24;

  async function issueAndSendVerification(userId: string, email: string, firstName: string | null) {
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    await db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });
    const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(raw)}`;
    await sendEmailVerificationEmail({
      toEmail: email,
      firstName,
      verifyUrl,
      expiresInHours: VERIFY_TOKEN_TTL_HOURS,
    });
  }

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
      // Burn any prior unused tokens for this user — only the newest link
      // should be valid.
      await db
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(emailVerificationTokens.userId, userId),
          isNull(emailVerificationTokens.usedAt),
        ));
      await issueAndSendVerification(userId, user.email, user.firstName ?? null);
      return res.status(200).json({
        message: "Verification email sent. Check your inbox.",
      });
    } catch (error) {
      console.error("Send verification error:", error);
      return res.status(500).json({ message: "Failed to send verification email" });
    }
  });

  const verifyEmailSchema = z.object({
    token: z.string().min(32, "Invalid verification token"),
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
      const now = new Date();
      const tokenRow = await db
        .select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, now),
        ))
        .then((r) => r[0]);
      if (!tokenRow) {
        return res.status(400).json({
          message: "This verification link is invalid or has expired. Please request a new one.",
        });
      }
      await db.update(users).set({ emailVerified: now }).where(eq(users.id, tokenRow.userId));
      await db
        .update(emailVerificationTokens)
        .set({ usedAt: now })
        .where(eq(emailVerificationTokens.id, tokenRow.id));
      return res.json({ message: "Email verified successfully." });
    } catch (error) {
      console.error("Verify email error:", error);
      return res.status(500).json({ message: "Failed to verify email" });
    }
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
