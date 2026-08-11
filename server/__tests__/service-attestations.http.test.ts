/**
 * D9 — ONBOARDING ATTESTATIONS (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67;
 * migration 197). Proven against the ALREADY-RUNNING dev server — real routes, real DB, real HTTP
 * (the service-logistics-capture.http / service-deliverable.http posture).
 *
 * Ruling 62, verbatim: *"D9: onboarding attestations keyed to method + category risk, inapplicable
 * ones OMITTED with a reason — the D2 honesty shape at the top of the funnel."* Concrete first
 * application: QA_PUNCH_LIST SS-5 / SIX_SIGMA_PROVIDER_PASS §3 R-1 — Japan deregulated paid
 * guiding on 2018-01-04, so no licence is required to trade, but 通訳案内士 is a protected TITLE.
 * The attestation is about the CLAIM, never a licensing gate.
 *
 * THE NEGATIVES ARE THE POINT. A1/A2 are the positive keying proofs; everything from A3 down is a
 * refusal:
 *   (A1) the applicable set is SERVER-DERIVED from method + category — a guide-category in-person
 *        listing gets title_claim + in-person safety, and NOT food handling.
 *   (A2) a `pdf` listing in the same guide category gets the title-claim attestation and NO
 *        in-person attestation — the method axis genuinely bites.
 *   (A3) §13 — a listing whose category is unset OMITS the category-keyed attestation WITH A
 *        STATED REASON, and never presents it as satisfied.
 *   (A4) affirming an applicable key persists it with a SERVER-STAMPED user id and timestamp.
 *   (A5) affirming an INAPPLICABLE key is a 400 and writes NOTHING.
 *   (A6) affirming an UNDECIDABLE (omitted-with-reason) key is a 400 carrying that reason.
 *   (A7) an unknown key is a 400 — the vocabulary is app-enforced (there is no DB CHECK).
 *   (A8) §14/§19 — a client-supplied `affirmedAt`/`affirmedBy`/`userId`/`serviceId` in the body is
 *        IGNORED: the row carries the session user and a server clock, not what was sent.
 *   (A9) a NON-OWNER cannot read or affirm — undifferentiated 404, and nothing is written.
 *   (A10) re-affirming is IDEMPOTENT: one row, the FIRST timestamp, the UNIQUE holds.
 *   (A11) the read surface returns affirmed state AND the omitted-with-reason entries, and an
 *        affirmation whose key stopped applying is still reported (a record is a fact).
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/service-attestations.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (verbatim shape from service-logistics-capture.http.test.ts) ─────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await readPool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-attestations] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = `d9-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Attest", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Category ids resolved from the LIVE taxonomy — never hardcoded uuids (they differ per bench). */
async function categoryIdByKey(key: string): Promise<string> {
  const r = await readPool.query(`SELECT id FROM service_categories WHERE category_key = $1`, [key]);
  assert.equal(r.rowCount, 1, `service_categories row for category_key='${key}' must exist on this bench`);
  return r.rows[0].id;
}

async function createService(
  cookie: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await api("/api/provider/services", cookie, "POST", {
    serviceName: `D9 attestation ${RUN}`,
    description: "ruling-67 attestation fixture",
    price: "120.00",
    priceType: "fixed",
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Karasuma exit",
    status: "draft",
    location: "Kyoto",
    ...extra,
  });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const id = ((await res.json()) as any).id as string;
  createdServiceIds.push(id);
  return id;
}

/** Reads the affirmation rows straight from the DB — storage truth, not the response echo. */
async function attestationRows(serviceId: string) {
  const r = await readPool.query(
    `SELECT attestation_key, affirmed_at, affirmed_by FROM service_attestations
      WHERE service_id = $1 ORDER BY attestation_key`,
    [serviceId],
  );
  return r.rows as Array<{ attestation_key: string; affirmed_at: Date; affirmed_by: string | null }>;
}

