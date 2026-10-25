// NOTE: `passport` and `passport-facebook` are intentional runtime deps —
// Facebook/Instagram influencer login is served here (routes registered in
// registerRoutes via setupFacebookAuth). See replitAuth.ts header note before
// removing Passport from package.json.
import passport from "passport";
import FacebookStrategy from "passport-facebook";
import type { Express } from "express";
import { authStorage } from "./storage";
import { sendWelcomeEmail } from "../../services/email.service";
import { issueEmailVerification } from "./emailAuth";
import { pathAfterAuth } from "../../services/email-verification.service";
import { EMAIL_VERIFICATION_HOLD_PATH } from "@shared/email-verification-gate";
import { getPlatformFlag, FLAG_REGISTRATION_ENABLED, getTravelerSignupMode, getLaunchMarketSlug } from "../../services/platform-flags";
import { decideFirstTimeSignup, waitlistBlockedPath, TRAVELER_WAITLIST, type SignupIntent } from "@shared/launch-signup";
import { stashSignupIntent, readSignupIntent, readSignupSourceTag, takeStashedReturnTo } from "./signup-intent-stash";
import { recordSignupSource } from "../../services/signup-source-record";
import {
  decideEmailMerge,
  EMAIL_SIGN_IN_REQUIRED,
  EMAIL_SIGN_IN_REQUIRED_MESSAGE,
  EMAIL_SIGN_IN_REQUIRED_PARAM,
} from "./email-merge";

interface InstagramAccount {
  id: string;
  username?: string;
  followers_count?: number;
  media_count?: number;
  account_type?: string;
  profile_picture_url?: string;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
  };
}

