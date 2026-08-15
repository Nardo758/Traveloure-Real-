import { Router, Request, Response } from "express";
import { createHmac } from "crypto";
import { getUserId } from "../utils/auth";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

/**
 * Maps a Graph API verification response to the status payload returned by
 * GET /api/instagram/status. Exported for unit testing.
 *
 * @param verifyOk   Whether the HTTP response had a 2xx status code
 * @param verifyData Parsed JSON body from graph.instagram.com/me
 */
export function resolveInstagramVerifyStatus(
  verifyOk: boolean,
  verifyData: Record<string, unknown>,
): { connected: boolean; reason?: string; accountType?: string } {
  if (!verifyOk || verifyData.error) {
    const errCode = (verifyData.error as { code?: number } | undefined)?.code;
    // 190 = invalid/expired token; 102/104 = session expired
    const isExpired = [102, 104, 190].includes(errCode as number);
    return {
      connected: false,
      reason: isExpired ? "token_expired" : "auth_error",
    };
  }

  const accountType: string = (verifyData.account_type as string) ?? "";
  if (accountType === "PERSONAL") {
    return { connected: false, reason: "personal_account" };
  }

  return { connected: true, accountType };
}

/**
 * Processes the Graph API verification result for the /status endpoint.
 * Resolves the status payload AND, when the token is definitively expired
 * (error codes 102, 104, 190), nulls out the stored token columns so stale
 * credentials never accumulate.
 *
 * Exported for unit testing — callers supply the db client so tests can inject
 * a mock without a real database connection.
 *
 * @param userId     The authenticated user's id (used for the DB update)
 * @param verifyOk   Whether the HTTP response had a 2xx status code
 * @param verifyData Parsed JSON body from graph.instagram.com/me
 * @param dbClient   Drizzle DB client (real or mock)
 */
export async function handleInstagramStatusVerify(
  userId: string,
  verifyOk: boolean,
  verifyData: Record<string, unknown>,
  dbClient: typeof db,
): Promise<{ connected: boolean; reason?: string; accountType?: string }> {
  const status = resolveInstagramVerifyStatus(verifyOk, verifyData);

  if (status.reason === "token_expired") {
    // Wipe stored credentials so expired tokens never accumulate. We do this
    // only for definitive token-expiry codes (102, 104, 190); non-token errors
    // (network failures, permission errors) leave the token intact.
    await dbClient
      .update(users)
      .set({ instagramUserId: null, instagramAccessToken: null })
      .where(eq(users.id, userId));
  }

  return status;
}

/**
 * Maps a token-verification result to a publish-gate error payload.
 * Returns null when the token is valid and publishing should proceed.
 * Exported for unit testing.
 *
 * @param verifyOk   Whether the HTTP response had a 2xx status code
 * @param verifyData Parsed JSON body from graph.instagram.com/me
 */
export function resolveInstagramPublishTokenError(
  verifyOk: boolean,
  verifyData: Record<string, unknown>,
): { statusCode: number; body: { error: string; reason: string } } | null {
  const status = resolveInstagramVerifyStatus(verifyOk, verifyData);
  if (status.connected) return null;

  if (status.reason === "token_expired") {
    return {
      statusCode: 401,
      body: {
        error: "Instagram session expired. Please reconnect your account.",
        reason: "token_expired",
      },
    };
  }

  if (status.reason === "personal_account") {
    return {
      statusCode: 403,
      body: {
        error: "Publishing requires a Business or Creator Instagram account.",
        reason: "personal_account",
      },
    };
  }

  return {
    statusCode: 401,
    body: {
      error: "Instagram account is disconnected. Please reconnect.",
      reason: status.reason ?? "auth_error",
    },
  };
}

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";

router.get("/config", (req: Request, res: Response) => {
  res.json({ appId: INSTAGRAM_APP_ID || null });
});

router.get("/callback", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error("Instagram OAuth error:", error_description);
      return res.redirect(`/expert/content-studio?error=${encodeURIComponent(error_description as string || "auth_failed")}`);
    }

    if (!code) {
      return res.redirect("/expert/content-studio?error=no_code");
    }

    if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
      console.error("Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET");
      return res.redirect("/expert/content-studio?error=missing_config");
    }

    const redirectUri = `${req.protocol}://${req.get("host")}/api/instagram/callback`;

    const tokenResponse = await fetch(
      `https://graph.instagram.com/oauth/v2/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: INSTAGRAM_APP_ID,
          client_secret: INSTAGRAM_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: code as string,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return res.redirect("/expert/content-studio?error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json();
    const { access_token, user_id } = tokenData;

    const longLivedResponse = await fetch(
      `https://graph.instagram.com/oauth/v2/access_token?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: INSTAGRAM_APP_SECRET,
          access_token,
        })
    );

    let longLivedToken = access_token;
    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      longLivedToken = longLivedData.access_token;
    }

    const userId = getUserId(req)!;
    if (userId) {
      await db
        .update(users)
        .set({
          instagramUserId: user_id,
          instagramAccessToken: longLivedToken,
        })
        .where(eq(users.id, userId));
    }

    res.redirect("/expert/content-studio?instagram=connected");
  } catch (error) {
    console.error("Instagram callback error:", error);
    res.redirect("/expert/content-studio?error=callback_failed");
  }
});

