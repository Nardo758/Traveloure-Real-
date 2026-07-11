import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { sendWelcomeEmail } from "../../services/email.service";

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
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any): Promise<void> {
  const userId: string = claims["sub"];
  const email: string | undefined = claims["email"];

  // Check whether this Replit sub already has its own account.
  const existing = await authStorage.getUser(userId).catch(() => undefined);

  // Email-merge: if a different account already owns this email (e.g. email/password
  // or Facebook), attach the Replit profile to that canonical account rather than
  // creating a second account keyed on the Replit sub.
  if (!existing && email) {
    const emailOwner = await authStorage.getUserByEmail(email).catch(() => undefined);
    if (emailOwner) {
      const updated = await authStorage.updateUser(emailOwner.id, {
        profileImageUrl: claims["profile_image_url"] || emailOwner.profileImageUrl || undefined,
        firstName: emailOwner.firstName || claims["first_name"] || undefined,
        lastName: emailOwner.lastName || claims["last_name"] || undefined,
      });
      const merged = updated ?? emailOwner;
      console.log(`[auth/replit] Merged Replit OIDC ${userId} → existing account ${emailOwner.id}`);
      if (merged.isSuspended) throw new Error("ACCOUNT_SUSPENDED");
      return;
    }
  }

  const user = await authStorage.upsertUser({
    id: userId,
    email: email || undefined,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    authProvider: "replit",
  });

  if (user.isSuspended) throw new Error("ACCOUNT_SUSPENDED");

  if (!existing && email) {
    sendWelcomeEmail({ toEmail: email, firstName: claims["first_name"] ?? null }).catch(
      (err) => console.error("[auth/replit] welcome email failed (non-fatal):", err)
    );
  }
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

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    try {
      await upsertUser(tokens.claims());
    } catch (err: any) {
      if (err?.message === "ACCOUNT_SUSPENDED") {
        return verified(null, false, { message: "Your account has been suspended. Please contact support." } as any);
      }
      return verified(err as Error);
    }
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/dashboard",
      failureRedirect: "/api/login",
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
      if (dbUser?.isSuspended) {
        req.logout(() => {});
        return res.status(403).json({
          message: "Your account has been suspended. Please contact support.",
          reason: dbUser.suspensionReason ?? undefined,
        });
      }
    } catch (err) {
      console.warn("[isAuthenticated] account-status DB check failed (fail-open):", (err as any)?.message);
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
