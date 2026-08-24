/**
 * verify-workstation-flows.ts — behavioral gate for the workstation-flow fixes (F1/F2, 2026-07-26).
 *
 * F1 (P1): a routed lead materializes in the expert's request inbox — `ensureTripAdvisorRow`
 *   creates the pending `trip_expert_advisors` row, the trip appears in /api/expert/assigned-trips,
 *   Accept works, and the workspace authorizes the expert. Idempotent: a second call never
 *   duplicates the assignment.
 * F2: advancing workspace-status notifies the TRAVELER (in_review + delivered), with the
 *   traveler-facing /trip/… link — never the expert workspace path.
 *
 * Usage: DATABASE_URL=... BASE_URL=http://localhost:5000 npx tsx scripts/verify-workstation-flows.ts
 * Self-cleaning.
 */
import { db } from "../server/db";
import { users, trips, tripExpertAdvisors, notifications } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { ensureTripAdvisorRow } from "../server/services/booking-actions.service";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "VerifyFlows!2026";

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
      try { json = JSON.parse(text); } catch { /* noop */ }
      return { status: res.status, json, text };
    },
  };
}

async function register(actor: ReturnType<typeof makeActor>, email: string) {
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Verify", lastName: "Flows",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Verify", lastName: "Flows",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register ${email}: ${reg.status} ${reg.text.slice(0, 150)}`);
  }
}

async function main() {
  const stamp = Date.now();
  const expertEmail = `flows-expert-${stamp}@t.test`;
  const travelerEmail = `flows-traveler-${stamp}@t.test`;
  let expertId = "";
  let travelerId = "";
  let tripId = "";

  const expert = makeActor();

  try {
    console.log(`\n── setup (${BASE}) ──`);
    await register(expert, expertEmail);
    const traveler = makeActor();
    await register(traveler, travelerEmail);
    await db.update(users).set({ role: "local_expert" } as any).where(eq(users.email, expertEmail));
    await expert.req("POST", "/api/auth/login", { email: expertEmail, password: PASSWORD });
    expertId = (await db.select({ id: users.id }).from(users).where(eq(users.email, expertEmail)))[0].id;
    travelerId = (await db.select({ id: users.id }).from(users).where(eq(users.email, travelerEmail)))[0].id;

    // A traveler trip a routed lead would target.
    const [trip] = await db.insert(trips).values({
      userId: travelerId, title: "Flows gate trip", destination: "Kyoto",
      startDate: "2026-09-01", endDate: "2026-09-04", status: "draft",
    } as any).returning();
    tripId = trip.id;
    console.log(`  expert ${expertId.slice(0, 8)}… · traveler trip ${tripId.slice(0, 8)}…`);

    console.log("\n── F1: routed lead materializes in the inbox ──");
    const before = await expert.req("GET", "/api/expert/assigned-trips");
    check("trip absent from inbox before routing", !(before.json ?? []).some((t: any) => t.trip_id === tripId));

    // The exact call the routed-lead success path now makes.
    await ensureTripAdvisorRow(tripId, expertId, "routed lead (gate)");
    const after = await expert.req("GET", "/api/expert/assigned-trips");
    const row = (after.json ?? []).find((t: any) => t.trip_id === tripId);
    check("routed lead now appears in Assigned Trips", !!row, JSON.stringify((after.json ?? []).length));
    check("born pending (the accept lifecycle applies)", row?.status === "pending", row?.status);

    await ensureTripAdvisorRow(tripId, expertId, "duplicate call");
    const advisorRows = await db.select({ id: tripExpertAdvisors.id }).from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, expertId)));
    check("idempotent — a second routing never duplicates the assignment", advisorRows.length === 1,
      `${advisorRows.length} rows`);

    const accept = await expert.req("POST", `/api/expert/assignments/${row.assignment_id}/accept`);
    check("expert can Accept the routed lead", accept.status === 200, `${accept.status}`);
    const ctx = await expert.req("GET", `/api/expert/workspace-context/${tripId}`);
    check("workspace authorizes the expert (assignment mode)",
      ctx.status === 200 && ctx.json?.mode === "assignment", `${ctx.status} ${ctx.json?.mode}`);

    console.log("\n── F2: delivery notifies the traveler ──");
    const beforeNotifs = await db.select({ id: notifications.id }).from(notifications)
      .where(eq(notifications.userId, travelerId));

    const inReview = await expert.req("PATCH", `/api/expert/assignments/${row.assignment_id}/workspace-status`,
      { workspaceStatus: "in_review" });
    check("draft → in_review transition ok", inReview.status === 200, `${inReview.status} ${inReview.text.slice(0, 120)}`);
    const delivered = await expert.req("PATCH", `/api/expert/assignments/${row.assignment_id}/workspace-status`,
      { workspaceStatus: "delivered" });
    check("in_review → delivered transition ok", delivered.status === 200);

    const afterNotifs = await db.select().from(notifications)
      .where(and(eq(notifications.userId, travelerId), eq(notifications.type, "itinerary_update")));
    check("traveler received BOTH transition notifications", afterNotifs.length === 2,
      `${afterNotifs.length} (had ${beforeNotifs.length} before)`);
    const links = afterNotifs.map((n: any) => n.data?.workspacePath ?? "");
    check("links are the TRAVELER'S trip view, never the expert workspace",
      links.every((l: string) => l.startsWith(`/trip/${tripId}`)), JSON.stringify(links));
    check("titles distinguish review vs delivered",
      afterNotifs.some((n: any) => n.title.includes("review")) &&
      afterNotifs.some((n: any) => n.title.includes("delivered")),
      JSON.stringify(afterNotifs.map((n: any) => n.title)));
  } finally {
    console.log("\n── cleanup ──");
    try {
      if (tripId) {
        await db.delete(tripExpertAdvisors).where(eq(tripExpertAdvisors.tripId, tripId));
        await db.delete(trips).where(eq(trips.id, tripId));
      }
      if (travelerId) await db.delete(notifications).where(eq(notifications.userId, travelerId));
      if (expertId) await db.delete(notifications).where(eq(notifications.userId, expertId));
      await db.delete(users).where(eq(users.email, expertEmail));
      await db.delete(users).where(eq(users.email, travelerEmail));
      console.log("  removed test rows");
    } catch (e: any) {
      console.log(`  cleanup warning: ${e.message}`);
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} workstation-flows gate: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify failed:", e); process.exit(1); });