router.get("/status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [user] = await db
      .select({
        instagramUserId: users.instagramUserId,
        instagramAccessToken: users.instagramAccessToken,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.instagramUserId || !user?.instagramAccessToken) {
      return res.json({ connected: false });
    }

    // Verify the token is still valid and check account type.
    // A personal account will succeed the call but return account_type === "PERSONAL".
    // An expired/revoked token returns an OAuthException error.
    // handleInstagramStatusVerify also nulls out the DB columns when the token
    // is definitively expired (codes 102, 104, 190) so stale tokens never accumulate.
    try {
      const verifyResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,account_type&access_token=${user.instagramAccessToken}`
      );
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || verifyData.error) {
        console.warn("Instagram token verification failed:", verifyData.error?.message);
      }

      const status = await handleInstagramStatusVerify(userId, verifyResponse.ok, verifyData, db);
      return res.json(status);
    } catch (verifyErr) {
      // Network error during verification — treat as disconnected but don't
      // wipe the stored token; the user may just be offline temporarily.
      console.error("Instagram token verification network error:", verifyErr);
      return res.json({ connected: false, reason: "verification_error" });
    }
  } catch (error) {
    console.error("Instagram status check error:", error);
    res.json({ connected: false });
  }
});

router.post("/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [user] = await db
      .select({
        instagramUserId: users.instagramUserId,
        instagramAccessToken: users.instagramAccessToken,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.instagramUserId || !user?.instagramAccessToken) {
      return res.status(400).json({
        error: "Instagram not connected. Please connect your account first.",
        reason: "not_connected",
      });
    }

    // Verify the stored token is still valid before attempting any Graph API
    // publish calls. An expired token would otherwise surface as an opaque
    // Graph API error rather than a clear reconnect prompt.
    try {
      const verifyResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,account_type&access_token=${user.instagramAccessToken}`
      );
      const verifyData = await verifyResponse.json();
      const tokenError = resolveInstagramPublishTokenError(verifyResponse.ok, verifyData);
      if (tokenError) {
        console.warn(
          "Instagram publish blocked — token check failed:",
          tokenError.body.reason,
        );
        return res.status(tokenError.statusCode).json(tokenError.body);
      }
    } catch (verifyErr) {
      console.error("Instagram token verification network error:", verifyErr);
      return res.status(503).json({
        error: "Could not verify Instagram connection. Please try again.",
        reason: "verification_error",
      });
    }

    const { imageUrl, caption } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL required" });
    }

    const createContainerResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption || "",
          access_token: user.instagramAccessToken,
        }),
      }
    );

    if (!createContainerResponse.ok) {
      const errText = await createContainerResponse.text();
      console.error("Container creation failed:", errText);
      return res.status(400).json({ error: "Failed to create media container" });
    }

    const containerData = await createContainerResponse.json();
    const containerId = containerData.id;

    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 30;

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(
        `https://graph.instagram.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code&access_token=${user.instagramAccessToken}`
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        status = statusData.status_code;
      }
      attempts++;
    }

    if (status !== "FINISHED") {
      return res.status(400).json({ error: `Media processing failed: ${status}` });
    }

    const publishResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: user.instagramAccessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errText = await publishResponse.text();
      console.error("Publish failed:", errText);
      return res.status(400).json({ error: "Failed to publish media" });
    }

    const publishData = await publishResponse.json();

    res.json({
      success: true,
      mediaId: publishData.id,
      message: "Successfully published to Instagram",
    });
  } catch (error) {
    console.error("Instagram publish error:", error);
    res.status(500).json({ error: "Failed to publish to Instagram" });
  }
});

router.get("/publishing-limit", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [user] = await db
      .select({
        instagramUserId: users.instagramUserId,
        instagramAccessToken: users.instagramAccessToken,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.instagramUserId || !user?.instagramAccessToken) {
      return res.status(400).json({ error: "Instagram not connected" });
    }

    const { imageUrls, caption } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length < 2) {
      return res.status(400).json({ error: "At least 2 image URLs required for carousel" });
    }

    if (imageUrls.length > 10) {
      return res.status(400).json({ error: "Maximum 10 images allowed in carousel" });
    }

    const containerIds: string[] = [];

    for (const imageUrl of imageUrls) {
    const response = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/content_publishing_limit?access_token=${user.instagramAccessToken}`
    );

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to get publishing limit" });
    }

    const data = await response.json();
      containerIds.push(data.id);
    }

    const carouselResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: containerIds.join(","),
          caption: caption || "",
          access_token: user.instagramAccessToken,
        }),
      }
    );

    if (!carouselResponse.ok) {
      return res.status(400).json({ error: "Failed to create carousel container" });
    }

    const carouselData = await carouselResponse.json();

    const publishResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: carouselData.id,
          access_token: user.instagramAccessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      return res.status(400).json({ error: "Failed to publish carousel" });
    }

    const publishData = await publishResponse.json();

    res.json({
      success: true,
      mediaId: publishData.id,
      message: "Successfully published carousel to Instagram",
    });
  } catch (error) {
    console.error("Instagram carousel publish error:", error);
    res.status(500).json({ error: "Failed to publish carousel to Instagram" });
  }
});

router.get("/publishing-limit", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [user] = await db
      .select({
        instagramUserId: users.instagramUserId,
        instagramAccessToken: users.instagramAccessToken,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.instagramUserId || !user?.instagramAccessToken) {
      return res.status(400).json({ error: "Instagram not connected" });
    }

    const response = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/content_publishing_limit?access_token=${user.instagramAccessToken}`
    );

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to get publishing limit" });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Publishing limit error:", error);
    res.status(500).json({ error: "Failed to get publishing limit" });
  }
});

