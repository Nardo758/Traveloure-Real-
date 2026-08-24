/**
 * FP-1 — PROVIDER-CONSOLE DEFECT FIX PACK (behavioural proof).
 *
 * Evidence: docs/testing/PROVIDER_BATCH_EXERCISE.md — a full Kyoto catalog authored through the
 * real console. This suite pins the five findings whose fix is provable server-side.
 *
 *   A1  the custom-offering flow no longer dead-ends. The "Custom / Other" service_categories row
 *       carries category_key='custom_other' — the key service_offering_types.custom_other_offering
 *       points at — and a listing filed under it PUBLISHES end to end.
 *   B2  a Workstation-created property, room and bundle land with an HONEST delivery_method
 *       (in_person / derived-from-components), never the column DEFAULT 'pdf' that had a machiya
 *       guest room labelled "PDF guide" to travelers. N-B2 pins the mixed bundle → 'hybrid'.
 *   B4  provider_services.city is server-derived from the neighborhood slug at create, and the
 *       market read prefers it. NEGATIVES FIRST: a listing with NO structured source stays NULL
 *       and is honestly ABSENT from every city payload (never guessed into one), and a listing
 *       whose structured city is ANOTHER city is not dragged onto Kyoto's page by its prose.
 *   B5  a scheduled REMOTE listing (video) carries the timing/capacity/booking-rules fields — the
 *       eight fields that vanished the moment a provider picked Video Call.
 *   B7  a pdf listing cannot PUBLISH with no deliverable (the field was marked * and enforced
 *       nowhere: it published, sold, and delivered nothing), and the protected upload rail flips
 *       it — a publish with no serviceFile in the body at all succeeds once the file is uploaded.
 *
 * NEGATIVES FIRST where the finding has one; every positive asserts the ROW, not just the status.
 *
 * Runs against the ALREADY-RUNNING dev server (the provider-office-location / service-display-options
 * posture). DISPOSABLE DB ONLY — every row created here is cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/fp1-console-defects.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { needsScheduling, isPlaceAnchored } from "@shared/service-fundamentals";

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
  if (!ok) throw new Error(`[fp1] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
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
let kyotoSlug = "";      // a real city_neighborhoods slug whose city is Kyoto
let customCategoryId = "";
let customOfferingTypeId = "";

/**
 * Publishing requires identity + business verification (ruling 53/56) — both written only by
 * Stripe, which this bench cannot reach. ONE statement, on a disposable DB, exactly as the batch
 * exercise recorded doing by hand. Nothing else is written by SQL.
 */
async function verifyProviderForm(userId: string, email: string): Promise<void> {
  const existing = await db.execute(sql`SELECT id FROM service_provider_forms WHERE user_id = ${userId} LIMIT 1`);
  if ((existing.rows as any[]).length === 0) {
    await db.execute(sql`
      INSERT INTO service_provider_forms
        (id, user_id, business_name, name, email, mobile, country, address, business_type,
         identity_verification_status, business_verification_status, status)
      VALUES
        (${crypto.randomUUID()}, ${userId}, ${"FP1 Test Biz"}, ${"FP1 Test"}, ${email},
         ${"+10000000000"}, ${"Japan"}, ${"1 Test Street, Kyoto"}, ${"tour_operator"},
         ${"verified"}, ${"verified"}, ${"approved"})
    `);
  } else {
    await db.execute(sql`
      UPDATE service_provider_forms
         SET identity_verification_status = 'verified', business_verification_status = 'verified'
       WHERE user_id = ${userId}
    `);
  }
}

async function createProvider(): Promise<void> {
  const email = `fp1-${RUN}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "FP", lastName: "One",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${id}`);
  await verifyProviderForm(id, email);
  // Re-login so the session carries the provider role.
  const login = await readOnce(await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD }));
  assert.equal(login.status, 200, `login failed (${login.status}): ${login.text}`);
  const cookie = (await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD }))
    .headers.get("set-cookie")!.split(";")[0];
  provider = { id, email, cookie };
}

