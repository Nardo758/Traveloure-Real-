/**
 * share-images.routes.ts — SH1 public share-image endpoints.
 *
 * Public GET-only image renders (Content-Type: image/png) fed by share-image.service.ts's
 * pure satori->SVG->resvg pipeline. Data is loaded + gated HERE (not in the service, which stays
 * pure data-in/buffer-out) — same F2 / REV-MOD read-gate pattern used across the rest of the app,
 * so a non-approved service or non-approved review can never render a shareable card.
 *
 * Rate-limited with heavyReadRateLimiter (render is real CPU work — layout + rasterization).
 * Cache-Control lets CDNs/clients cache a render (the content it's built from changes rarely and
 * SH0 ratified render-on-demand, not stored assets).
 */
import { READY_MADE_SHARE_FORMATS, type ReadyMadeShareFormat } from "../services/ready-made-share-image.service";
import { getReadyMadeShareImage } from "../services/ready-made-share-data.service";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { readyMadeTrips, users } from "@shared/schema";
import { storage } from "../storage";
import { heavyReadRateLimiter } from "../infrastructure/rate-limiter";
import {
  renderShareImage,
  type ServiceShareImageData,
  type ReviewShareImageData,
  type ServiceRouteShareImageData,
} from "../services/share-image.service";

const router = Router();

const IMAGE_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

function sendPng(res: any, buf: Buffer) {
  res.status(200).set({ "Content-Type": "image/png", "Cache-Control": IMAGE_CACHE_CONTROL }).end(buf);
}

async function loadOwnerNameAndHandle(userId: string): Promise<{ name: string | null; handle: string | null }> {
  const [owner] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!owner) return { name: null, handle: null };
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null;
  return { name, handle: owner.handle ?? null };
}

// GET /api/share-image/service/:id.png?format=feed|story|route
router.get("/api/share-image/service/:id.png", heavyReadRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const format =
      req.query.format === "story" ? "story" : req.query.format === "route" ? "route" : "feed";

    const service = await storage.getProviderServiceById(id);
    // F2 public read-gate: never render a card for a listing that isn't public yet.
    if (!service || service.approvalStatus !== "approved" || service.status !== "active") {
      return res.status(404).json({ message: "Service not found" });
    }

    const { name: earnerName, handle: earnerHandle } = await loadOwnerNameAndHandle(service.userId);

    // Ruling 22(d): the Route frame renders the ordered stop list. A service with no stops
    // 404s — an honest absence, never a fabricated route card (§13); the client hides the
    // frame on that signal.
    if (format === "route") {
      const routePoints = await storage.getServiceRoutePoints(service.id);
      if (routePoints.length === 0) {
        return res.status(404).json({ message: "No route on this service" });
      }
      const routeData: ServiceRouteShareImageData = {
        serviceName: service.serviceName,
        stops: routePoints.map((p) => p.name),
        earnerName,
        earnerHandle,
        path: earnerHandle ? `/s/${earnerHandle}` : `/services/${service.id}`,
      };
      const routeBuf = await renderShareImage("service-route", routeData);
      return sendPng(res, routeBuf);
    }

    const data: ServiceShareImageData = {
      serviceName: service.serviceName,
      price: service.price,
      averageRating: service.averageRating,
      reviewCount: service.reviewCount ?? 0,
      earnerName,
      earnerHandle,
      path: earnerHandle ? `/s/${earnerHandle}` : `/services/${service.id}`,
    };

    const buf = await renderShareImage(format === "story" ? "service-story" : "service-feed", data);
    return sendPng(res, buf);
  } catch (error: any) {
    console.error("[share-images] service render failed:", error);
    return res.status(500).json({ message: "Failed to render share image" });
  }
});

// GET /api/share-image/ready-made/:id.png?format=cover|map|story|og[&v=<version>][&download=1]
// Slice B2 (ledger `2026-10-05-rmt-share-images`): the Ready Made Trip's four generated cards
// (`ready-made-share-image.service.ts`), from ONE data object behind the public gate (approved +
// active, else 404 — no draft oracle). `feed` is kept as the cover's old name (SocialKitCard). A
// request naming the CURRENT version is immutable for a day; any other gets the short default.
router.get("/api/share-image/ready-made/:id.png", heavyReadRateLimiter, async (req, res) => {
  try {
    const raw = String(req.query.format ?? "cover");
    const format = (raw === "feed" ? "cover" : raw) as ReadyMadeShareFormat;
    if (!(READY_MADE_SHARE_FORMATS as readonly string[]).includes(format)) {
      return res.status(400).json({ message: "Unknown format" });
    }
    const image = await getReadyMadeShareImage(req.params.id, format);
    if (!image) return res.status(404).json({ message: "Trip not found" });
    res.setHeader("ETag", `"rmt-${format}-${image.version}"`);
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-${image.slug}-${format}.png"`);
    }
    if (req.query.v === image.version) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      return res.send(image.png);
    }
    return sendPng(res, image.png);
  } catch (error: any) {
    console.error("[share-images] ready-made render failed:", error);
    return res.status(500).json({ message: "Failed to render share image" });
  }
});

// GET /api/share-image/review/:id.png
router.get("/api/share-image/review/:id.png", heavyReadRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    const review = await storage.getServiceReview(id);
    // REV-MOD gate: only a moderator-approved review is shareable.
    if (!review || review.status !== "approved") {
      return res.status(404).json({ message: "Review not found" });
    }
    if (review.rating == null) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Same F2 gate as the service card — an unapproved/inactive service's review is not shareable.
    const service = await storage.getProviderServiceById(review.serviceId);
    if (!service || service.approvalStatus !== "approved" || service.status !== "active") {
      return res.status(404).json({ message: "Review not found" });
    }

    const [reviewer] = await db
      .select({ firstName: users.firstName })
      .from(users)
      .where(eq(users.id, review.travelerId))
      .limit(1);
    // Privacy: first name only, never the full name.
    const reviewerFirstName = reviewer?.firstName?.trim() || "A traveler";

    const data: ReviewShareImageData = {
      reviewText: review.reviewText ?? "",
      rating: review.rating,
      reviewerFirstName,
      serviceName: service.serviceName,
    };

    const buf = await renderShareImage("review", data);
    return sendPng(res, buf);
  } catch (error: any) {
    console.error("[share-images] review render failed:", error);
    return res.status(500).json({ message: "Failed to render share image" });
  }
});

export default router;
