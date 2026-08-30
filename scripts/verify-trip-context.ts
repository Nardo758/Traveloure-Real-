// TripContext P1 logic gate — proves the module's two load-bearing semantics:
//   (1) MERGE-BY-DEFAULT: a partial update never destroys fields it doesn't
//       mention (the concierge-handoff clobber class, defect D1), and
//   (2) DATE NORMALIZATION: startDate/endDate always store YYYY-MM-DD whether
//       the caller passes a Date, an ISO datetime, or a date-only string
//       (defect D3 — the full-ISO write that broke <input type="date"> seeds).
// Run: `npx tsx scripts/verify-trip-context.ts`
// Scope: docs/audits/trip-context-scope.md

// sessionStorage/window shim so the browser module runs under node.
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

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

// Minimal `fetch` stub so switchTripContext/hydrateTripContextFromServer's
// server-push/pull calls don't throw under node — captures every call so the
// #972 proofs below can assert exactly which server row each write targeted.
type FetchCall = { url: string; method: string; body?: any };
let fetchCalls: FetchCall[] = [];
let fetchResponder: (call: FetchCall) => { ok: boolean; json?: any } = () => ({ ok: true, json: {} });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const call: FetchCall = {
    url,
    method: init.method || "GET",
    body: init.body ? JSON.parse(init.body) : undefined,
  };
  fetchCalls.push(call);
  const resp = fetchResponder(call);
  return {
    ok: resp.ok,
    json: async () => resp.json ?? {},
  } as any;
};

