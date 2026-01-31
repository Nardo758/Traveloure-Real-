import { Router, Request, Response } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";

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

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error("Missing META_APP_ID or META_APP_SECRET");
      return res.redirect("/expert/content-studio?error=missing_config");
    }

    const redirectUri = `${req.protocol}://${req.get("host")}/api/instagram/callback`;

    const tokenResponse = await fetch(
      `https://api.instagram.com/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
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
      `https://graph.instagram.com/access_token?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: META_APP_SECRET,
          access_token,
        })
    );

    let longLivedToken = access_token;
    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      longLivedToken = longLivedData.access_token;
    }

    const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.json({ connected: false });
    }

    const [user] = await db
      .select({ instagramUserId: users.instagramUserId })
      .from(users)
      .where(eq(users.id, userId));

    res.json({ connected: !!user?.instagramUserId });
  } catch (error) {
    console.error("Instagram status check error:", error);
    res.json({ connected: false });
  }
});

router.post("/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
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

    const { imageUrl, caption, mediaType = "IMAGE" } = req.body;

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
      const error = await createContainerResponse.text();
      console.error("Container creation failed:", error);
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
      const error = await publishResponse.text();
      console.error("Publish failed:", error);
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

router.post("/publish-carousel", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
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
        `https://graph.instagram.com/${GRAPH_API_VERSION}/${user.instagramUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: user.instagramAccessToken,
          }),
        }
      );

      if (!response.ok) {
        return res.status(400).json({ error: "Failed to create carousel item" });
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
    const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
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

export default router;
