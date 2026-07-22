/**
 * Integration tests for the guest concierge claim flow.
 * Run with: npx tsx scripts/test-concierge-claim.ts
 * Requires a running server on localhost:5000 and DATABASE_URL set.
 */
import { createHmac } from "crypto";
import pg from "pg";

const BASE = "http://localhost:5000";
const DB_URL = process.env.DATABASE_URL!;
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-fallback-secret";
const TS = Date.now();

// ── Helpers ──────────────────────────────────────────────────────────────────

type Jar = Record<string, string>;

async function apiFetch(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  jar: Jar = {}
): Promise<{ status: number; body: any; jar: Jar }> {
  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  for (const c of (res.headers as any).getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  const ct = res.headers.get("content-type") ?? "";
  let body: any = null;
  try { body = ct.includes("json") ? await res.json() : await res.text(); } catch {}
  return { status: res.status, body, jar };
}

async function register(email: string, password = "TestPass123!") {
  const jar: Jar = {};
  const r = await apiFetch("/api/auth/register", {
    method: "POST",
    body: { email, password, firstName: "Test", lastName: "Claim" },
  }, jar);
  if (r.status !== 201 && r.status !== 200)
    throw new Error(`register failed ${r.status}: ${JSON.stringify(r.body)}`);
  return { jar, userId: r.body?.user?.id as string };
}

async function login(email: string, password = "TestPass123!") {
  const jar: Jar = {};
  const r = await apiFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
  }, jar);
  if (r.status !== 200) throw new Error(`login failed ${r.status}: ${JSON.stringify(r.body)}`);
  return { jar, userId: r.body?.user?.id as string };
}

async function guestFullPick(): Promise<{
  requestId: string;
  claimToken: string;
  coordinationId?: string;
  patchBody: any;
}> {
  const jar: Jar = {};
  const cr = await apiFetch("/api/concierge/requests", {
    method: "POST",
    body: { intent: `Claim-flow test ${TS}`, eventType: "wedding" },
  }, jar);
  if (cr.status !== 201) throw new Error(`create failed ${cr.status}: ${JSON.stringify(cr.body)}`);
  const requestId: string = cr.body.id;

  const pr = await apiFetch(`/api/concierge/requests/${requestId}`, {
    method: "PATCH",
    body: { chosenTier: "full" },
  }, jar);
  if (pr.status !== 200) throw new Error(`patch failed ${pr.status}: ${JSON.stringify(pr.body)}`);

  const claimToken: string = pr.body.claimToken;
  if (!claimToken) throw new Error("PATCH did not return claimToken for guest request");

  return { requestId, claimToken, coordinationId: pr.body.coordinationId, patchBody: pr.body };
}

// Direct DB client for state verification
const dbClient = new pg.Client({ connectionString: DB_URL });
await dbClient.connect();

async function dbRow(requestId: string) {
  const { rows } = await dbClient.query(
    `SELECT cr.id, cr.user_id, cr.chosen_tier, cr.status,
            cs.id AS cs_id, cs.status AS cs_status,
            (SELECT count(*) FROM coordination_states cs2
               WHERE (cs2.user_request->>'conciergeRequestId') = cr.id::text
            )::int AS cs_count
     FROM concierge_requests cr
     LEFT JOIN coordination_states cs
       ON (cs.user_request->>'conciergeRequestId') = cr.id::text
     WHERE cr.id = $1`,
    [requestId]
  );
  return rows[0] ?? null;
}

// Simple pass/fail tracking
const results: { name: string; pass: boolean; notes: string[] }[] = [];

function test(name: string) {
  const notes: string[] = [];
  const entry = { name, pass: false, notes };
  results.push(entry);
  return {
    note: (s: string) => { notes.push(s); console.log(`    ${s}`); },
    pass: () => { entry.pass = true; console.log(`  → ${name}: PASS ✓\n`); },
    fail: (msg: string) => { notes.push(`FAIL: ${msg}`); console.log(`  → ${name}: FAIL ✗  ${msg}\n`); },
  };
}

