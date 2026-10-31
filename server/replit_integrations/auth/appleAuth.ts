/**
 * Sign in with Apple for the web (fix-queue row 282, ledger `2026-10-31-sign-in-with-apple`).
 *
 * Registered from index.ts. The passport strategy and the live handlers exist
 * only when SIGN_IN_WITH_APPLE_ENABLED is the exact string "true" and every
 * APPLE_* env name is set. Otherwise both routes answer 404 and no strategy
 * is registered. The flag defaults off.
 *
 * Apple posts the callback (`response_mode=form_post`) with an id_token.
 * Email and name arrive on the first authorization only. Later sign-ins find
 * the account by users.apple_sub. A private-relay address is not a special
 * case: it goes through decideEmailMerge, and an unverified email never merges
 * and never creates a second account.
 *
 * Leon, Oct 31 2026: only a traveler may create an Apple account. A provider
 * or expert signs in only when apple_sub is already on that account. Any other
 * attempt that would create a non-traveler account, or that targets a provider
 * or expert role, fails with the existing generic auth refusal.
 *
 * APPLE_* values are read from process.env and are never logged.
 */
import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { authStorage } from "./storage";
import { isEmailUniqueViolation } from "./email-unique-violation";
import {
  decideEmailMerge,
  EMAIL_SIGN_IN_REQUIRED,
  EMAIL_SIGN_IN_REQUIRED_PARAM,
} from "./email-merge";
import {
  stashSignupIntent,
  readSignupIntent,
  readSupplyRole,
  takeStashedReturnTo,
} from "./signup-intent-stash";
import { appleServicesId, appleSignInConfigured } from "./apple-env";
import {
  APPLE_JWKS_URL,
  appleEmail,
  appleEmailVerified,
  verifyAppleIdToken,
  type AppleIdTokenClaims,
} from "./apple-id-token";
import {
  isValidOAuthState,
  newOAuthNonce,
  newOAuthState,
  safeReturnPath,
  type IssuedOAuthState,
} from "../../utils/oauth-state";
import { sendWelcomeEmail } from "../../services/email.service";
import { issueEmailVerification, pathAfterAuth } from "../../services/email-verification.service";
import {
  getPlatformFlag,
  FLAG_REGISTRATION_ENABLED,
  getTravelerSignupMode,
  getLaunchMarketSlug,
} from "../../services/platform-flags";
import {
  decideFirstTimeSignup,
  supplyRefusalRedirect,
  waitlistBlockedPath,
  EXPERT_APPLY_NOW,
  PROVIDER_FIELDS_REQUIRED,
  TRAVELER_WAITLIST,
} from "@shared/launch-signup";
import { isEarnerRole } from "@shared/roles";
import type { User } from "@shared/models/auth";

const APPLE_STRATEGY = "apple";
const APPLE_OAUTH_SESSION_KEY = "appleOAuth";
const JWKS_TTL_MS = 10 * 60 * 1000;

export type AppleJwksGetter = (refresh?: boolean) => Promise<{ keys: crypto.JsonWebKey[] }>;

interface AppleOAuthSession extends IssuedOAuthState {
  nonce: string;
}

type ResolveResult =
  | { ok: true; user: User }
  | { ok: false; code: string };

let jwksGetter: AppleJwksGetter = fetchAppleJwks;
let jwksCache: { keys: crypto.JsonWebKey[]; at: number } | null = null;

async function fetchAppleJwks(refresh = false): Promise<{ keys: crypto.JsonWebKey[] }> {
  const now = Date.now();
  if (!refresh && jwksCache && now - jwksCache.at < JWKS_TTL_MS) {
    return { keys: jwksCache.keys };
  }
  const response = await fetch(APPLE_JWKS_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("apple_jwks_unavailable");
  const body = (await response.json()) as { keys?: crypto.JsonWebKey[] };
  if (!body?.keys || !Array.isArray(body.keys)) throw new Error("apple_jwks_unavailable");
  jwksCache = { keys: body.keys, at: now };
  return { keys: body.keys };
}

export function appleStrategyRegistered(): boolean {
  return Boolean((passport as unknown as { _strategies?: Record<string, unknown> })._strategies?.[APPLE_STRATEGY]);
}

function clipName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/<[^>]*>/g, "").trim().slice(0, 100);
  return cleaned || null;
}

