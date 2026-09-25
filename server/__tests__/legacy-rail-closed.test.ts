/**
 * legacy-rail-closed.test.ts — the DATED no-new-writes switch on the legacy `bookings` rail.
 *
 * Punchlist **D-12**, decision-maker 2026-09-15 (option A), ledger
 * `2026-09-15-d12-service-bookings-canonical`. CLAUDE.md §8 (the date is CONFIG, never a literal),
 * §13, §15c (the legacy rail is still live and its READS survive), §17, §18 rule 1.
 *
 * THE RULING THIS PINS. `service_bookings` is the canonical booking rail. `POST
 * /api/bookings/process-cart` — the legacy rail's one write endpoint — refuses NEW writes from an
 * operator-set date, with the reason stated and the canonical rail named, and refuses BEFORE any
 * read or write. Historical reads, refunds, cancellations and §17's `scanLegacyRail` are untouched.
 *
 * WHY THE "BEFORE ANY WRITE" HALF NEEDS ITS OWN PROOF. `processCart` is not a single INSERT: it
 * can MINT A TRIP (`ensureValidTripIds` → `createTripForBooking`), insert `bookings` rows, insert
 * `booking_requests` rows and create a Stripe PaymentIntent. A refusal placed even one statement
 * too late would leave an orphan trip behind on every rejected call, and nothing would log it. So
 * C3 does not assert "no booking row" — it asserts that the service was never entered and that the
 * handler issued ZERO database statements of any kind.
 *
 * NEGATIVE SPACE, stated so a green run is read correctly (§18d habit):
 *  - NO DATABASE, NO HTTP, NO BROWSER. `db.execute`/`db.transaction` are replaced by counting stubs
 *    and the route handler is invoked directly off the router's own stack, so this proves what the
 *    HANDLER does, not that Express mounts it or that `isAuthenticated` admits anybody.
 *  - it asserts nothing about amounts, fees, rates or idempotency — this lane moved none of them.
 *    `legacy-rail-traveler-charge.test.ts` is the layer for the charge and §15's suites for claims.
 *  - C6 reads the SHIPPED SOURCE of the handler to prove the switch is the FIRST statement. A
 *    reordering that kept the refusal but moved a read above it would pass C1–C5 and fail here.
 *  - it cannot prove a cutoff date is RIGHT, and deliberately asserts none: the date is the
 *    decision-maker's and this lane sets it in no environment.
 *
 * Run: npx tsx --test server/__tests__/legacy-rail-closed.test.ts
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from '../db';
import { bookingService } from '../services/booking.service';
import bookingsRouter from '../routes/bookings';
import {
  CANONICAL_BOOKING_RAIL,
  LEGACY_BOOKINGS_CLOSED_REASON,
  LEGACY_BOOKINGS_CUTOFF_ENV,
  legacyBookingsClosedToNewWrites,
  legacyBookingsNoNewWritesFrom,
  describeLegacyBookingsCutoff,
} from '../config/legacy-bookings.config';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── the handler under test ───────────────────────────────────────────────────────────────────
// The LAST handle registered on the `/process-cart` POST layer is the route handler itself
// (`isAuthenticated` is the one before it). Taking it from the router rather than re-declaring it
// means this suite tests the shipped registration, not a copy of it.
function processCartHandler(): (req: any, res: any) => Promise<void> {
  const layer = (bookingsRouter as any).stack.find(
    (l: any) => l?.route?.path === '/process-cart' && l.route.methods?.post,
  );
  assert.ok(layer, 'POST /process-cart is no longer registered on the bookings router');
  const handles = layer.route.stack;
  return handles[handles.length - 1].handle;
}

/** A minimal Express-shaped response recorder. */
function recorder() {
  const out: { status: number | null; body: any } = { status: null, body: null };
  const res: any = {
    status(code: number) { out.status = code; return res; },
    json(payload: any) { out.body = payload; return res; },
  };
  return { out, res };
}

const SESSION_USER = 'user-d12';
function req(body: any = {}) {
  return { body, user: { id: SESSION_USER, claims: { sub: SESSION_USER } }, method: 'POST', path: '/process-cart' };
}

let originalExecute: typeof db.execute;
let originalTransaction: typeof db.transaction;
let originalProcessCart: typeof bookingService.processCart;
let originalEnv: string | undefined;

/** Every DB statement the handler caused this run. Must stay EMPTY on a refusal. */
let statements = 0;
/** Did the handler enter the service at all? */
let serviceCalls = 0;

