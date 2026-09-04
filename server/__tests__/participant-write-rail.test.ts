/**
 * Participant WRITE-rail contract (ledger `2026-09-04-guest-list-reconciliation`).
 *
 * Two proofs over the SOURCE, deliberately not over a running server:
 *
 * G1 — every `apiRequest(<verb>, …)` the participant tracker issues names a route that is
 *      actually DECLARED in server/. The defect this closes was a client PATCH to
 *      `/api/trips/:tripId/participants/:participantId`, a path no `app.*`/`router.*`
 *      declaration in the repo ever matched, so the only guest list that carries substance
 *      (`trip_participants`) had no working edit path from any screen. Note the failure was
 *      NOT silent: `app.use("/api", notFoundHandler)` (server/index.ts) answers an unmatched
 *      /api path with a 404 rather than the SPA's 200-HTML, so CLAUDE.md §9's "dead endpoints
 *      return 200-HTML" no longer describes the /api namespace. It still failed on every save.
 *
 * G2 — `PATCH /api/participants/:id` admits its body through the exported pick-based allowlist
 *      (§19) and never hands `req.body` to the storage writer, and that allowlist names none of
 *      the fields owned by another rail (linkage/identity, the RSVP rail, the payment rail).
 *
 * G3 — the CREATE rail is an ALLOWLIST too (ledger `2026-09-04-plan-islands`). The live copy —
 *      the `server/routes.ts` monolith handler, which registers first and SHADOWS the
 *      `trips.routes.ts` twin — parsed `insertTripParticipantSchema.omit({ userId: true })`, a
 *      DENYLIST: it closed the one hole its author knew about and left every other column
 *      reachable, `amount_owed` / `amount_paid` / `payment_status` / `payment_method` included.
 *      §19: "a privileged column is client-settable BY DEFAULT under a denylist schema, and
 *      nobody edits an omit list for a column that did not exist when it was written." G3 pins
 *      the create schema to the PATCH allowlist it is DERIVED from — a second literal field list
 *      is the drift §18 rule 1 names — and G3b pins the live handler to it.
 *
 * Source-level because `server/routes/content.routes.ts` transitively imports `server/db`,
 * which throws at import without DATABASE_URL — these proofs must run in plain CI.
 *
 * Run: npx tsx --test server/__tests__/participant-write-rail.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

const TRACKER = "client/src/components/logistics/participant-travel-tracker.tsx";
const CONTENT_ROUTES = "server/routes/content.routes.ts";

/** `/api/trips/${tripId}/x` and `/api/trips/:tripId/x` both normalise to `/api/trips/:p/x`. */
function normalisePath(p: string): string {
  return p
    .replace(/\$\{[^}]*\}/g, ":p")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":p")
    .replace(/\/+$/, "");
}

