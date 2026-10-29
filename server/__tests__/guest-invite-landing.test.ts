/**
 * Row 277 (Architect, 2026-10-28 01:45 ET, pt847u, and 08:55 ET, pt849u; ledger
 * `2026-10-28-guest-landing-fields`): the guest invite landing key, the guest-safe invite
 * projection on GET /api/invites/:token, POST …/origin and POST …/rsvp, the POST …/view beacon,
 * and migration 413's three columns.
 *
 * PURE UNIT plus static reads of the source. No database, no network, no git:
 *
 *   npx tsx --test server/__tests__/guest-invite-landing.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { eventInvites } from "../../shared/guest-invites-schema";
import { OPERATING_MARKETS } from "../../shared/operating-markets";
import {
  userExperienceHostNoteSchema,
  userExperienceRsvpBySchema,
  userExperienceVenueAddressSchema,
} from "../../shared/schema";
import { MIGRATION_FILES } from "../migrations/migration-files";
import {
  ADDRESS_RELEASING_STATUSES,
  buildGuestLanding,
  projectInviteForGuest,
} from "../services/guest-invite-landing";

const read = (p: string) => fs.readFileSync(p, "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ROUTES = stripComments(read("server/routes/guest-invites.ts"));
const STORAGE = read("server/storage.ts");
const SERVICE = read("server/services/guest-invite-landing.ts");

/** A top-level route block, cut at the next top-level `router.` line. */
function routeBlock(src: string, head: string): string {
  const start = src.indexOf(head);
  assert.ok(start >= 0, `route not found: ${head}`);
  const next = src.indexOf("\nrouter.", start + head.length);
  return src.slice(start, next < 0 ? undefined : next);
}
/** A storage method block, cut at the next `async ` method. */
function methodBlock(src: string, head: string): string {
  const start = src.indexOf(head);
  assert.ok(start >= 0, `method not found: ${head}`);
  const next = src.indexOf("\n  async ", start + head.length);
  return src.slice(start, next < 0 ? undefined : next);
}

const FULL = {
  title: "Maya & Sam",
  eventDate: "2026-11-20",
  startTime: "18:30",
  location: "The Garden Hall",
  hostNote: "Dress warmly.",
  rsvpBy: "2026-11-01",
  venueAddress: "12 Garden Lane",
  hostFirstName: "Maya",
  marketSlug: "kyoto",
  tripTimezone: "Asia/Tokyo",
  rsvpStatus: "accepted",
};
const ELEVEN = ["area", "eventDate", "hasVenueAddress", "hostFirstName", "hostNote", "rsvpBy", "startTime", "timezone", "title", "venue", "venueAddress"];

/** An invite carrying EVERY event_invites column with a distinct sentinel value. */
function sentinelInvite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(getTableColumns(eventInvites))) row[key] = `SENTINEL-${key}`;
  return { ...row, ...overrides };
}
const SEVEN = ["guestName", "id", "numberOfGuests", "originCity", "originCountry", "originState", "rsvpStatus"];

test("L1 the landing is an allowlist of exactly eleven keys", () => {
  const input = {
    ...FULL,
    budget: "5000", preferences: { a: 1 }, stepData: { s: 1 }, mapData: {}, guestCount: 80, tripId: "trip-1",
    userId: "user-1", organizerId: "org-1", hostEmail: "host@example.com", hostPhone: "555-0100", lastName: "Lee",
    vendors: [{ name: "Florist" }],
  } as any;
  // Row 207 added hasVenueAddress. The other ten keys are the row 277 allowlist.
  assert.deepEqual(Object.keys(buildGuestLanding(input)).sort(), ELEVEN);
});

test("L2 the street address is released only at rsvpStatus accepted", () => {
  assert.equal(buildGuestLanding(FULL).venueAddress, "12 Garden Lane");
  assert.deepEqual(Array.from(ADDRESS_RELEASING_STATUSES), ["accepted"]);
  for (const status of ["pending", "declined", "maybe", "no_response", "attending", "constructor", "ACCEPTED", " accepted", "accepted ", "", null, undefined]) {
    const result = buildGuestLanding({ ...FULL, rsvpStatus: status as any });
    assert.equal("venueAddress" in result, false, `status ${JSON.stringify(status)}`);
  }
  for (const key of ["rsvpstatus", "status"]) {
    const result = buildGuestLanding({ ...FULL, rsvpStatus: undefined, [key]: "accepted" } as any);
    assert.equal("venueAddress" in result, false, key);
  }
});

