/**
 * verify-expert-console.ts — behavioral gate for the sidebar-audit repairs (2026-07-25).
 *
 * Proves over real HTTP that:
 *   1. The three formerly-dark families now return JSON, not the Vite catch-all:
 *      /api/expert/role (GET), /api/expert/service-templates, /api/expert/knowledge-nuggets CRUD.
 *   2. Nugget CRUD round-trips (create → list → update → delete) and is session-scoped.
 *   3. Factory wire A: /api/expert/coordination-engagements lists ONLY the session expert's
 *      assignments (a coordination_states row assigned to someone else never appears).
 *
 * Usage: DATABASE_URL=... BASE_URL=http://localhost:5000 npx tsx scripts/verify-expert-console.ts
 * Self-cleaning: temp users + rows deleted in finally.
 */
import { db } from "../server/db";
import { users, coordinationStates, localKnowledgeNuggets, localExpertForms } from "@shared/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "VerifyConsole!2026";

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
      let isJson = false;
      try { json = JSON.parse(text); isJson = true; } catch { /* HTML = catch-all = still dark */ }
      return { status: res.status, json, isJson, text };
    },
  };
}

async function register(actor: ReturnType<typeof makeActor>, email: string) {
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Verify", lastName: "Console",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Verify", lastName: "Console",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register ${email}: ${reg.status} ${reg.text.slice(0, 150)}`);
  }
}

async function main() {
  const stamp = Date.now();
  const expertEmail = `console-expert-${stamp}@t.test`;
  const otherEmail = `console-other-${stamp}@t.test`;
  let expertId = "";
  let otherId = "";
  let myEngagementId = "";
  let foreignEngagementId = "";

  const expert = makeActor();
  const other = makeActor();

  try {
    console.log(`\n── setup (${BASE}) ──`);
    await register(expert, expertEmail);
    await register(other, otherEmail);
    await db.update(users).set({ role: "local_expert" } as any).where(eq(users.email, expertEmail));
    await db.update(users).set({ role: "local_expert" } as any).where(eq(users.email, otherEmail));
    await expert.req("POST", "/api/auth/login", { email: expertEmail, password: PASSWORD });
    await other.req("POST", "/api/auth/login", { email: otherEmail, password: PASSWORD });
    expertId = (await db.select({ id: users.id }).from(users).where(eq(users.email, expertEmail)))[0].id;
    otherId = (await db.select({ id: users.id }).from(users).where(eq(users.email, otherEmail)))[0].id;
    console.log("  two local_expert sessions established");

    console.log("\n── 1: formerly-dark endpoints answer JSON (not the Vite catch-all) ──");
    const role = await expert.req("GET", "/api/expert/role");
    check("GET /api/expert/role → JSON 200", role.status === 200 && role.isJson, `${role.status} json=${role.isJson}`);
    check("role honest for no-application expert", role.json?.role === null && role.json?.applicationStatus === null,
      JSON.stringify(role.json));

    const tmpl = await expert.req("GET", "/api/expert/service-templates");
    check("GET /api/expert/service-templates → JSON 200", tmpl.status === 200 && tmpl.isJson);
    check("no application → requiresApplication:true (not a fake empty catalog)",
      tmpl.json?.requiresApplication === true, JSON.stringify(tmpl.json));

    console.log("\n── 2: knowledge-nugget CRUD round-trip (Content Studio's library) ──");
    const list0 = await expert.req("GET", "/api/expert/knowledge-nuggets");
    check("list → JSON 200", list0.status === 200 && list0.isJson && Array.isArray(list0.json));

    const created = await expert.req("POST", "/api/expert/knowledge-nuggets", {
      nuggetType: "tip", city: "Kyoto", insight: "Arashiyama before 8am beats the crowds entirely.",
    });
    check("create → 201", created.status === 201, `${created.status} ${created.text.slice(0, 120)}`);
    const nuggetId = created.json?.id;

    const list1 = await expert.req("GET", "/api/expert/knowledge-nuggets");
    check("created nugget appears in own list", (list1.json ?? []).some((n: any) => n.id === nuggetId));

    const otherList = await other.req("GET", "/api/expert/knowledge-nuggets");
    check("another expert's list does NOT contain it (session-scoped)",
      !(otherList.json ?? []).some((n: any) => n.id === nuggetId));
    const foreignPatch = await other.req("PATCH", `/api/expert/knowledge-nuggets/${nuggetId}`, { insight: "hijack" });
    check("another expert cannot update it", foreignPatch.status === 404, `got ${foreignPatch.status}`);

    const patched = await expert.req("PATCH", `/api/expert/knowledge-nuggets/${nuggetId}`, {
      insight: "Arashiyama before 8am — and skip the main street.",
    });
    check("owner update persists", patched.status === 200 && patched.json?.insight?.includes("skip the main street"));

    const deleted = await expert.req("DELETE", `/api/expert/knowledge-nuggets/${nuggetId}`);
    check("owner delete", deleted.status === 200 && deleted.json?.success === true);
    const list2 = await expert.req("GET", "/api/expert/knowledge-nuggets");
    check("gone after delete", !(list2.json ?? []).some((n: any) => n.id === nuggetId));

    console.log("\n── 3: factory wire A — coordination engagements ──");
    const empty = await expert.req("GET", "/api/expert/coordination-engagements");
    check("empty list before any assignment", empty.status === 200 && empty.json?.engagements?.length === 0,
      JSON.stringify(empty.json));

    // Simulate the Phase-1c admin assignment: one engagement for our expert, one for the other.
    const [mine] = await db.insert(coordinationStates).values({
      userId: otherId, experienceType: "wedding", status: "intake",
      destination: "Kyoto", assignedExpertId: expertId,
    } as any).returning();
    myEngagementId = mine.id;
    const [foreign] = await db.insert(coordinationStates).values({
      userId: expertId, experienceType: "corporate", status: "intake",
      destination: "Kyoto", assignedExpertId: otherId,
    } as any).returning();
    foreignEngagementId = foreign.id;

    const listed = await expert.req("GET", "/api/expert/coordination-engagements");
    const ids = (listed.json?.engagements ?? []).map((e: any) => e.id);
    check("assigned engagement appears", ids.includes(myEngagementId), JSON.stringify(ids));
    check("someone ELSE'S engagement never appears (session-scoped, §14)", !ids.includes(foreignEngagementId));
    const row = (listed.json?.engagements ?? []).find((e: any) => e.id === myEngagementId);
    check("row carries type/status/destination for the intake card",
      row?.experienceType === "wedding" && row?.destination === "Kyoto");
  } finally {
    console.log("\n── cleanup ──");
    try {
      if (myEngagementId) await db.delete(coordinationStates).where(eq(coordinationStates.id, myEngagementId));
      if (foreignEngagementId) await db.delete(coordinationStates).where(eq(coordinationStates.id, foreignEngagementId));
      if (expertId) await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.expertUserId, expertId));
      await db.delete(localExpertForms).where(eq(localExpertForms.userId, expertId));
      await db.delete(users).where(eq(users.email, expertEmail));
      await db.delete(users).where(eq(users.email, otherEmail));
      console.log("  removed test rows");
    } catch (e: any) {
      console.log(`  cleanup warning: ${e.message}`);
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} expert-console gate: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify failed:", e); process.exit(1); });