/** Create a listing through the REAL route and remember it for cleanup. */
async function createListing(extra: Record<string, unknown>): Promise<{ status: number; body: any; text: string }> {
  const res = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `FP1 ${RUN} ${crypto.randomUUID().slice(0, 6)}`,
    description: "FP-1 fixture listing — created by server/__tests__/fp1-console-defects.db.test.ts",
    price: "50.00",
    status: "draft",
    ...extra,
  }));
  if (res.status === 201 && res.body?.id) createdServiceIds.push(res.body.id);
  return res;
}

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM provider_services WHERE id = ${id} LIMIT 1`);
  const found = (r.rows as any[])[0];
  assert.ok(found, `provider_services row ${id} must exist`);
  return found;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  await createProvider();

  const n = await db.execute(sql`
    SELECT slug FROM city_neighborhoods WHERE city = 'Kyoto' ORDER BY slug LIMIT 1
  `);
  kyotoSlug = ((n.rows as any[])[0]?.slug as string) ?? "";
  assert.ok(kyotoSlug, "the bench must carry at least one seeded Kyoto neighborhood");

  const c = await db.execute(sql`SELECT id FROM service_categories WHERE category_key = 'custom_other' LIMIT 1`);
  customCategoryId = ((c.rows as any[])[0]?.id as string) ?? "";
  const o = await db.execute(sql`SELECT id FROM service_offering_types WHERE offering_type_key = 'custom_other_offering' LIMIT 1`);
  customOfferingTypeId = ((o.rows as any[])[0]?.id as string) ?? "";
});

after(async () => {
  try {
    await assertDisposableDb();
    // Children first (bundle_components / rooms cascade or RESTRICT on their parents).
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${id} OR component_service_id = ${id}`).catch(() => {});
    }
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM provider_services WHERE parent_service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ A1 — the custom-offering flow publishes ════════════════════════════════════════════════════

test("A1-a: the Custom / Other category carries the key its offering type points at", async () => {
  assert.ok(customCategoryId, "a service_categories row must carry category_key='custom_other'");
  assert.ok(customOfferingTypeId, "the custom_other_offering service_offering_types row must exist");
  const o = await db.execute(sql`
    SELECT category_key FROM service_offering_types WHERE offering_type_key = 'custom_other_offering'
  `);
  const offeringKey = (o.rows as any[])[0]?.category_key;
  const c = await db.execute(sql`SELECT category_key FROM service_categories WHERE id = ${customCategoryId}`);
  const categoryKey = (c.rows as any[])[0]?.category_key;
  // The exact join the wizard makes: categories.find(c => c.categoryKey === offering.category_key).
  // It matched NOTHING before this lane, which is what made Category render "—" and Publish dead.
  assert.equal(categoryKey, offeringKey, "the offering's category_key must resolve to a real category");
});

test("A1-b: a listing filed under the custom offering PUBLISHES end to end", async () => {
  const created = await createListing({
    deliveryMethod: "pdf",
    categoryId: customCategoryId,
    serviceOfferingTypeId: customOfferingTypeId,
    serviceFile: "https://example.test/fp1-custom.pdf",
    status: "active",
  });
  assert.equal(created.status, 201, `custom-offering publish failed (${created.status}): ${created.text}`);
  const stored = await row(created.body.id);
  assert.equal(stored.status, "active", "the listing is LIVE, not stuck as a draft (the A1 dead end)");
  assert.equal(stored.category_id, customCategoryId, "it is filed under Custom / Other");
  assert.equal(stored.service_offering_type_id, customOfferingTypeId, "the custom offering FK is persisted");
});

// ═══ B2 — honest delivery_method on Workstation-created rows ════════════════════════════════════

