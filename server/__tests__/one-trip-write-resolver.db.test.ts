/**
 * V-29 — ONE TRIP-WRITE RESOLVER (punchlist V-29 = option B, decision-maker ruled 2026-09-15;
 * ledger `2026-09-15-v29-one-trip-write-resolver`).
 *
 * CLAUDE.md Locked Decision 42 **D17** rules ONE "may this person rewrite the plan?" predicate —
 * "a second 'may this person rewrite the plan?' test is the drift class §18 rule 1 names". There
 * were two, and they disagreed about THREE principals:
 *
 *   A  `getTripWriteRole` + `canMutateTrip` (server/utils/trip-role.ts) — the owner resolved ONLY
 *      through a `trip_collaborators` row (it never read `trips.user_id`), no author branch, no
 *      admin branch, so every caller bolted `isTripAuthor` on beside it.
 *   B  `authorizeTripLogistics(tripId, userId, route, { requireWriteAccess: true })`
 *      (server/utils/trip-logistics-auth.ts) — owner off the `trips` row, the §12 WRITE-status
 *      advisor (accepted/assigned, NEVER pending), the trip author, an audit-logged admin.
 *
 * B wins; A's write arm is DELETED (§18c — no caller remained). These proofs are about the
 * PREDICATE and the gates that read it, never about the optimizer, the item body or the money:
 * an optimizer RUN is mocked away entirely because what this lane changed is who may start one.
 *
 * BEHAVIOUR DELTA THE PROOFS PIN BY NAME
 *   (a) W1 — an OWNER WITH NO `trip_collaborators` ROW passes every moved gate. Under A they were
 *       403'd from their own plan; it did not bite on `main` only because every mint site wrote
 *       the row and a boot seed backfilled. W1's fixture trip is a RAW INSERT precisely so that
 *       row does not exist: the proof is that the predicate reads the column.
 *   (b) W4/W5 — the trip AUTHOR and an AUDIT-LOGGED ADMIN now pass, as they already did on
 *       reorder / expert-traveler-note / the D-19 proposal rails.
 *   W2 keeps §12 unweakened in both directions: `pending` is refused, `accepted` passes.
 *
 * NEGATIVE SPACE, stated because a guard is only as good as what it refuses to claim (§18d):
 *  • These are proofs about AUTHORIZATION. They assert nothing about what a passing caller may
 *    then write — the D4 `expert_note` strip, the plan-approval mode-flip and the D-4 authored
 *    price contract are pinned by `expert-work-protected.test.ts` and their own suites.
 *  • B's admin branch is audit-LOGGED, not audit-ROWED: there is no audit table on `main` (the
 *    dedicated audit-log lane is still filed), so W5 proves the admin passes and pins the interim
 *    logger call at the source. It does not claim a durable audit record exists.
 *  • W6 reads SOURCE. It can see that a gate calls the predicate; it cannot see that the gate runs
 *    before the write — that ordering is each handler's own, and the behavioural halves above are
 *    what make the static halves mean something about production.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key, no network, no server boot.
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/one-trip-write-resolver.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `v29-${RUN}-owner`,
  advisor: `v29-${RUN}-advisor`,
  stranger: `v29-${RUN}-stranger`,
  author: `v29-${RUN}-author`,
  admin: `v29-${RUN}-admin`,
  trip: `v29-${RUN}-trip`,
  authoredTrip: `v29-${RUN}-atrip`,
  item: `v29-${RUN}-item`,
};

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Source with block and line comments stripped — prose naming a symbol is not a call. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ── Disposable-DB guard (mirrors from-state-guards.db.test.ts; never defaults open) ───────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[one-trip-write-resolver] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/**
 * THE EIGHT RAILS THIS LANE MOVED, each named by the route label its handler passes to the
 * predicate. The labels are not decoration: they are what the admin audit line records, so a
 * handler that stops passing one stops being auditable.
 */
