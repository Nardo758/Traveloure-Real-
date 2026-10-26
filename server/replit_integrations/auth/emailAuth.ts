import type { Express } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { sendPasswordResetEmail, sendPasswordChangedEmail, getAppBaseUrl } from "../../services/email.service";
import { enqueueSignupWelcome } from "../../services/signup-welcome-outbox.service";
import { deliverQueuedEmail } from "../../services/email-outbox.service";
import { trackFunnelEvent } from "../../utils/funnelTracker";
import { getPlatformFlag, FLAG_REGISTRATION_ENABLED, getTravelerSignupMode, getLaunchMarketSlug } from "../../services/platform-flags";
import { qaSignupAllowed } from "../../services/qa-signup-code";
import { isTestAccount } from "../../services/test-account";
import { recordSignupSource } from "../../services/signup-source-record";
import { decideFirstTimeSignup, normalizeSignupIntent, waitlistBlockedPath, TRAVELER_WAITLIST_MESSAGE } from "@shared/launch-signup";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@shared/legal-versions";
import { REGISTRATION_NEUTRAL_STATUS, registrationNeutralBody } from "@shared/registration-neutral";
import {
  RESET_TOKEN_TTL_MIN, issuePasswordResetToken, consumePasswordResetToken, hashAuthToken,
  peekPasswordResetTokenUser,
} from "../../services/password-reset-tokens.service";
import { isEmailVerifiedForUser, verifiedEmailActionsEnforced } from "../../services/verified-email-action-gate";
import { verifyLoginCredential } from "../../services/login-credentials.service";
import { verificationEmailRateLimiter } from "../../infrastructure/rate-limiter";
import {
  VERIFICATION_RESEND_MESSAGE,
  VERIFICATION_EMAIL_CHANGE_MESSAGE,
  VERIFY_EMAIL_SUCCESS_MESSAGE,
  VERIFY_EMAIL_INVALID_MESSAGE,
} from "@shared/email-verification-gate";
import {
  issueEmailVerification,
  readEmailVerificationGate,
  stampGrandfatherOnSession,
  consumeEmailVerificationToken,
  deliverVerificationResend,
  sendVerificationForSessionUser,
  changeUnverifiedEmail,
} from "../../services/email-verification.service";
import { isEmailUniqueViolation } from "./email-unique-violation";

export { issueEmailVerification, isEmailUniqueViolation };

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
  // LW-1b: what the sign-up is for. `supply` (offering services) passes the traveler waitlist; anything else is a
  // traveler. It grants no role — role upgrades still require an approved application form.
  intent: z.string().max(20).optional(),
  // LW-1b: the QA sign-up code (server secret QA_SIGNUP_CODE). Compared in constant time; never logged.
  qaCode: z.string().max(256).optional(),
  // LW-1d: a supply sign-up's raw `?source=` tag. Only `recordSignupSource` reads it, normalized against the
  // launch market; it is distinct from the funnel `source` above, whose client default ("direct") is not a tag.
  signupSource: z.string().max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Do NOT .trim() the password: registration stores it verbatim (no trim), so trimming
  // here both (a) lets a whitespace-padded variant of a correct password authenticate and
  // (b) locks out anyone whose real password has leading/trailing spaces. Compare exactly.
  password: z.string().min(1, "Password is required"),
});

/** After a successful reset only. A missing owner or email sends nothing. */
async function notifyPasswordChanged(ownerId: string | null, token: string): Promise<void> {
  if (!ownerId) return;
  const [user] = await db
    .select({ email: users.email, firstName: users.firstName })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);
  if (!user?.email) return;
  await sendPasswordChangedEmail({
    toEmail: user.email,
    firstName: user.firstName,
    tokenHash: hashAuthToken(token),
  });
}