// ── SERVER-SIDE expected token (mirrors makeClaimToken in concierge.routes.ts) ──
function expectedToken(requestId: string) {
  return createHmac("sha256", SESSION_SECRET)
    .update(`concierge-claim:${requestId}`)
    .digest("hex");
}

// =============================================================================
// TEST 1: VALID CLAIM
// =============================================================================
console.log("═══ TEST 1: VALID CLAIM ═══");
{
  const t = test("TEST 1: VALID CLAIM");
  const { requestId, claimToken, coordinationId } = await guestFullPick();
  t.note(`requestId     = ${requestId}`);
  t.note(`claimToken    = ${claimToken.slice(0, 20)}…`);
  t.note(`coordinationId (patch) = ${coordinationId ?? "(absent — correct for guest)"}`);

  // Confirm the server token matches what we'd compute ourselves
  const localToken = expectedToken(requestId);
  t.note(`Server token matches local HMAC: ${claimToken === localToken}`);

  const { jar: jarA } = await register(`claim-a-${TS}@t.test`);
  const claim = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jarA);
  t.note(`Claim status = ${claim.status}  (expected 200)`);
  t.note(`coordinationId in response = ${claim.body?.coordinationId ?? "(absent)"}`);
  t.note(`userId in response = ${claim.body?.userId ?? "(absent)"}`);

  const row = await dbRow(requestId);
  t.note(`DB user_id  = ${row?.user_id ?? "null"}`);
  t.note(`DB status   = ${row?.status}`);
  t.note(`DB cs_id    = ${row?.cs_id ?? "null"}`);

  if (claim.status === 200 && row?.user_id && row?.cs_id) t.pass();
  else t.fail(`claim.status=${claim.status} user_id=${row?.user_id} cs_id=${row?.cs_id}`);
}

// =============================================================================
// TEST 2: TAMPERED TOKEN
// =============================================================================
console.log("═══ TEST 2: TAMPERED TOKEN ═══");
{
  const t = test("TEST 2: TAMPERED TOKEN");
  const { requestId, claimToken } = await guestFullPick();

  // Flip the last character of the token
  const tampered = claimToken.slice(0, -1) + (claimToken.endsWith("a") ? "b" : "a");
  t.note(`Original  token tail: …${claimToken.slice(-8)}`);
  t.note(`Tampered  token tail: …${tampered.slice(-8)}`);

  const { jar } = await register(`claim-tamper-${TS}@t.test`);
  const claim = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken: tampered },
  }, jar);
  t.note(`Claim status = ${claim.status}  (expected 403)`);
  t.note(`Error code   = ${claim.body?.error ?? "(none)"}`);

  const row = await dbRow(requestId);
  t.note(`DB user_id after tampered attempt = ${row?.user_id ?? "null"}`);

  if (claim.status === 403 && !row?.user_id) t.pass();
  else t.fail(`status=${claim.status} body=${JSON.stringify(claim.body)} user_id=${row?.user_id}`);
}