before(() => {
  originalExecute = db.execute.bind(db);
  originalTransaction = db.transaction.bind(db);
  originalProcessCart = bookingService.processCart.bind(bookingService);
  originalEnv = process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
});

after(() => {
  db.execute = originalExecute;
  db.transaction = originalTransaction;
  bookingService.processCart = originalProcessCart;
  if (originalEnv === undefined) delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
  else process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = originalEnv;
});

function arm() {
  statements = 0;
  serviceCalls = 0;
  (db as any).execute = async () => { statements += 1; return { rows: [] }; };
  (db as any).transaction = async (fn: Function) => {
    statements += 1;
    return fn({ execute: async () => { statements += 1; return { rows: [] }; } });
  };
  (bookingService as any).processCart = async () => {
    serviceCalls += 1;
    return {
      instantBookings: [], pendingRequests: [], externalLinks: [],
      paymentRequired: 0, travelerFeeTotal: 0, paymentIntent: undefined, errors: [],
    };
  };
}

function disarm() {
  db.execute = originalExecute;
  db.transaction = originalTransaction;
  bookingService.processCart = originalProcessCart;
  delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 24 * 60 * 60 * 1000;

describe('D-12 — the legacy `bookings` rail closes on a date, and only then', () => {
  beforeEach(arm);
  afterEach(disarm);

  it('C1 — UNSET means no cutoff has been decided: the accessor is null and writes are allowed', async () => {
    delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
    assert.equal(legacyBookingsNoNewWritesFrom(), null);
    assert.equal(legacyBookingsClosedToNewWrites(), false);

    const { out, res } = recorder();
    await processCartHandler()(req({ cartItems: [] }), res);

    // §13: an absent env var is "nobody has decided", NEVER "closed now". Closing a live money rail
    // because a variable is missing is the opposite of a safe failure mode.
    assert.notEqual(out.status, 410, 'an unset cutoff must never close the rail');
    assert.equal(serviceCalls, 1, 'the handler must reach the service exactly as before');
  });

  it('C2 — a FUTURE cutoff is decided but not yet in force: writes are still allowed', async () => {
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = iso(30 * DAY);
    assert.ok(legacyBookingsNoNewWritesFrom() instanceof Date);
    assert.equal(legacyBookingsClosedToNewWrites(), false);

    const { out, res } = recorder();
    await processCartHandler()(req({ cartItems: [] }), res);

    assert.notEqual(out.status, 410);
    assert.equal(serviceCalls, 1);
  });

  it('C3 — a PAST cutoff refuses with 410 BEFORE any read or write', async () => {
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = iso(-DAY);
    assert.equal(legacyBookingsClosedToNewWrites(), true);

    const { out, res } = recorder();
    await processCartHandler()(
      req({ cartItems: [{ id: 'x', tripId: 't', title: 'T', itemType: 'activity', bookingType: 'instant', date: '2026-10-02', price: 100 }] }),
      res,
    );

    assert.equal(out.status, 410);
    // The whole point of the placement: nothing was minted, inserted or charged. `processCart` can
    // create a TRIP before it creates a booking, so "no booking row" would not have been enough.
    assert.equal(serviceCalls, 0, 'the service must not be entered at all');
    assert.equal(statements, 0, 'the handler must issue ZERO database statements on a refusal');
  });

  it('C4 — the refusal states the reason and names the canonical rail', async () => {
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = iso(-DAY);
    const { out, res } = recorder();
    await processCartHandler()(req({ cartItems: [] }), res);

    assert.equal(out.body.reason, LEGACY_BOOKINGS_CLOSED_REASON);
    assert.equal(out.body.reason, 'legacy_rail_closed');
    assert.equal(out.body.canonical, CANONICAL_BOOKING_RAIL);
    assert.equal(out.body.canonical, '/api/checkout');
    assert.equal(typeof out.body.message, 'string');
    assert.ok(out.body.message.length > 0, 'a closed rail says WHY, never a bare status code (§13)');
    // The traveler is told their existing bookings are unaffected, because they are: only NEW
    // writes stop, and every read path on this rail survives (§15c, §17).
    assert.match(out.body.message, /unaffected/i);
  });

  it('C5 — a MALFORMED cutoff is refused, never silently read as "no cutoff"', () => {
    // An operator who set the variable and mistyped it believes the rail is closed. Degrading that
    // to `null` would keep a money rail open on a value nobody could read (§13).
    for (const bad of ['soon', 'tomorrow', '01/10/2026', '2026-13-45', 'true']) {
      process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = bad;
      assert.throws(
        () => legacyBookingsNoNewWritesFrom(),
        new RegExp(LEGACY_BOOKINGS_CUTOFF_ENV),
        `"${bad}" must be refused, not degraded to null`,
      );
    }
    // Whitespace alone is the UNSET case, not a malformed one.
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = '   ';
    assert.equal(legacyBookingsNoNewWritesFrom(), null);
  });

  it('C6 — the switch is the FIRST statement in the handler, and the date lives in config', () => {
    const src = readFileSync(join(ROOT, 'server/routes/bookings.ts'), 'utf8');
    const start = src.indexOf("router.post('/process-cart'");
    assert.ok(start >= 0, 'POST /process-cart is no longer declared in server/routes/bookings.ts');
    const body = src.slice(start, start + 2000);

    const switchAt = body.indexOf('legacyBookingsClosedToNewWrites');
    const sessionAt = body.indexOf('getUserId(');
    const serviceAt = body.indexOf('bookingService.processCart');
    assert.ok(switchAt >= 0, 'the D-12 switch is gone from the handler');
    assert.ok(switchAt < sessionAt, 'the switch must precede the session read');
    assert.ok(switchAt < serviceAt, 'the switch must precede the service call');

    // §8/§18 rule 1: the DATE is config. No date literal and no env read may appear in route code —
    // a second reading of the cutoff is how the route and the config start disagreeing.
    assert.ok(
      !/process\.env\.LEGACY_BOOKINGS/.test(src),
      'the route must read the cutoff through the ONE accessor, never the env directly',
    );
    assert.ok(
      !/\d{4}-\d{2}-\d{2}/.test(body),
      'no cutoff date literal may appear in the handler — the date is the operator’s, set in env',
    );
  });

  it('C7 — this lane sets no cutoff date anywhere in the repo', () => {
    // The decision-maker sets the date after the operator reads production’s weekly write
    // count. A date committed here would be this lane deciding it (the punchlist row keeps the
    // operator query open). The suite’s own fixtures are computed from `Date.now()`, never typed.
    for (const rel of ['.github/workflows/build.yml', 'server/config/legacy-bookings.config.ts', 'server/routes/bookings.ts']) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      assert.ok(
        !new RegExp(`${LEGACY_BOOKINGS_CUTOFF_ENV}\\s*[:=]\\s*["']?\\d`).test(src),
        `${rel} assigns a cutoff date — that is the decision-maker’s to set, not this lane’s`,
      );
    }
  });
});

