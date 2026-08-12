/**
 * Shared input sanitization utilities.
 *
 * Single source of truth for the XSS-stripping `sanitizeInput` that was
 * previously copy-pasted across route modules (server/routes.ts and the
 * server/routes/*.routes.ts files). Harden attack-pattern handling HERE so
 * every route module picks up the fix.
 */

// Simple XSS sanitization - strips HTML tags and dangerous characters
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}