// =============================================================================
// TEST 3: CROSS-USER CLAIM ATTEMPT
// =============================================================================
console.log("═══ TEST 3: CROSS-USER CLAIM ATTEMPT ═══");
{
  const t = test("TEST 3: CROSS-USER CLAIM");
  const { requestId, claimToken } = await guestFullPick();

  // User A claims it successfully first
  const { jar: jarA, userId: idA } = await register(`claim-xa-${TS}@t.test`);
  const claimA = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jarA);
  t.note(`User A claim status = ${claimA.status}  (expected 200, userId=${idA})`);

  const rowAfterA = await dbRow(requestId);
  t.note(`DB user_id after User A claim = ${rowAfterA?.user_id}`);

  // User B tries to claim the same request using the SAME (valid) token
  // The HMAC is still correct for the requestId — only the cross-user check blocks it
  const { jar: jarB, userId: idB } = await register(`claim-xb-${TS}@t.test`);
  const claimB = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jarB);
  t.note(`User B claim status = ${claimB.status}  (expected 403, userId=${idB})`);
  t.note(`User B error code   = ${claimB.body?.error ?? "(none)"}`);

  const rowAfterB = await dbRow(requestId);
  t.note(`DB user_id after User B attempt = ${rowAfterB?.user_id} (should still be User A's id)`);

  const ownershipPreserved = rowAfterB?.user_id === rowAfterA?.user_id;
  t.note(`Ownership preserved: ${ownershipPreserved}`);

  if (claimA.status === 200 && claimB.status === 403 && ownershipPreserved) t.pass();
  else t.fail(`claimA=${claimA.status} claimB=${claimB.status} preserved=${ownershipPreserved}`);
}

// =============================================================================
// TEST 4: DUPLICATE CLAIM (idempotency + no duplicate coordination_states)
// =============================================================================
console.log("═══ TEST 4: DUPLICATE / REUSED CLAIM ═══");
{
  const t = test("TEST 4: DUPLICATE CLAIM");
  const { requestId, claimToken } = await guestFullPick();

  const { jar } = await register(`claim-dup-${TS}@t.test`);

  const claim1 = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jar);
  t.note(`First  claim status = ${claim1.status}  (expected 200)`);
  t.note(`First  claim cs_id  = ${claim1.body?.coordinationId ?? "(absent)"}`);

  const claim2 = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jar);
  t.note(`Second claim status = ${claim2.status}  (expected 200 — idempotent)`);
  t.note(`Second claim cs_id  = ${claim2.body?.coordinationId ?? "(absent)"}`);

  const row = await dbRow(requestId);
  t.note(`coordination_states rows for this request: ${row?.cs_count}  (expected 1)`);
  t.note(`cs_id first = ${claim1.body?.coordinationId}  cs_id second = ${claim2.body?.coordinationId}`);
  const sameId = claim1.body?.coordinationId === claim2.body?.coordinationId;
  t.note(`Same coordination_state returned both times: ${sameId}`);

  if (
    claim1.status === 200 &&
    claim2.status === 200 &&
    row?.cs_count === 1 &&
    sameId
  ) t.pass();
  else t.fail(`claim1=${claim1.status} claim2=${claim2.status} cs_count=${row?.cs_count} sameId=${sameId}`);
}

// =============================================================================
// TEST 5: OAUTH PATH — sessionStorage survives /api/login redirect
// =============================================================================
console.log("═══ TEST 5: OAUTH PATH — TOKEN PERSISTENCE ═══");
{
  const t = test("TEST 5: OAUTH PATH");
  // sessionStorage is browser-only and can't be read server-side; the OAuth
  // callback (/api/login → OIDC → /api/callback) is a server-side redirect
  // chain. We verify the CLIENT-SIDE mechanism:
  //
  // (a) The PATCH endpoint still returns a valid claimToken for a guest request
  //     (confirmed in TEST 1 already).
  // (b) handleReplitSignIn() writes traveloure_return_to to sessionStorage before
  //     redirecting (code-verified — the key won't be wiped by the server redirect
  //     because sessionStorage is tab-local to the browser and is not sent to the
  //     server; the OIDC redirect loop only affects cookies + query-params).
  // (c) After the OAuth callback, the page reloads under the same tab, so
  //     sessionStorage is still intact: both guestConciergeRequestId and
  //     guestConciergeClaimToken are present for useClaimGuestConcierge to consume.
  // (d) We simulate the post-OAuth landing by calling the claim endpoint directly
  //     (same as the hook would) to confirm the token is still accepted.

  const { requestId, claimToken } = await guestFullPick();
  t.note(`Guest request created: ${requestId}`);
  t.note(`claimToken prefix    : ${claimToken.slice(0, 20)}…`);

  // Simulate what useClaimGuestConcierge does immediately after OAuth resolves
  const { jar } = await register(`claim-oauth-${TS}@t.test`);
  const claimAfterOauth = await apiFetch(`/api/concierge/requests/${requestId}/claim`, {
    method: "POST",
    body: { claimToken },
  }, jar);
  t.note(`Simulated post-OAuth claim status = ${claimAfterOauth.status}  (expected 200)`);
  t.note(`coordinationId returned = ${claimAfterOauth.body?.coordinationId ?? "(absent)"}`);

  // Confirm: token generated during guest PATCH is still valid after session re-establishment
  t.note("Token validity after simulated redirect: the HMAC is stateless (SERVER_SECRET + requestId)");
  t.note("→ no server-side state was required — token survives any redirect chain intact");

  const row = await dbRow(requestId);
  t.note(`DB user_id after simulated OAuth claim = ${row?.user_id ?? "null"}`);

  if (claimAfterOauth.status === 200 && row?.user_id) t.pass();
  else t.fail(`status=${claimAfterOauth.status} user_id=${row?.user_id}`);
}