async function main() {
  const {
    getTripContext,
    updateTripContext,
    clearTripContext,
    switchTripContext,
    switchTripContextPreservingId,
    hydrateTripContextFromServer,
  } = await import("../client/src/lib/trip-context");
  const { syncActiveTripToContext } = await import("../client/src/lib/trip-selection");

  // --- (2) Date normalization at the write boundary --------------------------
  clearTripContext();
  updateTripContext({ startDate: new Date("2026-08-12T15:30:00Z") });
  check("Date object → YYYY-MM-DD", getTripContext().startDate === "2026-08-12",
    `got ${getTripContext().startDate}`);

  updateTripContext({ startDate: "2026-08-13T00:00:00.000Z" });
  check("ISO datetime string → YYYY-MM-DD", getTripContext().startDate === "2026-08-13",
    `got ${getTripContext().startDate}`);

  updateTripContext({ endDate: "2026-08-17" });
  check("date-only string passes through", getTripContext().endDate === "2026-08-17");

  updateTripContext({ startDate: "not-a-date" });
  check("garbage date is dropped (previous value kept)",
    getTripContext().startDate === "2026-08-13",
    `got ${getTripContext().startDate}`);

  // --- (1) Merge-by-default — the D1 clobber regression -----------------------
  clearTripContext();
  updateTripContext({
    experienceSlug: "wedding",
    destination: "Kyoto",
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    travelers: 4,
  });
  // The concierge handoff writes only these three fields — the old raw setItem
  // destroyed everything else.
  updateTripContext({ experienceType: "wedding", destination: "Kyoto", intent: "full planning" });
  const afterHandoff = getTripContext();
  check("partial update keeps unmentioned fields (D1)",
    afterHandoff.startDate === "2026-09-01" &&
    afterHandoff.endDate === "2026-09-08" &&
    afterHandoff.travelers === 4 &&
    afterHandoff.experienceSlug === "wedding",
    JSON.stringify(afterHandoff));
  check("partial update applied its own fields", afterHandoff.intent === "full planning");

  updateTripContext({ destination: undefined, travelers: 6 });
  const afterUndef = getTripContext();
  check("explicit undefined does not erase", afterUndef.destination === "Kyoto");
  check("defined value in same patch still applies", afterUndef.travelers === 6);

  // --- Back-compat: legacy raw blob reads fine --------------------------------
  clearTripContext();
  sessionStorage.setItem("experienceContext",
    JSON.stringify({ experienceType: "proposal", startDate: "2026-10-01T12:00:00.000Z", id: "legacy-uuid" }));
  const legacy = getTripContext();
  check("legacy blob readable (same storage key)", legacy.experienceType === "proposal");
  check("legacy id alias preserved", legacy.id === "legacy-uuid");
  // Note: stored legacy datetime is only normalized on the next write —
  updateTripContext({ startDate: legacy.startDate });
  check("re-writing a legacy datetime normalizes it",
    getTripContext().startDate === "2026-10-01",
    `got ${getTripContext().startDate}`);

  // --- Corrupt storage never throws ------------------------------------------
  sessionStorage.setItem("experienceContext", "{not json");
  check("corrupt blob → empty context, no throw",
    Object.keys(getTripContext()).length === 0);
  updateTripContext({ destination: "Osaka" });
  check("write over corrupt blob recovers", getTripContext().destination === "Osaka");

  // --- (3) switchTripContext — REPLACE semantics for the identity set (#354) --
  clearTripContext();
  updateTripContext({
    destination: "Paris", startDate: "2026-01-01", endDate: "2026-01-05",
    travelers: 3, experienceSlug: "wedding",
  });
  switchTripContext({ tripId: "trip-A", destination: "Kyoto, Japan", startDate: "2026-09-01", endDate: "2026-09-08" });
  const afterSwitch = getTripContext();
  check("switchTripContext sets tripId + destination together",
    afterSwitch.tripId === "trip-A" && afterSwitch.destination === "Kyoto, Japan",
    JSON.stringify(afterSwitch));
  check("switchTripContext CLEARS an omitted identity field (travelers)",
    !("travelers" in afterSwitch), JSON.stringify(afterSwitch));
  check("switchTripContext preserves a non-identity field (experienceSlug)",
    afterSwitch.experienceSlug === "wedding");

  // --- (4) switchTripContextPreservingId — the edit-trip-panel policy ---------
  clearTripContext();
  switchTripContext({ tripId: "trip-X", destination: "Osaka, Japan", startDate: "2026-05-01", endDate: "2026-05-04", travelers: 2 });
  switchTripContextPreservingId({ destination: "Osaka, Japan", startDate: "2026-05-02", endDate: "2026-05-06", travelers: 4 });
  const preserved = getTripContext();
  check("switchTripContextPreservingId keeps tripId when destination unchanged",
    preserved.tripId === "trip-X" && preserved.startDate === "2026-05-02", JSON.stringify(preserved));

  switchTripContextPreservingId({ destination: "Kobe, Japan", startDate: "2026-06-01", endDate: "2026-06-03" });
  const clearedOnChange = getTripContext();
  check("switchTripContextPreservingId CLEARS tripId when destination changes",
    clearedOnChange.tripId === undefined && clearedOnChange.destination === "Kobe, Japan",
    JSON.stringify(clearedOnChange));

  // --- (5) #972 tripwire: updateTripContext merge while tripId is bound -------
  clearTripContext();
  switchTripContext({ tripId: "trip-Y", destination: "Nara, Japan", startDate: "2026-07-01", endDate: "2026-07-03" });
  {
    const realWarn = console.warn;
    let warned = false;
    console.warn = (...args: any[]) => { warned = true; };
    updateTripContext({ destination: "Somewhere Else" }); // no tripId in patch — should warn
    console.warn = realWarn;
    check("updateTripContext warns when it writes destination while tripId is bound (no tripId in patch)", warned);
    check("...but still applies the write (diagnostic only, no behavior change)",
      getTripContext().destination === "Somewhere Else");
  }
  {
    const realWarn = console.warn;
    let warned = false;
    console.warn = (...args: any[]) => { warned = true; };
    updateTripContext({ destination: "Nara, Japan", tripId: "trip-Y" }); // tripId re-affirmed — no warn
    console.warn = realWarn;
    check("updateTripContext does NOT warn when the patch re-affirms tripId", !warned);
  }
  {
    const realWarn = console.warn;
    let warned = false;
    console.warn = (...args: any[]) => { warned = true; };
    updateTripContext({ travelers: 5 }); // non-identity field — no warn
    console.warn = realWarn;
    check("updateTripContext does NOT warn for a non-identity-field merge", !warned);
  }

  // --- (6) #972 receipt 1/2: the dashboard trip-chip's REAL handler -----------
  // syncActiveTripToContext is the exact function dashboard.tsx's chip onClick
  // calls (client/src/pages/dashboard.tsx `selectTrip`) — this proves the real
  // handler code path, not a re-implementation of it.
  clearTripContext();
  const tripA = {
    id: "trip-A-id", destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-05",
    title: "Kyoto Trip", numberOfTravelers: 2, experienceType: "vacation",
  };
  const tripB = {
    id: "trip-B-id", destination: "Osaka, Japan", startDate: "2026-11-10", endDate: "2026-11-15",
    title: "Osaka Trip", numberOfTravelers: 3, experienceType: "vacation",
  };
  syncActiveTripToContext(tripA);
  check("dashboard chip A: TripContext binds A's tripId + own fields",
    getTripContext().tripId === "trip-A-id" &&
    getTripContext().destination === "Kyoto, Japan" &&
    getTripContext().startDate === "2026-10-01",
    JSON.stringify(getTripContext()));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  fetchCalls = [];
  await sleep(1600); // let A's debounced server push actually fire
  const aPush = fetchCalls.find((c) => c.method === "PUT");
  check("A's debounced push targets A's OWN trip-scoped row",
    !!aPush && aPush.url === "/api/trip-context?tripId=trip-A-id" && aPush.body?.context?.destination === "Kyoto, Japan",
    JSON.stringify(aPush));

  fetchCalls = [];
  syncActiveTripToContext(tripB); // the dashboard-chip switch to trip B
  const optimizeRequestTripId = getTripContext().tripId; // what cart.tsx's proceedOptimize/handleOptimizePayment reads
  check("dashboard chip B: the optimize request assembly now carries B's id, not A's",
    optimizeRequestTripId === "trip-B-id", `got ${optimizeRequestTripId}`);
  check("B's fields are B's own (not mixed with A's)",
    getTripContext().destination === "Osaka, Japan" && getTripContext().startDate === "2026-11-10",
    JSON.stringify(getTripContext()));

  await sleep(1600); // let B's debounced push fire
  const bPush = fetchCalls.find((c) => c.method === "PUT");
  check("B's debounced push targets B's OWN row, never A's stale id",
    !!bPush && bPush.url === "/api/trip-context?tripId=trip-B-id" && bPush.body?.context?.destination === "Osaka, Japan",
    JSON.stringify(bPush));
  check("no push targeted A's row during the B switch (A's trip_contexts row untouched by this switch)",
    !fetchCalls.some((c) => c.method === "PUT" && c.url.includes("trip-A-id")));

  // --- (7) #972 receipt 3: hydrate race — a trip bound mid-flight must not be
  // clobbered by a stale legacy-row response that was already in flight -------
  clearTripContext();
  fetchCalls = [];
  fetchResponder = () => ({
    ok: true,
    json: { context: { destination: "Weeks-Old Place", startDate: "2020-01-01", endDate: "2020-01-05", travelers: 1 } },
  });
  const hydratePromise = hydrateTripContextFromServer(); // fires the legacy-row GET (no local tripId yet)
  // Simulate the dashboard trip-chip switch landing WHILE that GET is in flight.
  switchTripContext({ tripId: "trip-B-id", destination: "Osaka, Japan", startDate: "2026-11-10", endDate: "2026-11-15", travelers: 3 });
  await hydratePromise;
  const afterRace = getTripContext();
  check("hydrate discards a legacy-row response that raced against a mid-flight trip bind",
    afterRace.tripId === "trip-B-id" && afterRace.destination === "Osaka, Japan" && afterRace.startDate === "2026-11-10",
    JSON.stringify(afterRace));
  check("stale legacy destination never leaked in", afterRace.destination !== "Weeks-Old Place");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