describe('D-12 — what the switch deliberately does NOT touch', () => {
  it('C8 — every READ path on the legacy rail is ungated', () => {
    const src = readFileSync(join(ROOT, 'server/routes/bookings.ts'), 'utf8');
    // The rail keeps its history: only the WRITE endpoint names the switch. A reader that gated on
    // it would turn "no new bookings" into "your past bookings are gone" (§13), and would blind
    // §17’s legacy scan, which reads rows this endpoint wrote years before the cutoff.
    const gated = src.split('\n').filter((l) => l.includes('legacyBookingsClosedToNewWrites('));
    assert.equal(gated.length, 1, 'exactly one call site — the write endpoint — may consult the switch');

    for (const route of ["router.get('/:id'", "router.post('/confirm-payment'", "router.post('/bulk-status'", "router.post('/refund'"]) {
      const at = src.indexOf(route);
      assert.ok(at >= 0, `${route} must still be registered — reads and refunds survive retirement`);
      // Bound the body at the NEXT route registration, never a fixed character count — a fixed
      // slice would spill into a neighbouring handler and read ITS switch as this one's.
      const rest = src.slice(at + route.length);
      const next = rest.search(/\nrouter\.(get|post|patch|put|delete)\(/);
      const body = next >= 0 ? rest.slice(0, next) : rest;
      assert.ok(
        !body.includes('legacyBookingsClosedToNewWrites'),
        `${route} must not consult the write switch`,
      );
    }
  });

  it('C9 — §17’s legacy scan is untouched', () => {
    const job = readFileSync(join(ROOT, 'server/jobs/stripeReconciliation.ts'), 'utf8');
    assert.match(job, /scanLegacyRail/, 'the drift job must still scan the legacy rail (§17)');
    assert.ok(
      !job.includes('legacyBookingsClosedToNewWrites'),
      'the detector must never stop looking at a rail because it stopped taking new rows',
    );
  });
});


describe('D-12 — the boot line states the resolved cutoff (ledger `2026-09-25-legacy-cutoff-boot-line`)', () => {
  // WHY THIS BLOCK EXISTS. A FUTURE cutoff and an UNSET one are behaviourally identical until the
  // date passes: both allow writes, and the rail's only reader is the write endpoint above. So a
  // restart performed to LOAD a cutoff could prove only that the value was not malformed. The boot
  // line closes that gap, and these proofs pin the one thing it must never do — read an absent
  // value as a closed rail (§13).
  //
  // NEGATIVE SPACE: this asserts what the DESCRIBER returns, not that `server/index.ts` prints it;
  // C14 reads the shipped source for the call site instead, because importing that module boots a
  // server. It asserts no cutoff DATE, for the same reason C7 does not.
  afterEach(() => {
    delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
  });

  it('C10 — UNSET reports "not set" with a null cutoff, and never says the rail is closed', () => {
    delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
    const report = describeLegacyBookingsCutoff();

    assert.equal(report.state, 'not_set');
    assert.equal(report.cutoff, null, 'no cutoff decided ⇒ null, never a stand-in instant (§13)');
    assert.match(report.message, /not set/i);
    assert.match(report.message, /accepts new writes/i);
    assert.ok(
      !/refuses/i.test(report.message),
      'an absent variable must never be reported as a closed rail',
    );
    assert.match(report.message, new RegExp(CANONICAL_BOOKING_RAIL.replace('/', '\\/')));
  });

  it('C11 — a FUTURE cutoff reports "decided, not in force" and carries the instant', () => {
    const at = iso(30 * DAY);
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = at;
    const report = describeLegacyBookingsCutoff();

    assert.equal(report.state, 'decided_not_in_force');
    assert.equal(report.cutoff, new Date(at).toISOString());
    assert.match(report.message, /still accepts new writes/i);
    // The operator's whole reason for restarting: the value they set is echoed back.
    assert.ok(report.message.includes(report.cutoff!), 'the resolved instant must be visible');
    assert.ok(report.message.includes(LEGACY_BOOKINGS_CUTOFF_ENV), 'the variable is named');
  });

  it('C12 — a PAST cutoff reports "in force" and names the refusal reason', () => {
    process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = iso(-DAY);
    const report = describeLegacyBookingsCutoff();

    assert.equal(report.state, 'in_force');
    assert.equal(typeof report.cutoff, 'string');
    assert.match(report.message, new RegExp(LEGACY_BOOKINGS_CLOSED_REASON));
  });

  it('C13 — the describer agrees with the route\'s own switch in all three states', () => {
    // §18 rule 1: the boot line ASKS `legacyBookingsClosedToNewWrites` rather than restating what
    // "closed" means, so the log and the endpoint it describes can never disagree.
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      [iso(30 * DAY), false],
      [iso(-DAY), true],
    ];
    for (const [value, closed] of cases) {
      if (value === undefined) delete process.env[LEGACY_BOOKINGS_CUTOFF_ENV];
      else process.env[LEGACY_BOOKINGS_CUTOFF_ENV] = value;

      assert.equal(
        describeLegacyBookingsCutoff().state === 'in_force',
        legacyBookingsClosedToNewWrites(),
        `the boot line and the route must agree for ${String(value)}`,
      );
      assert.equal(legacyBookingsClosedToNewWrites(), closed);
    }
  });

  it('C14 — boot logs the line on the pino path, after migrations and before routes', () => {
    const src = readFileSync(join(ROOT, 'server/index.ts'), 'utf8');

    assert.match(src, /describeLegacyBookingsCutoff/, 'boot must state the resolved cutoff');
    const at = src.indexOf('describeLegacyBookingsCutoff()');
    assert.ok(at > 0);

    // Ordering, not decoration: the migration summary and this line share the pino path precisely
    // because raw console.log interleaves unreliably with pino on fd 1 in production. A line
    // emitted after `registerRoutes` would land after the first requests are served.
    const migrations = src.indexOf('"Migrations complete"');
    const routes = src.indexOf('await registerRoutes(');
    assert.ok(migrations > 0 && routes > 0);
    assert.ok(at > migrations, 'the cutoff line follows the migration summary');
    assert.ok(at < routes, 'the cutoff line precedes route registration');

    // The message is the config module's, never re-typed at the call site (§18 rule 1).
    const tail = src.slice(at, at + 400);
    assert.match(tail, /legacyCutoff\.message/, 'boot prints the describer\'s own sentence');
    assert.ok(
      !/logger\.info\(\s*\{[^}]*\},\s*["`'].*LEGACY_BOOKINGS/s.test(tail),
      'the sentence must not be restated at the call site',
    );
  });
});