router.post("/disconnect", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await db
      .update(users)
      .set({
        instagramUserId: null,
        instagramAccessToken: null,
      })
      .where(eq(users.id, userId));

    res.json({ success: true, message: "Instagram disconnected" });
  } catch (error) {
    console.error("Instagram disconnect error:", error);
    res.status(500).json({ error: "Failed to disconnect Instagram" });
  }
});

/**
 * Shared helper: parse and verify Meta's signed_request parameter.
 * Meta encodes as base64url(HMAC-SHA256(payload, appSecret)) + "." + base64url(payload).
 * Returns the decoded payload object, or null if the signature is invalid or the
 * app secret is missing. Never throws — callers should treat null as "reject with 400".
 */
function parseSignedRequest(signedRequest: string): Record<string, unknown> | null {
  const secret = INSTAGRAM_APP_SECRET;
  if (!secret) return null;

  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;

  // base64url → base64 → Buffer
  const toBase64 = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");
  const sig = Buffer.from(toBase64(encodedSig), "base64");
  const expected = createHmac("sha256", secret).update(payload).digest();

  if (!sig.equals(expected)) return null;

  try {
    return JSON.parse(Buffer.from(toBase64(payload), "base64").toString("utf8"));
  } catch {
    // Malformed base64 or JSON payload — treat as unauthenticated without leaking verification details.
    return null;
  }
}

/**
 * POST /api/instagram/deauthorize
 * Meta calls this (with a signed_request form field) when an Instagram user removes
 * the app from their account settings. We clear their stored token so the platform
 * doesn't attempt further API calls with it.
 *
 * Must respond 200 — Meta does not retry on non-2xx, but a 5xx will generate a
 * platform alert in the App Dashboard.
 */
router.post("/deauthorize", async (req: Request, res: Response) => {
  try {
    const { signed_request } = req.body as { signed_request?: string };
    if (!signed_request) {
      return res.status(400).json({ error: "missing signed_request" });
    }

    const payload = parseSignedRequest(signed_request);
    if (!payload) {
      return res.status(400).json({ error: "invalid signed_request" });
    }

    // payload.user_id is the Instagram-scoped user ID, stored in users.instagramUserId
    const instagramUserId = payload.user_id as string | undefined;
    if (instagramUserId) {
      await db
        .update(users)
        .set({ instagramUserId: null, instagramAccessToken: null })
        .where(eq(users.instagramUserId, instagramUserId));
      console.info(`Instagram deauthorize: cleared token for ig_user=${instagramUserId}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Instagram deauthorize error:", error);
    res.status(500).json({ error: "deauthorize failed" });
  }
});

/**
 * POST /api/instagram/data-deletion
 * Meta calls this (with a signed_request form field) when a user submits a data
 * deletion request through Facebook's privacy tools. We clear the stored Instagram
 * credentials and return the confirmation envelope Meta requires:
 *   { url: <status-page>, confirmation_code: <unique-id> }
 *
 * Meta's App Review checks that this endpoint exists and returns the right shape.
 */
router.post("/data-deletion", async (req: Request, res: Response) => {
  try {
    const { signed_request } = req.body as { signed_request?: string };
    if (!signed_request) {
      return res.status(400).json({ error: "missing signed_request" });
    }

    const payload = parseSignedRequest(signed_request);
    if (!payload) {
      return res.status(400).json({ error: "invalid signed_request" });
    }

    const instagramUserId = payload.user_id as string | undefined;
    const confirmationCode = `IG-DEL-${Date.now()}${instagramUserId ? `-${instagramUserId.slice(-6)}` : ""}`;

    if (instagramUserId) {
      await db
        .update(users)
        .set({ instagramUserId: null, instagramAccessToken: null })
        .where(eq(users.instagramUserId, instagramUserId));
      console.info(`Instagram data deletion: cleared token for ig_user=${instagramUserId}, code=${confirmationCode}`);
    }

    // Meta requires this exact response shape. The url must be publicly reachable
    // and display a human-readable deletion confirmation (privacy page suffices).
    const baseUrl = process.env.APP_BASE_URL || "https://traveloure.com";
    res.status(200).json({
      url: `${baseUrl}/privacy`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error("Instagram data-deletion error:", error);
    res.status(500).json({ error: "data deletion failed" });
  }
});

export default router;
