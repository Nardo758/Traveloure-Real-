import { Router, type RequestHandler } from "express";
import express from "express";
import { randomBytes } from "node:crypto";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { sniffImageFormat } from "../utils/image-magic";

/**
 * THE PROFILE PHOTO IS SAVED — RC-10 (ledger `2026-09-25-rc10-profile-photo`; audit
 * `docs/audits/GAP_REGISTER.md` §A row 31, U2 CONFIRMED `ui/profile__button-save-profile/`).
 *
 * `/profile`'s "Upload Photo" read the file into a data URL, put it in React state, and toasted
 * "Photo updated" — no request left the browser (`image sent to server=false`), and a reload
 * showed the old avatar. `users.profile_image_url` had writers only on the OAuth sign-in paths
 * (Replit/Facebook claims) and on `PATCH /api/profile`, whose `profileImageUrl` is a bare URL the
 * page had no file host to point at. This is that host.
 *
 * THE SHAPE IS THE COVER-PHOTO RAIL'S (`POST /api/provider/services/:id/cover-photo`): no
 * multipart — `express.raw()` scoped to this route; JPEG/PNG by MAGIC BYTES, never by the
 * client's Content-Type; 5 MB; the private object-storage bucket (ruling 58 — unauthenticated GCS
 * GETs return 403) served through a server-side proxy so the GCS URL is never disclosed; the new
 * object is uploaded first and the previous managed one deleted best-effort AFTER the row is
 * written, so a failed write orphans nothing on the row.
 *
 * WHAT IS STORED IS THE PROXY URL ITSELF (`/api/avatars/<32 hex>.<ext>`), not a `prefix:key`
 * reference the way the cover rail stores `covers:<key>`: `profile_image_url` has a dozen readers
 * across storefronts, expert cards, landing and the console that render the column AS a URL with
 * no normaliser between them, and an opaque reference would break every one. The proxy path is
 * addressed by a CRYPTO-RANDOM file name and never by a user id (Locked Decision 40 —
 * `users.id` is internal), so the public serve route leaks no identity and cannot enumerate.
 *
 * §14: the actor is the session; no user id is read from the body or the path on either write.
 * §13: the client toasts only on the server's answer, and a refused upload says why by code.
 */
const router = Router();

export const AVATAR_PUBLIC_PREFIX = "/api/avatars/";
const AVATAR_OBJECT_PREFIX = "avatars/";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — the same cap every image rail carries
const AVATAR_FILE_RE = /^[a-f0-9]{32}\.(jpg|png)$/;

/** The stored URL of a photo THIS rail manages, or `null` for an OAuth-claimed or external URL. */
export function managedAvatarObjectKey(profileImageUrl: string | null | undefined): string | null {
  const value = (profileImageUrl ?? "").trim();
  if (!value.startsWith(AVATAR_PUBLIC_PREFIX)) return null;
  const file = value.slice(AVATAR_PUBLIC_PREFIX.length);
  return AVATAR_FILE_RE.test(file) ? `${AVATAR_OBJECT_PREFIX}${file}` : null;
}

router.post(
  "/api/me/profile-photo",
  isAuthenticated,
  express.raw({ type: ["image/jpeg", "image/png", "application/octet-stream"], limit: "5mb" }) as RequestHandler,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          message: "Send the image as a raw request body with Content-Type: image/jpeg or image/png",
          code: "PROFILE_PHOTO_REQUIRED",
        });
      }
      const buffer: Buffer = req.body;
      if (buffer.length > AVATAR_MAX_BYTES) {
        return res.status(400).json({ message: "Image exceeds the 5 MB size limit", code: "PROFILE_PHOTO_TOO_LARGE" });
      }
      const format = sniffImageFormat(buffer);
      if (!format) {
        return res.status(400).json({ message: "Only JPEG and PNG images are accepted", code: "PROFILE_PHOTO_INVALID_FORMAT" });
      }

      const file = `${randomBytes(16).toString("hex")}.${format.ext}`;
      const key = `${AVATAR_OBJECT_PREFIX}${file}`;
      const { uploadBuffer, deleteObject } = await import("../infrastructure/object-storage");
      try {
        await uploadBuffer(key, buffer);
      } catch (storageErr) {
        console.error("[profile-photo] upload failed:", storageErr);
        return res.status(503).json({
          message: "Photo storage is not available right now. Try again shortly.",
          code: "OBJECT_STORAGE_UNAVAILABLE",
        });
      }

      const previous = await authStorage.getUser(userId);
      const profileImageUrl = `${AVATAR_PUBLIC_PREFIX}${file}`;
      let updated;
      try {
        updated = await authStorage.updateUser(userId, { profileImageUrl });
      } catch (dbErr) {
        console.error("[profile-photo] persist failed:", dbErr);
        deleteObject(key).catch(() => {});
        return res.status(500).json({ message: "Failed to save profile photo" });
      }
      if (!updated) {
        deleteObject(key).catch(() => {});
        return res.status(404).json({ message: "User not found" });
      }
      // Best-effort cleanup of the previous MANAGED object, now that the row points elsewhere. An
      // OAuth-claimed or external URL is not ours to delete and is simply no longer referenced.
      const previousKey = managedAvatarObjectKey(previous?.profileImageUrl);
      if (previousKey && previousKey !== key) deleteObject(previousKey).catch(() => {});

      res.json({ message: "Photo updated", profileImageUrl, contentType: format.contentType });
    } catch (err) {
      console.error("[profile-photo] error:", err);
      res.status(500).json({ message: "Failed to upload profile photo" });
    }
  },
);

router.delete("/api/me/profile-photo", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const previous = await authStorage.getUser(userId);
    if (!previous) return res.status(404).json({ message: "User not found" });
    const updated = await authStorage.updateUser(userId, { profileImageUrl: null });
    if (!updated) return res.status(404).json({ message: "User not found" });
    const previousKey = managedAvatarObjectKey(previous.profileImageUrl);
    if (previousKey) {
      const { deleteObject } = await import("../infrastructure/object-storage");
      deleteObject(previousKey).catch(() => {});
    }
    // §13: "removed" is said only once the column is NULL; whether there was a photo to begin
    // with is reported, not assumed.
    res.json({ message: "Photo removed", hadPhoto: Boolean((previous.profileImageUrl ?? "").trim()) });
  } catch (err) {
    console.error("[profile-photo] remove error:", err);
    res.status(500).json({ message: "Failed to remove profile photo" });
  }
});

// Public avatar proxy: addressed by the random file name only (never a user id), one 404 for a
// malformed name, an unknown object and a storage outage alike — nothing here can be probed.
router.get("/api/avatars/:file", async (req, res) => {
  const file = String(req.params.file ?? "");
  if (!AVATAR_FILE_RE.test(file)) return res.status(404).json({ message: "Not found" });
  try {
    const { downloadBytes } = await import("../infrastructure/object-storage");
    const bytes = await downloadBytes(`${AVATAR_OBJECT_PREFIX}${file}`);
    res.setHeader("Content-Type", file.endsWith(".png") ? "image/png" : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(bytes);
  } catch {
    return res.status(404).json({ message: "Not found" });
  }
});

export default router;