function appleName(raw: unknown): { firstName: string | null; lastName: string | null } {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2000) {
    return { firstName: null, lastName: null };
  }
  try {
    const parsed = JSON.parse(raw) as { name?: { firstName?: unknown; lastName?: unknown } };
    return {
      firstName: clipName(parsed?.name?.firstName),
      lastName: clipName(parsed?.name?.lastName),
    };
  } catch {
    return { firstName: null, lastName: null };
  }
}

function isAppleSubViolation(err: unknown): boolean {
  for (let current: any = err, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    if (current.code === "23505" && current.constraint === "users_apple_sub_unique") return true;
  }
  return false;
}

function blocked(user: { isDeleted?: boolean | null; isSuspended?: boolean | null }): boolean {
  return user.isDeleted === true || user.isSuspended === true;
}

/** A supply door, or a provider/expert supply role, is not a traveler sign-up. */
function targetsNonTravelerSignup(input: {
  intent: ReturnType<typeof readSignupIntent>;
  supplyRole: ReturnType<typeof readSupplyRole>;
}): boolean {
  return input.intent === "supply" || input.supplyRole === "provider" || input.supplyRole === "expert";
}

/** Linking Apple onto a provider or expert who does not already have a subject. */
function refuseUnlinkedEarner(owner: { id: string; role?: string | null }): ResolveResult | null {
  if (!isEarnerRole(owner.role)) return null;
  console.warn(`[Apple Auth] provider or expert Apple link refused for existing account ${owner.id}`);
  return { ok: false, code: "auth_failed" };
}

async function linkVerifiedOwner(
  owner: User,
  sub: string,
  emailVerified: boolean,
  firstName: string | null,
  lastName: string | null,
): Promise<ResolveResult> {
  try {
    const linked = await authStorage.attachAppleIdentity(owner.id, {
      appleSub: sub,
      emailVerified: emailVerified && !owner.emailVerified ? new Date() : undefined,
      firstName: owner.firstName ? undefined : firstName,
      lastName: owner.lastName ? undefined : lastName,
    });
    console.log(`[Apple Auth] linked subject onto existing account ${owner.id}`);
    return { ok: true, user: linked ?? owner };
  } catch (err) {
    if (!isAppleSubViolation(err)) throw err;
    const winner = await authStorage.getUserByAppleSub(sub);
    if (winner && !blocked(winner)) return { ok: true, user: winner };
    return { ok: false, code: "account_blocked" };
  }
}

/**
 * Find or create the account for a verified Apple subject.
 * Private-relay mail uses this same function, which calls decideEmailMerge.
 */
export async function resolveAppleAccount(input: {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  intent: ReturnType<typeof readSignupIntent>;
  supplyRole: ReturnType<typeof readSupplyRole>;
}): Promise<ResolveResult> {
  const existing = await authStorage.getUserByAppleSub(input.sub);
  if (existing) {
    if (blocked(existing)) return { ok: false, code: "account_blocked" };
    return { ok: true, user: existing };
  }

  // Already-linked subjects signed in above, including providers and experts.
  // A new Apple account is a traveler's. A supply door, or an email that belongs
  // to a provider or expert, does not create one and does not attach a subject.
  if (targetsNonTravelerSignup(input)) {
    console.warn("[Apple Auth] non-traveler Apple sign-up refused");
    return { ok: false, code: "auth_failed" };
  }

  if (input.email) {
    const owners = await authStorage.getUsersByEmailNormalized(input.email);
    if (owners.length > 1) {
      console.warn(`[Apple Auth] email-match ambiguous for accounts ${owners.map((row) => row.id).join(",")}`);
      return { ok: false, code: EMAIL_SIGN_IN_REQUIRED };
    }
    if (owners.length === 1) {
      const owner = owners[0];
      if (blocked(owner)) return { ok: false, code: "account_blocked" };
      const earnerRefusal = refuseUnlinkedEarner(owner);
      if (earnerRefusal) return earnerRefusal;
      const decision = decideEmailMerge({ emailVerified: input.emailVerified, owner });
      if (!decision.merge) {
        console.warn(`[Apple Auth] email-match merge refused (${decision.reason}) for existing account ${owner.id}`);
        return { ok: false, code: EMAIL_SIGN_IN_REQUIRED };
      }
      return linkVerifiedOwner(owner, input.sub, input.emailVerified, input.firstName, input.lastName);
    }
  }

  const registrationEnabled = await getPlatformFlag(FLAG_REGISTRATION_ENABLED, true);
  if (!registrationEnabled) return { ok: false, code: "registration_disabled" };
  const decision = decideFirstTimeSignup({
    mode: await getTravelerSignupMode(),
    intent: input.intent,
    qaCodeValid: false,
    supplyRole: input.supplyRole,
    providerFieldsValid: false,
  });
  if (!decision.allowed) {
    return { ok: false, code: "reason" in decision ? decision.reason : TRAVELER_WAITLIST };
  }

  const id = crypto.randomUUID();
  try {
    const user = await authStorage.createAppleUser({
      id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      emailVerified: input.emailVerified ? new Date() : null,
      appleSub: input.sub,
    });
    if (input.email) {
      sendWelcomeEmail({ toEmail: input.email, firstName: input.firstName }).catch(() => {
        console.error("[Apple Auth] welcome email failed (non-fatal)");
      });
      if (!input.emailVerified) {
        issueEmailVerification(user.id, input.email, input.firstName).catch(() => {
          console.error("[Apple Auth] verification email failed (non-fatal)");
        });
      }
    }
    return { ok: true, user };
  } catch (err) {
    if (input.email && isEmailUniqueViolation(err)) {
      const owners = await authStorage.getUsersByEmailNormalized(input.email);
      if (owners.length === 1 && !blocked(owners[0])) {
        const earnerRefusal = refuseUnlinkedEarner(owners[0]);
        if (earnerRefusal) return earnerRefusal;
        const decision = decideEmailMerge({ emailVerified: input.emailVerified, owner: owners[0] });
        if (decision.merge) {
          return linkVerifiedOwner(owners[0], input.sub, input.emailVerified, input.firstName, input.lastName);
        }
        console.warn(`[Apple Auth] email-match merge refused (${decision.reason}) for existing account ${owners[0].id}`);
      }
      return { ok: false, code: EMAIL_SIGN_IN_REQUIRED };
    }
    if (isAppleSubViolation(err)) {
      const winner = await authStorage.getUserByAppleSub(input.sub);
      if (winner && !blocked(winner)) return { ok: true, user: winner };
    }
    throw err;
  }
}