// =============================================================================
// TEST 6: Promise.all ISOLATION — cart failure doesn't block concierge claim
// =============================================================================
console.log("═══ TEST 6: Promise.all ISOLATION ═══");
{
  const t = test("TEST 6: Promise.all ISOLATION");
  // Simulate exactly what SignInModal does:
  //   await Promise.all([migrateGuestCart(), claimGuestConcierge()])
  //
  // We fire both in parallel:
  //   • Cart migration → use a non-existent guestSessionId (guaranteed to fail or noop)
  //   • Concierge claim → use a real requestId + valid token

  const { requestId, claimToken } = await guestFullPick();
  const { jar } = await register(`claim-parallel-${TS}@t.test`);

  // Run both in parallel just like Promise.all — one will fail (cart), one should succeed
  const [cartResult, claimResult] = await Promise.allSettled([
    // Cart migration with a bogus session (mimics a guest with no cart)
    apiFetch("/api/cart/migrate", {
      method: "POST",
      body: { guestSessionId: "nonexistent-session-00000000" },
    }, { ...jar }),
    // Real concierge claim
    apiFetch(`/api/concierge/requests/${requestId}/claim`, {
      method: "POST",
      body: { claimToken },
    }, jar),
  ]);

  const cartStatus = cartResult.status === "fulfilled" ? cartResult.value.status : `rejected(${cartResult.reason})`;
  const claimStatus = claimResult.status === "fulfilled" ? claimResult.value.status : `rejected(${claimResult.reason})`;
  t.note(`Cart migration result  : ${cartStatus}  (anything non-2xx is acceptable)`);
  t.note(`Concierge claim result : ${claimStatus}  (expected 200)`);

  const row = await dbRow(requestId);
  t.note(`DB user_id after parallel run = ${row?.user_id ?? "null"}`);
  t.note(`DB cs_id   after parallel run = ${row?.cs_id ?? "null"}`);

  const claimOk = claimResult.status === "fulfilled" && claimResult.value.status === 200;
  if (claimOk && row?.user_id) t.pass();
  else t.fail(`claimStatus=${claimStatus} user_id=${row?.user_id}`);
}

// =============================================================================
// SUMMARY
// =============================================================================
await dbClient.end();

console.log("═══════════════════════════════════════════════");
console.log("SUMMARY");
console.log("═══════════════════════════════════════════════");
let passed = 0;
for (const r of results) {
  const icon = r.pass ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${icon}  ${r.name}`);
  if (!r.pass) for (const n of r.notes) console.log(`         ${n}`);
  if (r.pass) passed++;
}
console.log("");
const all = results.length;
console.log(`RESULT: ${passed}/${all} ${passed === all ? "PASS — safe to merge" : "FAIL — do not merge"}`);