let provider: Actor;
let stranger: Actor;
let guideCategoryId: string;
let photoCategoryId: string;
let foodCategoryId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);
  await assertDisposableDb();

  // Fail LOUDLY (never silently pass) if migration 197 has not been applied to this database —
  // a new migration only runs on a FULL server restart.
  const tbl = await readPool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'service_attestations'`,
  );
  assert.equal(
    tbl.rowCount,
    1,
    "migration 197 has not been applied to this database — restart the dev server so runMigrations() runs",
  );

  provider = await registerActor("provider");
  stranger = await registerActor("stranger");
  // Same earner-role promotion every other provider-surface suite does (the EARNER_SELF_SERVICE
  // RBAC backstop refuses a freshly-registered non-earner before the route itself is reached).
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = ANY($1)`, [
    [provider.id, stranger.id],
  ]);

  guideCategoryId = await categoryIdByKey("tour_guide");
  photoCategoryId = await categoryIdByKey("photography");
  foodCategoryId = await categoryIdByKey("private_chef");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM service_attestations WHERE service_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── (A1) the set is SERVER-DERIVED from method + category ───────────────────────────────────

test("D9-A1: a guide-category IN-PERSON listing is keyed title_claim + in-person safety, and NOT food", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie);
  assert.equal(res.status, 200, `read failed: ${await res.clone().text()}`);
  const body = (await res.json()) as any;

  const keys = body.applicable.map((a: any) => a.key).sort();
  assert.deepEqual(keys, ["in_person_safety_basics", "title_claim_honesty"]);
  // Both axes decided, so NOTHING is omitted — the honest state is silence, not a caveat.
  assert.deepEqual(body.omitted, []);
  // A food attestation must not appear at all for a guide category (an omission entry would
  // still read as "this could apply to you" — the delivery_asset precedent).
  assert.ok(!keys.includes("food_safety_disclosure"));

  // The catalog copy travels with the applicable set, in BOTH locales (ruling 60 system A).
  const title = body.applicable.find((a: any) => a.key === "title_claim_honesty");
  assert.match(title.body.en, /通訳案内士/, "the EN body names the protected title verbatim");
  assert.match(title.body.ja, /通訳案内士/);
  assert.ok(title.body.en.length > 40 && title.body.ja.length > 20);
  assert.equal(title.affirmedAt, null, "nothing is affirmed until the provider affirms it");
});

// ── (A2) the METHOD axis genuinely bites ────────────────────────────────────────────────────

test("D9-A2: the SAME guide category delivered as pdf keeps title_claim and drops the in-person one", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "pdf",
    meetingPoint: null,
  });

  const body = (await (await api(`/api/provider/services/${id}/attestations`, provider.cookie)).json()) as any;
  const keys = body.applicable.map((a: any) => a.key);
  assert.deepEqual(keys, ["title_claim_honesty"], `expected title-claim only, got ${JSON.stringify(keys)}`);
  assert.ok(
    !keys.includes("in_person_safety_basics"),
    "a pdf listing must get NO in-person attestation — nobody is met in person",
  );
  assert.deepEqual(body.omitted, [], "both axes are known, so nothing is undecidable");
});

test("D9-A2b: a food category delivered IN PERSON is keyed food handling; the same category as pdf is not", async () => {
  const inPerson = await createService(provider.cookie, {
    categoryId: foodCategoryId,
    deliveryMethod: "in_person",
  });
  const remote = await createService(provider.cookie, {
    categoryId: foodCategoryId,
    deliveryMethod: "pdf",
    meetingPoint: null,
  });

  const a = (await (await api(`/api/provider/services/${inPerson}/attestations`, provider.cookie)).json()) as any;
  const b = (await (await api(`/api/provider/services/${remote}/attestations`, provider.cookie)).json()) as any;

  assert.deepEqual(
    a.applicable.map((x: any) => x.key).sort(),
    ["food_safety_disclosure", "in_person_safety_basics"],
  );
  // A recipe pdf serves nobody food — BOTH axes are required for this one.
  assert.deepEqual(b.applicable.map((x: any) => x.key), []);
  assert.deepEqual(b.omitted, [], "a known-negative on either axis settles it — no caveat needed");
});

