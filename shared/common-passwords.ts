/**
 * DX-4 common-password refusal.
 *
 * The bundled list is zxcvbn 4.4.2's `passwords` frequency list
 * (https://github.com/dropbox/zxcvbn, MIT), filtered to entries of 8 or more
 * characters and normalised to trimmed lower case. It is a local JSON data file;
 * there is no network call and no new dependency.
 */
import passwords from "./common-passwords.json" with { type: "json" };

export const COMMON_PASSWORD_ERROR = "This password is too common. Choose a different one.";

const COMMON_PASSWORDS = new Set<string>(
  (passwords as string[]).map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0),
);

/** Matching is on the trimmed, lower-cased password (D4). */
export function isCommonPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  return normalized.length > 0 && COMMON_PASSWORDS.has(normalized);
}
