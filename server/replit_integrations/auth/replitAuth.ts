// NOTE: `passport` is an intentional runtime dependency. It is the live auth
// system for this app — Replit OIDC login (this file), email/password login
// (emailAuth.ts uses req.login / passport.session), and Facebook/Instagram
// influencer auth (facebookAuth.ts) all depend on it. Do not remove it from
// package.json unless every one of those flows is migrated off Passport first.
import * as client from "openid-client";
import { Strategy, type VerifyFunctionWithRequest } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { sendWelcomeEmail } from "../../services/email.service";
import { getPlatformFlag, FLAG_REGISTRATION_ENABLED, getTravelerSignupMode, getLaunchMarketSlug } from "../../services/platform-flags";
import { decideFirstTimeSignup, waitlistBlockedPath, TRAVELER_WAITLIST, type SignupIntent } from "@shared/launch-signup";
import { stashSignupIntent, readSignupIntent, readSignupSourceTag, takeStashedReturnTo } from "./signup-intent-stash";
import { safeReturnPath } from "../../utils/oauth-state";
import { pathAfterAuth } from "../../services/email-verification.service";
import { EMAIL_VERIFICATION_HOLD_PATH } from "@shared/email-verification-gate";
import { recordSignupSource } from "../../services/signup-source-record";
import {
  decideEmailMerge,
  oidcEmailVerified,
  EMAIL_SIGN_IN_REQUIRED,
  EMAIL_SIGN_IN_REQUIRED_MESSAGE,
  EMAIL_SIGN_IN_REQUIRED_PARAM,
} from "./email-merge";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      // `secure` cookies are only sent back over HTTPS. Production runs behind
      // TLS so this is correct there. But the auth-route smoke gate runs the
      // production build over plain-http localhost (NODE_ENV=production), where
      // a secure cookie is never replayed — the login "succeeds" but the session
      // can't be reused, so authenticated checks fail. SESSION_COOKIE_INSECURE=1
      // is a test-only opt-out for that case; it must never be set in production.
      secure:
        process.env.SESSION_COOKIE_INSECURE === '1'
          ? false
          : process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  // LW-1-0: a session whose Replit sign-in was merged into an existing account is pinned to THAT
  // account's id (`accountId`), on the first sign-in and on every token refresh after it — otherwise
  // `claims.sub` is the Replit sub, which has no users row, and every request is a 401.
  const claims: any = { ...(tokens.claims() as any) };
  if (user.accountId) claims.sub = user.accountId;
  user.claims = claims;
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

