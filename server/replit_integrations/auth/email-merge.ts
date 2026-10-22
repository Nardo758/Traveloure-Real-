// LW-1-0 (ledger `2026-10-15-lw1-0-oauth-email-merge`): the ONE rule for attaching a first-time social
// sign-in to an EXISTING account that owns the same email.
//
// A first-time Replit or Facebook sign-in whose email matched an existing account used to be merged into
// that account with no check that the provider had verified the email — so anyone who could make a provider
// assert an address they do not own could sign in as that address's owner, an admin included. Now:
//
//   - a merge needs an EXPLICIT verified-email signal from the provider (`email_verified === true` on an
//     OIDC claim set; Facebook's passport profile carries no such signal, so Facebook never merges);
//   - a merge NEVER lands on a privileged account (any staff role), whatever the signal;
//   - a refused merge creates NO second account for the same email: the person is told to sign in with
//     their email and password (`EMAIL_SIGN_IN_REQUIRED`);
//   - merges and refusals are logged by user id only — never the email.
//
// Pure: no db, no logger. The callers (replitAuth.ts upsertUser, facebookAuth.ts facebookVerify) read the
// owner row, ask this, and act.

import { STAFF_ROLES } from "@shared/roles";

/** Roles a social sign-in may never be merged into. Every staff role, from shared/roles.ts. */
export const EMAIL_MERGE_REFUSED_ROLES: readonly string[] = STAFF_ROLES;

export type EmailMergeDecision =
  | { merge: true }
  | { merge: false; reason: "email_not_verified" | "privileged_account" };

// The refusal's code, URL parameter and sentence live in shared/ so the login page reads the same words.
export {
  EMAIL_SIGN_IN_REQUIRED,
  EMAIL_SIGN_IN_REQUIRED_PARAM,
  EMAIL_SIGN_IN_REQUIRED_MESSAGE,
} from "@shared/email-sign-in-required";

/**
 * An OIDC claim set's verified-email signal. Only the boolean `true` counts: a missing claim, `false`, or
 * the string "true" are all "not verified" — a signal we cannot read is not a signal.
 */
export function oidcEmailVerified(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.["email_verified"] === true;
}

export function decideEmailMerge(input: {
  emailVerified: boolean;
  owner: { role?: string | null };
}): EmailMergeDecision {
  // Privileged first: an admin account is never a merge target, even on a verified signal.
  if (EMAIL_MERGE_REFUSED_ROLES.includes(String(input.owner.role ?? ""))) {
    return { merge: false, reason: "privileged_account" };
  }
  if (input.emailVerified !== true) return { merge: false, reason: "email_not_verified" };
  return { merge: true };
}