test("B2-a: a property and its rooms are born 'in_person', never the 'pdf' default", async () => {
  const res = await readOnce(await api("/api/provider/properties", provider.cookie, "POST", {
    serviceName: `FP1 Property ${RUN}`,
    description: "FP-1 property fixture",
    location: "Nishijin, Kamigyo-ku",
    neighborhood: kyotoSlug,
    rooms: [{ roomName: "FP1 Room A", price: "185.00", units: 1 }],
  }));
  assert.equal(res.status, 201, `property create failed (${res.status}): ${res.text}`);
  createdServiceIds.push(res.body.id);
  for (const r of res.body.rooms ?? []) createdServiceIds.push(r.id);

  const property = await row(res.body.id);
  assert.equal(property.delivery_method, "in_person", "a guesthouse is place-anchored, not a PDF");
  assert.notEqual(property.delivery_method, "pdf", "the storefront chip must never read 'PDF guide' for a stay");
  const roomRow = await row(res.body.rooms[0].id);
  assert.equal(roomRow.delivery_method, "in_person", "a room inherits its property's honest delivery method");
});

test("B2-b: a bundle DERIVES its method — uniform components keep it, mixed become 'hybrid'", async () => {
  // Two approved+active components with the SAME method, then two with different ones. Approval is
  // an admin act; on this disposable DB it is set directly so the bundle validator will accept them.
  const mk = async (method: string) => {
    const c = await createListing({ deliveryMethod: method, price: "40.00" });
    assert.equal(c.status, 201, `component create failed (${c.status}): ${c.text}`);
    await db.execute(sql`UPDATE provider_services SET approval_status = 'approved', status = 'active' WHERE id = ${c.body.id}`);
    return c.body.id as string;
  };
  const inPersonA = await mk("in_person");
  const inPersonB = await mk("in_person");
  const videoC = await mk("video");

  const uniform = await readOnce(await api("/api/provider/bundles", provider.cookie, "POST", {
    serviceName: `FP1 Uniform Bundle ${RUN}`,
    price: "105.00",
    componentServiceIds: [inPersonA, inPersonB],
  }));
  assert.equal(uniform.status, 201, `uniform bundle create failed (${uniform.status}): ${uniform.text}`);
  createdServiceIds.push(uniform.body.id);
  assert.equal((await row(uniform.body.id)).delivery_method, "in_person",
    "a bundle of in-person components is in_person — not the 'pdf' default");

  const mixed = await readOnce(await api("/api/provider/bundles", provider.cookie, "POST", {
    serviceName: `FP1 Mixed Bundle ${RUN}`,
    price: "145.00",
    componentServiceIds: [inPersonA, videoC],
  }));
  assert.equal(mixed.status, 201, `mixed bundle create failed (${mixed.status}): ${mixed.text}`);
  createdServiceIds.push(mixed.body.id);
  assert.equal((await row(mixed.body.id)).delivery_method, "hybrid",
    "a bundle mixing in_person and video is hybrid — the canonical word for mixed (§3)");
});

// ═══ B5 — a scheduled REMOTE listing keeps its timing fields ════════════════════════════════════

test("B5-a: the SHARED predicate says call/video are scheduled (the gate's source of truth)", () => {
  // STATED BOUNDS (§18d): the card that renders the eight fields is gated on this predicate in
  // client/src/components/ServiceForm.tsx. This test pins the predicate and the server round-trip;
  // it does not execute the React component.
  assert.equal(needsScheduling({ deliveryMethod: "video", productShape: null }), true);
  assert.equal(needsScheduling({ deliveryMethod: "call", productShape: null }), true);
  assert.equal(isPlaceAnchored({ deliveryMethod: "video", productShape: null }), false,
    "video stays NON place-anchored — transport/pickup/surcharge remain place-anchored-only");
});

test("B5-b: a video listing's timing/capacity/booking-rules fields persist", async () => {
  const created = await createListing({
    deliveryMethod: "video",
    price: "65.00",
    durationMinutes: 60,
    bufferMinutes: 15,
    earliestStartTime: "09:00",
    latestStartTime: "18:00",
    serviceTimezone: "Asia/Tokyo",
    partySizeMin: 1,
    partySizeMax: 4,
    changeCutoffHours: 24,
  });
  assert.equal(created.status, 201, `video listing create failed (${created.status}): ${created.text}`);
  const stored = await row(created.body.id);
  assert.equal(stored.delivery_method, "video");
  assert.equal(Number(stored.duration_minutes), 60, "duration survives on a remote session");
  assert.equal(Number(stored.buffer_minutes), 15);
  assert.equal(stored.service_timezone, "Asia/Tokyo",
    "the timezone a Kyoto provider needs to sell 09:00 to a New York buyer");
  assert.equal(Number(stored.party_size_min), 1);
  assert.equal(Number(stored.party_size_max), 4);
  assert.equal(Number(stored.change_cutoff_hours), 24);
});

