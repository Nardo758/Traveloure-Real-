/**
 * S10 — BUNDLE COMPOSITION, EXECUTION-MAP GATE G4 (behavioural proof).
 *
 * G4 REC (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md): "keep the Workstation dialog, add real
 * component linking on the traveler page, method chip derived from components (FP-1's fix is the
 * interim), price stays no-auto-sum with the existing honest copy."
 *
 * This suite pins the PUBLIC READ (GET /api/services/:id, bundle branch — server/routes/content.
 * routes.ts): components already carry real ids (bundle_components, migration 151 — this was
 * NOT a schema gap), so the read now (a) sends EVERY component slot rather than silently
 * shrinking the list, with an unapproved/paused component reduced to name-only (no id, no link,
 * no image, no method — §13), and (b) derives the displayed delivery-method chip FRESH from the
 * components still visible on THIS read, never trusting the stored `delivery_method` column,
 * which only reflects whatever was true at the bundle's last create/edit (migration 208's B2
 * repair fixed that once; this suite proves the read path keeps it honest going forward instead
 * of drifting stale again).
 *
 * NEGATIVES FIRST: N1 proves the unapproved component is name-only before any positive case is
 * trusted. N-DRIFT is the strongest single proof — it forces the stored column and the freshly
 * derived value to DISAGREE, and asserts the response reads the derived value, never the stale
 * stored one, while the stored column itself is left untouched by the read (no write-on-read).
 *
 * Runs against the ALREADY-RUNNING dev server. DISPOSABLE DB ONLY — every row created here is
 * cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/bundle-component-linking.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[bundle-linking] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

let provider = { id: "", email: "", cookie: "" };

async function verifyProviderForm(userId: string, email: string): Promise<void> {
  const existing = await db.execute(sql`SELECT id FROM service_provider_forms WHERE user_id = ${userId} LIMIT 1`);
  if ((existing.rows as any[]).length === 0) {
    await db.execute(sql`
      INSERT INTO service_provider_forms
        (id, user_id, business_name, name, email, mobile, country, address, business_type,
         identity_verification_status, business_verification_status, status)
      VALUES
        (${crypto.randomUUID()}, ${userId}, ${"S10 Test Biz"}, ${"S10 Test"}, ${email},
         ${"+10000000000"}, ${"Japan"}, ${"1 Test Street, Kyoto"}, ${"tour_operator"},
         ${"verified"}, ${"verified"}, ${"approved"})
    `);
  }
}

async function createProvider(): Promise<void> {
  const email = `s10-${RUN}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "S10", lastName: "Bundle",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${id}`);
  await verifyProviderForm(id, email);
  const cookie = (await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD }))
    .headers.get("set-cookie")!.split(";")[0];
  provider = { id, email, cookie };
}

/** Publish-gate defaults per method (mirrors what the FP-1 suite already established): an
 * in_person listing needs a meeting point, a pdf listing needs its deliverable, before the
 * PUBLISH (status: 'active') gate will accept it. Neither is the thing under test here. */
function publishDefaultsFor(deliveryMethod: string): Record<string, unknown> {
  if (deliveryMethod === "in_person" || deliveryMethod === "hybrid") {
    return { meetingPoint: "Kyoto Station, Karasuma exit" };
  }
  if (deliveryMethod === "pdf") {
    return { serviceFile: "https://example.test/s10-fixture.pdf" };
  }
  return {};
}

/** Create an approved+active component service through the REAL create route. */
async function mkComponent(deliveryMethod: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `S10 Component ${RUN} ${crypto.randomUUID().slice(0, 6)}`,
    shortDescription: "A bundle component fixture",
    description: "S10 fixture — server/__tests__/bundle-component-linking.db.test.ts",
    price: "40.00",
    deliveryMethod,
    status: "active",
    ...publishDefaultsFor(deliveryMethod),
    ...extra,
  }));
  assert.equal(res.status, 201, `component create failed (${res.status}): ${res.text}`);
  createdServiceIds.push(res.body.id);
  await db.execute(sql`UPDATE provider_services SET approval_status = 'approved', status = 'active' WHERE id = ${res.body.id}`);
  return res.body.id as string;
}

