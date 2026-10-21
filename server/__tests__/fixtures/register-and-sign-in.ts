/**
 * AUTH-1 fix 3a (ledger `2026-10-16-auth1-3a-register-and-sign-in`): the ONE way a server suite creates a
 * signed-in actor over HTTP (CLAUDE.md §18 rule 1 — one implementation, callers).
 *
 * WHY. AUTH-1 fix 3b makes `POST /api/auth/register` answer the SAME neutral 202 for a new and an existing
 * address, with no session, user id or email in the body. A suite that took its cookie and its user id from
 * the register response stops working the moment that lands. So every suite registers, then signs in through
 * `POST /api/auth/login` and takes the cookie and the id from THAT response — which works both before 3b
 * (register 201 + session) and after it (register 202, no session).
 *
 * What it does NOT do: it reads nothing from the register body, and it never treats a register refusal as
 * success — any status outside 2xx fails with the server's own text. A suite that is testing REGISTRATION
 * itself (its status, its body, its refusals) calls the endpoint directly, not this helper.
 */
import assert from "node:assert/strict";

export interface SignedInActor {
  id: string;
  email: string;
  cookie: string;
  /** The login response's `user` object, for suites that read the role or names back. */
  user: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null; role?: string | null };
}

export interface RegisterAndSignInOptions {
  baseUrl: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  /** Extra register-body fields a suite already sends (`userType`, `intent`, `qaCode`, `signupSource`, …). */
  extra?: Record<string, unknown>;
  /**
   * S-09: suites that sign in through this helper get a verified address, so the
   * hold screen does not take over. Pass true only when the test is about the hold.
   */
  leaveUnverified?: boolean;
}

async function stampEmailVerified(email: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("registerAndSignIn requires DATABASE_URL to record email verification");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "UPDATE users SET email_verified = NOW() WHERE lower(email) = lower($1) AND email_verified IS NULL",
      [email],
    );
  } finally {
    await client.end();
  }
}

export async function registerAndSignIn(options: RegisterAndSignInOptions): Promise<SignedInActor> {
  const { baseUrl, email, password } = options;
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      firstName: options.firstName ?? "Test",
      lastName: options.lastName ?? "Actor",
      ...(options.extra ?? {}),
    }),
  });
  if (reg.status < 200 || reg.status >= 300) {
    assert.fail(`register(${email}) failed (${reg.status}): ${await reg.text()}`);
  }
  await reg.arrayBuffer().catch(() => undefined);
  if (!options.leaveUnverified) await stampEmailVerified(email);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await login.text();
  if (login.status !== 200) assert.fail(`sign-in(${email}) after register failed (${login.status}): ${text}`);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie, `sign-in(${email}) must set a session cookie`);
  const body = JSON.parse(text) as { user?: SignedInActor["user"] };
  const id = body?.user?.id;
  assert.ok(id, `sign-in(${email}) must return the user id, got ${text}`);
  return { id, email, cookie: setCookie.split(";")[0], user: body.user! };
}
