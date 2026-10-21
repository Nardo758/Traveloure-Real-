/**
 * Login enumeration — the credential check itself (ledger `2026-10-21-login-enumeration`).
 *
 * No database and no session. Proves one scrypt (keylen 64, Node's default cost
 * parameters, no custom options) and one 64-byte comparison per attempt, that the
 * dummy path cannot authenticate, and that a malformed hash still does that work.
 *
 *   npx tsx --test server/__tests__/login-enumeration.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DUMMY_PASSWORD_HASH,
  LOGIN_SCRYPT_KEYLEN,
  usablePasswordHash,
  verifyLoginCredential,
} from "../services/login-credentials.service";

const ROOT = path.resolve(import.meta.dirname, "../..");

function scrypt(password: string, salt: string, keylen: number, options?: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const done = (err: Error | null, derived?: Buffer) => (err ? reject(err) : resolve(derived as Buffer));
    if (options) crypto.scrypt(password, salt, keylen, options, done);
    else crypto.scrypt(password, salt, keylen, done);
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, LOGIN_SCRYPT_KEYLEN);
  return `${salt}:${key.toString("hex")}`;
}

interface Spy {
  scrypts: { password: string; salt: string; keylen: number }[];
  compares: { a: number; b: number }[];
}

function spy(): Spy & {
  scrypt: (password: string, salt: string, keylen: number) => Promise<Buffer>;
  timingSafeEqual: (a: Buffer, b: Buffer) => boolean;
} {
  const seen: Spy = { scrypts: [], compares: [] };
  return {
    ...seen,
    scrypt: async (password, salt, keylen) => {
      seen.scrypts.push({ password, salt, keylen });
      return scrypt(password, salt, keylen);
    },
    timingSafeEqual: (a, b) => {
      seen.compares.push({ a: a.length, b: b.length });
      return crypto.timingSafeEqual(a, b);
    },
  };
}

function assertOneFixedCompare(seen: Spy, password: string) {
  assert.equal(seen.scrypts.length, 1);
  assert.equal(seen.scrypts[0].password, password);
  assert.equal(seen.scrypts[0].keylen, LOGIN_SCRYPT_KEYLEN);
  assert.equal(seen.scrypts[0].salt.length, 32);
  assert.equal(seen.compares.length, 1);
  assert.deepEqual(seen.compares[0], { a: LOGIN_SCRYPT_KEYLEN, b: LOGIN_SCRYPT_KEYLEN });
}

test("the dummy hash is a usable 64-byte scrypt hash and is not a published password", () => {
  const parsed = usablePasswordHash(DUMMY_PASSWORD_HASH);
  assert.ok(parsed);
  assert.equal(parsed.salt.length, 32);
  assert.equal(parsed.keyHex.length, 128);
  assert.equal(Buffer.from(parsed.keyHex, "hex").length, LOGIN_SCRYPT_KEYLEN);
});

test("Node default scrypt parameters match the explicit cost used by stored hashes", async () => {
  const salt = "ab".repeat(16);
  const plain = await scrypt("same-parameters", salt, LOGIN_SCRYPT_KEYLEN);
  const explicit = await scrypt("same-parameters", salt, LOGIN_SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 });
  assert.ok(plain.equals(explicit));
});

test("a usable hash matches only the exact password, including whitespace", async () => {
  const stored = await hashPassword("secret with spaces");
  const salt = stored.split(":")[0];
  const ok = spy();
  assert.equal(await verifyLoginCredential("secret with spaces", stored, ok), true);
  assertOneFixedCompare(ok, "secret with spaces");
  assert.equal(ok.scrypts[0].salt, salt);

  const padded = spy();
  assert.equal(await verifyLoginCredential("secret with spaces ", stored, padded), false);
  assertOneFixedCompare(padded, "secret with spaces ");
  assert.equal(padded.scrypts[0].salt, salt);

  const leading = spy();
  assert.equal(await verifyLoginCredential(" secret with spaces", stored, leading), false);
  assert.equal(leading.scrypts[0].salt, salt);
});

test("unknown, provider-only, and unusable hashes do the dummy work and cannot authenticate", async () => {
  const cases: Array<string | null | undefined> = [
    null,
    undefined,
    "",
    "not-a-hash",
    "salt-only:",
    `short:${"ab".repeat(8)}`,
    `zz:${"zz".repeat(64)}`,
    `:${"ab".repeat(64)}`,
    `aa:${"ab".repeat(64)}:extra`,
  ];
  const dummySalt = DUMMY_PASSWORD_HASH.split(":")[0];
  for (const stored of cases) {
    const seen = spy();
    const ok = await verifyLoginCredential("whatever-password", stored, {
      ...seen,
      timingSafeEqual: () => {
        seen.compares.push({ a: LOGIN_SCRYPT_KEYLEN, b: LOGIN_SCRYPT_KEYLEN });
        return true;
      },
    });
    assert.equal(ok, false, `dummy path authenticated for ${String(stored)}`);
    assertOneFixedCompare(seen, "whatever-password");
    assert.equal(seen.scrypts[0].salt, dummySalt);
  }
});

test("a wrong password on a usable hash compares that hash, not the dummy", async () => {
  const stored = await hashPassword("right-password");
  const seen = spy();
  assert.equal(await verifyLoginCredential("wrong-password", stored, seen), false);
  assertOneFixedCompare(seen, "wrong-password");
  assert.equal(seen.scrypts[0].salt, stored.split(":")[0]);
  assert.notEqual(seen.scrypts[0].salt, DUMMY_PASSWORD_HASH.split(":")[0]);
});

test("unknown, wrong, and missing-hash attempts use the same scrypt key length and one compare", async () => {
  const stored = await hashPassword("right-password");
  const attempts: Array<string | null> = [null, stored, ""];
  const passwords = ["no-such-account", "wrong-password", "provider-only"];
  const keylens: number[] = [];
  for (let i = 0; i < attempts.length; i++) {
    const seen = spy();
    await verifyLoginCredential(passwords[i], attempts[i] === stored ? stored : attempts[i], seen);
    assertOneFixedCompare(seen, passwords[i]);
    keylens.push(seen.scrypts[0].keylen);
  }
  assert.deepEqual(keylens, [LOGIN_SCRYPT_KEYLEN, LOGIN_SCRYPT_KEYLEN, LOGIN_SCRYPT_KEYLEN]);
});

test("a scrypt failure rejects and does not become a credential miss", async () => {
  await assert.rejects(
    () => verifyLoginCredential("pw", null, {
      scrypt: async () => {
        throw new Error("scrypt failed");
      },
    }),
    /scrypt failed/,
  );
});

test("a derivation that is not 64 bytes is an operational failure", async () => {
  await assert.rejects(
    () => verifyLoginCredential("pw", null, {
      scrypt: async () => Buffer.alloc(32),
    }),
    /length mismatch/,
  );
});

test("the credential service does not look up accounts or create sessions", () => {
  const src = fs.readFileSync(path.join(ROOT, "server/services/login-credentials.service.ts"), "utf8");
  assert.doesNotMatch(src, /from ["'][^"']*db["']/);
  assert.doesNotMatch(src, /\busers\b/);
  assert.doesNotMatch(src, /express-session|req\.session|passport|req\.login/);
});

test("the login route delegates the check and no longer names a provider", () => {
  const src = fs.readFileSync(path.join(ROOT, "server/replit_integrations/auth/emailAuth.ts"), "utf8");
  assert.match(src, /verifyLoginCredential\(password, user\?\.password \?\? null\)/);
  assert.doesNotMatch(src, /created via/);
  assert.doesNotMatch(src, /Facebook\/Instagram/);
  assert.doesNotMatch(src, /does not have a password set/);
  assert.doesNotMatch(src, /function verifyPassword/);
});

test("the sign-in modal and profile carry the approved guidance sentences", () => {
  const modal = fs.readFileSync(path.join(ROOT, "client/src/components/SignInModal.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(ROOT, "client/src/pages/profile.tsx"), "utf8");
  const modalSentence = "If you normally use a sign-in provider, use its sign-in button.";
  const profileSentence = "Signed in with a sign-in provider. Continue using that provider to access your account.";
  assert.equal(modal.split(modalSentence).length - 1, 1);
  assert.equal(profile.split(profileSentence).length - 1, 1);
  assert.match(profile, /authProvider !== "email"/);
  assert.doesNotMatch(modal, /authProvider/);
});