function sessionUserFor(user: User) {
  return {
    claims: {
      sub: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
    },
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    provider: "apple",
  };
}

function readIssued(req: Request): AppleOAuthSession | null {
  const issued = (req.session as unknown as Record<string, unknown> | undefined)?.[APPLE_OAUTH_SESSION_KEY] as
    | AppleOAuthSession
    | undefined;
  if (!issued || typeof issued.nonce !== "string") return null;
  return issued;
}

function clearIssued(req: Request): void {
  const session = req.session as unknown as Record<string, unknown> | undefined;
  if (session) delete session[APPLE_OAUTH_SESSION_KEY];
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

class AppleStrategy extends passport.Strategy {
  name = APPLE_STRATEGY;

  authenticate(req: Request): void {
    // Passport writes success/fail/error onto this instance per request. Copy them
    // before the first await so a second sign-in cannot replace this request's callbacks.
    const strategy = this as passport.Strategy & {
      success: (user: Express.User, info?: object) => void;
      fail: (challenge?: object | string | number, status?: number) => void;
      error: (err: unknown) => void;
    };
    const success = strategy.success.bind(strategy);
    const fail = strategy.fail.bind(strategy);
    const error = strategy.error.bind(strategy);
    void authenticateApple(req, { success, fail, error });
  }
}

async function authenticateApple(
  req: Request,
  strategy: {
    success: (user: Express.User, info?: object) => void;
    fail: (challenge?: object | string | number, status?: number) => void;
    error: (err: unknown) => void;
  },
): Promise<void> {
  try {
    const issued = readIssued(req);
    const state = (req.body as { state?: unknown } | undefined)?.state;
    if (!isValidOAuthState(issued, state) || !issued) {
      clearIssued(req);
      strategy.fail({ code: "auth_failed" }, 401);
      return;
    }
    const nonce = issued.nonce;
    clearIssued(req);
    await saveSession(req);
    const idToken = (req.body as { id_token?: unknown } | undefined)?.id_token;
    if (typeof idToken !== "string") {
      strategy.fail({ code: "auth_failed" }, 401);
      return;
    }
    const audience = appleServicesId();
    if (!audience) {
      strategy.fail({ code: "auth_failed" }, 401);
      return;
    }
    let keys = (await jwksGetter(false)).keys;
    let verified = verifyAppleIdToken(idToken, { audience, nonce, keys });
    if (!verified.ok && verified.reason === "bad_signature") {
      try {
        keys = (await jwksGetter(true)).keys;
        verified = verifyAppleIdToken(idToken, { audience, nonce, keys });
      } catch {
        strategy.fail({ code: "auth_failed" }, 401);
        return;
      }
    }
    if (!verified.ok) {
      strategy.fail({ code: "auth_failed" }, 401);
      return;
    }
    const names = appleName((req.body as { user?: unknown } | undefined)?.user);
    const claims: AppleIdTokenClaims = verified.claims;
    const resolved = await resolveAppleAccount({
      sub: claims.sub,
      email: appleEmail(claims),
      emailVerified: appleEmailVerified(claims),
      firstName: names.firstName,
      lastName: names.lastName,
      intent: readSignupIntent(req),
      supplyRole: readSupplyRole(req),
    });
    if (!resolved.ok) {
      strategy.fail({ code: resolved.code }, 401);
      return;
    }
    strategy.success(sessionUserFor(resolved.user));
  } catch (err) {
    console.error("[Apple Auth] sign-in failed");
    strategy.error(err instanceof Error ? err : new Error("apple_sign_in_failed"));
  }
}

function appleRedirectUri(req: Request): string {
  return `https://${req.hostname}/api/auth/apple/callback`;
}

function appleStart(req: Request, res: Response): void {
  if (!appleSignInConfigured()) {
    res.status(404).end();
    return;
  }
  const servicesId = appleServicesId();
  if (!servicesId || !req.session) {
    res.status(404).end();
    return;
  }
  stashSignupIntent(req);
  const state = newOAuthState();
  const nonce = newOAuthNonce();
  const returnTo = safeReturnPath(req.query?.returnTo, "/");
  (req.session as unknown as Record<string, unknown>)[APPLE_OAUTH_SESSION_KEY] = {
    state,
    nonce,
    returnTo,
    issuedAt: Date.now(),
  } satisfies AppleOAuthSession;
  const params = new URLSearchParams({
    client_id: servicesId,
    redirect_uri: appleRedirectUri(req),
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state,
    nonce,
  });
  const target = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  req.session.save((err) => {
    if (err || res.headersSent) {
      if (!res.headersSent) res.status(503).end();
      return;
    }
    res.redirect(target);
  });
}

function redirectForFailure(req: Request, res: Response, code: string | undefined): void {
  takeStashedReturnTo(req);
  if (code === EMAIL_SIGN_IN_REQUIRED) {
    res.redirect(`/login?error=${EMAIL_SIGN_IN_REQUIRED_PARAM}`);
    return;
  }
  if (code === TRAVELER_WAITLIST) {
    getLaunchMarketSlug()
      .then((slug) => {
        if (!res.headersSent) res.redirect(waitlistBlockedPath(slug));
      })
      .catch(() => {
        if (!res.headersSent) res.redirect("/");
      });
    return;
  }
  if (code === EXPERT_APPLY_NOW || code === PROVIDER_FIELDS_REQUIRED) {
    res.redirect(supplyRefusalRedirect(code));
    return;
  }
  res.redirect("/login");
}

function appleCallback(req: Request, res: Response, next: NextFunction): void {
  if (!appleSignInConfigured() || !appleStrategyRegistered()) {
    res.status(404).end();
    return;
  }
  const issuedReturn = readIssued(req)?.returnTo || "/";
  passport.authenticate(APPLE_STRATEGY, (err: unknown, user: Express.User | false, info?: { code?: string }) => {
    if (err) return next(err);
    if (!user) {
      redirectForFailure(req, res, info?.code);
      return;
    }
    const returnTo = takeStashedReturnTo(req) || issuedReturn || "/";
    const fallback = returnTo || "/";
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        if (!res.headersSent) res.redirect("/login");
        return;
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          if (!res.headersSent) res.redirect("/login");
          return;
        }
        const userId = (user as { claims?: { sub?: string } }).claims?.sub;
        pathAfterAuth(req.session, userId, fallback)
          .then((dest) => {
            if (!res.headersSent) res.redirect(dest);
          })
          .catch(() => {
            if (!res.headersSent) res.redirect("/");
          });
      });
    });
  })(req, res, next);
}

/**
 * Mounts the Apple routes. The strategy is registered only when the flag is on
 * and every APPLE_* env name is set. Callers import this from index.ts.
 */
export function registerAppleAuthRoutes(app: Express, opts?: { getJwks?: AppleJwksGetter }): void {
  if (opts?.getJwks) jwksGetter = opts.getJwks;
  if (appleSignInConfigured()) {
    passport.use(APPLE_STRATEGY, new AppleStrategy());
  } else {
    passport.unuse(APPLE_STRATEGY);
  }
  app.get("/api/auth/apple", appleStart);
  app.post("/api/auth/apple/callback", appleCallback);
}
