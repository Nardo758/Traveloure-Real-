/**
 * A plain same-site path, or null. The social sign-in href and the OAuth callback
 * both use this so a return path cannot become an open redirect: no scheme, no
 * host, no protocol-relative `//`, no backslash (browsers treat `/\` as `//`).
 */
export function sameSiteReturnPath(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(candidate) || candidate.length > 512) return null;
  return candidate;
}