async function mkBundle(componentServiceIds: string[]): Promise<{ status: number; body: any; text: string }> {
  const res = await readOnce(await api("/api/provider/bundles", provider.cookie, "POST", {
    serviceName: `S10 Bundle ${RUN} ${crypto.randomUUID().slice(0, 6)}`,
    price: "99.00",
    componentServiceIds,
  }));
  if (res.status === 201 && res.body?.id) createdServiceIds.push(res.body.id);
  return res;
}

/** Publish the bundle row itself so the PUBLIC GET /api/services/:id read-gate admits it. */
async function publishBundle(id: string): Promise<void> {
  await db.execute(sql`UPDATE provider_services SET approval_status = 'approved', status = 'active' WHERE id = ${id}`);
}

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM provider_services WHERE id = ${id} LIMIT 1`);
  const found = (r.rows as any[])[0];
  assert.ok(found, `provider_services row ${id} must exist`);
  return found;
}

async function getPublicService(id: string): Promise<{ status: number; body: any; text: string }> {
  return readOnce(await api(`/api/services/${id}`, undefined));
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  await createProvider();
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${id} OR component_service_id = ${id}`).catch(() => {});
    }
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ N1 (negative first) — an unapproved component is name-only, never a broken link ═══════════

test("N1: an un-approved component renders name-only — no id, no link fields, on a public read", async () => {
  const visible = await mkComponent("video");
  const hidden = await mkComponent("video");
  const bundle = await mkBundle([visible, hidden]);
  assert.equal(bundle.status, 201, bundle.text);
  await publishBundle(bundle.body.id);

  // The component is un-approved AFTER joining the bundle — the bundle itself is never touched.
  await db.execute(sql`UPDATE provider_services SET approval_status = 'rejected' WHERE id = ${hidden}`);

  const read = await getPublicService(bundle.body.id);
  assert.equal(read.status, 200, `public read failed (${read.status}): ${read.text}`);
  const components = read.body.bundleComponents as any[];
  assert.equal(components.length, 2, "both component SLOTS are still sent — the list does not silently shrink");

  const hiddenEntry = components.find((c) => !c.available);
  assert.ok(hiddenEntry, "the un-approved component must be present as an unavailable entry");
  assert.equal(hiddenEntry.available, false);
  assert.equal("id" in hiddenEntry, false, "no id ⇒ the client can build no /services/:id link to it");
  assert.equal("deliveryMethod" in hiddenEntry, false, "no method chip data leaks for a hidden component");
  assert.equal("serviceImage" in hiddenEntry, false, "no image leaks for a hidden component");
  assert.equal("shortDescription" in hiddenEntry, false, "no description leaks for a hidden component");
  assert.equal(typeof hiddenEntry.serviceName, "string", "the name is still shown — honest, not invented");

  const visibleEntry = components.find((c) => c.available);
  assert.ok(visibleEntry, "the still-approved component must render fully");
  assert.equal(visibleEntry.id, visible);
  assert.equal(visibleEntry.deliveryMethod, "video");
});

// ═══ Uniform-method bundle derives that method at read time ═════════════════════════════════════

test("P1: a uniform-method bundle's read-time chip is the shared method", async () => {
  const a = await mkComponent("video");
  const b = await mkComponent("video");
  const bundle = await mkBundle([a, b]);
  assert.equal(bundle.status, 201, bundle.text);
  await publishBundle(bundle.body.id);

  const read = await getPublicService(bundle.body.id);
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.deliveryMethod, "video");
  const components = read.body.bundleComponents as any[];
  assert.equal(components.length, 2);
  assert.ok(components.every((c) => c.available === true));
});

// ═══ Mixed bundle derives 'hybrid' at read time ══════════════════════════════════════════════════

test("P2: a mixed-method bundle's read-time chip is 'hybrid'", async () => {
  const a = await mkComponent("video");
  const b = await mkComponent("call");
  const bundle = await mkBundle([a, b]);
  assert.equal(bundle.status, 201, bundle.text);
  await publishBundle(bundle.body.id);

  const read = await getPublicService(bundle.body.id);
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.deliveryMethod, "hybrid");
});

// ═══ N-DRIFT — the read-time chip is derived FRESH, never trusted from the stored column ════════

