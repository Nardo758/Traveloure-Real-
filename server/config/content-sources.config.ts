/**
 * Content sources — who may ACTIVATE a registry row (A6 decision 2A, ledger
 * `2026-10-01-a6-registry-surface`). Any admin may draft or edit a row; activating it is the terms
 * check, and the founder makes it. The allowlist is config (`CONTENT_SOURCE_ACTIVATOR_USER_IDS`,
 * comma-separated `users.id` values), never a literal.
 *
 * FAIL CLOSED: unset or empty ⇒ nobody may activate, and the surface says so. An unconfigured
 * environment never lets every admin activate by default.
 */
export function contentSourceActivatorIds(): string[] {
  return (process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mayActivateContentSource(userId: string | null | undefined): boolean {
  return !!userId && contentSourceActivatorIds().includes(userId);
}
