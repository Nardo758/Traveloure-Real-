/**
 * verify-role-vocab.ts — behavioral gate for the role-vocabulary normalization
 * (shared/roles.ts; console/role-switch fix + the always-false `role === "provider"` cluster).
 *
 * Proves over real HTTP:
 *   1. 🔴 Commission routing: a booking on a service OWNED BY a `service_provider` prices with
 *      the PROVIDER_BOOKING tier-1 split (12 % platform), not the EXPERT_SESSION split — the
 *      old `ownerRole === "provider"` comparison was always false, so every provider booking
 *      silently took the expert split.
 *   2. Expert-owned booking still prices via the expert split (no regression).
 *   3. Intake validation: POST /api/expert-application rejects an out-of-enum expertType
 *      (the privilege-escalation vector — expertType was copied verbatim into users.role
 *      on admin approval).
 *   4. Role switch: PATCH /api/expert/role accepts enum values, rejects "service_provider"
 *      and "admin", and actually flips users.role.
 *   5. Payout onboarding: a travel_expert is no longer 403'd off /api/stripe/connect/onboard
 *      (the old ['expert','service_provider'] pair locked the expert family out of payouts).
 *
 * Usage:
 *   DATABASE_URL=... npm run dev            # in another shell
 *   DATABASE_URL=... BASE_URL=http://localhost:5000 npx tsx scripts/verify-role-vocab.ts
 *
 * Self-cleaning: deletes every row it creates in a finally block.
 */
import { db } from "../server/db";
import { users, providerServices, serviceBookings, localExpertForms } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "VerifyVocab!2026";

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
      try { json = JSON.parse(text); } catch { /* HTML = Vite catch-all */ }
      return { status: res.status, json, text };
    },
  };
}

async function registerAndPromote(email: string, role: string | null) {
  const actor = makeActor();
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Vocab", lastName: "Verify",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Vocab", lastName: "Verify",
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

async function userByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return row;
}