test("N-DRIFT: the read re-derives from what's STILL visible; it never trusts (or rewrites) the stale stored column", async () => {
  const a = await mkComponent("video");
  const b = await mkComponent("video");
  const c = await mkComponent("call");

  // Create with [a, b] only — uniform, so the WRITE path (provider.routes.ts) stamps 'video'.
  const bundle = await mkBundle([a, b]);
  assert.equal(bundle.status, 201, bundle.text);
  const bundleId = bundle.body.id as string;
  assert.equal((await row(bundleId)).delivery_method, "video");

  // Patch the component set to [a, b, c] — mixed, so the WRITE path re-derives 'hybrid' and
  // STORES it (existing FP-1/B2 behaviour, unchanged by this lane).
  const patch = await readOnce(await api(`/api/provider/bundles/${bundleId}`, provider.cookie, "PATCH", {
    componentServiceIds: [a, b, c],
  }));
  assert.equal(patch.status, 200, `bundle patch failed (${patch.status}): ${patch.text}`);
  assert.equal((await row(bundleId)).delivery_method, "hybrid", "write-time re-derivation is unchanged by this lane");
  await publishBundle(bundleId);

  // Now `c` (the call component) is un-approved with NO further edit to the bundle itself — the
  // stored column has no reason to move and stays 'hybrid', which is now STALE.
  await db.execute(sql`UPDATE provider_services SET approval_status = 'rejected' WHERE id = ${c}`);
  assert.equal((await row(bundleId)).delivery_method, "hybrid", "the stored column is untouched by un-approving a component");

  const read = await getPublicService(bundleId);
  assert.equal(read.status, 200, read.text);
  // The chip a traveler actually sees is derived from [a, b] (both video) — NOT the stale
  // stored 'hybrid'. This is the read-time fix: the display is honest even though nobody edited
  // the bundle after `c` was hidden.
  assert.equal(read.body.deliveryMethod, "video",
    "the DISPLAYED chip must be freshly derived from the still-visible components, not the stale stored column");

  // And the read must NOT have written the derived value back onto the row (read-time-only, per
  // the S10 scope: never write on read).
  assert.equal((await row(bundleId)).delivery_method, "hybrid",
    "the read must never write the derived value back to provider_services — write-time stays the only writer");

  const components = read.body.bundleComponents as any[];
  assert.equal(components.length, 3, "all three component slots are still sent");
  const cEntry = components.find((comp: any) => !comp.available);
  assert.ok(cEntry, "the un-approved call component must be the one unavailable entry");
  assert.equal("id" in cEntry, false);
});

// ═══ Image rides the component summary when the owner set one ═══════════════════════════════════

test("P3: a component's cover image rides the summary when set, and is absent (never fabricated) when not", async () => {
  const withImage = await mkComponent("video", { serviceImage: "https://example.test/s10-fixture.jpg" });
  const withoutImage = await mkComponent("video");
  const bundle = await mkBundle([withImage, withoutImage]);
  assert.equal(bundle.status, 201, bundle.text);
  await publishBundle(bundle.body.id);

  const read = await getPublicService(bundle.body.id);
  assert.equal(read.status, 200, read.text);
  const components = read.body.bundleComponents as any[];
  const withImg = components.find((c) => c.id === withImage);
  const withoutImg = components.find((c) => c.id === withoutImage);
  assert.equal(withImg.serviceImage, "https://example.test/s10-fixture.jpg");
  assert.equal(withoutImg.serviceImage, null, "no image set ⇒ null, never a fabricated placeholder URL");
});

// ═══ No auto-summing — the bundle's own price is exactly the owner-set listing price ════════════

test("P4: the bundle's public price is the owner-set listing price, never a sum of components", async () => {
  const a = await mkComponent("pdf", { price: "40.00" });
  const b = await mkComponent("pdf", { price: "60.00" });
  const bundle = await mkBundle([a, b]); // bundle price set to 99.00 in mkBundle — not 100.00
  assert.equal(bundle.status, 201, bundle.text);
  await publishBundle(bundle.body.id);

  const read = await getPublicService(bundle.body.id);
  assert.equal(read.status, 200, read.text);
  assert.equal(Number(read.body.price), 99, "the bundle price is exactly what the owner set — never $40+$60=$100");
});