// ═══ B7 — the deliverable is enforced, and the upload rail satisfies it ═════════════════════════

test("N-B7: a pdf listing cannot PUBLISH with no deliverable (draft still saves)", async () => {
  const draft = await createListing({ deliveryMethod: "pdf", price: "18.00", status: "draft" });
  assert.equal(draft.status, 201, "a draft with no deliverable still saves — the gate is publish-only");

  const publishAttempt = await createListing({ deliveryMethod: "pdf", price: "18.00", status: "active" });
  assert.equal(publishAttempt.status, 400, `publish with no deliverable must be refused: ${publishAttempt.text}`);
  assert.equal(publishAttempt.body?.code, "DELIVERABLE_FILE_REQUIRED");

  // …and the same refusal on the flip-a-draft-live path.
  const flip = await readOnce(await api(`/api/provider/services/${draft.body.id}`, provider.cookie, "PATCH", { status: "active" }));
  assert.equal(flip.status, 400, `flipping an empty-deliverable draft live must be refused: ${flip.text}`);
  assert.equal(flip.body?.code, "DELIVERABLE_FILE_REQUIRED");
  assert.equal((await row(draft.body.id)).status, "draft", "the refused publish left the row a draft");
});

test("B7: the protected upload rail flips the gate — publish succeeds with no serviceFile in the body", async () => {
  const draft = await createListing({ deliveryMethod: "pdf", price: "18.00", status: "draft" });
  assert.equal(draft.status, 201);
  const id = draft.body.id as string;

  // The rail's FIRST client-shaped call: raw PDF bytes, the shape express.raw() expects.
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("FP1 deliverable fixture\n%%EOF\n")]);
  const upload = await readOnce(await fetch(`${BASE_URL}/api/provider/services/${id}/deliverable-file`, {
    method: "POST",
    headers: { "content-type": "application/pdf", cookie: provider.cookie },
    body: pdf,
  }));
  if (upload.status === 503) {
    // Honest degradation when no object storage is attached — the rail says so rather than
    // fabricating a success. Nothing to prove here on such a bench.
    assert.equal(upload.body?.code, "OBJECT_STORAGE_UNAVAILABLE");
    return;
  }
  assert.equal(upload.status, 200, `upload failed (${upload.status}): ${upload.text}`);
  assert.equal(upload.body?.protected, true, "an uploaded file is platform-protected");
  const afterUpload = await row(id);
  assert.ok(String(afterUpload.service_file ?? "").startsWith("objstore:"),
    "the upload writes the objstore: key itself — the client is never told the location");

  // The client omits serviceFile entirely after an upload (never-clobber). Publish must succeed.
  const publish = await readOnce(await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", { status: "active" }));
  assert.equal(publish.status, 200, `publish after upload must succeed (${publish.status}): ${publish.text}`);
  const live = await row(id);
  assert.equal(live.status, "active");
  assert.ok(String(live.service_file ?? "").startsWith("objstore:"),
    "the publish did NOT clobber the uploaded key");
});

test("N-B7b: a non-PDF upload is refused and the row is untouched", async () => {
  const draft = await createListing({ deliveryMethod: "pdf", price: "18.00", status: "draft" });
  const id = draft.body.id as string;
  const res = await readOnce(await fetch(`${BASE_URL}/api/provider/services/${id}/deliverable-file`, {
    method: "POST",
    headers: { "content-type": "application/pdf", cookie: provider.cookie },
    body: Buffer.from("this is not a pdf"),
  }));
  assert.equal(res.status, 400, `magic-byte check must refuse a non-PDF: ${res.text}`);
  assert.equal(res.body?.code, "DELIVERABLE_NOT_PDF");
  assert.equal((await row(id)).service_file ?? null, null, "a refused upload writes nothing");
});