// ── (A3) §13 — insufficient data is OMITTED WITH A REASON, never guessed ────────────────────

test("D9-A3: a listing with NO category omits the category-keyed attestations with a stated reason", async () => {
  const id = await createService(provider.cookie, { deliveryMethod: "in_person" });

  const body = (await (await api(`/api/provider/services/${id}/attestations`, provider.cookie)).json()) as any;

  // The method axis is known, so the in-person attestation still applies…
  assert.deepEqual(body.applicable.map((a: any) => a.key), ["in_person_safety_basics"]);
  // …and the category-keyed ones are OMITTED WITH A REASON, never presented as satisfied.
  const omitted = Object.fromEntries(body.omitted.map((o: any) => [o.key, o]));
  assert.ok(omitted.title_claim_honesty, "title_claim must be omitted, not silently dropped");
  assert.equal(omitted.title_claim_honesty.code, "no_category");
  assert.match(omitted.title_claim_honesty.reason.en, /no category/i);
  assert.ok(omitted.title_claim_honesty.reason.en.length > 20, "the reason must be a real sentence");
  // The reason is LOCALIZED like the catalog copy — an English sentence inside a Japanese card
  // is the mixed-copy failure I18N-2 names, and this is the line a provider most needs to read.
  assert.ok(/[぀-ヿ一-龯]/.test(omitted.title_claim_honesty.reason.ja), "the reason carries JA too");
  assert.ok(omitted.food_safety_disclosure, "food handling is undecidable without a category too");
  // A reason must fit the KEY it is attached to, not be one generic sentence pasted twice —
  // found by the live wizard probe, where the shared string described the wrong attestation.
  assert.notEqual(
    omitted.title_claim_honesty.reason.en,
    omitted.food_safety_disclosure.reason.en,
    "each omission states what ITS OWN missing signal would have decided",
  );
  assert.match(omitted.title_claim_honesty.reason.en, /title-claim/i);
  assert.match(omitted.food_safety_disclosure.reason.en, /food or drink/i);

  // §13's whole point: an omitted key is NOT reported as compliant anywhere in the response.
  const affirmedKeys = [
    ...body.applicable.filter((a: any) => a.affirmedAt).map((a: any) => a.key),
    ...body.affirmedOther.map((a: any) => a.key),
  ];
  assert.ok(!affirmedKeys.includes("title_claim_honesty"));
});

// ── (A4) affirming persists with a SERVER-stamped user + timestamp ──────────────────────────

test("D9-A4: affirming an applicable key persists it with the SESSION user and a server clock", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const before = new Date();
  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty"],
  });
  assert.equal(res.status, 200, `affirm failed: ${await res.clone().text()}`);
  const after = new Date();

  const rows = await attestationRows(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attestation_key, "title_claim_honesty");
  assert.equal(rows[0].affirmed_by, provider.id, "affirmed_by is the SESSION user (§14)");
  const at = new Date(rows[0].affirmed_at);
  assert.ok(
    at.getTime() >= before.getTime() - 5000 && at.getTime() <= after.getTime() + 5000,
    `affirmed_at must be the server clock at the time of the call, got ${at.toISOString()}`,
  );

  // …and the response hands the state back for the wizard to re-render.
  const body = (await res.json()) as any;
  const hit = body.applicable.find((a: any) => a.key === "title_claim_honesty");
  assert.ok(hit.affirmedAt, "the response reports the affirmation");
  assert.equal(hit.affirmedBy, provider.id);
});

// ── (A5) affirming an INAPPLICABLE key is refused ───────────────────────────────────────────

