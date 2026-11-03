/**
 * CAP-1 — the pure capabilities derivation (ledger `2026-11-03-cap1-trip-capabilities`).
 *
 *   T1 a table of input rows → the WHOLE expected actions object, one row per case the brief names plus the rulings'
 *      rows (handoff never lowers checkout; the `handoff_booking` switch; the CN-1 concierge offer / in_progress / no;
 *      the verified-email gate as "verify", which waitlist outranks).
 *   T2 `reasons` carries a machine code for every action.
 *   T3 no field in the output is an amount (no `*cents*` / `*price*` key; numbers only in runs and the suggestion count).
 *
 * Run: npx tsx --test server/services/__tests__/trip-capabilities.pure.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveCapabilities, type CapabilityInputs } from "../trip-capabilities.pure";
import { TRIP_CAPABILITY_ACTION_KEYS, type TripCapabilityActions } from "@shared/trip-capabilities";

type Partial2 = {
  viewer?: Partial<CapabilityInputs["viewer"]>;
  signup?: Partial<CapabilityInputs["signup"]>;
} & Partial<Omit<CapabilityInputs, "viewer" | "signup">>;

function inputs(o: Partial2 = {}): CapabilityInputs {
  return {
    viewer: { tripRole: "owner", isAssignedExpert: false, isAuthor: false, advisorSource: null, ownsTrip: true, canEdit: true, emailVerified: true, ...o.viewer },
    signup: { mode: "open", purchasesAllowed: true, ...o.signup },
    pass: o.pass ?? { active: false, runs: null },
    tripPassPlanAvailable: o.tripPassPlanAvailable ?? true,
    optimizerFeeDisabled: o.optimizerFeeDisabled ?? false,
    handoff: o.handoff ?? null,
    pendingSuggestions: o.pendingSuggestions ?? 0,
    handoffBookingOn: o.handoffBookingOn ?? true,
    concierge: o.concierge ?? null,
    checkoutEmailDenied: o.checkoutEmailDenied ?? false,
    handoffEmailDenied: o.handoffEmailDenied ?? false,
  };
}
const handoff = (kind: string, status: string) => ({ kind, status, scopeItemIds: ["i1"], onTripSupportOfferedAt: null, onTripSupportAcceptedAt: null });
const NONE: TripCapabilityActions = { optimize: "no", ask: "no", handoff: "no", handoffBook: "no", checkout: "no", tripPass: "no", concierge: "no" };
const OWNER_OPEN: TripCapabilityActions = { optimize: "pay", ask: "pay", handoff: "offer", handoffBook: "offer", checkout: "yes", tripPass: "offer", concierge: "offer" };
const WAITLIST: TripCapabilityActions = { optimize: "waitlist", ask: "waitlist", handoff: "no", handoffBook: "no", checkout: "waitlist", tripPass: "waitlist", concierge: "no" };

export const T1_TABLE: Array<{ name: string; in: CapabilityInputs; actions: TripCapabilityActions }> = [
  { name: "owner · open · no pass", in: inputs(), actions: OWNER_OPEN },
  { name: "owner · waitlist", in: inputs({ signup: { mode: "waitlist", purchasesAllowed: false } }), actions: WAITLIST },
  {
    name: "owner · pass with runs left",
    in: inputs({ pass: { active: true, runs: { cap: 3, used: 1, left: 2 } } }),
    actions: { ...OWNER_OPEN, optimize: "free", ask: "free", tripPass: "active" },
  },
  {
    name: "owner · pass with no runs left",
    in: inputs({ pass: { active: true, runs: { cap: 3, used: 3, left: 0 } } }),
    actions: { ...OWNER_OPEN, optimize: "pay", ask: "free", tripPass: "active" },
  },
  {
    name: "owner · waitlist · active pass (the waitlist gate runs first on the paid rails)",
    in: inputs({ signup: { mode: "waitlist", purchasesAllowed: false }, pass: { active: true, runs: { cap: 3, used: 0, left: 3 } } }),
    actions: { ...WAITLIST, tripPass: "active" },
  },
  {
    name: "owner · handoff proposed",
    in: inputs({ handoff: handoff("polish", "proposed") }),
    actions: { ...OWNER_OPEN, handoff: "in_progress", handoffBook: "no" },
  },
  {
    name: "owner · handoff accepted (plan_all) — checkout stays yes",
    in: inputs({ handoff: handoff("plan_all", "accepted") }),
    actions: { ...OWNER_OPEN, handoff: "in_progress", handoffBook: "no" },
  },
  {
    name: "owner · handoff delivered",
    in: inputs({ handoff: handoff("book", "delivered") }),
    actions: { ...OWNER_OPEN, handoff: "approve", handoffBook: "no" },
  },
  {
    name: "owner · handoff delivered · waitlist (approve moves no money)",
    in: inputs({ signup: { mode: "waitlist", purchasesAllowed: false }, handoff: handoff("polish", "delivered") }),
    actions: { ...WAITLIST, handoff: "approve" },
  },
  {
    name: "owner · handoff approved (a new ask may start)",
    in: inputs({ handoff: handoff("polish", "approved") }),
    actions: OWNER_OPEN,
  },
  {
    name: "owner · handoff_booking off — book refused, polish / plan_all offered",
    in: inputs({ handoffBookingOn: false }),
    actions: { ...OWNER_OPEN, handoffBook: "no" },
  },
  {
    name: "owner · concierge booking pending",
    in: inputs({ concierge: { status: "pending", accessUntil: null } }),
    actions: { ...OWNER_OPEN, concierge: "in_progress" },
  },
  {
    name: "owner · concierge booking refunded (offer again)",
    in: inputs({ concierge: { status: "refunded", accessUntil: null } }),
    actions: OWNER_OPEN,
  },
  { name: "payer", in: inputs({ viewer: { tripRole: "payer", ownsTrip: false, canEdit: false } }), actions: NONE },
  { name: "delegate (managing EA)", in: inputs({ viewer: { tripRole: "delegate", ownsTrip: false, canEdit: true } }), actions: NONE },
  { name: "expert (handoff advisor)", in: inputs({ viewer: { tripRole: "expert", advisorSource: "handoff", ownsTrip: false, canEdit: true } }), actions: NONE },
  { name: "concierge", in: inputs({ viewer: { tripRole: "expert", advisorSource: "concierge", ownsTrip: false, canEdit: true } }), actions: NONE },
  { name: "author", in: inputs({ viewer: { tripRole: null, isAuthor: true, ownsTrip: false, canEdit: true } }), actions: NONE },
  { name: "collaborator (friend)", in: inputs({ viewer: { tripRole: "friend", ownsTrip: false, canEdit: false } }), actions: NONE },
  {
    name: "admin owner · waitlist (the P-1s gate lets an admin buy)",
    in: inputs({ signup: { mode: "waitlist", purchasesAllowed: true } }),
    actions: OWNER_OPEN,
  },
  {
    name: "unverified owner · open (the verified-email gate is the only refusal)",
    in: inputs({ viewer: { emailVerified: false }, checkoutEmailDenied: true, handoffEmailDenied: true }),
    actions: { optimize: "verify", ask: "verify", handoff: "verify", handoffBook: "verify", checkout: "verify", tripPass: "verify", concierge: "verify" },
  },
  {
    name: "unverified owner · waitlist (waitlist wins over verify)",
    in: inputs({ viewer: { emailVerified: false }, signup: { mode: "waitlist", purchasesAllowed: false }, checkoutEmailDenied: true, handoffEmailDenied: true }),
    actions: WAITLIST,
  },
  {
    name: "unverified owner · active pass with runs · handoff_booking off · handoff delivered",
    in: inputs({
      viewer: { emailVerified: false },
      checkoutEmailDenied: true,
      handoffEmailDenied: true,
      handoffBookingOn: false,
      pass: { active: true, runs: { cap: 3, used: 0, left: 3 } },
      handoff: handoff("polish", "delivered"),
    }),
    actions: { optimize: "verify", ask: "verify", handoff: "approve", handoffBook: "no", checkout: "verify", tripPass: "active", concierge: "verify" },
  },
  {
    name: "unverified payer (the viewer's no wins over verify)",
    in: inputs({ viewer: { tripRole: "payer", ownsTrip: false, canEdit: false, emailVerified: false }, checkoutEmailDenied: true, handoffEmailDenied: true }),
    actions: NONE,
  },
  {
    name: "owner · Trip Pass plan unavailable · optimizer fee disabled",
    in: inputs({ tripPassPlanAvailable: false, optimizerFeeDisabled: true }),
    actions: { ...OWNER_OPEN, optimize: "no", tripPass: "no" },
  },
];

describe("CAP-1 — deriveCapabilities", () => {
  it(`T1 the input table (${T1_TABLE.length} rows) — every row asserts the whole actions object`, () => {
    assert.ok(T1_TABLE.length >= 16);
    for (const row of T1_TABLE) assert.deepEqual(deriveCapabilities(row.in).actions, row.actions, row.name);
  });

  it("T1 roles: each viewer resolves to the role the brief names", () => {
    const roleOf = (v: Partial<CapabilityInputs["viewer"]>) => deriveCapabilities(inputs({ viewer: v })).viewer.role;
    assert.equal(roleOf({}), "owner");
    assert.equal(roleOf({ tripRole: "friend" }), "collaborator");
    assert.equal(roleOf({ tripRole: "expert" }), "expert");
    assert.equal(roleOf({ tripRole: "expert", advisorSource: "concierge" }), "concierge");
    assert.equal(roleOf({ tripRole: "delegate" }), "delegate");
    assert.equal(roleOf({ tripRole: "payer" }), "payer");
    assert.equal(roleOf({ tripRole: null, isAuthor: true }), "author");
    // A collaborator-row "owner" who is not trips.user_id cannot pay.
    assert.equal(deriveCapabilities(inputs({ viewer: { ownsTrip: false } })).viewer.canPay, false);
  });

  it("T1 the two ruling rows carry their reason codes", () => {
    assert.equal(deriveCapabilities(inputs({ handoffBookingOn: false })).reasons.handoffBook, "handoff_booking_off");
    assert.equal(deriveCapabilities(inputs({ concierge: { status: "confirmed", accessUntil: null } })).reasons.concierge, "concierge_confirmed");
    assert.equal(deriveCapabilities(inputs({ signup: { mode: "waitlist", purchasesAllowed: false } })).reasons.checkout, "waitlist");
    assert.equal(deriveCapabilities(inputs({ viewer: { tripRole: "payer", ownsTrip: false } })).reasons.checkout, "viewer_payer");
    const unverified = deriveCapabilities(inputs({ viewer: { emailVerified: false }, checkoutEmailDenied: true, handoffEmailDenied: true }));
    for (const k of TRIP_CAPABILITY_ACTION_KEYS) assert.equal(unverified.reasons[k], "email_unverified", k);
    assert.equal(unverified.viewer.emailVerified, false);
    // Another refusal that also applies outranks verify: a disabled fee row and an unavailable pass say "no".
    const both = deriveCapabilities(inputs({ checkoutEmailDenied: true, optimizerFeeDisabled: true, tripPassPlanAvailable: false }));
    assert.deepEqual([both.actions.optimize, both.actions.tripPass], ["no", "no"]);
  });

  it("T2 reasons are present for every action, as machine codes", () => {
    for (const row of T1_TABLE) {
      const out = deriveCapabilities(row.in);
      assert.deepEqual(Object.keys(out.reasons).sort(), [...TRIP_CAPABILITY_ACTION_KEYS].sort(), row.name);
      for (const k of TRIP_CAPABILITY_ACTION_KEYS) assert.match(out.reasons[k], /^[a-z][a-z0-9_]*$/, `${row.name}: ${k}`);
    }
  });

  it("T3 no field is an amount", () => {
    const allowedNumbers = new Set(["cap", "used", "left", "pendingSuggestions"]);
    const walk = (v: unknown, key: string, path: string) => {
      if (/cents|price|amount|fee/i.test(key)) assert.fail(`money-shaped key at ${path}`);
      if (typeof v === "number") assert.ok(allowedNumbers.has(key), `number at ${path}`);
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, `${path}.${k}`);
    };
    for (const row of T1_TABLE) walk(deriveCapabilities({ ...row.in, pendingSuggestions: 2 }), "", row.name);
  });

  it("facts: handoff, pass and concierge restate their inputs", () => {
    const out = deriveCapabilities(inputs({
      pass: { active: true, runs: { cap: 3, used: 1, left: 2 } },
      handoff: { ...handoff("polish", "approved"), onTripSupportOfferedAt: "2026-11-01", onTripSupportAcceptedAt: null },
      pendingSuggestions: 4,
      concierge: { status: "confirmed", accessUntil: new Date("2026-12-01T00:00:00Z") },
    }));
    assert.deepEqual(out.pass, { active: true, runs: { cap: 3, used: 1, left: 2 } });
    assert.deepEqual(out.handoff, { present: true, kind: "polish", status: "approved", scopeItemIds: ["i1"], pendingSuggestions: 4, onTripSupport: "offered" });
    assert.deepEqual(out.concierge, { present: true, status: "confirmed", accessUntil: "2026-12-01T00:00:00.000Z" });
    assert.deepEqual(deriveCapabilities(inputs()).handoff, { present: false, kind: null, status: null, scopeItemIds: [], pendingSuggestions: 0, onTripSupport: "none" });
  });
});