test("L3 the host's first name only", () => {
  assert.equal(buildGuestLanding({ hostFirstName: "Maya" }).hostFirstName, "Maya");
  assert.equal(buildGuestLanding({ hostFirstName: "  Maya " }).hostFirstName, "Maya");
  for (const v of [null, undefined, "", "   "]) assert.equal("hostFirstName" in buildGuestLanding({ hostFirstName: v as any }), false);
  const json = JSON.stringify(buildGuestLanding({ hostFirstName: "Maya", lastName: "Lee", email: "m@x.com", phone: "555" } as any));
  for (const leaked of ["Lee", "m@x.com", "555"]) assert.equal(json.includes(leaked), false, leaked);
});

test("L4 an absent value is an absent key", () => {
  for (const [field, key] of [["title", "title"], ["eventDate", "eventDate"], ["location", "venue"], ["hostNote", "hostNote"], ["rsvpBy", "rsvpBy"], ["venueAddress", "venueAddress"]] as const) {
    for (const v of [null, undefined, "", "   "]) {
      const result = buildGuestLanding({ ...FULL, [field]: v } as any);
      assert.equal(key in result, false, `${field}=${JSON.stringify(v)}`);
    }
  }
  assert.deepEqual(buildGuestLanding({}), {});
});

test("L5 the time ships as stored, with the trip's zone only when usable", () => {
  const t = buildGuestLanding({ startTime: "18:30", tripTimezone: "Asia/Tokyo" });
  assert.strictEqual(t.startTime, "18:30");
  assert.equal(t.timezone, "Asia/Tokyo");
  const noZone = buildGuestLanding({ startTime: "18:30", tripTimezone: null });
  assert.equal(noZone.startTime, "18:30");
  assert.equal("timezone" in noZone, false);
  assert.equal("timezone" in buildGuestLanding({ startTime: "18:30", tripTimezone: "Mars/Phobos" }), false);
  for (const [time, zone] of [[null, "Asia/Tokyo"], ["6pm", "Asia/Tokyo"], ["18:30:00", "Asia/Tokyo"]] as const) {
    const r = buildGuestLanding({ startTime: time as any, tripTimezone: zone });
    assert.equal("startTime" in r, false, String(time));
    assert.equal("timezone" in r, false, String(time));
  }
  const code = stripComments(SERVICE);
  for (const banned of ["new Date", "Date.parse", "toLocale", "getTimezoneOffset", "UTC"]) assert.equal(code.includes(banned), false, banned);
});

test("L6 the area comes from the trip's market key, never from text", () => {
  assert.equal(buildGuestLanding({ marketSlug: "kyoto" }).area, "Kyoto");
  for (const m of OPERATING_MARKETS) assert.equal(buildGuestLanding({ marketSlug: m.marketKey }).area, m.cityName, m.marketKey);
  for (const v of [null, "", "KYOTO", "atlantis"]) assert.equal("area" in buildGuestLanding({ marketSlug: v as any }), false, String(v));
  assert.equal("area" in buildGuestLanding({ location: "Kyoto, Japan", marketSlug: null }), false);
});

test("L7 the venue is the location as typed, trimmed", () => {
  const r = buildGuestLanding({ location: "  The Hall  " });
  assert.equal(r.venue, "The Hall");
  assert.deepEqual(Object.keys(r), ["venue"]);
});

test("L8 projectInviteForGuest is exactly seven keys; the experience redaction is unchanged", () => {
  const out = projectInviteForGuest(sentinelInvite());
  assert.deepEqual(Object.keys(out).sort(), SEVEN);
  const json = JSON.stringify(out);
  for (const col of ["organizerId", "guestEmail", "guestPhone", "uniqueToken"]) assert.equal(json.includes(`SENTINEL-${col}`), false, col);
  const redact = ROUTES.slice(ROUTES.indexOf("function redactExperienceForGuest"), ROUTES.indexOf("function generateInviteToken"));
  for (const banned of ["venueAddress", "hostNote", "rsvpBy", "organizerId", "userId", "budget", "preferences", "stepData", "mapData"]) {
    assert.equal(redact.includes(banned), false, banned);
  }
  for (const kept of ["id:", "title:", "location:", "destination:", "eventDate:", "startDate:", "status:", "experienceType:"]) assert.ok(redact.includes(kept), kept);
});