test("D9-A5: affirming an attestation that does NOT apply is a 400 and writes nothing", async () => {
  const id = await createService(provider.cookie, {
    categoryId: photoCategoryId, // not a guide category, not food
    deliveryMethod: "in_person",
  });

  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty"],
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
  const body = (await res.json()) as any;
  assert.equal(body.code, "ATTESTATION_NOT_APPLICABLE");
  assert.equal(body.key, "title_claim_honesty");

  assert.deepEqual(await attestationRows(id), [], "a refused affirmation writes NOTHING");
});

test("D9-A5b: one inapplicable key in a batch refuses the WHOLE batch — no partial write", async () => {
  const id = await createService(provider.cookie, {
    categoryId: photoCategoryId,
    deliveryMethod: "in_person",
  });

  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    // in_person_safety_basics DOES apply here; title_claim_honesty does not.
    affirm: ["in_person_safety_basics", "title_claim_honesty"],
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
  assert.deepEqual(
    await attestationRows(id),
    [],
    "the applicable half must NOT be written when the batch is refused — all or nothing",
  );
});

// ── (A6) affirming an UNDECIDABLE key is refused, carrying the reason ───────────────────────

test("D9-A6: affirming an OMITTED (undecidable) key is a 400 that states the reason", async () => {
  const id = await createService(provider.cookie, { deliveryMethod: "in_person" }); // no category

  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty"],
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
  const body = (await res.json()) as any;
  assert.equal(body.code, "ATTESTATION_UNDECIDABLE");
  assert.equal(body.omissionCode, "no_category");
  assert.match(body.reason, /no category/i);
  assert.deepEqual(await attestationRows(id), []);
});

// ── (A7) the vocabulary is app-enforced (there is NO DB CHECK behind it) ────────────────────

test("D9-A7: an unknown attestation key is a 400 — the vocabulary is app-enforced", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["i_am_definitely_certified"],
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
  assert.equal(((await res.json()) as any).code, "UNKNOWN_ATTESTATION");
  assert.deepEqual(await attestationRows(id), []);
});

// ── (A8) §14/§19 — client-supplied identity/timestamp are IGNORED ───────────────────────────

test("D9-A8: a client-supplied affirmedAt / affirmedBy / userId / serviceId is IGNORED (§14/§19)", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });
  const otherId = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const forged = new Date("2001-01-01T00:00:00Z").toISOString();
  const res = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty"],
    // Every privileged field a denylist body would have let through:
    affirmedAt: forged,
    affirmedBy: stranger.id,
    userId: stranger.id,
    serviceId: otherId,
    id: crypto.randomUUID(),
  });
  assert.equal(res.status, 200, `affirm failed: ${await res.clone().text()}`);

  const rows = await attestationRows(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].affirmed_by, provider.id, "the affirming user is the SESSION, not the body");
  assert.notEqual(
    new Date(rows[0].affirmed_at).getUTCFullYear(),
    2001,
    "a client-supplied affirmedAt must never reach the row",
  );
  assert.deepEqual(
    await attestationRows(otherId),
    [],
    "a body-supplied serviceId must never redirect the write — the path owns the row",
  );
});

// ── (A9) non-owner — undifferentiated 404 on BOTH verbs ─────────────────────────────────────

test("D9-A9: a NON-OWNER can neither read nor affirm — undifferentiated 404, nothing written", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const read = await api(`/api/provider/services/${id}/attestations`, stranger.cookie);
  assert.equal(read.status, 404, `expected 404, got ${read.status}`);

  const write = await api(`/api/provider/services/${id}/attestations`, stranger.cookie, "POST", {
    affirm: ["title_claim_honesty"],
  });
  assert.equal(write.status, 404, `expected 404, got ${write.status}: ${await write.clone().text()}`);
  assert.deepEqual(await attestationRows(id), [], "a stranger's affirmation writes NOTHING");

  // …and an UNAUTHENTICATED caller never reaches the handler at all.
  const anon = await api(`/api/provider/services/${id}/attestations`, undefined, "POST", {
    affirm: ["title_claim_honesty"],
  });
  assert.ok(anon.status === 401 || anon.status === 403, `expected 401/403, got ${anon.status}`);
  assert.deepEqual(await attestationRows(id), []);
});