async function fetchInstagramData(accessToken: string): Promise<InstagramAccount | null> {
  try {
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      console.log("[Facebook Auth] No Facebook Pages found for Instagram Business Account");
      return null;
    }

    for (const page of pagesData.data as FacebookPage[]) {
      if (page.instagram_business_account) {
        const igAccountId = page.instagram_business_account.id;
        
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${igAccountId}?fields=id,username,followers_count,media_count,account_type,profile_picture_url&access_token=${page.access_token}`
        );
        const igData = await igResponse.json();

        if (igData.id) {
          console.log(`[Facebook Auth] Found Instagram account: @${igData.username} with ${igData.followers_count} followers`);
          return {
            id: igData.id,
            username: igData.username,
            followers_count: igData.followers_count,
            media_count: igData.media_count,
            account_type: igData.account_type,
            profile_picture_url: igData.profile_picture_url,
          };
        }
      }
    }

    console.log("[Facebook Auth] No Instagram Business Account linked to any Facebook Page");
    return null;
  } catch (error) {
    console.error("[Facebook Auth] Error fetching Instagram data:", error);
    return null;
  }
}

// Passport verify callback for the Facebook strategy. Exported so the
// registration-flag gate can be unit-tested without a live OAuth handshake.
export async function facebookVerify(
  accessToken: string,
  refreshToken: string,
  profile: FacebookStrategy.Profile,
  done: (error: any, user?: any, info?: any) => void,
  opts: { intent?: SignupIntent; sourceTag?: string | null } = {}
): Promise<void> {
  try {
    const email = profile.emails?.[0]?.value;
    const profileImageUrl = profile.photos?.[0]?.value;

    const instagramData = await fetchInstagramData(accessToken);

    const fbUserId = `fb_${profile.id}`;

    let user;
    let isNewUser = false;

    // This Facebook identity's own account signs in as itself, whatever its email.
    const existingFb = await authStorage.getUser(fbUserId).catch(() => undefined);

    // Email-merge (LW-1-0): a DIFFERENT account already owns this email. Facebook's profile carries no
    // verified-email signal, so the ONE rule (email-merge.ts) never merges it — and never into an admin
    // account. No second account is created for the email either: the person is told to sign in with
    // their email and password. Logged by user id only.
    const emailOwner = !existingFb && email
      ? await authStorage.getUserByEmail(email).catch(() => undefined)
      : undefined;

    if (emailOwner) {
      const decision = decideEmailMerge({ emailVerified: false, owner: emailOwner });
      if (!decision.merge) {
        console.warn(`[Facebook Auth] email-match merge refused (${decision.reason}) for existing account ${emailOwner.id}`);
        return done(null, false, { message: EMAIL_SIGN_IN_REQUIRED_MESSAGE, code: EMAIL_SIGN_IN_REQUIRED } as any);
      }
      // Unreachable while Facebook supplies no signal; kept so the rule, not this file, decides.
      user = (await authStorage.updateUser(emailOwner.id, {
        profileImageUrl: emailOwner.profileImageUrl || instagramData?.profile_picture_url || profileImageUrl || undefined,
        firstName: emailOwner.firstName || profile.name?.givenName || profile.displayName?.split(" ")[0] || undefined,
        lastName: emailOwner.lastName || profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || undefined,
      })) ?? emailOwner;
      console.log(`[Facebook Auth] Merged fb_${profile.id} into existing account ${emailOwner.id}`);
    } else {
      // No email collision — create/update the fb_xxx account as before.
      isNewUser = !existingFb;

      // Admin-controlled registration kill switch (/admin/system):
      // block first-time account creation only — existing accounts
      // (any provider) still log in.
      if (isNewUser) {
        const registrationEnabled = await getPlatformFlag(FLAG_REGISTRATION_ENABLED, true);
        if (!registrationEnabled) {
          return done(null, false, { message: "New user registration is temporarily disabled. Please try again later." } as any);
        }
        // LW-1b: the traveler sign-up switch — in waitlist mode a first-time traveler is refused; a supply sign-up
        // (intent carried by the session stash) passes. No QA bypass on a social sign-in.
        const decision = decideFirstTimeSignup({
          mode: await getTravelerSignupMode(),
          intent: opts.intent ?? "traveler",
          qaCodeValid: false,
        });
        if (!decision.allowed) return done(null, false, { code: TRAVELER_WAITLIST } as any);
      }

      // Row 156: a blank profile address is not written over a stored one; a different address is stored unverified. authStorage.upsertUser applies that, and this call passes no verified flag.
      user = await authStorage.upsertUser({
        id: fbUserId,
        email: email || null,
        firstName: profile.name?.givenName || profile.displayName?.split(" ")[0] || null,
        lastName: profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || null,
        profileImageUrl: instagramData?.profile_picture_url || profileImageUrl || null,
        // LW-1b: record the provider (the column defaulted to "email", which mislabelled every Facebook account).
        authProvider: "facebook",
      });
      // LW-1d: a NEW supply account records its sign-up source tag once (never on a sign-in, never for a traveler).
      if (isNewUser && opts.intent === "supply") await recordSignupSource(user.id, opts.sourceTag);
    }

    if (isNewUser && email) {
      // AUTH-1 Finding A (i): Facebook is never trusted as a verified address. A new account gets the
      // same verification email an email sign-up gets, and its welcome is held until that is used.
      issueEmailVerification(user.id, email, user.firstName ?? null).catch(
        (err) => console.error("[auth/facebook] verification email issue failed (non-fatal):", err)
      );
      sendWelcomeEmail({ toEmail: email, firstName: user.firstName ?? null }).catch(
        (err) => console.error("[auth/facebook] welcome email failed (non-fatal):", err)
      );
    }

    if (user.isSuspended) {
      return done(null, false, { message: "Your account has been suspended. Please contact support." } as any);
    }

    const sessionUser = {
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        profile_image_url: user.profileImageUrl,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
      provider: "facebook",
      instagram: instagramData ? {
        id: instagramData.id,
        username: instagramData.username,
        followers_count: instagramData.followers_count,
        media_count: instagramData.media_count,
        account_type: instagramData.account_type,
      } : null,
    };

    done(null, sessionUser);
  } catch (error) {
    console.error("[Facebook Auth] Error during authentication:", error);
    done(error as Error);
  }
}

export function setupFacebookAuth(app: Express) {
  const META_APP_ID = process.env.META_APP_ID;
  const META_APP_SECRET = process.env.META_APP_SECRET;

  if (!META_APP_ID || !META_APP_SECRET) {
    console.log("[Facebook Auth] Meta credentials not configured, skipping Facebook auth setup");
    return;
  }

  const registeredStrategies = new Set<string>();

  const ensureFacebookStrategy = (domain: string) => {
    const strategyName = `facebook:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      passport.use(
        strategyName,
        new FacebookStrategy.Strategy(
          {
            clientID: META_APP_ID,
            clientSecret: META_APP_SECRET,
            callbackURL: `https://${domain}/api/auth/facebook/callback`,
            profileFields: ["id", "emails", "name", "displayName", "photos"],
            enableProof: true,
            passReqToCallback: true,
          },
          // LW-1b: the request carries the stashed sign-up intent into the verify callback.
          (req: any, accessToken: string, refreshToken: string, profile: FacebookStrategy.Profile, done: any) =>
            facebookVerify(accessToken, refreshToken, profile, done, { intent: readSignupIntent(req), sourceTag: readSignupSourceTag(req) })
        )
      );
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/auth/facebook", (req, res, next) => {
    ensureFacebookStrategy(req.hostname);
    // LW-1b: `?intent=supply&returnTo=/path` survive the round trip in the session stash.
    stashSignupIntent(req);
    passport.authenticate(`facebook:${req.hostname}`, {
      scope: [
        "email",
        "public_profile",
        "pages_show_list",
        "instagram_basic",
        "instagram_manage_insights",
        "business_management",
      ],
    })(req, res, next);
  });

  app.get("/api/auth/facebook/callback", (req, res, next) => {
    ensureFacebookStrategy(req.hostname);
    passport.authenticate(`facebook:${req.hostname}`, (err: any, user: any, info: any) => {
      if (err) return next(err);
      // LW-1-0: a refused email-match merge is told to use email and password.
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
      if (!user) return res.redirect("/become-expert?influencer=true&error=auth_failed");
      // LW-1b: return to the page the flow started from (read before req.logIn regenerates the session); the
      // influencer onboarding page stays the default when none was stashed.
      const returnTo = takeStashedReturnTo(req);
      const fallback = returnTo ?? "/become-expert?influencer=true&auth=facebook";
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const userId = user?.claims?.sub ?? user?.id;
        pathAfterAuth(req.session, userId, fallback)
          .then((dest) => {
            if (!res.headersSent) res.redirect(dest);
          })
          .catch(() => {
            if (!res.headersSent) res.redirect(EMAIL_VERIFICATION_HOLD_PATH);
          });
      });
    })(req, res, next);
  });

  app.get("/api/auth/instagram-data", (req, res) => {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    if (user.instagram) {
      return res.json({
        connected: true,
        username: user.instagram.username,
        followers_count: user.instagram.followers_count,
        media_count: user.instagram.media_count,
        account_type: user.instagram.account_type,
      });
    }
    
    return res.json({ connected: false });
  });

  console.log("[Facebook Auth] Facebook/Instagram authentication configured with Instagram Business API");
}
