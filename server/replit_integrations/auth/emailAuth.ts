import type { Express } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { users, passwordResetTokens } from "@shared/models/auth";
import { and, eq, gt, isNull, sql as drizzleSql } from "drizzle-orm";
import { sendPasswordResetEmail, getAppBaseUrl } from "../../services/email.service";

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

// Valid user roles for registration
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
  userType: z.enum(validUserTypes).optional().default("user"),
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

      const { email, password, firstName, lastName, userType } = validation.data;

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
          role: userType, // Map userType to role
          authProvider: "email",
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          termsVersion: "1.0",
          privacyVersion: "1.0",
        })
        .returning();

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

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid", { path: "/" });
        res.json({ message: "Logged out successfully" });
      });
    });
  });
}