const MOVED_RAILS: Array<{ label: string; file: string; marker: string }> = [
  {
    label: "PATCH /api/trips/:tripId/itinerary-items/:itemId",
    file: "server/routes/trips.routes.ts",
    marker: 'router.patch("/api/trips/:tripId/itinerary-items/:itemId"',
  },
  {
    label: "DELETE /api/trips/:tripId/itinerary-items/:itemId",
    file: "server/routes/trips.routes.ts",
    marker: 'router.delete("/api/trips/:tripId/itinerary-items/:itemId"',
  },
  {
    label: "POST /api/itinerary-items/:id/backup",
    file: "server/routes/trips.routes.ts",
    marker: 'router.post("/api/itinerary-items/:id/backup"',
  },
  {
    label: "POST /api/itinerary-comparisons",
    file: "server/routes.ts",
    marker: 'app.post("/api/itinerary-comparisons", isAuthenticated',
  },
  {
    label: "POST /api/itinerary-comparisons/:id/generate",
    file: "server/routes.ts",
    marker: 'app.post("/api/itinerary-comparisons/:id/generate"',
  },
  {
    label: "POST /api/trips/:tripId/itinerary/optimize-order",
    file: "server/routes.ts",
    marker: 'app.post("/api/trips/:tripId/itinerary/optimize-order"',
  },
  {
    label: "POST /api/itinerary-comparisons/:id/apply-to-trip",
    file: "server/routes/plancard.routes.ts",
    marker: 'router.post("/api/itinerary-comparisons/:id/apply-to-trip"',
  },
  {
    label: "PATCH /api/transport-legs/:legId/status",
    file: "server/routes/plancard.routes.ts",
    marker: 'router.patch("/api/transport-legs/:legId/status"',
  },
];

/** Ask THE predicate the way every moved gate asks it. */
function mayRewrite(tripId: string, userId: string, label: string) {
  return authorizeTripLogistics(tripId, userId, label, { requireWriteAccess: true });
}

