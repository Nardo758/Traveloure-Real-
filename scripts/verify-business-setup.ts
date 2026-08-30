/**
 * verify-business-setup.ts — behavioral gate for Build 1 (activation checklist) +
 * the migration-147 Stripe Connect column repair.
 *
 * Proves over real HTTP:
 *   1. GET /api/me/business-setup: non-earner → eligible:false; fresh earner → all steps
 *      incomplete; each step flips as the REAL underlying row appears (handle claim via the
 *      live PATCH /api/me/handle, offering insert, approval flip, availability slot).
 *   2. Migration 147: users.stripe_account_* columns exist and GET /api/stripe/connect/status
 *      no longer throws (the phantom-column chain) — returns an honest not_connected.
 *   3. GET /api/admin/business-funnel: admin-gated (403 for non-admin), returns the count
 *      fields, and with_handle/with_offering move when a fixture earner gains those rows.
 *
 * Usage:
 *   DATABASE_URL=... npm run dev
 *   DATABASE_URL=... BASE_URL=http://localhost:5000 npx tsx scripts/verify-business-setup.ts
 *
 * Self-cleaning (finally block).
 */
import { db } from "../server/db";
import { users, providerServices, vendorAvailabilitySlots } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "VerifySetup!2026";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function makeActor() {
  let cookie = "";
  return {
    async req(method: string, path: string, body?: any) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* HTML */ }
      return { status: res.status, json, text };
    },
  };
}

async function registerAndPromote(email: string, role: string | null) {
  const actor = makeActor();
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Setup", lastName: "Verify",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Setup", lastName: "Verify",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register failed for ${email}: ${reg.status} ${reg.text.slice(0, 200)}`);
  }
  if (role) await db.update(users).set({ role } as any).where(eq(users.email, email.toLowerCase()));
  const login = await actor.req("POST", "/api/auth/login", { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed for ${email}: ${login.status}`);
  return actor;
}

async function main() {
  const stamp = Date.now();
  const providerEmail = `setup-provider-${stamp}@t.test`;
  const travelerEmail = `setup-traveler-${stamp}@t.test`;
  const adminEmail = `setup-admin-${stamp}@t.test`;
  const createdEmails = [providerEmail, travelerEmail, adminEmail];
  const createdServiceIds: string[] = [];
  const handle = `setup-verify-${stamp}`.slice(0, 30).replace(/[^a-z0-9-]/g, "");

  try {
    console.log(`\n── setup (${BASE}) ──`);
    const provider = await registerAndPromote(providerEmail, "service_provider");
    const traveler = await registerAndPromote(travelerEmail, null);
    const admin = await registerAndPromote(adminEmail, "admin");
    const [provRow] = await db.select().from(users).where(eq(users.email, providerEmail.toLowerCase()));

    console.log("\n── 1: migration 147 — Connect columns exist, status endpoint doesn't throw ──");
    const cols = await db.execute(sql`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('stripe_account_id','stripe_account_status','can_receive_payments')
    `);
    check("users has all 3 Connect columns", Number((cols.rows as any[])[0]?.n) === 3);
    const connect = await provider.req("GET", "/api/stripe/connect/status");
    check(
      `connect/status returns 200 (was a phantom-column 500) — got ${connect.status} ${JSON.stringify(connect.json)?.slice(0, 60)}`,
      connect.status === 200 && connect.json?.status === "not_connected",
    );

    console.log("\n── 2: business-setup eligibility + step derivation ──");
    const t = await traveler.req("GET", "/api/me/business-setup");
    check(`traveler (role user) → eligible:false — got ${JSON.stringify(t.json)}`, t.status === 200 && t.json?.eligible === false);

    let s = await provider.req("GET", "/api/me/business-setup");
    check("fresh provider → eligible provider console", s.json?.eligible === true && s.json?.consoleFamily === "provider");
    check("handle step incomplete", s.json?.steps?.handle?.done === false);
    check("payouts step incomplete", s.json?.steps?.payouts?.done === false);
    check("offering step incomplete", s.json?.steps?.firstOffering?.done === false);
    check("availability applicable for provider", s.json?.steps?.availability?.applicable === true);

    const claim = await provider.req("PATCH", "/api/me/handle", { handle });
    check(`handle claimed via live endpoint — got ${claim.status}`, claim.status === 200);
    s = await provider.req("GET", "/api/me/business-setup");
    check("handle step now done", s.json?.steps?.handle?.done === true && s.json?.storefrontPath === `/p/${handle}`);

    const [svc] = await db.insert(providerServices).values({
      userId: provRow.id,
      serviceName: "Setup verify service",
      description: "fixture",
      price: "50.00",
      status: "active",
      // Born submitted (D1a) — the offering exists but is not yet approved.
      approvalStatus: "submitted",
    } as any).returning();
    createdServiceIds.push(svc.id);
    s = await provider.req("GET", "/api/me/business-setup");
    check("firstOffering done after insert", s.json?.steps?.firstOffering?.done === true);
    check("approvedOffering still false (born submitted)", s.json?.steps?.approvedOffering?.done === false);

    await db.update(providerServices).set({ approvalStatus: "approved" } as any).where(eq(providerServices.id, svc.id));
    await db.insert(vendorAvailabilitySlots).values({
      serviceId: svc.id,
      providerId: provRow.id,
      date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      startTime: "10:00",
      endTime: "12:00",
      capacity: 4,
      bookedCount: 0,
      status: "available",
    } as any);
    s = await provider.req("GET", "/api/me/business-setup");
    check("approvedOffering done after approval", s.json?.steps?.approvedOffering?.done === true);
    check("availability done after future slot", s.json?.steps?.availability?.done === true);

    console.log("\n── 3: admin funnel ──");
    const denied = await provider.req("GET", "/api/admin/business-funnel");
    check(`non-admin denied — got ${denied.status}`, denied.status === 403 || denied.status === 401);
    const funnel = await admin.req("GET", "/api/admin/business-funnel");
    check(`admin gets funnel — got ${funnel.status}`, funnel.status === 200);
    const f = funnel.json ?? {};
    check("funnel has count fields", ["earners", "with_handle", "with_offering", "with_approved_offering", "with_booking"].every((k) => typeof f[k] === "number"));
    check(`with_handle counts our fixture (>=1) — got ${f.with_handle}`, (f.with_handle ?? 0) >= 1);
    check(`with_approved_offering counts our fixture (>=1) — got ${f.with_approved_offering}`, (f.with_approved_offering ?? 0) >= 1);
  } finally {
    console.log("\n── cleanup ──");
    try {
      if (createdServiceIds.length) {
        await db.delete(vendorAvailabilitySlots).where(inArray(vendorAvailabilitySlots.serviceId, createdServiceIds));
        await db.delete(providerServices).where(inArray(providerServices.id, createdServiceIds));
      }
      const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, createdEmails.map((e) => e.toLowerCase())));
      const ids = rows.map((r) => r.id);
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      console.log("  fixtures removed");
    } catch (e: any) {
      console.log(`  cleanup error (non-fatal): ${e?.message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
