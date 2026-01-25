import passport from "passport";
import FacebookStrategy from "passport-facebook";
import type { Express } from "express";
import { authStorage } from "./storage";

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
          },
          async (accessToken: string, refreshToken: string, profile: FacebookStrategy.Profile, done: (error: any, user?: any) => void) => {
            try {
              const email = profile.emails?.[0]?.value;
              const profileImageUrl = profile.photos?.[0]?.value;

              const user = await authStorage.upsertUser({
                id: `fb_${profile.id}`,
                email: email || null,
                firstName: profile.name?.givenName || profile.displayName?.split(" ")[0] || null,
                lastName: profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || null,
                profileImageUrl: profileImageUrl || null,
              });

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
              };

              done(null, sessionUser);
            } catch (error) {
              console.error("[Facebook Auth] Error during authentication:", error);
              done(error as Error);
            }
          }
        )
      );
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/auth/facebook", (req, res, next) => {
    ensureFacebookStrategy(req.hostname);
    passport.authenticate(`facebook:${req.hostname}`, {
      scope: ["email", "public_profile"],
    })(req, res, next);
  });

  app.get("/api/auth/facebook/callback", (req, res, next) => {
    ensureFacebookStrategy(req.hostname);
    passport.authenticate(`facebook:${req.hostname}`, {
      successRedirect: "/become-expert?influencer=true&auth=facebook",
      failureRedirect: "/become-expert?influencer=true&error=auth_failed",
    })(req, res, next);
  });

  console.log("[Facebook Auth] Facebook/Instagram authentication configured");
}
