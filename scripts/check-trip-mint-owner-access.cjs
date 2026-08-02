#!/usr/bin/env node
/**
 * Trip-mint owner-access guard (CLAUDE.md §13 L10 — the mint-path tripwire).
 *
 * getTripRole()/canMutateTrip() resolve trip access by ASSIGNMENT ONLY (trip_collaborators +
 * trip_expert_advisors) — they never read trips.userId. So every code path that INSERTs a
 * trips row MUST also mint the owner's trip_collaborators row in the same operation, or the
 * trip's own owner is 403'd from every assignment-gated surface (their own Trip Card included)
 * until the boot-time backfill (server/seeds/trip-ownership.seed.ts) happens to run. This class
 * produced three real owner-less mint paths (L10: ready-made purchase clone, cart-checkout
 * auto-trip, saved-trip conversion) — all since fixed. The architectural fix (an owner branch on
 * trips.userId inside getTripRole) is a named follow-up; until it lands, this guard makes the
 * invariant load-bearing so a FOURTH owner-less mint path fails CI instead of shipping.
 *
 * A trip-insert site passes the OWNER-ACCESS invariant when ANY of:
 *   (a) a trip_collaborators write appears within the following window (same operation —
 *       covers storage.createTrip and the raw-SQL booking.service paths);
 *   (b) it carries an explicit `trip-mint-owner-ok: <reason>` annotation within 5 lines —
 *       reserved for deliberate NULL-owner inserts (authoring-mode builds, §17 W-1), where no
 *       owner principal exists and access rides authorId/isTripAuthor instead.
 *
 * SECOND INVARIANT — TRACKING NUMBER (Lane S rulings 10/17): every trip mints its identity at
 * birth. Each insert site must reference trackingNumber/tracking_number within the surrounding
 * window (the `generateTrackingNumber` call precedes the insert; the value appears in the column
 * list / values). There is NO annotation escape for this one — "one identity scheme, no
 * exceptions" (authoring builds become Ready Mades later, so they need identity from birth too).
 *
 * Node built-ins only; no npm ci needed.
 */
const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.join(__dirname, "..", "server");
const OWNER_ROW_WINDOW = 60; // lines after the insert in which the collaborator write must appear
const ANNOTATION_WINDOW = 5; // lines around the insert in which the escape hatch may appear

const INSERT_RES = [/\.insert\(\s*trips\s*\)/, /INSERT\s+INTO\s+trips\b/i];
const OWNER_ROW_RE = /tripCollaborators|trip_collaborators/;
const ANNOTATION_RE = /trip-mint-owner-ok/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const TRACKING_RE = /trackingNumber|tracking_number/;
const TRACKING_BACK_WINDOW = 15; // generateTrackingNumber call may precede the insert

const ownerViolations = [];
const trackingViolations = [];

for (const file of walk(SERVER_DIR)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!INSERT_RES.some((re) => re.test(lines[i]))) continue;

    const relPath = `${path.relative(path.join(__dirname, ".."), file)}:${i + 1}`;
    const winEnd = Math.min(lines.length, i + OWNER_ROW_WINDOW + 1);

    // Invariant 1: owner access (annotation escape exists for NULL-owner authoring inserts).
    const annStart = Math.max(0, i - ANNOTATION_WINDOW);
    const annEnd = Math.min(lines.length, i + ANNOTATION_WINDOW + 1);
    const annotated = lines.slice(annStart, annEnd).some((l) => ANNOTATION_RE.test(l));
    if (!annotated) {
      const hasOwnerRow = lines.slice(i + 1, winEnd).some((l) => OWNER_ROW_RE.test(l));
      if (!hasOwnerRow) ownerViolations.push(relPath);
    }

    // Invariant 2: tracking number — NO annotation escape (ruling 17).
    const trackStart = Math.max(0, i - TRACKING_BACK_WINDOW);
    const mintsTracking = lines.slice(trackStart, winEnd).some((l) => TRACKING_RE.test(l));
    if (!mintsTracking) trackingViolations.push(relPath);
  }
}

let failed = false;
if (ownerViolations.length > 0) {
  failed = true;
  console.error("❌ Trip-mint guard [owner-access]: trip INSERT without a trip_collaborators owner write.");
  console.error("");
  console.error("getTripRole resolves access by assignment only (never trips.userId), so an insert that");
  console.error("skips the owner collaborator row locks the owner out of their own trip. Either write the");
  console.error("owner row in the same operation (see storage.createTrip), or — ONLY for a deliberate");
  console.error("NULL-owner authoring-mode insert — annotate within 5 lines: // trip-mint-owner-ok: <reason>");
  console.error("");
  for (const v of ownerViolations) console.error("  " + v);
}
if (trackingViolations.length > 0) {
  failed = true;
  console.error("❌ Trip-mint guard [tracking-number]: trip INSERT that never mints trackingNumber.");
  console.error("");
  console.error("Lane S rulings 10/17: every trip mints its TRV- identity at birth — one scheme, no");
  console.error("exceptions, no annotation escape. Call storage.generateTrackingNumber('TRV') and include");
  console.error("the value in the insert (see storage.createTrip).");
  console.error("");
  for (const v of trackingViolations) console.error("  " + v);
}
if (failed) process.exit(1);

console.log("✅ Trip-mint guard: every trip-insert site mints the owner row (or is annotated) AND a tracking number.");
