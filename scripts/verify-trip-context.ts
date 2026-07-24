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

async function main() {
  const { getTripContext, updateTripContext, clearTripContext } = await import(
    "../client/src/lib/trip-context"
  );

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

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
