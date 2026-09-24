/**
 * What a save request may carry (board #330). ONE home for the admitted kinds and the body shape,
 * read by `POST /api/saved-items` and by the client's save button (§18 rule 1).
 *
 * Pick-shaped and `.strict()` (§19): the owner is the session, never the body, and an unknown key
 * is refused rather than silently dropped. `contentName`/`contentImage`/`city` are a DISPLAY CACHE
 * of the card at save time — nothing reads them for money, access or identity.
 */
import { z } from "zod";

export const SAVED_CONTENT_TYPES = ["gem", "hotel", "activity", "service"] as const;
export type SavedContentType = (typeof SAVED_CONTENT_TYPES)[number];

export const saveItemBodySchema = z
  .object({
    contentType: z.enum(SAVED_CONTENT_TYPES),
    contentId: z.string().trim().min(1).max(255),
    contentName: z.string().trim().min(1).max(255),
    contentImage: z
      .string()
      .trim()
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u) || u.startsWith("/"), "contentImage must be an http(s) or site-relative URL")
      .nullish(),
    city: z.string().trim().max(100).nullish(),
  })
  .strict();
export type SaveItemBody = z.infer<typeof saveItemBodySchema>;
