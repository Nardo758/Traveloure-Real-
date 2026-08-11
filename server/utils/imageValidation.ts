// Server-enforced image upload limits (the client's 5MB check in profile.tsx is advisory;
// the server is the authority). Applies to base64 data-URL image fields (e.g. govId,
// travelLicence on the expert application).
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Strict: when a value is present (non-empty), it MUST be an allowed `data:image/*;base64,`
// URL with a valid base64 payload under the size cap. Non-data-URL strings are rejected —
// otherwise an arbitrary oversized text blob would bypass both the size and MIME checks.
// Returns an error message, or null if valid / absent.
export function validateImageDataUrl(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return null; // field not provided
  if (typeof value !== "string") return `${fieldName} must be a string`;
  if (value.trim() === "") return null; // explicit clear — nothing to enforce
  const match = value.match(/^data:([^;,]+);base64,/);
  if (!match) {
    return `${fieldName} must be a base64-encoded image data URL (data:image/...;base64,...)`;
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return `${fieldName} must be a JPEG, PNG, WebP or GIF image`;
  }
  const payload = value.slice(value.indexOf(",") + 1);
  if (payload.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 !== 0) {
    return `${fieldName} contains invalid base64 image data`;
  }
  // Exact decoded size: 3 bytes per 4 base64 chars, minus padding
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = (payload.length / 4) * 3 - padding;
  if (decodedBytes > MAX_IMAGE_UPLOAD_BYTES) {
    return `${fieldName} must be under 5MB`;
  }
  return null;
}