// ── (A10) re-affirming is IDEMPOTENT ────────────────────────────────────────────────────────

test("D9-A10: re-affirming is idempotent — one row, the FIRST timestamp, the UNIQUE holds", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });

  const first = await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty", "in_person_safety_basics"],
  });
  assert.equal(first.status, 200);
  const firstRows = await attestationRows(id);
  assert.equal(firstRows.length, 2);
  const firstStamp = new Date(firstRows[1].affirmed_at).getTime(); // title_claim_honesty (sorted)

  // Concurrent replay — the double-click / retry shape, not just a sequential repeat.
  const replays = await Promise.all([
    api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
      affirm: ["title_claim_honesty", "in_person_safety_basics"],
    }),
    api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
      affirm: ["title_claim_honesty"],
    }),
    api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
      affirm: ["in_person_safety_basics"],
    }),
  ]);
  for (const r of replays) assert.equal(r.status, 200, `replay failed: ${await r.clone().text()}`);

  const rows = await attestationRows(id);
  assert.equal(rows.length, 2, `re-affirming must never mint a duplicate row, got ${rows.length}`);
  assert.equal(
    new Date(rows[1].affirmed_at).getTime(),
    firstStamp,
    "the FIRST affirmation's timestamp survives — a replay never re-dates the record",
  );

  // The UNIQUE is the structural guard, not the application logic — prove it is really there.
  await assert.rejects(
    () =>
      readPool.query(
        `INSERT INTO service_attestations (id, service_id, attestation_key, affirmed_at)
         VALUES ($1, $2, 'title_claim_honesty', now())`,
        [crypto.randomUUID(), id],
      ),
    /duplicate key|unique/i,
    "the (service_id, attestation_key) UNIQUE must reject a second row at the DB level",
  );
});

// ── (A11) the read surface tells the whole truth ────────────────────────────────────────────

test("D9-A11: the read returns affirmed state, omitted-with-reason, and records that stopped applying", async () => {
  const id = await createService(provider.cookie, {
    categoryId: guideCategoryId,
    deliveryMethod: "in_person",
  });
  await api(`/api/provider/services/${id}/attestations`, provider.cookie, "POST", {
    affirm: ["title_claim_honesty", "in_person_safety_basics"],
  });

  let body = (await (await api(`/api/provider/services/${id}/attestations`, provider.cookie)).json()) as any;
  assert.equal(body.applicable.length, 2);
  assert.ok(body.applicable.every((a: any) => a.affirmedAt), "both read back as affirmed");
  assert.deepEqual(body.affirmedOther, []);

  // Now the provider switches this listing to a remote delivery method. The in-person
  // attestation stops APPLYING — but the fact that they made it does not stop being true.
  const patch = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    deliveryMethod: "pdf",
  });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);

  body = (await (await api(`/api/provider/services/${id}/attestations`, provider.cookie)).json()) as any;
  assert.deepEqual(body.applicable.map((a: any) => a.key), ["title_claim_honesty"]);
  assert.deepEqual(
    body.affirmedOther.map((a: any) => a.key),
    ["in_person_safety_basics"],
    "an affirmation whose key stopped applying is still reported — a record is a fact (§13)",
  );
  // The row itself is untouched: applicability is re-derived, never stored.
  const rows = await attestationRows(id);
  assert.equal(rows.length, 2);

  // And an undecidable listing reports its omission on the READ surface too (not only on write).
  const bare = await createService(provider.cookie, { deliveryMethod: "in_person" });
  const bareBody = (await (await api(`/api/provider/services/${bare}/attestations`, provider.cookie)).json()) as any;
  assert.ok(bareBody.omitted.length >= 1);
  assert.ok(bareBody.omitted.every((o: any) => typeof o.reason?.en === "string" && o.reason.en.length > 10));
});
