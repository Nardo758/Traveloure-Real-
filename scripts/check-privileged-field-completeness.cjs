#!/usr/bin/env node
/**
 * Privileged-field mass-assignment COMPLETENESS guard (CLAUDE.md §19, ruling 46; the "close the
 * class, not the instance" closer — 2026-08-29-privileged-field-completeness).
 *
 * WHY THIS EXISTS.
 * §14 caught a client-set AMOUNT. §18 caught the RATE. §19 caught VERIFICATION. Three privileged
 * column families, found ONE AT A TIME, each by a separate audit, each fixed by hand. The
 * decision-maker's directive: "two families found one-at-a-time means the third is sitting
 * there; the guard finds it mechanically." `check-money-endpoints.cjs`'s schema-mediated pass
 * already does this well for its THREE known families (rate/payment-identity/verification-status,
 * §18/§19c) — this guard is the same mechanism, generalized to enumerate every NAMED privileged
 * family up front, so the next family doesn't need its own incident before it gets a check.
 *
 * SCOPE — the mass-assignment surface, not all 186 insert schemas.
 * Most of the 186 `createInsertSchema(...)` calls in shared/schema.ts are internal-only and never
 * reach a request body — scanning all of them would bury real findings in noise from schemas no
 * attacker can ever touch. This guard scans ONLY schemas that are actually `.parse(req.body)` /
 * `.safeParse(req.body)` / `.partial().parse(req.body)`-ed (directly, or via a body spread like
 * `{ ...req.body, tripId }`) anywhere under server/ — the same mass-assignment surface the
 * money-endpoints guard's schema-mediated pass already targets, just without pre-filtering by
 * column family. A `.pick()`-based (allowlist) schema is safe BY CONSTRUCTION for any column not
 * named in the pick set, so it is scanned too but can only ever fail on a family column someone
 * explicitly picked.
 *
 * THE SIX NAMED FAMILIES (the enumeration the directive asked for).
 *   1. ROLE/PRIVILEGE     — role, isAdmin, verifiedInfluencer, influencerTier, referralCode
 *   2. STATUS/APPROVAL    — bare `status`, any `*Status` column, `pendingChanges`
 *   3. FEE/PAYOUT/RATE    — *fee*, *payout*, *commission*, *ShareRate, revenueShareRate,
 *                           bookingFee*, minBookingFee, feeSettings, totalEarnings,
 *                           pendingPayout, payoutSchedule (ruling 42's family, re-derived
 *                           independently — redundant coverage with the money-endpoints guard is
 *                           deliberate: if one predicate is ever weakened, the other still catches
 *                           it)
 *   4. VERIFICATION       — identityVerification*, businessVerification*, identityVerifiedAt,
 *                           canReceivePayments (the b2b15a28 family, re-derived independently —
 *                           the self-check the directive asked for)
 *   5. PAYMENT-IDENTITY   — stripe<Thing>Id, stripeAccountStatus, stripeConnectStatus,
 *                           paymentIntentId, sourcePaymentId (ruling 46's family, re-derived
 *                           independently)
 *   6. PLAN/ENTITLEMENT   — plan*, entitlement*, sourcePaymentId, and `source` SPECIFICALLY on a
 *                           plan/entitlement-named table (bare `source` is far too common a column
 *                           name elsewhere — e.g. `custom_venues.source` — to flag table-agnostic)
 *
 * WHAT COUNTS AS "EXPOSED".
 * For an `.omit()`-based schema: every table column NOT named in the omit block.
 * For a `.pick()`-based schema: only the columns NAMED in the pick block (safe by construction
 * otherwise — this is #PS18's target shape and the ratchet guard's job is to grow this bucket).
 * For a BARE call (no omit/pick — `createInsertSchema(Table)` with no narrowing modifier before
 * a request-body parse): every column, same as check-omit-schema-ratchet.cjs's treatment.
 *
 * ESCAPE HATCH — the GRANDFATHER list below, not a schema-line comment.
 * A column that is intentionally client-settable (an ordinary owner-authored status a client
 * legitimately sets, a field that only LOOKS privileged) is named explicitly in
 * GRANDFATHERED_COLUMNS with a one-line reason. This mirrors `money-derive-ok` in spirit but lives
 * in the guard itself (not scattered across shared/schema.ts) so the full grandfather list is
 * readable in one place, matching ruling 43's "state your negative space" posture — every
 * grandfather entry is exactly that, stated, not silently absorbed by a permissive regex.
 *
 * NEGATIVE SPACE (ruling 43 — state what this guard does NOT cover):
 *   · Scans shared/schema.ts's `createInsertSchema(...)` call sites ONLY — a hand-written zod
 *     object schema, or a table declared in shared/guest-invites-schema.ts, is out of scope.
 *   · A schema is "body-reachable" via handler-scoped ONE-HOP taint tracking (a req.body
 *     destructure, or a function call fed a req.body-derived value, one level deep — the
 *     `extractServiceLocation(bodyWithoutX)` shape) — a value threaded through two or more
 *     intermediate calls, reassigned under yet another name, or reconstructed from
 *     `req.query`/`req.params`, is invisible to this pass.
 *   · Column-NAME family membership only — it does not know whether the route or storage layer
 *     ALSO already strips a flagged column server-side (§18's two-layer posture still applies; a
 *     column can be doubly protected and still get flagged here until it is omitted/picked too).
 *     Conversely a flagged-then-grandfathered column is not proven SAFE by this guard — the
 *     grandfather reason is a human claim, not a machine proof.
 *   · The six families above are NAMED, not exhaustive — an authorization GRANT, an arbitrary
 *     AMOUNT column, or any future privileged shape nobody has named yet is invisible until it is
 *     added as a seventh family. This guard closes the *known* classes mechanically; it does not
 *     claim to close the unknown ones.
 *   · Does not analyze whether a route that parses a flagged schema ever actually SPREADS the
 *     dangerous field into a write — money-endpoints.cjs's line-level req.body pass, and the human
 *     judgment that goes into any given fix, own that.
 *
 * Node built-ins only. Self-test: --self-test (run in CI immediately before the guard itself).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = 'shared/schema.ts';
const ALLOW = 'money-derive-ok'; // same column-line escape hatch the sibling guard uses

// ─── The six family predicates ───────────────────────────────────────────────────────────────
const ROLE_FAMILY_RE = /^(role|isAdmin|verifiedInfluencer|influencerTier|referralCode)$/;
const STATUS_FAMILY_RE = /^status$|Status$|^pendingChanges$/;
const FEE_FAMILY_RE =
  /^(revenueShareRate|totalEarnings|pendingPayout|payoutSchedule|feeSettings|minBookingFee)$/.source +
  '|' +
  /(?:^|[^A-Za-z])(fee|payout|commission)s?(?![a-z])/i.source +
  '|' +
  /(?:[a-z0-9_])(Fee|Payout|Commission|ShareRate)s?(?![a-z])/.source;
const FEE_FAMILY_RE_COMPILED = new RegExp(FEE_FAMILY_RE);
const VERIFICATION_FAMILY_RE = /^(identity|business)(Verification\w*|VerifiedAt)$|^canReceivePayments$/;
const PAYMENT_IDENTITY_FAMILY_RE =
  /^(stripe\w*Id|stripeAccountStatus|stripeConnectStatus|paymentIntentId|sourcePaymentId)$/;
// camelCase-boundary-aware: `plan`/`entitlement` alone, or followed by a capitalized segment
// (`planKey`, `entitlementType`) — NOT a same-case continuation (`planningNotes` must not match).
const PLAN_FAMILY_RE = /^(plan|entitlement)([A-Z]\w*)?$/;
const PLAN_TABLE_RE = /plan|entitlement|membership|occasion/i;

// Order matters: `classify()` returns the FIRST match, and STATUS_FAMILY_RE's bare `Status$` suffix
// also matches identityVerificationStatus/stripeAccountStatus/stripeConnectStatus etc. The more
// SPECIFIC families are checked first so a column that is verification-shaped or payment-identity-
// shaped is labeled as that (semantically the primary family), with STATUS/APPROVAL last as the
// generic catch-all for everything else ending in "status".
const FAMILIES = [
  { key: 'verification', label: 'VERIFICATION', re: (col) => VERIFICATION_FAMILY_RE.test(col) },
  { key: 'payment-identity', label: 'PAYMENT-IDENTITY', re: (col) => PAYMENT_IDENTITY_FAMILY_RE.test(col) },
  { key: 'fee', label: 'FEE/PAYOUT/RATE', re: (col) => FEE_FAMILY_RE_COMPILED.test(col) },
  { key: 'role', label: 'ROLE/PRIVILEGE', re: (col) => ROLE_FAMILY_RE.test(col) },
  {
    key: 'plan',
    label: 'PLAN/ENTITLEMENT',
    re: (col, table) => PLAN_FAMILY_RE.test(col) || (col === 'source' && PLAN_TABLE_RE.test(table)),
  },
  { key: 'status', label: 'STATUS/APPROVAL', re: (col) => STATUS_FAMILY_RE.test(col) },
];

function classify(col, table) {
  for (const f of FAMILIES) {
    if (f.re(col, table)) return f;
  }
  return null;
}

// ─── GRANDFATHER — intentionally-exposed columns, one reason each ───────────────────────────────
// Every entry here is a column the guard's predicate correctly flagged as family-matching, that a
// human reviewed and confirmed is NOT the privileged shape §14/§18/§19 prohibit. This list is the
// guard's stated exception set (ruling 43 posture) — it is read in full by the report this guard's
// authoring PR carries, not assumed safe by omission.
const GRANDFATHERED_COLUMNS = {
  // STATUS family — the owner's own publish/draft/active toggle for their OWN listing. Gated by
  // the meeting-point/price/verification publish checks in the POST/PATCH route handlers
  // themselves (not this schema); distinct from `approvalStatus` (stripped, see the schema
  // comment) which is the ADMIN review-queue verdict, not the owner's availability switch.
  'providerServices.status': 'owner-set publish/draft/active toggle for their own listing; gated by route-level publish checks, not an admin verdict',
  // STATUS family — the traveler/expert's own planning state for an item on their OWN trip
  // (planned/confirmed/completed/…). No cross-user or money read found; distinct from
  // `routingStatus` (stripped — the actual checkout-claim money-lifecycle field).
  'itineraryItems.status': "owner's own item planning state (planned/confirmed/…); no money or cross-user read found",
  // STATUS family — the §19 follow-up investigation this entry filed for is now CLOSED (not merely
  // deferred): confirmed display-only, not a money hole.
  //   (a) The one reader that looked money-adjacent, `GET /trips/:tripId/commission`
  //       (booking-actions.ts), is a non-persisted LIVE ESTIMATE. Both real charge paths derive
  //       their charged set from server-owned rows and never read bookingStatus:
  //       `resolveCoordinationFee` (→ platform_revenue) is a pure function of
  //       (eventType, budgetCents, credits); the checkout charge loop (payments.routes.ts →
  //       pickOwnerShareRate → service_bookings/expert_earnings) charges cart_items gated on
  //       routingStatus, not bookingStatus. So no strip is needed.
  //   (b) Deliberately NOT stripped: the one legitimate writer is content.routes.ts's
  //       affiliate-booking-confirm flow, which sets bookingStatus:"confirmed" as a
  //       server-verified, ownership-gated transition. A blanket strip in
  //       storage.createItineraryItem/updateItineraryItem would break that caller for zero
  //       money-safety benefit. Contrast sibling `routingStatus`/`bookingId`, which ARE stripped —
  //       they have no legitimate direct caller (item-routing.service.ts writes them raw).
  //   (c) The commission endpoint has NO client consumer today (nothing useQuerys its body); its
  //       future consumer is the filed fee-attribution sidebar (marketplace-audit DISPLAY lane).
  //       WHEN that lane lands, switch its `bookingStatus !== "cancelled"` filter to a
  //       server-owned signal (routingStatus/bookingId presence) so a traveler's cosmetic PATCH
  //       can't nudge the displayed estimate — deferred to the moment it matters, not fixed here
  //       for an endpoint with zero consumers.
  'itineraryItems.bookingStatus': 'confirmed display-only (2026-08-29 investigation) — no money path reads it; not stripped because affiliate-booking-confirm is a legitimate direct writer; commission-endpoint filter hardening deferred until the fee-attribution sidebar consumes it',
  // STATUS family — a legacy generation-job tracker row (pending/completed/failed on the client's
  // OWN AI-generated-itinerary record). No gating read found anywhere in server/.
  'generatedItineraries.status': "the client's own AI-generation job status; no gating read found",
  // STATUS family — vendors is a directory row (name/category/rating/…), default "active". The
  // route (`POST /api/vendors`) is `isAuthenticated`-only with no ownership/admin scoping at all,
  // which is a SEPARATE, broader endpoint-authorization gap (any authenticated user can create a
  // publicly-listed vendor row) — not a column-privilege issue this guard's family list covers;
  // filed as its own task rather than folded into this fix.
  'vendors.status': "directory-listing status; POST /api/vendors' missing endpoint-level scoping is a separate, already-filed concern — not a column-family issue",
  // STATUS family (x6) — each of these EA tables is the acting eaUserId's OWN private
  // executive-assistant record (contact, event, gift, communication, AI-task tracker). `status`
  // is ordinary per-record workflow state for a tool that never crosses users or moves money.
  'eaExecutives.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  'eaEvents.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  'eaTravelArrangements.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  'eaGifts.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  'eaCommunications.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  'eaAiTasks.status': "owner's own private EA record; ordinary workflow state, no cross-user or money read",
  // STATUS family — RSVP status on a participant row the TRIP OWNER creates for their own trip
  // (route requires verifyTripOwnership before the schema parse). Ordinary coordination data.
  'tripParticipants.status': "RSVP status the trip owner sets when adding a participant to their own trip (route requires ownership); no money/access-control read",
  // STATUS family — an informal expense-split ("who owes what") tracker, the same shape as a
  // Splitwise entry: read only by `coordination.service.ts`'s own display stats, never tied to a
  // real Stripe charge or checkout flow. Not a §14 "money decision".
  'tripParticipants.paymentStatus': "informal IOU/expense-split bookkeeping (organizer-authored); never reaches a real Stripe charge or checkout decision",
  // ROLE family — a free-text-from-a-small-vocabulary group-coordination LABEL
  // (organizer/co-organizer/guest/vendor_contact), set by the trip owner when adding a
  // participant to their own trip. Every real privilege check in the repo reads `users.role`
  // (session-derived, server-side), never `trip_participants.role` — verified by inspection (no
  // `.role ===` / RBAC read references this column anywhere in server/).
  'tripParticipants.role': "group-coordination display label (organizer/guest/…), not an access-control role; every real privilege check reads users.role instead",
  // ROLE family — an attribution label on the trip's own change-log feed (who/what made this
  // edit: owner/expert/friend/ai), written server-side alongside the change text. Purely display
  // metadata for the activity feed, not a permission grant.
  'itineraryChanges.role': 'change-log attribution label (owner/expert/friend/ai) for the activity feed, not a permission grant',
};

// ─── Self-test (`--self-test`) — committed fixtures, ledger-lint / §18d precedent ────────────
function selfTest() {
  const cases = [
    // [subject-column, table, family-label-or-null, why]
    // ROLE/PRIVILEGE
    ['role', 'tripParticipants', 'ROLE/PRIVILEGE', 'bare role column'],
    ['isAdmin', 'x', 'ROLE/PRIVILEGE', 'admin flag'],
    ['verifiedInfluencer', 'x', 'ROLE/PRIVILEGE', 'influencer verdict'],
    ['influencerTier', 'x', 'ROLE/PRIVILEGE', 'influencer tier'],
    ['referralCode', 'x', 'ROLE/PRIVILEGE', 'referral code'],
    ['userRole', 'x', null, 'not an exact match — a *different* column, not this family (avoid over-matching compound names)'],
    // STATUS/APPROVAL
    ['status', 'x', 'STATUS/APPROVAL', 'bare status'],
    ['approvalStatus', 'x', 'STATUS/APPROVAL', 'the F2/D1a column'],
    ['editReviewStatus', 'x', 'STATUS/APPROVAL', 'the edit-split rail column'],
    ['formStatus', 'x', 'STATUS/APPROVAL', 'named by the directive'],
    ['routingStatus', 'x', 'STATUS/APPROVAL', 'the itineraryItems checkout-claim column (this fix)'],
    ['pendingChanges', 'x', 'STATUS/APPROVAL', 'the edit-split rail jsonb column'],
    ['statusCode', 'x', null, 'does not END in "Status" — must not match (over-match guard)'],
    // FEE/PAYOUT/RATE
    ['revenueShareRate', 'x', 'FEE/PAYOUT/RATE', 'the MI-1 column'],
    ['bookingFeePercentage', 'x', 'FEE/PAYOUT/RATE', 'fee family'],
    ['minBookingFee', 'x', 'FEE/PAYOUT/RATE', 'named by the directive'],
    ['totalEarnings', 'x', 'FEE/PAYOUT/RATE', 'named by the directive'],
    ['pendingPayout', 'x', 'FEE/PAYOUT/RATE', 'named by the directive'],
    ['payoutSchedule', 'x', 'FEE/PAYOUT/RATE', 'named by the directive'],
    ['commissionBandKey', 'x', 'FEE/PAYOUT/RATE', 'a band selector'],
    ['hourlyRate', 'x', null, 'a free-text display rate, not fee/payout/commission/ShareRate-shaped — must not match (matches the sibling guard\'s own adjudication)'],
    ['separateInvoices', 'x', null, '"separate" contains "rate" as a substring — must not match'],
    // VERIFICATION
    ['identityVerificationSessionId', 'x', 'VERIFICATION', 'session id'],
    ['identityVerificationStatus', 'x', 'VERIFICATION', 'the publish-gate status'],
    ['identityVerifiedAt', 'x', 'VERIFICATION', 'timestamp'],
    ['businessVerificationStatus', 'x', 'VERIFICATION', 'provider-only'],
    ['canReceivePayments', 'x', 'VERIFICATION', 'named explicitly by the directive'],
    ['verificationRequired', 'x', null, 'category admin flag, no identity/business prefix — must not match'],
    ['businessRegistrationNumber', 'x', null, '"business" prefix but not verification-shaped — must not match'],
    ['lastVerifiedAt', 'x', null, '"last", not identity/business — must not match'],
    // PAYMENT-IDENTITY
    ['stripePaymentIntentId', 'x', 'PAYMENT-IDENTITY', 'the PS15/§19a column'],
    ['stripeAccountId', 'x', 'PAYMENT-IDENTITY', 'Connect linkage'],
    ['stripeAccountStatus', 'x', 'PAYMENT-IDENTITY', 'named explicitly by the directive (unlike the sibling guard\'s narrower id-only predicate)'],
    ['stripeConnectStatus', 'x', 'PAYMENT-IDENTITY', 'named explicitly by the directive'],
    ['paymentIntentId', 'x', 'PAYMENT-IDENTITY', 'un-prefixed spelling'],
    ['sourcePaymentId', 'x', 'PAYMENT-IDENTITY', 'named explicitly by the directive'],
    ['tripId', 'x', null, 'an ordinary FK — must not match'],
    // PLAN/ENTITLEMENT
    ['planKey', 'x', 'PLAN/ENTITLEMENT', 'plan-prefixed'],
    ['entitlementType', 'x', 'PLAN/ENTITLEMENT', 'entitlement-prefixed'],
    ['source', 'plan_memberships', 'PLAN/ENTITLEMENT', 'table-scoped: source on a plan-named table'],
    ['source', 'customVenues', null, 'bare "source" on an UNRELATED table must not match — too common a column name to flag table-agnostic'],
    ['planningNotes', 'x', null, '"plan" as a substring of an unrelated word — must not match (word-anchored, not substring)'],
  ];
  let bad = 0;
  for (const [col, table, expectedLabel, why] of cases) {
    const got = classify(col, table);
    const gotLabel = got ? got.label : null;
    if (gotLabel !== expectedLabel) {
      bad++;
      console.error(`SELF-TEST FAIL: ${table}.${col} → ${gotLabel}, expected ${expectedLabel} (${why})`);
    }
  }
  if (bad) process.exit(1);
  console.log(`self-test OK (${cases.length} fixtures across 6 families: role, status, fee/payout/rate, verification, payment-identity, plan/entitlement)`);
  process.exit(0);
}
if (process.argv.includes('--self-test')) selfTest();

// ─── Walk server/ for .ts files ──────────────────────────────────────────────────────────────
function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.ts')) out.push(rel);
  }
}

// ─── Step 1: every createInsertSchema(...) call site in shared/schema.ts ────────────────────
const schemaPath = path.join(ROOT, SCHEMA_FILE);
if (!fs.existsSync(schemaPath)) {
  console.error(`❌ ${SCHEMA_FILE} not found`);
  process.exit(1);
}
const schemaSrc = fs.readFileSync(schemaPath, 'utf8');
const schemaLines = schemaSrc.split('\n');

// table -> [{col, line}] (every declared column, unfiltered by family — classification happens later)
const tableColumns = {};
{
  let curTable = null;
  schemaLines.forEach((l, i) => {
    const t = l.match(/^export const (\w+)\s*=\s*pgTable\(/);
    if (t) { curTable = t[1]; tableColumns[curTable] = []; return; }
    if (!curTable) return;
    if (/^\}\)/.test(l) || /^\}, \(table\)/.test(l)) { curTable = null; return; }
    const c = l.match(/^\s{2}(\w+):\s*(?:decimal|numeric|integer|real|doublePrecision|varchar|text|jsonb|timestamp|boolean|uuid|serial|bigint|date)\(/);
    if (c) tableColumns[curTable].push({ col: c[1], line: i + 1 });
  });
}

// insert schema name -> { table, shape: 'omit'|'pick'|'bare', names: string[] }
const insertSchemas = [];
{
  const re = /export const (insert\w+Schema)\s*=\s*createInsertSchema\((\w+)\)([\s\S]*?);\n/g;
  let m;
  while ((m = re.exec(schemaSrc))) {
    const chain = m[3];
    const omitBlock = chain.match(/^\s*\.omit\(\{([\s\S]*?)\}\)/);
    const pickBlock = chain.match(/^\s*\.pick\(\{([\s\S]*?)\}\)/);
    let shape, names;
    if (omitBlock) {
      shape = 'omit';
      names = [...omitBlock[1].matchAll(/(\w+):\s*true/g)].map((x) => x[1]);
    } else if (pickBlock) {
      shape = 'pick';
      names = [...pickBlock[1].matchAll(/(\w+):\s*true/g)].map((x) => x[1]);
    } else {
      shape = 'bare';
      names = [];
    }
    insertSchemas.push({ name: m[1], table: m[2], shape, names });
  }
}

// ─── Step 2: which insert schemas are parsed from a request body anywhere under server/ ──────
// Handler-scoped TAINT PROPAGATION, not just a same-line/nearby-line text match. The money-
// endpoints guard's own schema-mediated pass only checks the parse call's immediate argument text
// against /req\.body|body\b/ — which is blind to `insertProviderServiceSchema.parse(bodyWithoutLocation)`
// (found while building this guard: `bodyWithoutLocation` is destructured from `extractServiceLocation`,
// itself called on `bodyWithoutNeighborhoods`, itself destructured from `req.body`, two hops
// upstream — a real, live pattern in server/routes.ts, not a hypothetical). A same-line/window
// text match would silently miss this schema's entire family sweep. Instead: within each route
// handler's own line range (delimited by the next `app./router.<method>(` registration, the same
// scoping the money-endpoints guard uses for its money-operation pass), track every identifier
// that is DERIVED from req.body — directly (`const x = req.body`, `const {...rest} = req.body`)
// or transitively through one more hop (`const {body: y} = someFn(x)` where x is already tainted)
// — and treat a parse call whose argument is `req.body` OR ANY tainted identifier as body-reachable.
// Scoping to the handler's own line range keeps an unrelated variable name in a LATER handler
// (`input`, `body`, …) from inheriting an EARLIER handler's taint.
const serverFiles = [];
walk('server', serverFiles);
const HANDLER_START_RE = /\b(app|router)\.(get|post|put|patch|delete)\s*\(/;
const bodyReachable = new Map(); // schemaName -> [sites]

function handlerRanges(lines) {
  const starts = [];
  lines.forEach((l, i) => { if (HANDLER_START_RE.test(l)) starts.push(i); });
  const ranges = [];
  for (let k = 0; k < starts.length; k++) {
    ranges.push({ start: starts[k], end: k + 1 < starts.length ? starts[k + 1] : lines.length });
  }
  return ranges;
}

for (const rel of serverFiles) {
  if (/[/\\]__tests__[/\\]|\.test\.ts$/.test(rel)) continue;
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  for (const { start, end } of handlerRanges(lines)) {
    const tainted = new Set();
    for (let i = start; i < end; i++) {
      const line = lines[i];
      // Direct: `const x = req.body` / `const { a, ...rest } = req.body`.
      if (/req\.body/.test(line)) {
        const destructure = line.match(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*req\.body/);
        if (destructure) {
          const rest = destructure[1].match(/\.\.\.(\w+)/);
          if (rest) tainted.add(rest[1]);
          for (const bare of destructure[1].matchAll(/(?:^|,)\s*(\w+)\s*(?:,|$)/g)) tainted.add(bare[1]);
          for (const aliased of destructure[1].matchAll(/(\w+)\s*:\s*(\w+)/g)) tainted.add(aliased[2]);
        }
        const simple = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*req\.body\b/);
        if (simple) tainted.add(simple[1]);
      }
      // One-hop propagation: `const { body: y, patch: z } = someFn(x)` where x is already tainted,
      // or `const y = someFn(x)` likewise — the exact `extractServiceLocation(bodyWithoutX)` shape.
      const call = line.match(/(?:const|let|var)\s*(\{[^}]*\}|\w+)\s*=\s*\w+\(([^)]*)\)/);
      if (call && [...tainted].some((t) => new RegExp(`\\b${t}\\b`).test(call[2]))) {
        const lhs = call[1];
        if (lhs.startsWith('{')) {
          for (const bare of lhs.slice(1, -1).matchAll(/(?:^|,)\s*(\w+)\s*(?:,|$)/g)) tainted.add(bare[1]);
          for (const aliased of lhs.slice(1, -1).matchAll(/(\w+)\s*:\s*(\w+)/g)) tainted.add(aliased[2]);
        } else {
          tainted.add(lhs);
        }
      }
      const mm = line.match(/\b(insert\w+Schema)\s*(?:\.partial\(\))?\s*\.(?:safeParse|parse)\s*\(([^;]*)/);
      if (!mm) continue;
      // The parse call's own argument text (may span a few lines for an object-literal spread) —
      // covers both `schema.parse(req.body)` and `schema.parse({ ...req.body, tripId })`.
      const argWindow = [mm[2], ...lines.slice(i + 1, Math.min(i + 6, end))].join('\n');
      const directHit = /req\.body|\.\.\.\s*body\b/.test(argWindow);
      const taintHit = [...tainted].some((t) => new RegExp(`\\b${t}\\b`).test(argWindow));
      if (directHit || taintHit) {
        const arr = bodyReachable.get(mm[1]) || [];
        arr.push(`${rel}:${i + 1}`);
        bodyReachable.set(mm[1], arr);
      }
    }
  }
}

// ─── Step 3: intersect — for each body-reachable schema, which family columns are EXPOSED ────
const violations = [];
let scannedCount = 0;

for (const s of insertSchemas) {
  const sites = bodyReachable.get(s.name);
  if (!sites) continue;
  scannedCount++;
  const allCols = tableColumns[s.table] || [];
  let exposed;
  if (s.shape === 'omit') {
    exposed = allCols.filter((c) => !s.names.includes(c.col));
  } else if (s.shape === 'pick') {
    exposed = allCols.filter((c) => s.names.includes(c.col));
  } else {
    exposed = allCols; // bare — nothing narrows it, same posture as check-omit-schema-ratchet.cjs
  }
  for (const c of exposed) {
    const line = schemaLines[c.line - 1] || '';
    if (line.includes(ALLOW)) continue;
    const family = classify(c.col, s.table);
    if (!family) continue;
    const key = `${s.table}.${c.col}`;
    if (GRANDFATHERED_COLUMNS[key]) continue;
    violations.push({
      table: s.table,
      col: c.col,
      family: family.label,
      schema: s.name,
      shape: s.shape,
      where: `${SCHEMA_FILE}:${c.line}`,
      sites: sites.join(', '),
    });
  }
}

if (violations.length) {
  console.error('❌ Privileged-field completeness guard: a body-reachable insert schema EXPOSES an unclassified privileged column.');
  console.error('   Fix: either omit/exclude it from the pick set (and add a storage-layer strip, §18 two-layer posture),');
  console.error('   or — if it is genuinely intentional — add it to GRANDFATHERED_COLUMNS in this script with a one-line reason.\n');
  for (const v of violations) {
    console.error(`   ${v.where}  ${v.table}.${v.col} [${v.family}] exposed by ${v.schema} (${v.shape}), parsed from a request body at: ${v.sites}`);
  }
  process.exit(1);
}

console.log(
  `✅ Privileged-field completeness guard: scanned ${insertSchemas.length} insert schemas, ` +
  `${scannedCount} body-reachable — no unclassified privileged column exposed across the 6 named ` +
  `families (role, status/approval, fee/payout/rate, verification, payment-identity, plan/` +
  `entitlement), ${Object.keys(GRANDFATHERED_COLUMNS).length} grandfathered.`
);
console.log(
  '   NEGATIVE SPACE (ruling 43 — what this guard does NOT cover):\n' +
  '   · Scans shared/schema.ts createInsertSchema(...) call sites ONLY — a hand-written zod object\n' +
  '     schema, or a table in shared/guest-invites-schema.ts, is out of scope.\n' +
  '   · "Body-reachable" tracks req.body-derived identifiers ONE hop through a same-handler\n' +
  '     destructure or function call (the `extractServiceLocation(bodyWithoutX)` shape) — a value\n' +
  '     threaded through TWO or more intermediate calls, reassigned under yet another name, or\n' +
  '     passed into a helper declared in a different file is invisible to this pass. Each handler\'s\n' +
  '     taint set is scoped to that handler\'s own line range (delimited by the next app./router.\n' +
  '     registration) so it cannot leak across routes — but also cannot see across them.\n' +
  '   · Column-NAME family membership only. It does not know whether a route or storage layer\n' +
  '     already strips a flagged column server-side, and a grandfathered column is a human claim,\n' +
  '     not a machine proof.\n' +
  '   · The six families are NAMED, not exhaustive — an authorization grant, an arbitrary amount\n' +
  '     column, or any future privileged shape nobody has named yet is invisible until it becomes\n' +
  '     a seventh family here.\n' +
  '   · Does not analyze whether a route that parses a flagged schema ever actually spreads the\n' +
  '     field into a write — money-endpoints.cjs\'s line-level req.body pass owns that.'
);
