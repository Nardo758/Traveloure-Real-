import passport from "passport";
import FacebookStrategy from "passport-facebook";
import type { Express } from "express";
import { authStorage } from "./storage";

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

              const instagramData = await fetchInstagramData(accessToken);

              const user = await authStorage.upsertUser({
                id: `fb_${profile.id}`,
                email: email || null,
                firstName: profile.name?.givenName || profile.displayName?.split(" ")[0] || null,
                lastName: profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || null,
                profileImageUrl: instagramData?.profile_picture_url || profileImageUrl || null,
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
        )
      );
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/auth/facebook", (req, res, next) => {
    ensureFacebookStrategy(req.hostname);
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
    passport.authenticate(`facebook:${req.hostname}`, {
      successRedirect: "/become-expert?influencer=true&auth=facebook",
      failureRedirect: "/become-expert?influencer=true&error=auth_failed",
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
