/**
 * Email string-escaping helpers — the ONE implementation, shared by every builder.
 *
 * These two functions lived as private helpers inside `server/services/email.service.ts`. They
 * moved here (ledger `2026-09-04-invite-mailer`) so a payload builder that is genuinely PURE — no
 * DB, no network, no env — can reach them without importing `email.service`, which pulls in
 * `platform-flags` → `server/db.ts` and therefore cannot load without DATABASE_URL. Copying them
 * into a second file instead would be the derivation-drift class §18 rule 1 names: two escapers
 * is how one of them stops escaping something.
 *
 * `email.service.ts` now imports them from here; every call site is unchanged.
 */

/**
 * Escape a string for safe interpolation inside an HTML email body.
 * Converts the five characters that have special meaning in HTML so that
 * user-controlled values cannot inject markup or attributes.
 */
export function escHtml(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip carriage-return and line-feed characters from a value before it is
 * interpolated into an email `subject` header.  A bare CR or LF in a header
 * value is the classic "email header injection" vector.
 */
export function stripCrLf(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).replace(/[\r\n]/g, "");
}
