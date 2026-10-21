/**
 * AUTH-1 fix 3a (ledger `2026-10-16-auth1-3a-register-and-sign-in`): the ONE way a verify script creates a
 * fresh signed-in account through the app's own API.
 *
 * It registers (waiting out the register rate limiter once, as these scripts always have), lets the caller
 * act on the new row BEFORE the session exists (a role promotion, so the session's claims carry the role),
 * then signs in through `POST /api/auth/login` and takes the user id from the LOGIN response — never from
 * the register body. AUTH-1 fix 3b makes register answer the same neutral 202 for a new and an existing
 * address, with no session and no user id; this works before and after it.
 *
 * `req` is the script's own cookie-jar request function, so the session lands in the caller's jar.
 */
export type ScriptRequest = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; json?: any; text: string }>;

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

export async function registerAndSignIn(
  req: ScriptRequest,
  account: { email: string; password: string; firstName?: string; lastName?: string },
  options: { beforeSignIn?: () => Promise<void>; leaveUnverified?: boolean } = {},
): Promise<{ id: string }> {
  const body = {
    email: account.email,
    password: account.password,
    firstName: account.firstName ?? "Verify",
    lastName: account.lastName ?? "Script",
  };
  let reg = await req("POST", "/api/auth/register", body);
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s (limiter, not a failure)`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await req("POST", "/api/auth/register", body);
  }
  if (reg.status < 200 || reg.status >= 300) {
    throw new Error(`register failed for ${account.email}: ${reg.status} ${reg.text.slice(0, 200)}`);
  }
  if (options.beforeSignIn) await options.beforeSignIn();
  if (!options.leaveUnverified) await stampEmailVerified(account.email);
  const login = await req("POST", "/api/auth/login", { email: account.email, password: account.password });
  if (login.status !== 200) {
    throw new Error(`sign-in failed for ${account.email}: ${login.status} ${login.text.slice(0, 200)}`);
  }
  const id = login.json?.user?.id;
  if (!id) throw new Error(`sign-in for ${account.email} returned no user id: ${login.text.slice(0, 200)}`);
  return { id: String(id) };
}
