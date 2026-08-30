/**
 * verify-guest-invite-context.ts — behavioral gate for Guest-invite A2/A3
 * (docs/briefs/04-guest-invite-a2a3.md).
 *
 * A2 — TripContext `origin` provenance:
 *   module: first-touch merge semantics (origin set once, never overwritten; survives
 *           trip switches), and the REAL GuestInvitePage stamping entry point
 *           (stampInviteTripContext — imported, not re-implemented).
 *   server: PUT /api/trip-context accepts the closed vocabulary, rejects anything
 *           out-of-vocabulary (400), and a PUT WITHOUT origin never clears a stored
 *           origin (first-touch on the server row too) — legacy AND trip-scoped rows.
 *
 * A3 — invite-aware Event-class strip:
 *   SSR-renders the REAL TripStrip component: guest_invite + Event-class + title →
 *   the invite framing ("You're planning for <event>", data-invite-aware); organic or
 *   missing-field contexts → the generic strip, byte-identical framing to before.
 *
 * End-to-end: creates a real event invite via POST /api/events/:experienceId/invites,
 * follows it via the public GET /api/invites/:token as a second (anonymous) visitor,
 * feeds the actual response into the actual entry-point stamp, and renders the strip.
 *
 * Usage:
 *   DATABASE_URL=... BASE_URL=http://localhost:5601 npx tsx scripts/verify-guest-invite-context.ts
 * Requires a running server (real runMigrations() has created trip_contexts etc.).
 * Self-cleaning.
 */

// ── Browser shims so the client modules run under node ─────────────────────────
const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as any).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).CustomEvent = class {
  constructor(public type: string) {}
};

// fetch wrapper: RELATIVE urls (the module's debounced /api/trip-context push — a
// guest surface, best-effort by design) are swallowed as a silent 401 exactly like
// production for a signed-out visitor; ABSOLUTE urls pass through to the real fetch
// so the HTTP sections below still hit the live server.
const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = async (url: any, init?: any) => {
  if (typeof url === "string" && url.startsWith("/")) {
    return { ok: false, status: 401, json: async () => ({}), text: async () => "" } as any;
  }
  return realFetch(url, init);
};

