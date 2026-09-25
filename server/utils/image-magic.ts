/**
 * THE ONE FORMAT SNIFF FOR AN UPLOADED IMAGE (RC-10, ledger `2026-09-25-rc10-profile-photo`).
 * A client's Content-Type is a claim; the first bytes are the fact. The cover-photo and
 * gallery-photo rails in `server/routes.ts` carry the same two magic numbers inline — they are
 * not rewired here (a monolith edit for no behaviour change), but a rail born after this file
 * reads it rather than restating the bytes (§18 rule 1). JPEG and PNG only: the platform accepts
 * nothing else on any image rail, and this sniff does not widen that.
 */
export interface SniffedImage {
  ext: "jpg" | "png";
  contentType: "image/jpeg" | "image/png";
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG

/** `null` = not a JPEG or PNG by its bytes, whatever the client said it was. */
export function sniffImageFormat(buffer: Buffer): SniffedImage | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) return { ext: "jpg", contentType: "image/jpeg" };
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PNG_MAGIC)) return { ext: "png", contentType: "image/png" };
  return null;
}