test("L9 the GET is a pure read", () => {
  const get = routeBlock(ROUTES, 'router.get("/api/invites/:token",');
  for (const needed of ["projectInviteForGuest(", "landing", "invite.rsvpStatus"]) assert.ok(get.includes(needed), needed);
  for (const banned of ["trackInviteView", "storage.update", "storage.create", "req.query", "req.body", "req.headers", "router.post", "router.put"]) {
    assert.equal(get.includes(banned), false, banned);
  }
  const imports = SERVICE.split("\n").filter((l) => /^import /.test(l)).join("\n");
  for (const banned of ["../db", "storage", "express"]) assert.equal(imports.includes(banned), false, banned);
});

test("L10 the view beacon", () => {
  assert.equal(ROUTES.split('router.post("/api/invites/:token/view"').length - 1, 1);
  const view = routeBlock(ROUTES, 'router.post("/api/invites/:token/view"');
  for (const needed of ["guestTokenLimiter", "storage.trackInviteView(token)", "204", "404"]) assert.ok(view.includes(needed), needed);
  for (const banned of ["req.body", "req.query", "req.headers", "getUserId", "isAuthenticated"]) assert.equal(view.includes(banned), false, banned);
  const track = methodBlock(STORAGE, "async trackInviteView(");
  assert.ok(track.includes(".returning("));
  assert.ok(track.includes("COALESCE"));
});

test("L11 the storage join selects only the first name, the market key and the zone", () => {
  const get = methodBlock(STORAGE, "async getInviteByToken(");
  for (const needed of ["users.firstName", "trips.marketSlug", "trips.timezone", "landingSource"]) assert.ok(get.includes(needed), needed);
  for (const banned of ["users.email", "users.phone", "users.lastName", "users.notificationEmail", "users.password", ".select().from(users)", "trips.destination"]) {
    assert.equal(get.includes(banned), false, banned);
  }
});

test("L12 the write path admits the three fields through the one allowlist", () => {
  assert.equal(userExperienceHostNoteSchema.parse("Dress warmly."), "Dress warmly.");
  assert.equal(userExperienceVenueAddressSchema.parse("12 Garden Lane"), "12 Garden Lane");
  assert.equal(userExperienceRsvpBySchema.parse("2026-11-01"), "2026-11-01");
  for (const s of [userExperienceHostNoteSchema, userExperienceVenueAddressSchema, userExperienceRsvpBySchema]) {
    assert.equal(s.parse(null), null);
    assert.equal(s.parse(undefined), undefined);
  }
  assert.equal(userExperienceHostNoteSchema.safeParse("x".repeat(1001)).success, false);
  assert.equal(userExperienceVenueAddressSchema.safeParse("x".repeat(256)).success, false);
  for (const bad of ["tomorrow", "2026/10/28"]) assert.equal(userExperienceRsvpBySchema.safeParse(bad).success, false, bad);
  const src = read("server/routes/content.routes.ts");
  const start = src.indexOf("export const userExperienceBodySchema");
  const block = src.slice(start, src.indexOf('router.post("/api/user-experiences"', start));
  for (const needed of ["hostNote: true", "venueAddress: true", "rsvpBy: true", "hostNote: userExperienceHostNoteSchema", "venueAddress: userExperienceVenueAddressSchema", "rsvpBy: userExperienceRsvpBySchema"]) {
    assert.ok(block.includes(needed), needed);
  }
  for (const banned of ["userId: true", "trackingNumber: true"]) assert.equal(block.includes(banned), false, banned);
  assert.equal(block.includes("\\d{4}-\\d{2}-\\d{2}"), false, "no second copy of the date shape");
});