/** Every .ts under server/, tests and node_modules excluded. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      serverFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

before(async () => {
  await assertDisposableDb();
  for (const [id, role] of [
    [ids.owner, "traveler"],
    [ids.advisor, "local_expert"],
    [ids.stranger, "traveler"],
    [ids.author, "travel_expert"],
    [ids.admin, "admin"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'V29', ${role}, ${role})
    `);
  }

  // THE FIXTURE THAT CARRIES THE WHOLE POINT OF (a): a RAW INSERT, so this trip has NO
  // `trip_collaborators` owner row. `storage.createTrip` would have written one and hidden the
  // very disagreement V-29 settles.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.owner}, ${`V29 plan ${RUN}`}, 'Kyoto, Japan',
            '2027-05-01', '2027-05-06', 'draft')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, day_number, title, origin)
    VALUES (${ids.item}, ${ids.trip}, 1, ${`V29 item ${RUN}`}, 'traveler')
  `);

  // An AUTHORED build (ready-made §2): author_id present, user_id NULL — there is no traveler
  // principal at all, which is exactly the shape A could not express.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.authoredTrip}, NULL, ${ids.author}, ${`V29 authored ${RUN}`}, 'Kyoto, Japan',
            '2027-05-01', '2027-05-06', 'draft')
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.trip}, ${ids.authoredTrip})`);
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${ids.trip}, ${ids.authoredTrip})`);
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id IN (${ids.trip}, ${ids.authoredTrip})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.authoredTrip})`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`v29-${RUN}-%`}`);
});

// ── W1 ───────────────────────────────────────────────────────────────────────────────────────────

test("W1a: an owner with NO trip_collaborators row passes EVERY moved gate", async () => {
  const collab = await db.execute(
    sql`SELECT COUNT(*) AS n FROM trip_collaborators WHERE trip_id = ${ids.trip}`,
  );
  assert.equal(
    Number((collab.rows[0] as any).n),
    0,
    "fixture invalid: the proof requires a trip with no owner collaborator row",
  );
  for (const rail of MOVED_RAILS) {
    assert.equal(
      await mayRewrite(ids.trip, ids.owner, rail.label),
      null,
      `owner refused on ${rail.label} — the retired resolver's owner bug is back`,
    );
  }
});

test("W1b: that owner really can PATCH and DELETE their own item", async () => {
  // The route's own shape: gate, then the storage writer the handler calls. Nothing is
  // reimplemented — these are the same two objects the handler uses.
  assert.equal(await mayRewrite(ids.trip, ids.owner, MOVED_RAILS[0].label), null);
  const updated = await storage.updateItineraryItem(ids.item, { title: `V29 renamed ${RUN}` } as any);
  assert.equal((updated as any)?.title, `V29 renamed ${RUN}`);

  assert.equal(await mayRewrite(ids.trip, ids.owner, MOVED_RAILS[1].label), null);
  await storage.deleteItineraryItem(ids.item, { actorType: "traveler", actorId: ids.owner } as any);
  const gone = await storage.getItineraryItemByIdAndTrip(ids.item, ids.trip);
  assert.ok(gone == null, "the owner's delete did not land");
});

// ── W2 ───────────────────────────────────────────────────────────────────────────────────────────

test("W2: a PENDING advisor is refused on every moved gate; an ACCEPTED advisor passes", async () => {
  const advisorRow = await storage.createTripExpertAdvisor({
    tripId: ids.trip,
    localExpertId: ids.advisor,
    message: "V29 fixture assignment",
  } as any);
  const status = await db.execute(
    sql`SELECT status FROM trip_expert_advisors WHERE id = ${(advisorRow as any).id}`,
  );
  assert.equal((status.rows[0] as any).status, "pending", "fixture invalid: advisor must start pending");

  for (const rail of MOVED_RAILS) {
    const denial = await mayRewrite(ids.trip, ids.advisor, rail.label);
    assert.equal(denial?.status, 403, `§12 breached: a pending advisor may write ${rail.label}`);
  }

  await db.execute(
    sql`UPDATE trip_expert_advisors SET status = 'accepted' WHERE id = ${(advisorRow as any).id}`,
  );
  for (const rail of MOVED_RAILS) {
    assert.equal(
      await mayRewrite(ids.trip, ids.advisor, rail.label),
      null,
      `an accepted advisor was refused on ${rail.label}`,
    );
  }

  // 'assigned' is the admin lead-confirm status and is the other half of the WRITE allow-list.
  await db.execute(
    sql`UPDATE trip_expert_advisors SET status = 'assigned' WHERE id = ${(advisorRow as any).id}`,
  );
  assert.equal(await mayRewrite(ids.trip, ids.advisor, MOVED_RAILS[0].label), null);

  // 'rejected' denies — the allow-list fails closed.
  await db.execute(
    sql`UPDATE trip_expert_advisors SET status = 'rejected' WHERE id = ${(advisorRow as any).id}`,
  );
  assert.equal((await mayRewrite(ids.trip, ids.advisor, MOVED_RAILS[0].label))?.status, 403);
});

// ── W3 ───────────────────────────────────────────────────────────────────────────────────────────

test("W3: a stranger is refused, 403, with the predicate's own message", async () => {
  for (const rail of MOVED_RAILS) {
    const denial = await mayRewrite(ids.trip, ids.stranger, rail.label);
    assert.equal(denial?.status, 403, `stranger not refused on ${rail.label}`);
    assert.equal(denial?.message, "Not authorized to access this trip");
  }
  // An absent principal is 401, not 403 — the predicate's own split, unchanged by this lane.
  assert.equal((await mayRewrite(ids.trip, "", MOVED_RAILS[0].label))?.status, 401);
});

test("W3b: every moved gate answers a refusal with the shape it always answered", async () => {
  // The bodies are the routers' own local conventions: `{ message }` in the monolith and
  // trips.routes.ts, `{ error }` in plancard.routes.ts. A moved gate that quietly changed one
  // would break a client for no reason the ruling asked for.
  for (const rail of MOVED_RAILS) {
    const body = handlerSlice(rail.file, rail.marker);
    const expected = rail.file.endsWith("plancard.routes.ts") ? "{ error:" : "{ message:";
    assert.ok(
      codeOnly(body).includes(`res.status(denial.status).json(${expected} "Access denied" })`),
      `${rail.label} changed its refusal shape`,
    );
  }
});

// ── W4 ───────────────────────────────────────────────────────────────────────────────────────────

test("W4: the trip AUTHOR passes — delta (b), on a build with no traveler at all", async () => {
  for (const rail of MOVED_RAILS) {
    assert.equal(
      await mayRewrite(ids.authoredTrip, ids.author, rail.label),
      null,
      `the author was refused on ${rail.label}`,
    );
  }
  // …and authorship is a PRESENT-VALUE check: a different expert on the same authored build is not
  // an author, so the branch cannot be reached by the `null === null` shape it was written against.
  assert.equal((await mayRewrite(ids.authoredTrip, ids.stranger, MOVED_RAILS[0].label))?.status, 403);
});

// ── W5 ───────────────────────────────────────────────────────────────────────────────────────────

test("W5: an ADMIN passes — delta (b) — and the interim audit line is what records it", async () => {
  for (const rail of MOVED_RAILS) {
    assert.equal(
      await mayRewrite(ids.trip, ids.admin, rail.label),
      null,
      `the admin was refused on ${rail.label}`,
    );
  }
  // WHAT THE AUDIT IS, said plainly (§13): a structured logger line carrying the actor, the ROUTE
  // LABEL each moved gate now passes, and the trip. There is no audit TABLE on main and this lane
  // adds none, so the durable half is pinned at the source rather than asserted as a row.
  const authSrc = src("server/utils/trip-logistics-auth.ts");
  const fn = authSrc.match(/export async function authorizeTripLogistics[\s\S]*?\n\}/)![0];
  assert.match(fn, /user\?\.role === "admin"/);
  assert.match(fn, /logger\.info\(/);
  assert.match(fn, /actor: userId, route, tripId/);
  assert.match(fn, /admin-cross-trip-logistics/);
});

// ── W6 — static: ONE predicate ───────────────────────────────────────────────────────────────────

/** The text of one handler: from its registration marker to the next registered route. */
function handlerSlice(relFile: string, startMarker: string): string {
  const text = src(relFile);
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `handler not found: ${startMarker} in ${relFile}`);
  const rest = text.slice(start);
  const next = rest.slice(1).search(/\n\s*(?:app|router)\.(get|post|patch|put|delete)\(/);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

test("W6a: the retired resolver is GONE from its module", () => {
  const roleSrc = src("server/utils/trip-role.ts");
  assert.ok(!/export async function getTripWriteRole/.test(roleSrc), "getTripWriteRole is back");
  assert.ok(!/export function canMutateTrip/.test(roleSrc), "canMutateTrip is back");
  // The READ resolver survives untouched — §12 grants a PENDING advisor a read, deliberately.
  assert.match(roleSrc, /export async function getTripRole/);
  assert.match(roleSrc, /isTripAdvisor\(tripId, userId\)/);
});

test("W6b: NO file under server/ references the retired resolver (file-set pin)", () => {
  // Derived from the FILE SET with comments stripped, never a call-site count: a lane that moves
  // code does not break this pin, and prose explaining the retirement is not a reference.
  const offenders = serverFiles(path.join(REPO_ROOT, "server"))
    .filter((f) => /\b(getTripWriteRole|canMutateTrip)\s*\(/.test(codeOnly(fs.readFileSync(f, "utf8"))))
    .map((f) => f.slice(REPO_ROOT.length + 1));
  assert.deepEqual(offenders, [], "a second 'may this person rewrite the plan?' resolver is back");
});

test("W6c: every moved gate calls THE predicate with the §12 narrowing and its own route label", () => {
  for (const rail of MOVED_RAILS) {
    const code = codeOnly(handlerSlice(rail.file, rail.marker));
    assert.match(code, /authorizeTripLogistics\(/, `${rail.label}: the one predicate is missing`);
    assert.match(code, /requireWriteAccess:\s*true/, `${rail.label}: the §12 narrowing is missing`);
    assert.ok(code.includes(`"${rail.label}"`), `${rail.label}: the route label is missing`);
    // Every call in a moved gate carries the narrowing — a read-shaped second call beside the
    // narrowed one would still satisfy the two assertions above.
    const calls = (code.match(/authorizeTripLogistics\(/g) || []).length;
    const narrowed = (code.match(/requireWriteAccess:\s*true/g) || []).length;
    assert.equal(narrowed, calls, `${rail.label}: a call without requireWriteAccess: true`);
  }
});
