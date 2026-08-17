/**
 * Gap #16 (Gate G5): magic-byte sniffing for the service-photo upload rail.
 *
 * The Content-Type header is client-declared and not trusted on its own — exactly the
 * deliverable rail's PDF_MAGIC posture (ruling 58 / R4), extended to the three image formats
 * the photo rail accepts. Returns the canonical file extension for a recognized image buffer,
 * or null for anything else (the route 400s on null — never stores a mystery file under an
 * image path).
 */
export type SniffedImageExt = "jpg" | "png" | "webp";

export function sniffImageExtension(buffer: Buffer): SniffedImageExt | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  // WEBP: "RIFF" <4-byte size> "WEBP"
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export const IMAGE_CONTENT_TYPES: Readonly<Record<SniffedImageExt, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