test("L13 migration 413 adds three nullable columns and nothing else", () => {
  const file = MIGRATION_FILES.find((f) => /^\d+_guest_landing_event_fields\.sql$/.test(f));
  assert.ok(file, "registered in migration-files.ts");
  const sql = stripComments(read(`server/migrations/${file}`).replace(/--.*$/gm, ""));
  assert.equal((sql.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length, 3);
  for (const col of ["host_note", "venue_address", "rsvp_by", "user_experiences"]) assert.ok(sql.includes(col), col);
  for (const banned of ["NOT NULL", "DEFAULT", "CHECK", "CREATE INDEX", "UPDATE", "DROP"]) assert.equal(sql.toUpperCase().includes(banned), false, banned);
  const schema = read("shared/schema.ts");
  const table = schema.slice(schema.indexOf('export const userExperiences = pgTable("user_experiences"'), schema.indexOf("export const userExperienceItems"));
  for (const col of ['"host_note"', '"venue_address"', '"rsvp_by"']) assert.ok(table.includes(col), col);
});

test("L14 the host form names the venue input Venue name", () => {
  const modal = read("client/src/components/trip/plan-modal.tsx");
  const organize = read("client/src/components/plancard/SlipOrganizeEvents.tsx");
  assert.ok(modal.includes("HOST_EVENT_FORM_LABELS.venueName"));
  assert.ok(organize.includes("HOST_EVENT_FORM_LABELS.venueName"));
  assert.equal(modal.includes("<span>Place</span>"), false);
  assert.equal(modal.includes("Place for"), false);
  assert.ok(modal.includes("input-etp-event-place-"));
  assert.ok(organize.includes("organize-place-"));
});

test("L15 the GET and both POSTs return only the projected invite", () => {
  const row = sentinelInvite({ rsvpStatus: "accepted", rsvpDate: new Date("2026-10-28T00:00:00Z") });
  const out = projectInviteForGuest(row);
  assert.deepEqual(Object.keys(out).sort(), SEVEN);
  const json = JSON.stringify(out);
  for (const col of ["guestEmail", "guestPhone", "organizerId", "uniqueToken", "message", "specialRequests"]) {
    assert.equal(json.includes(`SENTINEL-${col}`), false, col);
  }
  const raw = read("server/routes/guest-invites.ts");
  assert.equal(raw.split('from "../services/guest-invite-landing"').length - 1, 1);
  assert.match(raw, /import \{[^}]*projectInviteForGuest[^}]*\} from "\.\.\/services\/guest-invite-landing";/);
  const blocks = {
    get: routeBlock(ROUTES, 'router.get("/api/invites/:token",'),
    origin: routeBlock(ROUTES, 'router.post("/api/invites/:token/origin"'),
    rsvp: routeBlock(ROUTES, 'router.post("/api/invites/:token/rsvp"'),
  };
  for (const [name, block] of Object.entries(blocks)) {
    assert.ok(block.includes("projectInviteForGuest("), name);
    for (const banned of ["invite: updated", "invite: invite", "invite,", "...updated", "...invite", "guestEmail", "guestPhone", "organizerId"]) {
      assert.equal(block.includes(banned), false, `${name}: ${banned}`);
    }
  }
  assert.ok(blocks.origin.includes("originSchema.safeParse"));
  assert.ok(blocks.origin.includes("storage.updateInviteOrigin("));
  assert.ok(blocks.origin.includes("Origin city saved successfully"));
  assert.ok(blocks.rsvp.includes("rsvpSchema.safeParse"));
  assert.ok(blocks.rsvp.includes("storage.updateInviteRsvp("));
  assert.ok(blocks.rsvp.includes("RSVP submitted successfully"));
  for (const name of ["origin", "rsvp"] as const) {
    const b = blocks[name];
    assert.ok(b.indexOf("if (!updated)") >= 0 && b.indexOf("if (!updated)") < b.indexOf("projectInviteForGuest("), `${name}: 404 guard before the projection`);
    const jsonCalls = b.match(/res(?:\.status\(\d+\))?\.json\([^)]*\binvite\b/g) ?? [];
    assert.equal(jsonCalls.length, 1, `${name}: one response carries an invite`);
  }
});
