/**
 * ONE registered-actor fixture for the HTTP + DB suites (CLAUDE.md §18 rule 1 — one
 * implementation, callers).
 *
 * WHY THIS EXISTS. These suites create their actor with `POST /api/auth/register`, which
 * runs IN THE SERVER PROCESS, and then insert every dependent fixture row (a
 * `provider_services` owner row, a room, a listing) FROM THE TEST PROCESS. Nothing in
 * between confirmed the actor was visible to the test's own connection, so the dependent
 * INSERT raced the register and died on
 * `provider_services_user_id_users_id_fk … Key (user_id)=(…) is not present in table "users"`
 * before a single assertion ran — non-deterministically. `docs/lane-reports/
 * 2026-09-15-orphan-triage.md` §6 measured it on two suites: 0/13 on six runs and 13/13 on
 * two for `availability-model`, 1/7 on three runs and 8/8 on one for `s11-stay-booking`.
 * When the race does not bite, both suites are fully green — so what was missing was a
 * precondition, not an assertion.
 *
 * THE REPAIR IS A READ-BACK, and deliberately NOT a sleep and NOT a retry loop around the
 * assertion. §6's own measurements say why: a bare 50 ms `setTimeout` in the same place was
 * 13/13 on one run and 0/13 on another, while ONE extra round-trip between the register and
 * the fixture insert was 13/13. So this polls with real SELECT round-trips on the TEST's
 * connection and never calls `setTimeout`; the round-trip is the only thing that has been
 * shown to work, and a timer would be a guess dressed as a fix.
 *
 * §13 — THE FAILURE MODES ARE DIFFERENT FACTS AND ARE REPORTED AS SUCH. "the register did
 * not return 201", "the actor never became visible to this connection within N reads" and
 * "the role UPDATE matched no row" are three different things; each throws with its own
 * sentence rather than being funnelled into one FK error raised much later by an unrelated
 * INSERT. The role UPDATE in particular used to be able to match ZERO rows in silence, which
 * is how the race stayed invisible until it broke a foreign key two statements later.
 *
 * STATED NEGATIVE SPACE: this proves the actor row is readable by the TEST process's
 * connection. It does not prove the server's session store has the cookie live yet, and it
 * says nothing about any other row the register handler may write.
 */
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../../db";

export interface RegisteredActor {
  id: string;
  email: string;
  cookie: string;
}

/** Bounded by READS, not by wall-clock: each attempt is one real round-trip. */
const MAX_READ_BACKS = 50;

/**
 * Register an actor over HTTP, then read it back on the caller's own DB connection before
 * returning, so a dependent fixture insert cannot outrun it.
 */
export async function registerActorWithReadBack(options: {
  baseUrl: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Optional role to stamp once the row is visible. The UPDATE is asserted to match. */
  role?: string;
  db?: typeof defaultDb;
}): Promise<RegisteredActor> {
  const { baseUrl, email, password, firstName, lastName, role } = options;
  const db = options.db ?? defaultDb;

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  if (res.status !== 201) {
    assert.fail(`register(${email}) failed (${res.status}): ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, `register(${email}) must set a session cookie`);
  const body = (await res.json()) as { user?: { id?: string } };
  const id = body?.user?.id;
  assert.ok(id, `register(${email}) must return the created user id, got ${JSON.stringify(body)}`);

  let visible = false;
  for (let attempt = 0; attempt < MAX_READ_BACKS; attempt += 1) {
    const rows = await db.execute(sql`SELECT id FROM users WHERE id = ${id}`);
    if (rows.rows.length > 0) {
      visible = true;
      break;
    }
  }
  assert.ok(
    visible,
    `register(${email}) returned user ${id}, but this connection could not read it back after ` +
      `${MAX_READ_BACKS} reads — a dependent fixture insert would fail its users foreign key`,
  );

  if (role) {
    const updated = await db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${id}`);
    assert.equal(
      updated.rowCount,
      1,
      `role UPDATE for ${email} (${id}) matched ${updated.rowCount} rows, expected exactly 1`,
    );
  }

  return { id, email, cookie: setCookie!.split(";")[0] };
}
