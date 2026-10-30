/**
 * WL-B server (ledger `2026-10-30-wlb-provider-signup-gate`): before launch, providers are the one supply role that may
 * create an account; an expert is refused and sent to "Apply Now" on the waitlist. ONE decision, read by every path.
 *
 *   G1  a provider supply sign-up with business name, category and city passes (the email is the account's own)
 *   G2  a provider missing any one required field is refused provider_fields_required, before any account read
 *   G3  a traveler is decided exactly as before WL-B
 *   G4  an expert supply sign-up is refused expert_apply_now, before any account read
 *   G5  email, Replit and Facebook give the same decision; a social provider sign-up (no fields) is sent to email
 *   G6  website and languages are optional; venue is a category
 *   G8  the expert refusal carries reason, the exact message and applyPath = WAITLIST_EXPERT_FORM_PATH
 *   G9  a provider or traveler answer never carries applyPath or the expert message
 *   G10 WAITLIST_EXPERT_FORM_PATH is "/kyoto#experts" and WAITLIST_ROLES has "expert"
 *   G12 the waitlist body: an expert needs contactName and a market ("City you know best" is the market picker) and
 *       may not send traveler or provider fields;
 *       traveler and provider bodies validate as before
 *   G14 the expert keep rate the page shows is GET /api/fee-policies/keep-rates (admin config), never a literal
 *   L   a supply sign-up that names no role is refused provider_fields_required before launch; a social door's role
 *       is taken from its return path (/become-expert ⇒ expert, /become-provider ⇒ provider)
 *
 * Run: npx tsx --test server/__tests__/wlb-provider-signup-gate.test.ts
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db } from "../db.js";
import { invalidatePlatformFlagCache } from "../services/platform-flags.js";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth.js";
import { authStorage } from "../replit_integrations/auth/storage.js";
import { upsertUser } from "../replit_integrations/auth/replitAuth.js";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth.js";
import { readSupplyRole, stashSignupIntent } from "../replit_integrations/auth/signup-intent-stash.js";
import {
  EXPERT_APPLY_NOW,
  EXPERT_APPLY_NOW_MESSAGE,
  PROVIDER_EMAIL_SIGNUP_PATH,
  PROVIDER_FIELDS_REQUIRED,
  TRAVELER_WAITLIST,
  decideFirstTimeSignup,
  providerSignupFieldsSchema,
  supplyRefusalRedirect,
} from "../../shared/launch-signup.js";
import {
  WAITLIST_EXPERT_FORM_PATH,
  WAITLIST_MARKET_OPENED_ROLES,
  WAITLIST_ROLES,
  WAITLIST_SERVICE_TYPES,
  waitlistJoinBodySchema,
  waitlistLanguagesList,
} from "../../shared/launch-waitlist.js";

const FIELDS = { businessName: "Fixture Tours", category: "venue", city: "Kyoto" };

const origExecute = (db as any).execute;
const origSelect = (db as any).select;
const origGetUser = authStorage.getUser;
const origGetUserByEmail = authStorage.getUserByEmail;
const origUpsertUser = authStorage.upsertUser;
const origFetch = global.fetch;
let settings: Record<string, string | null> = {};
let selectCalls = 0;
let created: any[] = [];

before(() => {
  (db as any).execute = async (query: any) => {
    const chunks: unknown[] = query?.queryChunks ?? [];
    const key = chunks.find((c) => typeof c === "string" && c in settings) as string | undefined;
    const value = key ? settings[key] : undefined;
    return { rows: value === undefined || value === null ? [] : [{ setting_value: value }] };
  };
  // An existing account answers the email check, so a request that got past the gate stops at the neutral 202.
  (db as any).select = () => {
    selectCalls += 1;
    const chain: any = { from: () => chain, where: () => chain, limit: () => chain, then: (f: any) => Promise.resolve([{ id: "existing" }]).then(f) };
    return chain;
  };
});
after(() => {
  (db as any).execute = origExecute;
  (db as any).select = origSelect;
  authStorage.getUser = origGetUser;
  authStorage.getUserByEmail = origGetUserByEmail;
  authStorage.upsertUser = origUpsertUser;
  (global as any).fetch = origFetch;
});
beforeEach(() => {
  invalidatePlatformFlagCache();
  settings = { new_user_registration_enabled: "true", launch_market_slug: "kyoto", traveler_signup_mode: "waitlist" };
  selectCalls = 0;
  created = [];
  (global as any).fetch = async () => { throw new Error("network disabled in test"); };
  authStorage.getUser = async () => undefined as any;
  authStorage.getUserByEmail = async () => undefined as any;
  authStorage.upsertUser = async (u: any) => { created.push(u); return { ...u, isSuspended: false } as any; };
});

const handlers: Record<string, any> = {};
setupEmailAuth({
  post: (path: string, h: any) => { handlers[`POST ${path}`] = h; },
  get: (path: string, h: any) => { handlers[`GET ${path}`] = h; },
} as any);

async function register(extra: Record<string, unknown> = {}) {
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(p: any) { this.body = p; return this; } };
  await handlers["POST /api/auth/register"](
    { body: { email: "wlb-new@example.com", password: "longenough1", firstName: "Fixture", lastName: "Person", ...extra }, session: {} },
    res,
  );
  return res;
}

const expertRefusal = { allowed: false, reason: EXPERT_APPLY_NOW, message: EXPERT_APPLY_NOW_MESSAGE, applyPath: WAITLIST_EXPERT_FORM_PATH };

describe("WL-B decision", () => {
  it("G1 a provider with its fields passes; G6 website and languages are optional, venue is a category", () => {
    assert.ok(providerSignupFieldsSchema.safeParse(FIELDS).success);
    assert.ok(providerSignupFieldsSchema.safeParse({ ...FIELDS, website: "https://example.com", languages: "Japanese, English" }).success);
    assert.ok(WAITLIST_SERVICE_TYPES.some((t) => t.key === "venue" && t.label === "Venue"));
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: false, supplyRole: "provider", providerFieldsValid: true }), { allowed: true });
  });

  it("G2 a provider missing any required field is refused", () => {
    for (const k of ["businessName", "category", "city"] as const) {
      const partial: Record<string, string> = { ...FIELDS };
      delete partial[k];
      assert.equal(providerSignupFieldsSchema.safeParse(partial).success, false, k);
      assert.equal(providerSignupFieldsSchema.safeParse({ ...FIELDS, [k]: "  " }).success, false, `${k} blank`);
    }
    assert.equal(providerSignupFieldsSchema.safeParse({ ...FIELDS, category: "spa" }).success, false);
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: false, supplyRole: "provider", providerFieldsValid: false }), { allowed: false, reason: PROVIDER_FIELDS_REQUIRED });
  });

  it("G3 a traveler is decided as before; L a supply sign-up with no role is decided as before", () => {
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "traveler", qaCodeValid: false }), { allowed: false, code: TRAVELER_WAITLIST });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "traveler", qaCodeValid: true }), { allowed: true });
    assert.deepEqual(decideFirstTimeSignup({ mode: "open", intent: "traveler", qaCodeValid: false }), { allowed: true });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: false }), { allowed: false, reason: PROVIDER_FIELDS_REQUIRED });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: true }), { allowed: true }, "a QA sign-up passes");
    assert.deepEqual(decideFirstTimeSignup({ mode: "open", intent: "supply", qaCodeValid: false, supplyRole: "expert" }), { allowed: true }, "after launch nobody is refused");
  });

  it("G4/G8 an expert is refused with the apply-now answer", () => {
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: false, supplyRole: "expert" }), expertRefusal);
    assert.equal(EXPERT_APPLY_NOW_MESSAGE, "Expert accounts open at launch. Apply now to join as a local expert.");
  });

  it("G10 the form path and the role", () => {
    assert.equal(WAITLIST_EXPERT_FORM_PATH, "/kyoto#experts");
    assert.ok((WAITLIST_ROLES as readonly string[]).includes("expert"));
    assert.deepEqual([...WAITLIST_MARKET_OPENED_ROLES], ["traveler", "provider"], "no market-opened email is sent to experts");
    assert.equal(supplyRefusalRedirect(EXPERT_APPLY_NOW), WAITLIST_EXPERT_FORM_PATH);
    assert.equal(supplyRefusalRedirect(PROVIDER_FIELDS_REQUIRED), PROVIDER_EMAIL_SIGNUP_PATH);
  });
});

describe("WL-B on every path", () => {
  it("G2/G4/G8/G9 email: the expert and the field-less provider are refused before any account read", async () => {
    const expert = await register({ intent: "supply", supplyRole: "expert" });
    assert.equal(expert.statusCode, 403);
    assert.deepEqual(expert.body, expertRefusal);
    const bare = await register({ intent: "supply", supplyRole: "provider", provider: { businessName: "Fixture Tours" } });
    assert.equal(bare.statusCode, 403);
    assert.deepEqual(bare.body, { allowed: false, reason: PROVIDER_FIELDS_REQUIRED });
    assert.equal(selectCalls, 0, "no account read, no account created");
    const ok = await register({ intent: "supply", supplyRole: "provider", provider: FIELDS });
    assert.equal(ok.statusCode, 202, "past the gate");
    for (const r of [bare, ok]) {
      assert.equal(JSON.stringify(r.body).includes("applyPath"), false);
      assert.equal(JSON.stringify(r.body).includes(EXPERT_APPLY_NOW_MESSAGE), false);
    }
    const traveler = await register();
    assert.equal(traveler.body.code, TRAVELER_WAITLIST);
    assert.equal(JSON.stringify(traveler.body).includes("applyPath"), false);
  });

  it("G5 Replit and Facebook give the same decision and create nothing when refused", async () => {
    await assert.rejects(() => upsertUser({ sub: "wlb-r-1" }, { intent: "supply", supplyRole: "expert" }), new RegExp(EXPERT_APPLY_NOW));
    await assert.rejects(() => upsertUser({ sub: "wlb-r-2" }, { intent: "supply", supplyRole: "provider" }), new RegExp(PROVIDER_FIELDS_REQUIRED));
    assert.equal(created.length, 0);
    await assert.rejects(() => upsertUser({ sub: "wlb-r-3" }, { intent: "supply" }), new RegExp(PROVIDER_FIELDS_REQUIRED), "no role: refused");
    assert.equal(created.length, 0);
    const profile: any = { id: "9191", displayName: "F B", emails: [{ value: "wlb-fb@example.com" }], photos: [], name: { givenName: "F" } };
    for (const [role, code] of [["expert", EXPERT_APPLY_NOW], ["provider", PROVIDER_FIELDS_REQUIRED]] as const) {
      created = [];
      let out: any;
      await facebookVerify("t", "r", profile, (err, user, info) => { out = { err, user, info }; }, { intent: "supply", supplyRole: role });
      assert.equal(out.user, false);
      assert.equal(out.info.code, code);
      assert.equal(created.length, 0);
    }
  });

  it("G5 the stash carries the supply role for a supply door only", () => {
    const req: any = { query: { intent: "supply", supplyRole: "expert" }, session: {} };
    stashSignupIntent(req, 1_000);
    assert.equal(readSupplyRole(req, 2_000), "expert");
    const trav: any = { query: { supplyRole: "provider" }, session: {} };
    stashSignupIntent(trav, 1_000);
    assert.equal(readSupplyRole(trav, 2_000), null);
    const odd: any = { query: { intent: "supply", supplyRole: "admin" }, session: {} };
    stashSignupIntent(odd, 1_000);
    assert.equal(readSupplyRole(odd, 2_000), null);
    const expertDoor: any = { query: { intent: "supply", returnTo: "/become-expert?type=local_expert" }, session: {} };
    stashSignupIntent(expertDoor, 1_000);
    assert.equal(readSupplyRole(expertDoor, 2_000), "expert", "a role-less expert door is an expert");
    const providerDoor: any = { query: { intent: "supply", returnTo: "/become-provider" }, session: {} };
    stashSignupIntent(providerDoor, 1_000);
    assert.equal(readSupplyRole(providerDoor, 2_000), "provider");
  });
});

describe("WL-B waitlist body", () => {
  const base = { email: "wlb-expert@example.com", consent: true };
  it("G12 an expert needs contactName and a market and may not send another role's fields", () => {
    assert.ok(waitlistJoinBodySchema.safeParse({ ...base, role: "expert", contactName: "Fixture Expert", market: "kyoto" }).success);
    assert.ok(waitlistJoinBodySchema.safeParse({ ...base, role: "expert", contactName: "Fixture Expert", market: "kyoto", languages: "Japanese", link: "https://example.com/work" }).success);
    for (const missing of ["contactName", "market"] as const) {
      const body: Record<string, unknown> = { ...base, role: "expert", contactName: "Fixture Expert", market: "kyoto" };
      delete body[missing];
      const r = waitlistJoinBodySchema.safeParse(body);
      assert.equal(r.success, false);
      assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === missing), missing);
      assert.equal(waitlistJoinBodySchema.safeParse({ ...body, [missing]: "   " }).success, false, `${missing} blank`);
    }
    const trip = waitlistJoinBodySchema.safeParse({ ...base, role: "expert", contactName: "X", market: "kyoto", tripType: "wedding" });
    assert.ok(!trip.success && trip.error.issues.some((i) => i.message === "traveler field"));
    const svc = waitlistJoinBodySchema.safeParse({ ...base, role: "expert", contactName: "X", market: "kyoto", serviceType: "venue" });
    assert.ok(!svc.success && svc.error.issues.some((i) => i.message === "provider field"));
    assert.ok(waitlistJoinBodySchema.safeParse({ ...base, tripType: "wedding" }).success, "a traveler body as before");
    assert.ok(waitlistJoinBodySchema.safeParse({ ...base, role: "provider", contactName: "P", serviceType: "transport", businessName: "B" }).success, "a provider body as before");
    assert.equal(waitlistJoinBodySchema.safeParse({ ...base, link: "https://example.com" }).success, false, "a traveler may not send expert fields");
    assert.equal(waitlistJoinBodySchema.safeParse({ ...base, role: "expert", contactName: "X", market: "kyoto", expertCity: "Kyoto" } as any).success, false, "no expertCity key");
    assert.deepEqual(waitlistLanguagesList("Japanese, English;  "), ["Japanese", "English"]);
    assert.equal(waitlistLanguagesList("  "), null);
  });

  it("G14 the expert keep rate is the existing admin-config endpoint", () => {
    const src = fs.readFileSync("server/services/earn-keep-rates.service.ts", "utf8");
    assert.match(src, /resolvePublicKeepRates/);
    for (const f of ["shared/launch-signup.ts", "shared/launch-waitlist.ts"]) {
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /\b85\b/, f);
    }
  });
});