const BASE = process.env.BASE_URL ?? "http://localhost:5601";

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
      const res = await realFetch(`${BASE}${path}`, {
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

async function register(actor: ReturnType<typeof makeActor>, email: string, password: string) {
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password, firstName: "Verify", lastName: "Invite",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password, firstName: "Verify", lastName: "Invite",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register ${email}: ${reg.status} ${reg.text.slice(0, 150)}`);
  }
}

async function main() {
  const {
    getTripContext,
    updateTripContext,
    clearTripContext,
    switchTripContext,
  } = await import("../client/src/lib/trip-context");
  const { stampInviteTripContext } = await import("../client/src/pages/GuestInvitePage");

  // ══ 1. Module semantics (A2) ══════════════════════════════════════════════════
  console.log("\n── A2 module: first-touch origin semantics ──");

  clearTripContext();
  stampInviteTripContext({
    title: "Sarah & Tom's Wedding",
    destination: "Tulum, Mexico",
    startDate: "2026-11-20T00:00:00.000Z",
    experienceType: "Wedding",
  });
  let ctx = getTripContext();
  check("invite stamp sets origin=guest_invite", ctx.origin === "guest_invite", JSON.stringify(ctx));
  check("invite stamp carries the event's fields (title/destination/type)",
    ctx.title === "Sarah & Tom's Wedding" && ctx.destination === "Tulum, Mexico" && ctx.experienceType === "Wedding");
  check("invite stamp date is normalized to YYYY-MM-DD", ctx.startDate === "2026-11-20", `got ${ctx.startDate}`);

  updateTripContext({ origin: "organic", destination: "Cancun, Mexico" });
  ctx = getTripContext();
  check("later merge can NOT overwrite origin (first-touch wins)", ctx.origin === "guest_invite", `got ${ctx.origin}`);
  check("...but the same patch's other fields still apply", ctx.destination === "Cancun, Mexico");

  switchTripContext({ tripId: "trip-guest-1", destination: "Tulum, Mexico", startDate: "2026-11-19", endDate: "2026-11-22" });
  ctx = getTripContext();
  check("origin survives a trip switch (not a SWITCH_FIELD)",
    ctx.origin === "guest_invite" && ctx.tripId === "trip-guest-1", JSON.stringify(ctx));

  // Bound-trip guard: an invite visit while a trip is bound stamps ONLY provenance.
  clearTripContext();
  switchTripContext({ tripId: "trip-organic-1", destination: "Kyoto, Japan", startDate: "2026-09-01", endDate: "2026-09-05", title: "Kyoto Trip" });
  stampInviteTripContext({ title: "Crashed Wedding", destination: "Elsewhere", startDate: "2027-01-01", experienceType: "Wedding" });
  ctx = getTripContext();
  check("invite stamp with a BOUND trip keeps the trip's identity fields (#972 guard)",
    ctx.destination === "Kyoto, Japan" && ctx.title === "Kyoto Trip" && ctx.tripId === "trip-organic-1", JSON.stringify(ctx));
  check("...while still recording provenance", ctx.origin === "guest_invite");

  // Organic control: nothing ever sets origin on an organic path.
  clearTripContext();
  updateTripContext({ destination: "Lisbon, Portugal", startDate: "2026-10-01", travelers: 2, experienceType: "Wedding", title: "Ana's Wedding" });
  ctx = getTripContext();
  check("organic context carries NO origin (unchanged behavior)", !("origin" in ctx), JSON.stringify(ctx));

  // ══ 2. A3: TripStrip SSR render — invite-aware vs generic ═════════════════════
  console.log("\n── A3 strip: invite-aware Event-class variant (SSR render of the real component) ──");
  const React = (await import("react")).default;
  // The app compiles JSX with Vite's AUTOMATIC runtime; tsx/esbuild here uses the
  // CLASSIC transform, which emits a bare `React.createElement`. Expose React
  // globally so the real component modules load unmodified under this harness.
  (globalThis as any).React = React;
  const { renderToString } = await import("react-dom/server");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { Router } = await import("wouter");
  const { TripStrip } = await import("../client/src/components/trip/trip-strip");

  // wouter's own SSR entry point (`ssrPath`) — memoryLocation's useSyncExternalStore
  // has no getServerSnapshot and cannot render on the server.
  function renderStrip(context: Record<string, unknown>): string {
    store.clear();
    sessionStorage.setItem("experienceContext", JSON.stringify(context));
    // Cart query stubbed to empty: the strip's cart chip is P3 surface, not A3 —
    // this gate is about the LEAD framing. `enabled:false` alone still warns.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false, queryFn: async () => ({ itemCount: 0, total: "0" }) } },
    });
    return renderToString(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(Router, { ssrPath: "/discover" }, React.createElement(TripStrip)),
      ),
    );
  }

  const inviteCtx = {
    origin: "guest_invite",
    title: "Sarah & Tom's Wedding",
    destination: "Tulum, Mexico",
    startDate: "2026-11-20",
    experienceType: "Wedding",
  };
  const inviteHtml = renderStrip(inviteCtx);
  check("invite-origin Event context renders the invite-aware lead",
    inviteHtml.includes("You&#x27;re planning for Sarah &amp; Tom&#x27;s Wedding"),
    inviteHtml.slice(0, 300));
  check("invite-aware marker attribute present", inviteHtml.includes('data-invite-aware="true"'));

  const organicHtml = renderStrip({ ...inviteCtx, origin: undefined });
  check("SAME context without origin renders the generic event lead (organic unchanged)",
    !organicHtml.includes("planning for") && organicHtml.includes("Your Tulum wedding"),
    organicHtml.slice(0, 300));
  check("no invite-aware marker on the organic strip", !organicHtml.includes("data-invite-aware"));

  const travelHtml = renderStrip({ origin: "guest_invite", title: "Company Offsite", destination: "Denver, CO", experienceType: "Travel", startDate: "2026-10-10" });
  check("guest_invite origin WITHOUT an Event-class type stays generic (fallback)",
    !travelHtml.includes("planning for") && travelHtml.includes("Your trip"), travelHtml.slice(0, 300));

  const noTitleHtml = renderStrip({ origin: "guest_invite", destination: "Tulum, Mexico", experienceType: "Wedding", startDate: "2026-11-20" });
  check("guest_invite Event context with NO title falls back gracefully (never fabricated)",
    !noTitleHtml.includes("planning for"), noTitleHtml.slice(0, 300));

  // ══ 3. End-to-end + server semantics (real endpoints, real DB) ════════════════
  console.log(`\n── end-to-end via real endpoints (${BASE}) ──`);
  const { db } = await import("../server/db");
  const { users, trips, userExperiences, experienceTypes } = await import("@shared/schema");
  const { eventInvites } = await import("../shared/guest-invites-schema");
  const { eq, sql } = await import("drizzle-orm");

  const stamp = Date.now();
  const PASSWORD = "VerifyInvite!2026";
  const organizerEmail = `invite-organizer-${stamp}@t.test`;
  const guestUserEmail = `invite-guest-${stamp}@t.test`;
  const organicEmail = `invite-organic-${stamp}@t.test`;
  let organizerId = "", guestUserId = "", organicId = "", expTypeId = "", experienceId = "", guestTripId = "";

  try {
    const organizer = makeActor();
    await register(organizer, organizerEmail, PASSWORD);
    organizerId = (await db.select().from(users).where(eq(users.email, organizerEmail)))[0].id;

    // Fixture: an Event-class experience type + the organizer's event (the invite's parent).
    const [expType] = await db.insert(experienceTypes).values({
      name: `Wedding Verify ${stamp}`, slug: `wedding-verify-${stamp}`,
    } as any).returning();
    expTypeId = expType.id;
    const [experience] = await db.insert(userExperiences).values({
      userId: organizerId, experienceTypeId: expTypeId, title: "Sarah & Tom's Wedding",
      location: "Tulum, Mexico", eventDate: "2026-11-20", status: "planning",
    } as any).returning();
    experienceId = experience.id;

    // Real invite creation endpoint (organizer session).
    const created = await organizer.req("POST", `/api/events/${experienceId}/invites`, {
      guests: [{ email: guestUserEmail, name: "Verify Guest" }],
    });
    check("POST /api/events/:experienceId/invites creates the invite", created.status === 201, `${created.status} ${created.text.slice(0, 120)}`);
    const token = created.json?.invites?.[0]?.uniqueToken;
    check("invite carries a unique token", typeof token === "string" && token.length > 10);

    // Second user: anonymous guest follows the invite link's data endpoint.
    const anon = makeActor();
    const inviteView = await anon.req("GET", `/api/invites/${token}`);
    check("public GET /api/invites/:token resolves", inviteView.status === 200, `${inviteView.status}`);
    const exp = inviteView.json?.experience;
    check("redacted experience carries the Event-class type name (A2 join)",
      exp?.experienceType === `Wedding Verify ${stamp}`, JSON.stringify(exp));
    check("redaction still withholds organizer fields (budget/preferences/stepData)",
      exp && !("budget" in exp) && !("preferences" in exp) && !("stepData" in exp), JSON.stringify(exp));

    // Feed the REAL response through the REAL entry-point stamp → REAL strip render.
    clearTripContext();
    stampInviteTripContext(exp);
    const e2eCtx = getTripContext();
    check("TripContext born from the invite entry carries origin=guest_invite",
      e2eCtx.origin === "guest_invite" && e2eCtx.title === "Sarah & Tom's Wedding" && e2eCtx.destination === "Tulum, Mexico",
      JSON.stringify(e2eCtx));
    const e2eHtml = renderStrip(e2eCtx as any);
    check("strip rendered from the real invite context shows the invite-aware variant",
      e2eHtml.includes("You&#x27;re planning for Sarah &amp; Tom&#x27;s Wedding") && e2eHtml.includes('data-invite-aware="true"'),
      e2eHtml.slice(0, 300));

    // ── Server-side origin semantics (signed-in guest, legacy per-user row) ──
    console.log("\n── server: PUT /api/trip-context origin allow-list + first-touch ──");
    const guestUser = makeActor();
    await register(guestUser, guestUserEmail, PASSWORD);
    guestUserId = (await db.select().from(users).where(eq(users.email, guestUserEmail)))[0].id;

    const put1 = await guestUser.req("PUT", "/api/trip-context", {
      context: { origin: "guest_invite", destination: "Tulum, Mexico", startDate: "2026-11-20", title: "Sarah & Tom's Wedding", experienceType: "Wedding" },
    });
    check("PUT with origin=guest_invite accepted", put1.status === 200, `${put1.status} ${put1.text.slice(0, 120)}`);
    const get1 = await guestUser.req("GET", "/api/trip-context");
    check("GET returns the stored origin", get1.json?.context?.origin === "guest_invite", JSON.stringify(get1.json));

    const putBad = await guestUser.req("PUT", "/api/trip-context", { context: { origin: "party_crash" } });
    check("PUT with out-of-vocabulary origin → 400", putBad.status === 400, `${putBad.status}`);

    const put2 = await guestUser.req("PUT", "/api/trip-context", {
      context: { destination: "Cancun, Mexico", startDate: "2026-11-21" },
    });
    check("PUT without origin accepted", put2.status === 200);
    const get2 = await guestUser.req("GET", "/api/trip-context");
    check("PUT without origin does NOT clear the stored origin (server first-touch)",
      get2.json?.context?.origin === "guest_invite", JSON.stringify(get2.json?.context));
    check("...while the rest of the blob was replaced as before",
      get2.json?.context?.destination === "Cancun, Mexico" && !("title" in (get2.json?.context ?? {})));

    const put3 = await guestUser.req("PUT", "/api/trip-context", { context: { origin: "organic", destination: "Cancun, Mexico" } });
    check("PUT with a DIFFERENT origin accepted (but ignored)", put3.status === 200);
    const get3 = await guestUser.req("GET", "/api/trip-context");
    check("stored origin is never overwritten (first-touch on the server row)",
      get3.json?.context?.origin === "guest_invite", JSON.stringify(get3.json?.context));

    // ── Same semantics on the TRIP-SCOPED row (the second SQL branch) ──
    const [guestTrip] = await db.insert(trips).values({
      userId: guestUserId, title: "Invite gate trip", destination: "Tulum",
      startDate: "2026-11-19", endDate: "2026-11-22", status: "draft",
    } as any).returning();
    guestTripId = guestTrip.id;
    const putT1 = await guestUser.req("PUT", `/api/trip-context?tripId=${guestTripId}`, {
      context: { origin: "guest_invite", destination: "Tulum, Mexico", tripId: guestTripId },
    });
    check("trip-scoped PUT with origin accepted", putT1.status === 200, `${putT1.status}`);
    await guestUser.req("PUT", `/api/trip-context?tripId=${guestTripId}`, {
      context: { destination: "Playa del Carmen, Mexico", tripId: guestTripId },
    });
    const getT = await guestUser.req("GET", `/api/trip-context?tripId=${guestTripId}`);
    check("trip-scoped row preserves origin across an origin-less PUT too",
      getT.json?.context?.origin === "guest_invite" && getT.json?.context?.destination === "Playa del Carmen, Mexico",
      JSON.stringify(getT.json?.context));

    // ── Organic control: a user who never touched an invite ──
    const organic = makeActor();
    await register(organic, organicEmail, PASSWORD);
    organicId = (await db.select().from(users).where(eq(users.email, organicEmail)))[0].id;
    await organic.req("PUT", "/api/trip-context", { context: { destination: "Lisbon, Portugal", startDate: "2026-10-01" } });
    const getO = await organic.req("GET", "/api/trip-context");
    check("organic user's stored context has NO origin key (unchanged)",
      getO.json?.context?.destination === "Lisbon, Portugal" && !("origin" in (getO.json?.context ?? {})),
      JSON.stringify(getO.json?.context));
  } finally {
    // Self-clean (FK cascades: invites/travel-plans via experience delete).
    try {
      if (experienceId) await db.delete(userExperiences).where(eq(userExperiences.id, experienceId));
      if (expTypeId) await db.delete(experienceTypes).where(eq(experienceTypes.id, expTypeId));
      if (guestTripId) await db.delete(trips).where(eq(trips.id, guestTripId));
      for (const uid of [organizerId, guestUserId, organicId].filter(Boolean)) {
        await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${uid}`);
        await db.delete(users).where(eq(users.id, uid));
      }
    } catch (e) {
      console.error("cleanup:", e);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