// Exported for tests — the registration-flag gate is verified without a live
// OIDC handshake. Resolves to the id of the account the session belongs to: the
// Replit sub, or the existing account a verified email-match was merged into.
export async function upsertUser(claims: any, opts: { intent?: SignupIntent; sourceTag?: string | null } = {}): Promise<string> {
  const userId: string = claims["sub"];
  const email: string | undefined = claims["email"];

  // Check whether this Replit sub already has its own account.
  const existing = await authStorage.getUser(userId).catch(() => undefined);

  // Email-merge (LW-1-0): a different account already owns this email (e.g. email/password or
  // Facebook). Attach the Replit sign-in to it ONLY on an explicit verified-email claim, and never to an
  // admin account (email-merge.ts). A refused merge creates no second account for the email either:
  // the person is told to sign in with their email and password. Logged by user id only.
  if (!existing && email) {
    const emailOwner = await authStorage.getUserByEmail(email).catch(() => undefined);
    if (emailOwner) {
      const decision = decideEmailMerge({ emailVerified: oidcEmailVerified(claims), owner: emailOwner });
      if (!decision.merge) {
        console.warn(`[auth/replit] email-match merge refused (${decision.reason}) for existing account ${emailOwner.id}`);
        throw new Error(EMAIL_SIGN_IN_REQUIRED);
      }
      // The owner's own profile image is kept; the Replit one only fills a gap.
      const updated = await authStorage.updateUser(emailOwner.id, {
        profileImageUrl: emailOwner.profileImageUrl || claims["profile_image_url"] || undefined,
        firstName: emailOwner.firstName || claims["first_name"] || undefined,
        lastName: emailOwner.lastName || claims["last_name"] || undefined,
      });
      const merged = updated ?? emailOwner;
      console.log(`[auth/replit] Merged Replit OIDC ${userId} → existing account ${emailOwner.id}`);
      if (merged.isSuspended) throw new Error("ACCOUNT_SUSPENDED");
      return emailOwner.id;
    }
  }

  // Admin-controlled registration kill switch (/admin/system): block first-time
  // account creation only — existing accounts (any provider) still log in.
  if (!existing) {
    const registrationEnabled = await getPlatformFlag(FLAG_REGISTRATION_ENABLED, true);
    if (!registrationEnabled) throw new Error("REGISTRATION_DISABLED");

    // LW-1b: the traveler sign-up switch. In waitlist mode a FIRST-TIME traveler is refused; a supply sign-up
    // (intent carried through the round trip by the session stash) passes. Social sign-ins get no QA bypass.
    const decision = decideFirstTimeSignup({
      mode: await getTravelerSignupMode(),
      intent: opts.intent ?? "traveler",
      qaCodeValid: false,
    });
    if (!decision.allowed) throw new Error(TRAVELER_WAITLIST);
  }

  const user = await authStorage.upsertUser({
    id: userId,
    email: email || undefined,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    authProvider: "replit",
    // AUTH-1 Finding A (i): a NEW account whose Replit OIDC claim says `email_verified === true` is born
    // verified — the same signal the email-merge trusts (oidcEmailVerified, email-merge.ts), one rule.
    // An existing account is never re-stamped here, and anything but a literal `true` stamps nothing.
    ...(!existing && email && oidcEmailVerified(claims) ? { emailVerified: new Date() } : {}),
  });

  if (user.isSuspended) throw new Error("ACCOUNT_SUSPENDED");

  // LW-1d: a NEW supply account records its sign-up source tag once (never on a sign-in, never for a traveler).
  if (!existing && opts.intent === "supply") await recordSignupSource(user.id, opts.sourceTag);

  if (!existing && email) {
    sendWelcomeEmail({ toEmail: email, firstName: claims["first_name"] ?? null }).catch(
      (err) => console.error("[auth/replit] welcome email failed (non-fatal):", err)
    );
  }
  return user.id;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Must register before the REPL_ID early-return: email/password login
  // (emailAuth.ts req.login) depends on these in every environment, not
  // just Replit — without them req.login() fails with "Failed to
  // serialize user into session" in CI and non-Replit deploys.
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (!process.env.REPL_ID) {
    console.warn('[Auth] REPL_ID not set — skipping Replit OIDC strategy (CI / non-Replit env)');
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunctionWithRequest = async (
    req,
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    try {
      const accountId = await upsertUser(tokens.claims(), { intent: readSignupIntent(req), sourceTag: readSignupSourceTag(req) });
      const sub = (tokens.claims() as any)?.sub;
      if (accountId && accountId !== sub) user.accountId = accountId;
    } catch (err: any) {
      if (err?.message === EMAIL_SIGN_IN_REQUIRED) {
        return verified(null, false, { message: EMAIL_SIGN_IN_REQUIRED_MESSAGE, code: EMAIL_SIGN_IN_REQUIRED } as any);
      }
      if (err?.message === "ACCOUNT_SUSPENDED") {
        return verified(null, false, { message: "Your account has been suspended. Please contact support." } as any);
      }
      if (err?.message === "REGISTRATION_DISABLED") {
        return verified(null, false, { message: "New user registration is temporarily disabled. Please try again later." } as any);
      }
      if (err?.message === TRAVELER_WAITLIST) {
        return verified(null, false, { code: TRAVELER_WAITLIST } as any);
      }
      return verified(err as Error);
    }
    updateUserSession(user, tokens);
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      // Local dev access (127.0.0.1 / localhost) serves plain HTTP on $PORT;
      // an https, port-less callback would point at nothing and break login.
      const isLocalDev =
        process.env.NODE_ENV !== "production" &&
        (domain === "127.0.0.1" || domain === "localhost");
      const callbackURL = isLocalDev
        ? `http://${domain}:${process.env.PORT || "5000"}/api/callback`
        : `https://${domain}/api/callback`;
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL,
          passReqToCallback: true,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    // LW-1b: `?intent=supply&returnTo=/path` survive the round trip in the session stash.
    stashSignupIntent(req);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
      if (err) return next(err);
      // LW-1-0: a refused email-match merge is told to use email and password. Re-entering OIDC
      // (the generic failure below) would loop on the same refusal and show nothing.
      if (!user && info?.code === EMAIL_SIGN_IN_REQUIRED) {
        return res.redirect(`/login?error=${EMAIL_SIGN_IN_REQUIRED_PARAM}`);
      }
      // LW-1b: a first-time traveler in waitlist mode goes to the launch market's waitlist — no email in the URL.
      if (!user && info?.code === TRAVELER_WAITLIST) {
        takeStashedReturnTo(req);
        getLaunchMarketSlug()
          .then((slug) => res.redirect(waitlistBlockedPath(slug)))
          .catch(() => res.redirect("/"));
        return;
      }
      if (!user) return res.redirect("/api/login");
      // Read the stashed return path BEFORE req.logIn regenerates the session.
      // safeReturnPath is the open-redirect gate: a same-site path is honoured, anything else is /dashboard.
      const returnTo = safeReturnPath(takeStashedReturnTo(req), "/dashboard");
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const userId = user?.claims?.sub ?? user?.id;
        pathAfterAuth(req.session, userId, returnTo)
          .then((dest) => {
            if (!res.headersSent) res.redirect(dest);
          })
          .catch(() => {
            if (!res.headersSent) res.redirect(EMAIL_VERIFICATION_HOLD_PATH);
          });
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid", { path: "/" });
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;
  const userId: string | undefined = user?.claims?.sub ?? user?.id;

  // Reject soft-deleted accounts regardless of auth method.
  // This DB check catches accounts deleted after the session was created (e.g. an
  // admin deletes a user who is currently logged in). One indexed PK lookup per
  // request is negligible; the alternative (stale sessions) is a security hole.
  if (userId) {
    try {
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.isDeleted) {
        req.logout(() => {});
        return res.status(403).json({ message: "This account has been deleted" });
      }
      if (!dbUser) {
        req.logout(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (dbUser.isSuspended) {
        req.logout(() => {});
        return res.status(403).json({
          message: "Your account has been suspended. Please contact support.",
          reason: dbUser.suspensionReason ?? undefined,
        });
      }
    } catch (err) {
      console.error("[isAuthenticated] account-status DB check failed (fail-closed):", (err as any)?.message);
      return res.status(503).json({ message: "Authentication service temporarily unavailable" });
    }
  }

  // Email/password auth sessions have no expires_at — let them through directly
  if (!user.expires_at) {
    return next();
  }

  // Replit OIDC sessions: check token expiry and refresh if needed
  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