async function main() {
  const stamp = Date.now();
  const providerEmail = `vocab-provider-${stamp}@t.test`;
  const expertEmail = `vocab-expert-${stamp}@t.test`;
  const travelerEmail = `vocab-traveler-${stamp}@t.test`;
  const applicantEmail = `vocab-applicant-${stamp}@t.test`;
  const createdEmails = [providerEmail, expertEmail, travelerEmail, applicantEmail];
  const createdServiceIds: string[] = [];
  const createdBookingIds: string[] = [];

  try {
    console.log(`\n── setup (${BASE}) ──`);
    await registerAndPromote(providerEmail, "service_provider");
    const expertActor = await registerAndPromote(expertEmail, "travel_expert");
    const traveler = await registerAndPromote(travelerEmail, null); // stays role "user"
    const providerRow = await userByEmail(providerEmail);
    const expertRow = await userByEmail(expertEmail);

    // revenueShareRate must be NULL: the column defaults to 0.75, and a per-service rate is
    // the documented FINAL OVERRIDE — it would mask the role-routed commission branch under test.
    const [provSvc] = await db.insert(providerServices).values({
      userId: providerRow.id,
      serviceName: "Vocab verify provider service",
      description: "fixture",
      price: "100.00",
      status: "active",
      approvalStatus: "approved",
      revenueShareRate: null,
    } as any).returning();
    const [expSvc] = await db.insert(providerServices).values({
      userId: expertRow.id,
      serviceName: "Vocab verify expert service",
      description: "fixture",
      price: "100.00",
      status: "active",
      approvalStatus: "approved",
      revenueShareRate: null,
    } as any).returning();
    createdServiceIds.push(provSvc.id, expSvc.id);
    console.log("  provider + expert users, one $100 service each");

    console.log("\n── 1: 🔴 provider-owned booking → PROVIDER_BOOKING split (12 % tier 1) ──");
    const b1 = await traveler.req("POST", "/api/expert-booking-requests", { serviceId: provSvc.id, notes: "vocab-verify" });
    check("booking request accepted", b1.status === 200 || b1.status === 201, `status ${b1.status}: ${b1.text.slice(0, 150)}`);
    const [provBooking] = await db.select().from(serviceBookings).where(eq(serviceBookings.serviceId, provSvc.id));
    if (provBooking) createdBookingIds.push(provBooking.id);
    check("service_bookings row exists", !!provBooking);
    // PROVIDER_BOOKING tier 1 = 12 % platform / 88 % provider (commissionCalculator).
    check(
      `platformFee is 12.00 (was 25.00 expert split before the fix) — got ${provBooking?.platformFee}`,
      Number(provBooking?.platformFee) === 12,
    );
    check(
      `providerEarnings is 88.00 — got ${provBooking?.providerEarnings}`,
      Number(provBooking?.providerEarnings) === 88,
    );

    console.log("\n── 2: expert-owned booking still prices via the expert split ──");
    const b2 = await traveler.req("POST", "/api/expert-booking-requests", { serviceId: expSvc.id, notes: "vocab-verify" });
    check("booking request accepted", b2.status === 200 || b2.status === 201, `status ${b2.status}`);
    const [expBooking] = await db.select().from(serviceBookings).where(eq(serviceBookings.serviceId, expSvc.id));
    if (expBooking) createdBookingIds.push(expBooking.id);
    check("service_bookings row exists", !!expBooking);
    check(
      `expert booking platformFee differs from provider tier rate — got ${expBooking?.platformFee}`,
      !!expBooking && Number(expBooking.platformFee) !== 12,
    );

    console.log("\n── 3: intake validation (privilege-escalation closed) ──");
    const applicant = await registerAndPromote(applicantEmail, null);
    const badApp = await applicant.req("POST", "/api/expert-application", {
      firstName: "Vocab", lastName: "Verify", expertType: "admin",
    });
    check(`expertType "admin" rejected (400) — got ${badApp.status}`, badApp.status === 400);
    const badApp2 = await applicant.req("POST", "/api/expert-application", {
      firstName: "Vocab", lastName: "Verify", expertType: "service_provider",
    });
    check(`expertType "service_provider" rejected (400) — got ${badApp2.status}`, badApp2.status === 400);
    const goodApp = await applicant.req("POST", "/api/expert-application", {
      firstName: "Vocab", lastName: "Verify", expertType: "travel_expert",
    });
    check(`expertType "travel_expert" accepted — got ${goodApp.status}`, goodApp.status === 201 || goodApp.status === 200);

    console.log("\n── 4: role switch (PATCH /api/expert/role) ──");
    // Give the expert an approved form so the switch gate passes.
    await db.insert(localExpertForms).values({
      userId: expertRow.id, expertType: "travel_expert", status: "approved",
      firstName: "Vocab", lastName: "Verify",
    } as any);
    const swBad = await expertActor.req("PATCH", "/api/expert/role", { expertType: "service_provider" });
    check(`switch to "service_provider" rejected (400) — got ${swBad.status}`, swBad.status === 400);
    const swBad2 = await expertActor.req("PATCH", "/api/expert/role", { expertType: "admin" });
    check(`switch to "admin" rejected (400) — got ${swBad2.status}`, swBad2.status === 400);
    const swOk = await expertActor.req("PATCH", "/api/expert/role", { expertType: "event_planner" });
    check(`switch to "event_planner" accepted — got ${swOk.status}`, swOk.status === 200);
    const afterSwitch = await userByEmail(expertEmail);
    check(`users.role flipped to event_planner — got ${afterSwitch?.role}`, afterSwitch?.role === "event_planner");

    console.log("\n── 5: payout onboarding no longer 403s the expert family ──");
    const onboard = await expertActor.req("POST", "/api/stripe/connect/onboard", {});
    // Without a Stripe key locally the honest degrade is 503 stripe_unavailable; with a key
    // it proceeds. Either way it must NOT be the 403 role lockout the old pair produced.
    check(
      `travel_expert-family onboard is not role-403 — got ${onboard.status} ${JSON.stringify(onboard.json)?.slice(0, 80)}`,
      onboard.status !== 403,
    );
  } finally {
    console.log("\n── cleanup ──");
    try {
      if (createdBookingIds.length) await db.delete(serviceBookings).where(inArray(serviceBookings.id, createdBookingIds));
      if (createdServiceIds.length) await db.delete(providerServices).where(inArray(providerServices.id, createdServiceIds));
      const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, createdEmails.map(e => e.toLowerCase())));
      const ids = rows.map(r => r.id);
      if (ids.length) {
        await db.delete(localExpertForms).where(inArray(localExpertForms.userId, ids));
        await db.delete(users).where(inArray(users.id, ids));
      }
      console.log("  fixtures removed");
    } catch (e: any) {
      console.log(`  cleanup error (non-fatal): ${e?.message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