// ═══ B4 — structured city: derived on write, preferred on read, honest when absent ══════════════

test("B4-a: city is DERIVED from the neighborhood slug; no neighborhood ⇒ NULL (never guessed)", async () => {
  const withHood = await createListing({
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Karasuma exit",
    neighborhood: kyotoSlug,
    location: "Nishijin, Kamigyo-ku", // deliberately does NOT contain the word "Kyoto"
  });
  assert.equal(withHood.status, 201, withHood.text);
  assert.equal((await row(withHood.body.id)).city, "Kyoto",
    "the ONE structured signal a listing carries resolves its city");

  const withoutHood = await createListing({ deliveryMethod: "pdf", price: "18.00" });
  assert.equal(withoutHood.status, 201, withoutHood.text);
  assert.equal((await row(withoutHood.body.id)).city ?? null, null,
    "§13: no structured source ⇒ NULL, never a guessed city");
});

test("N-B4: a client-sent `city` is ignored — the column is server-derived or NULL", async () => {
  const res = await createListing({ deliveryMethod: "pdf", price: "18.00", city: "Paris" });
  assert.equal(res.status, 201, res.text);
  assert.equal((await row(res.body.id)).city ?? null, null,
    "a body-supplied city must never reach the column (it would put a listing on any market page it liked)");
});

test("B4-b: the Kyoto market read returns the derived listing, and NOT the ones that don't belong", async () => {
  // Three fixtures, created BEFORE the single read below (the location view caches per city for 5m).
  const belongs = await createListing({
    deliveryMethod: "in_person",
    meetingPoint: "Nishiki Market west entrance",
    neighborhood: kyotoSlug,
    location: "Arashiyama, Sagano", // no "Kyoto" anywhere in the prose — the old read missed this
    price: "95.00",
  });
  assert.equal(belongs.status, 201, belongs.text);
  await db.execute(sql`UPDATE provider_services SET approval_status = 'approved', status = 'active' WHERE id = ${belongs.body.id}`);

  const noCity = await createListing({ deliveryMethod: "pdf", price: "18.00", location: "Unknown" });
  assert.equal(noCity.status, 201, noCity.text);
  await db.execute(sql`UPDATE provider_services SET approval_status = 'approved', status = 'active' WHERE id = ${noCity.body.id}`);

  // A listing that structurally belongs to ANOTHER city but whose prose mentions Kyoto. Under the
  // old substring read this appeared on Kyoto's page; structured must win.
  const elsewhere = await createListing({ deliveryMethod: "in_person", meetingPoint: "Osaka Castle", price: "70.00" });
  assert.equal(elsewhere.status, 201, elsewhere.text);
  await db.execute(sql`
    UPDATE provider_services
       SET approval_status = 'approved', status = 'active', city = 'Osaka', location = 'Day trips from Kyoto'
     WHERE id = ${elsewhere.body.id}
  `);

  const view = await readOnce(await api(`/api/discover/location/Kyoto?country=Japan`, undefined));
  assert.equal(view.status, 200, `location view failed (${view.status}): ${view.text}`);
  const ids = new Set(((view.body?.services?.data ?? []) as any[]).map((s) => s.id));

  assert.ok(ids.has(belongs.body.id),
    "a listing whose STRUCTURED city is Kyoto reaches the Kyoto payload even with no 'Kyoto' in its prose");
  assert.ok(!ids.has(noCity.body.id),
    "§13: a listing with no city and no matching prose is honestly ABSENT — never guessed into a market");
  assert.ok(!ids.has(elsewhere.body.id),
    "a listing whose structured city is Osaka is NOT dragged onto Kyoto's page by the word 'Kyoto' in its text");

  // B4b: the accommodation shape is on the wire, which is what lets the Stay spine route it.
  const shaped = ((view.body?.services?.data ?? []) as any[]).find((s) => s.id === belongs.body.id);
  assert.ok(shaped && "productShape" in shaped,
    "productShape must ride the city payload — the Stay tab routes on it (it reported 'No stay found' without it)");
});