/** Every `app.<verb>("path"` / `router.<verb>("path"` declaration under server/. */
function declaredRoutes(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const src = fs.readFileSync(full, "utf8");
      const re = /\b(?:app|router)\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`]/g;
      for (const m of src.matchAll(re)) {
        found.add(`${m[1].toUpperCase()} ${normalisePath(m[2])}`);
      }
    }
  };
  walk(path.join(REPO, "server"));
  return found;
}

test("G1: every write the participant tracker issues names a declared server route", () => {
  const src = read(TRACKER);
  const routes = declaredRoutes();

  const calls = [...src.matchAll(/apiRequest\(\s*["'`](GET|POST|PATCH|PUT|DELETE)["'`]\s*,\s*[`"']([^`"']+)[`"']/g)];
  assert.ok(calls.length > 0, "expected the tracker to issue at least one apiRequest");

  for (const [, verb, rawPath] of calls) {
    const key = `${verb} ${normalisePath(rawPath)}`;
    assert.ok(
      routes.has(key),
      `${TRACKER} calls "${verb} ${rawPath}" (normalised: ${key}) but no app.*/router.* ` +
        `declaration under server/ matches it. An unmatched /api path 404s — the write never lands.`,
    );
  }
});

test("G1b: the retired path is gone and the live one is used", () => {
  const src = read(TRACKER);
  assert.ok(
    !/apiRequest\([^)]*\/api\/trips\/\$\{tripId\}\/participants\//.test(src),
    "the undeclared /api/trips/:tripId/participants/:id write path must not come back",
  );
  assert.ok(
    src.includes("`/api/participants/${participantId}`"),
    "the tracker must write through PATCH /api/participants/:id, the one declared rail",
  );
});

test("G2: PATCH /api/participants/:id parses through the allowlist, never req.body", () => {
  const src = read(CONTENT_ROUTES);
  const start = src.indexOf('router.patch("/api/participants/:id", isAuthenticated');
  assert.ok(start > -1, "PATCH /api/participants/:id handler not found");
  // Stop at the next route declaration so we only read this handler.
  const nextRoute = src.indexOf("router.", start + 10);
  const handler = src.slice(start, nextRoute > -1 ? nextRoute : undefined);

  assert.ok(
    /tripParticipantPatchSchema\.parse\(req\.body\)/.test(handler),
    "the handler must admit its body through the pick-based allowlist (§19)",
  );
  assert.ok(
    !/updateParticipant\(\s*req\.params\.id\s*,\s*req\.body\s*\)/.test(handler),
    "req.body must never reach coordinationService.updateParticipant (§19 mass-assignment)",
  );
  assert.ok(
    /verifyTripOwnership\(\s*existing\.tripId/.test(handler),
    "ownership must be resolved from the STORED row's tripId, never from the URL (§14)",
  );
});

test("G2b: the allowlist names no field another rail owns", () => {
  const src = read(CONTENT_ROUTES);
  const decl = src.slice(src.indexOf("export const tripParticipantPatchSchema"));
  const pickBody = decl.slice(decl.indexOf(".pick({"), decl.indexOf("})", decl.indexOf(".pick({")));
  const picked = new Set([...pickBody.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*true\s*,?\s*$/gm)].map((m) => m[1]));

  assert.ok(picked.size > 0, "expected a non-empty pick() allowlist");

  // Linkage & identity (§14 / the L20 strip the CREATE rail already carries).
  for (const forbidden of ["tripId", "userId", "id"]) {
    assert.ok(!picked.has(forbidden), `${forbidden} must never be client-settable on a participant row`);
  }
  // Owned by PATCH /api/participants/:id/rsvp (which also stamps respondedAt).
  for (const forbidden of ["status", "rsvpNotes", "respondedAt", "invitedAt"]) {
    assert.ok(!picked.has(forbidden), `${forbidden} belongs to the RSVP rail, not the generic PATCH`);
  }
  // Owned by POST /api/participants/:id/payment, which DERIVES paid/status from the stored row.
  for (const forbidden of ["amountPaid", "amountOwed", "paymentStatus", "paymentMethod", "paymentNotes"]) {
    assert.ok(!picked.has(forbidden), `${forbidden} belongs to the payment rail, not the generic PATCH`);
  }

  // The three fields the tracker actually edits must be reachable. arrival/departure are
  // re-admitted by .extend() with a route-boundary date coercion, so check the source for them.
  assert.ok(picked.has("mobilityLevel"), "mobilityLevel must be editable");
  for (const field of ["arrivalDatetime", "departureDatetime"]) {
    assert.ok(
      new RegExp(`${field}:\\s*z\\.coerce\\.date\\(\\)\\.nullable\\(\\)\\.optional\\(\\)`).test(decl),
      `${field} must be admitted with a nullable route-boundary date coercion`,
    );
  }
});

test("G3: the CREATE allowlist is DERIVED from the PATCH allowlist, never restated beside it", () => {
  const src = read(CONTENT_ROUTES);
  const decl = src.slice(src.indexOf("export const tripParticipantCreateSchema"));
  assert.ok(decl.length > 0, "tripParticipantCreateSchema not found");
  const body = decl.slice(0, decl.indexOf("});") + 3);

  assert.ok(
    /tripParticipantPatchSchema\.extend\(/.test(body),
    "the create schema must extend the PATCH allowlist — a second literal field list is the " +
      "derivation drift §18 rule 1 names",
  );
  // The two things a CREATE needs and an UPDATE does not, both taken from the Drizzle contract
  // rather than re-stated as a fresh zod constraint (a second authority for the column).
  for (const field of ["name", "tripId"]) {
    assert.ok(
      new RegExp(`${field}:\\s*insertTripParticipantSchema\\.shape\\.${field}`).test(body),
      `${field} must be re-admitted from insertTripParticipantSchema.shape, not re-declared`,
    );
  }
  // Nothing else may be extended in — in particular nothing from the money or identity families.
  for (const forbidden of [
    "userId",
    "amountOwed",
    "amountPaid",
    "paymentStatus",
    "paymentMethod",
    "paymentNotes",
    "status",
    "invitedAt",
    "respondedAt",
  ]) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\s*:`).test(body),
      `${forbidden} must not be admitted by the participant CREATE allowlist`,
    );
  }
});

test("G3b: the LIVE create handler parses through that allowlist, and the denylist is gone", () => {
  const src = read("server/routes.ts");
  const start = src.indexOf('app.post("/api/trips/:tripId/participants", isAuthenticated');
  assert.ok(start > -1, "live POST /api/trips/:tripId/participants handler not found");
  const nextRoute = src.indexOf("app.", start + 10);
  const handler = src.slice(start, nextRoute > -1 ? nextRoute : undefined);

  assert.ok(
    /tripParticipantCreateSchema\.parse\(\{/.test(handler),
    "the live create rail must admit its body through the pick-based allowlist (§19)",
  );
  // The denylist ADMISSION, not the word: the handler's own comment names the retired
  // `insertTripParticipantSchema.omit({ userId: true })` to record what it replaced, and a
  // predicate that cannot tell a citation from a call would forbid explaining the fix.
  assert.ok(
    !/insertTripParticipantSchema\s*\.omit\([^)]*\)\s*\.parse\(/.test(handler),
    "the denylist (.omit(...).parse) admission must not come back on the live create rail",
  );
  // tripId is stamped from the route param AFTER the spread, so a body value can never win (§14).
  const spread = handler.indexOf("...req.body");
  const stamp = handler.indexOf("tripId: req.params.tripId");
  assert.ok(spread > -1 && stamp > spread, "tripId must be stamped AFTER the body spread");
  assert.ok(
    /verifyTripOwnership\(\s*req\.params\.tripId/.test(handler),
    "the trip must be ownership-checked before a participant is created on it",
  );
});
