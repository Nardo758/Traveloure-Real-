import crypto from "crypto";

/**
 * Fixed-work password check for email login (ledger `2026-10-21-login-enumeration`).
 *
 * This module does not look up accounts and does not create sessions. The route
 * looks the account up, then calls `verifyLoginCredential`. A later gate (fix-queue
 * S-09, enforce email verification) can sit beside this check in the route without
 * folding the comparison back into `emailAuth.ts`.
 *
 * Every call does one scrypt (Node defaults: N=16384, r=8, p=1, keylen 64 — the
 * same call `hashPassword` in emailAuth.ts makes) and one 64-byte comparison.
 * A usable stored hash is compared as-is. Anything else is compared against
 * `DUMMY_PASSWORD_HASH`. That path returns false even when the bytes match, so
 * the dummy hash can never authenticate an account.
 *
 * scrypt errors reject. Callers must not turn that into a credential failure.
 */

export const LOGIN_SCRYPT_KEYLEN = 64;

/**
 * salt (32 hex chars) + 64-byte scrypt key, produced with Node's default scrypt
 * parameters from a secret that is not stored. Shape matches a real password hash.
 */
export const DUMMY_PASSWORD_HASH =
  "4e9f117b129fe5f8dc0d2903079434d3:4f6bc3c90050f827916538eeafe7279105af920053421ca575059688cfd741556a2fafd0ef2599476f7bddb18ea2b8c160918fac74f2445750be98554bdc2566";

export interface UsablePasswordHash {
  salt: string;
  keyHex: string;
}

/** A stored hash the existing scrypt format can compare. Anything else is unusable. */
export function usablePasswordHash(hash: string | null | undefined): UsablePasswordHash | null {
  if (typeof hash !== "string") return null;
  const parts = hash.split(":");
  if (parts.length !== 2) return null;
  const [salt, keyHex] = parts;
  if (!salt || !/^[0-9a-f]{128}$/i.test(keyHex)) return null;
  return { salt, keyHex };
}

export interface LoginCredentialDeps {
  scrypt?: (password: string, salt: string, keylen: number) => Promise<Buffer>;
  timingSafeEqual?: (a: Buffer, b: Buffer) => boolean;
}

function scryptBuf(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

/**
 * True only when `storedHash` is usable and the password matches it.
 * The password is compared exactly — leading and trailing spaces are significant.
 */
export async function verifyLoginCredential(
  password: string,
  storedHash: string | null | undefined,
  deps: LoginCredentialDeps = {},
): Promise<boolean> {
  const usable = usablePasswordHash(storedHash);
  const target = usable ?? usablePasswordHash(DUMMY_PASSWORD_HASH);
  if (!target) {
    throw new Error("login dummy hash is not a usable scrypt hash");
  }

  const scrypt = deps.scrypt ?? scryptBuf;
  const equal = deps.timingSafeEqual ?? ((a, b) => crypto.timingSafeEqual(a, b));
  const derived = await scrypt(password, target.salt, LOGIN_SCRYPT_KEYLEN);
  const expected = Buffer.from(target.keyHex, "hex");
  if (derived.length !== LOGIN_SCRYPT_KEYLEN || expected.length !== LOGIN_SCRYPT_KEYLEN) {
    throw new Error("login credential derivation length mismatch");
  }
  const matches = equal(expected, derived);
  return usable !== null && matches;
}