export function setupEmailAuth(app: Express): void {
  // Register new user with email/password
  app.post("/api/auth/register", async (req, res) => {
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

      // LW-1b: the traveler sign-up switch. In waitlist mode (read fail-closed) a first-time TRAVELER account is
      // refused and sent to the launch market's waitlist; supply intent and a QA sign-up (QA-domain address AND the
      // right code) pass. Decided before
      // the existing-email check, so the refusal says nothing about whether the address has an account.
      const signupDecision = decideFirstTimeSignup({
        mode: await getTravelerSignupMode(),
        intent: normalizeSignupIntent(validation.data.intent),
        qaCodeValid: qaSignupAllowed(email, validation.data.qaCode),
      });
      if (!signupDecision.allowed) {
        return res.status(403).json({
          code: signupDecision.code,
          message: TRAVELER_WAITLIST_MESSAGE,
          redirectTo: waitlistBlockedPath(await getLaunchMarketSlug()),
        });
      }
      // userType from request body is intentionally ignored — all new accounts
      // start as role='user'. Role upgrades happen via approved application forms.

      // AUTH-1 fix 3b: from here a new address and an existing one get the SAME answer (202, neutral body, no
      // session). The password is hashed BEFORE the existing-account lookup, so both paths do the same scrypt work;
      // a duplicate simply discards the hash. Nothing is written, sent or signed in for a duplicate.
      const hashedPassword = await hashPassword(password);

      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .then((r) => r[0]);

      if (existingUser) {
        return res.status(REGISTRATION_NEUTRAL_STATUS).json(registrationNeutralBody());
      }

      // Commit the account and welcome obligation together; never send before commit.
      let created: { newUser: typeof users.$inferSelect; welcomeId: number } | null;
      try {
        created = await db.transaction(async (tx) => {
          const [newUser] = await tx
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
              // SH-1 item 12: an account created on the QA domain is a test account from birth. Any other
              // sign-up leaves the flag NULL (not a test account by flag).
              isTest: isTestAccount({ email }) ? true : null,
            })
            .returning();
          const welcomeId = await enqueueSignupWelcome(tx, newUser.id);
          return { newUser, welcomeId };
        });
      } catch (err) {
        // A concurrent sign-up for the same address won the email unique index: that is a duplicate, and gets the
        // duplicate's answer. Any other failure stays a failure (outer catch → 500).
        if (!isEmailUniqueViolation(err)) throw err;
        created = null;
      }
      if (!created) {
        return res.status(REGISTRATION_NEUTRAL_STATUS).json(registrationNeutralBody());
      }
      const { newUser, welcomeId } = created;

      // LW-1d: a supply account records its sign-up source tag once. Never fails the sign-up (the writer never throws).
      if (normalizeSignupIntent(validation.data.intent) === "supply") {
        await recordSignupSource(newUser.id, validation.data.signupSource);
      }

      // Fire-and-forget: T1 funnel event (includes paid-acquisition attribution)
      trackFunnelEvent({
        userId: newUser.id,
        eventType: "account_created",
        funnelStage: "T1_ACCOUNT_CREATED",
        source: (req.body.source as string) || "direct",
        refToken: (req.body.refToken as string) || undefined,
      }).catch(() => { /* fire-and-forget funnel event — never blocks signup */ });

      // Fire-and-forget verification email. Failure here MUST NOT block signup —
      // the user can request a resend later. RESEND_API_KEY absence is logged
      // inside sendEmailVerificationEmail.
      issueEmailVerification(newUser.id, newUser.email!, newUser.firstName ?? null).catch(
        (err) => console.error("[auth/register] verification email issue failed:", err)
      );

      // Best-effort immediate delivery after commit; the existing drain handles retries. (AUTH-1 fix 1 holds the
      // welcome until the address is verified.)
      deliverQueuedEmail(welcomeId).catch(
        (err) => console.error("[auth/register] welcome email failed (non-fatal):", err)
      );

      // AUTH-1 fix 3b: no sign-in here. The session is left exactly as it was; the new account signs in through
      // POST /api/auth/login (which regenerates the session id) like every other account.
      return res.status(REGISTRATION_NEUTRAL_STATUS).json(registrationNeutralBody());
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

      // Find user. Email normalization is the existing lowercase lookup.
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .then((r) => r[0]);

      // One scrypt and one fixed-length compare for every syntactically valid attempt
      // (login-credentials.service.ts). Unknown, provider-only, and unusable hashes
      // take the dummy path and fail. A thrown error is operational — the outer catch
      // answers 500, not 401. Deleted and suspended checks stay after this.
      const passwordOk = await verifyLoginCredential(password, user?.password ?? null);
      if (!passwordOk || !user) {
        return res.status(401).json({
          message: "Invalid email or password",
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

      // S-09 sits beside the credential check. A correct password still creates a
      // session. An unverified account with no activity is limited to the verify
      // screen by emailVerificationGate. The 401 body above is unchanged.
      const gate = await readEmailVerificationGate({
        id: user.id,
        emailVerified: user.emailVerified,
      });

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
        (req as any).login(sessionUser, (err: any) => {
          if (err) {
            console.error("Login error:", err);
            return res.status(500).json({ message: "Failed to create session" });
          }

          stampGrandfatherOnSession(req.session, gate.access, user.emailVerified);
          res.json({
            message: "Logged in successfully",
            emailVerificationRequired: gate.emailVerificationRequired,
            nextStep: gate.nextStep,
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
  // user's existing sessions, and marks the token used. AUTH-1 Finding B: issuing a link revokes
  // every earlier one, and issuing and using lock the account in the same order
  // (server/services/password-reset-tokens.service.ts).

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
        // Row 101: while sends are on, an unverified address (users.email_verified
        // only — grandfathering is not honored) gets a verification letter instead
        // of a reset link. The HTTP answer stays the neutral 200 either way.
        // The flag is read first so an off switch adds no extra query.
        const holdForVerification =
          verifiedEmailActionsEnforced() && !(await isEmailVerifiedForUser(user.id));
        if (holdForVerification) {
          const address = user.email;
          if (address) {
            issueEmailVerification(user.id, address, user.firstName ?? null).catch(() => {
              console.error("[auth/forgot-password] verification email issue failed for user", user.id);
            });
          }
        } else {
          const issued = await issuePasswordResetToken(user.id);

          const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(issued.raw)}`;
          try {
            await sendPasswordResetEmail({
              toEmail: user.email!,
              firstName: user.firstName ?? null,
              resetUrl,
              expiresInMinutes: RESET_TOKEN_TTL_MIN,
              linkExpiresAt: issued.expiresAt,
              tokenHash: hashAuthToken(issued.raw),
            });
          } catch (emailErr) {
            // Don't surface delivery state to the client. Log for ops; the token
            // row remains in the DB so retries are possible.
            console.error("[auth/forgot-password] email delivery failed:", emailErr);
          }
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
      const hashedPassword = await hashPassword(newPassword);
      // Peek once before consume. Consume spends the token, and the account
      // can no longer be read from it. The verified-email refusal reuses this read.
      const accountId = await peekPasswordResetTokenUser(token);
      // Row 101: while sends are on, a link whose account is unverified is the same
      // invalid-link answer, and the token stays unused. Verified accounts fall
      // through to consume.
      if (verifiedEmailActionsEnforced()) {
        if (accountId && !(await isEmailVerifiedForUser(accountId))) {
          return res.status(400).json({
            message: "This reset link is invalid or has expired. Please request a new one.",
          });
        }
      }
      const resetApplied = await consumePasswordResetToken(token, hashedPassword);
      if (!resetApplied) {
        return res.status(400).json({
          message: "This reset link is invalid or has expired. Please request a new one.",
        });
      }

      try {
        await notifyPasswordChanged(accountId, token);
      } catch (err) {
        console.error("[auth/reset-password] password_changed notice failed:", err);
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
  // issueEmailVerification (email-verification.service.ts) is shared with Facebook.
  // Every answer below is the same sentence whether or not the address exists,
  // except a missing session (401) and a malformed change-email body (400).

  const resendSchema = z.object({
    email: z.string().email().max(254),
  }).strict();

  app.post("/api/auth/resend-verification", verificationEmailRateLimiter, async (req, res) => {
    try {
      const parsed = resendSchema.safeParse(req.body);
      if (parsed.success) await deliverVerificationResend(parsed.data.email);
    } catch {
      console.error("[auth/resend-verification] failed");
    }
    return res.status(200).json({ message: VERIFICATION_RESEND_MESSAGE });
  });

  app.post("/api/auth/send-verification", verificationEmailRateLimiter, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    try {
      await sendVerificationForSessionUser(userId);
    } catch {
      console.error("[auth/send-verification] failed");
    }
    return res.status(200).json({ message: VERIFICATION_RESEND_MESSAGE });
  });

  const changeEmailSchema = z.object({
    email: z.string().email("Invalid email address").max(254, "Email is too long"),
  }).strict();

  app.post("/api/auth/change-unverified-email", verificationEmailRateLimiter, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.errors,
      });
    }
    try {
      await changeUnverifiedEmail(userId, parsed.data.email, req.session);
    } catch {
      console.error("[auth/change-unverified-email] failed");
    }
    return res.status(200).json({ message: VERIFICATION_EMAIL_CHANGE_MESSAGE });
  });

  const verifyEmailSchema = z.object({
    token: z.string().min(32, "Invalid verification token").max(128, "Invalid verification token"),
  });

  // POST /api/auth/verify-email — public. Single-use, expiring, and a repeat of
  // a link that already verified the address returns the same success.
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.errors,
        });
      }
      const result = await consumeEmailVerificationToken(parsed.data.token);
      if (result !== "verified") {
        return res.status(400).json({ message: VERIFY_EMAIL_INVALID_MESSAGE });
      }
      return res.json({ message: VERIFY_EMAIL_SUCCESS_MESSAGE });
    } catch {
      console.error("[auth/verify-email] failed");
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
