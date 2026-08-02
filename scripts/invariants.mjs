#!/usr/bin/env node
// scripts/invariants.mjs
//
// STANDALONE SQL-ASSERTION RUNNER — no app boot needed, just a reachable Postgres. Runs a fixed
// list of money-integrity + data-hygiene invariants derived from docs/MONEY_MAP.md and
// CLAUDE.md (§8/§14/§15, the escrow spine, D1a, Lane 1/6 migrations). Each invariant is a single
// SQL query that returns the OFFENDING rows (never a bare count-only check) — id/amount columns
// so a violation is immediately actionable, not just a red flag.
//
// Exit code: 0 iff every invariant found ZERO offending rows. 1 if any invariant is violated.
// A violation is printed with severity, the rule it protects, and the offending row ids — some
// invariants are EXPECTED to find real rows on a long-lived sandbox DB (documented per-invariant
// below, e.g. the L10 owner-less-trip hazard) and are reported, not treated as harness bugs.
//
// Usage:
//   node scripts/invariants.mjs --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//   node scripts/invariants.mjs --db-url "..." --json          # machine-readable report only
//
// Severity groups:
//   MONEY-INTEGRITY  — a violation means real dollars are unaccounted for (double-pay risk,
//                       unbacked earning, missing revenue provenance, orphaned charge).
//   DATA-HYGIENE     — a violation means the data model's own invariant is broken (a status
//                       implies a column that isn't set) but no money is directly at risk today.

import { Client as PgClient } from "pg";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (flag) => process.argv.includes(flag);

const DB_URL = argValue(
  "--db-url",
  process.env.DATABASE_URL ||
    "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg",
);
const JSON_ONLY = hasFlag("--json");

// ─────────────────────────────────────────────────────────────────────────────────
// THE INVARIANT LIST — each entry: { id, severity, rule, sql, expectedFindings? }
//
// `rule` is a one-line pointer to the CLAUDE.md section / PR / migration the invariant protects,
// per the task's requirement ("each invariant carries a one-line comment saying WHICH rule/PR it
// protects"). `expectedFindings` (optional) documents that a nonzero result is a KNOWN, already-
// tracked condition (not a harness bug) — printed as such rather than implying the runner is
// broken; it still contributes to the severity-grouped report and the process still reports the
// count honestly (this script never suppresses a real finding, it only labels it correctly).
// ─────────────────────────────────────────────────────────────────────────────────
const INVARIANTS = [
  {
    id: "paid-out-earnings-have-payout-id",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §escrow spine / task #141 — releasable→paid_out is a single choke point " +
      "(storage.ts markEarningsPaidOutForPayoutTx) that always stamps payout_id alongside the " +
      "status flip; a paid_out row with no payout_id means money left without a payout record.",
    sql: `
      SELECT id, expert_id AS owner_id, amount, status, payout_id, 'expert_earnings' AS src
      FROM expert_earnings WHERE status = 'paid_out' AND payout_id IS NULL
      UNION ALL
      SELECT id, provider_id AS owner_id, amount, status, payout_id, 'provider_earnings' AS src
      FROM provider_earnings WHERE status = 'paid_out' AND payout_id IS NULL
      ORDER BY src, id;
    `,
  },
  {
    id: "completed-payout-not-exceeded-by-linked-earnings",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §15 FIX 1 + the releasable→paid_out flip (storage.ts markEarningsPaidOutForPayoutTx) " +
      "— a completed payout's amount must not exceed the sum of the earnings it claims to have paid " +
      "out (tolerance $0.01); a shortfall means the payout transferred more than the ledger backs.",
    // Compares each completed payout's OWN amount against the sum of earnings rows stamped with
    // that payout_id — a positive `shortfall` means the payout paid out MORE than its linked
    // earnings sum (the dangerous direction: money left the door unbacked by the ledger).
    sql: `
      WITH ep AS (
        SELECT p.id AS payout_id, p.amount AS payout_amount,
               COALESCE(SUM(e.amount), 0) AS linked_earnings_sum
        FROM expert_payouts p
        LEFT JOIN expert_earnings e ON e.payout_id = p.id AND e.status = 'paid_out'
        WHERE p.status = 'completed'
        GROUP BY p.id, p.amount
      ), pp AS (
        SELECT p.id AS payout_id, p.amount AS payout_amount,
               COALESCE(SUM(e.amount), 0) AS linked_earnings_sum
        FROM provider_payouts p
        LEFT JOIN provider_earnings e ON e.payout_id = p.id AND e.status = 'paid_out'
        WHERE p.status = 'completed'
        GROUP BY p.id, p.amount
      )
      SELECT payout_id, payout_amount, linked_earnings_sum,
             (payout_amount - linked_earnings_sum) AS shortfall, 'expert_payouts' AS src
      FROM ep WHERE payout_amount - linked_earnings_sum > 0.01
      UNION ALL
      SELECT payout_id, payout_amount, linked_earnings_sum,
             (payout_amount - linked_earnings_sum) AS shortfall, 'provider_payouts' AS src
      FROM pp WHERE payout_amount - linked_earnings_sum > 0.01
      ORDER BY src, payout_id;
    `,
  },
  {
    id: "platform-revenue-source-type-present",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §2 ledger writes — recordPlatformRevenue (storage.ts:3957) always writes a " +
      "sourceType; a NULL/empty source_type means a revenue row with no provenance, unauditable " +
      "and unreconcilable against the money map's per-rail bookkeeping.",
    sql: `
      SELECT id, source_type, source_id, gross_amount, status
      FROM platform_revenue
      WHERE source_type IS NULL OR btrim(source_type) = ''
      ORDER BY id;
    `,
  },
  {
    id: "reversed-platform-revenue-has-compensating-row",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §14 A2 / escrow Phase 4 (PR #170) — reversePlatformRevenueForBooking flips the " +
      "original row status='reversed' and inserts a compensating NEGATIVE row (double-entry) in the " +
      "SAME operation; a reversed row with no matching negative row for the same source_id means the " +
      "double-entry half never landed, so daily/summary rollups over-recognise revenue that was refunded.",
    sql: `
      SELECT r.id, r.source_id, r.source_type, r.gross_amount, r.status
      FROM platform_revenue r
      WHERE r.status = 'reversed'
        AND NOT EXISTS (
          SELECT 1 FROM platform_revenue neg
          WHERE neg.source_id = r.source_id
            AND neg.id <> r.id
            AND neg.gross_amount < 0
        )
      ORDER BY r.id;
    `,
  },
  {
    id: "paid-service-bookings-have-payment-intent",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §MONEY_MAP §2 service_bookings status machine — a booking that has advanced past " +
      "payment_pending (confirmed/completed/disputed) is only ever moved there by the Stripe webhook " +
      "or a verified PI, both of which stamp stripe_payment_intent_id first; a paid-equivalent booking " +
      "with no PI id means the status advanced without a verifiable charge behind it.",
    sql: `
      SELECT id, status, total_amount, stripe_payment_intent_id
      FROM service_bookings
      WHERE status IN ('confirmed', 'completed', 'disputed')
        AND (stripe_payment_intent_id IS NULL OR btrim(stripe_payment_intent_id) = '')
      ORDER BY id;
    `,
  },
  {
    id: "cart-items-itinerary-item-not-orphaned",
    severity: "DATA-HYGIENE",
    rule:
      "CLAUDE.md migration 160 (Trip-Canon Lane 1 Phase 1b) — cart_items.itinerary_item_id FK is " +
      "ON DELETE CASCADE specifically so a deleted plan item can never leave an orphaned, still-" +
      "chargeable cart row; this asserts that guarantee actually holds at the DB level.",
    sql: `
      SELECT ci.id, ci.itinerary_item_id, ci.user_id
      FROM cart_items ci
      WHERE ci.itinerary_item_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM itinerary_items ii WHERE ii.id = ci.itinerary_item_id)
      ORDER BY ci.id;
    `,
  },
  {
    id: "trips-have-owner-collaborator-row",
    severity: "DATA-HYGIENE",
    rule:
      "CLAUDE.md §13 L10 'Trip-access model divergence + owner under-grant' — getTripRole reads ONLY " +
      "trip_collaborators, never trips.userId, so a trip whose owner has no collaborator row 403s its " +
      "own owner on every model-A endpoint (plancard read, transport-leg status, per-item PATCH/DELETE). " +
      "This MAY legitimately find rows on a long-lived DB (three documented owner-less-trip mint sites: " +
      "ready-made-purchase.service.ts, booking.service.ts cart-checkout + saved-trip conversion) — " +
      "reported, not auto-fixed here.",
    expectedFindings: "known-open (L10) — report counts, do not fix",
    sql: `
      SELECT t.id, t.user_id, t.title, t.created_at
      FROM trips t
      WHERE t.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM trip_collaborators c
          WHERE c.trip_id = t.id AND c.user_id = t.user_id AND c.role = 'owner'
        )
      ORDER BY t.created_at DESC;
    `,
  },
  {
    id: "purchased-items-have-booking-id",
    severity: "DATA-HYGIENE",
    rule:
      "CLAUDE.md migration 159 (Trip-Canon Lane 1 Phase 1a) + docs/briefs/ROUTING_STATE_CONTRACT.md — " +
      "routing_status='purchased' is checkout-only (the POST /route endpoint explicitly refuses to set " +
      "it) and every writer of 'purchased' pairs it with the real booking_id in the same write; a " +
      "purchased item with no booking_id means the plan claims a purchase the ledger can't back.",
    sql: `
      SELECT id, trip_id, title, routing_status, booking_id
      FROM itinerary_items
      WHERE routing_status = 'purchased' AND booking_id IS NULL
      ORDER BY id;
    `,
  },
  {
    id: "approved-provider-services-have-owner",
    severity: "DATA-HYGIENE",
    rule:
      "shared/schema.ts providerServices.userId is NOT NULL + ON DELETE CASCADE — an approved " +
      "listing with no owner is structurally impossible unless a raw SQL path bypassed the FK; " +
      "asserts the invariant the schema is supposed to guarantee actually holds.",
    sql: `
      SELECT id, service_name, approval_status, user_id
      FROM provider_services
      WHERE approval_status = 'approved' AND user_id IS NULL
      ORDER BY id;
    `,
  },
  {
    id: "paid-coordination-fee-has-intent-and-amount",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §7 'Quote-only → CAPTURED' (migration 125) — the /pay/confirm atomic transition " +
      "unpaid→pending→paid always stamps fee_payment_intent_id and fee_amount_cents in the same " +
      "flow that flips status='paid'; a paid state with no PI id (and a nonzero fee) means the " +
      "state was marked paid without ever going through the real charge path.",
    sql: `
      SELECT id, user_id, fee_payment_status, fee_payment_intent_id, fee_amount_cents
      FROM coordination_states
      WHERE fee_payment_status = 'paid'
        AND fee_payment_intent_id IS NULL
        AND COALESCE(fee_amount_cents, 0) <> 0
      ORDER BY id;
    `,
  },
  {
    id: "matched-affiliate-earnings-have-partner-reference",
    severity: "MONEY-INTEGRITY",
    rule:
      "CLAUDE.md §2 affiliate_earnings + MONEY_MAP F-5 'adopt-external-truth — never estimate' — the " +
      "reconciliation matcher (fuzzy and exact-token) only ever flips reconciliation_status='matched' " +
      "in the SAME UPDATE that stamps partner_reference_id from the partner's own report; a matched " +
      "row with no partner reference means a commission was marked reconciled with no external record " +
      "behind it.",
    sql: `
      SELECT id, expert_id, total_commission, reconciliation_status, partner_reference_id
      FROM affiliate_earnings
      WHERE reconciliation_status = 'matched'
        AND (partner_reference_id IS NULL OR btrim(partner_reference_id) = '')
      ORDER BY id;
    `,
  },
  {
    id: "readymade-purchases-clone-status-consistent",
    severity: "DATA-HYGIENE",
    rule:
      "server/services/ready-made-purchase.service.ts fulfillReadyMadePurchase — a purchase that " +
      "reached status='cloned' always stamps clone_trip_id in the same fulfillment step; a cloned " +
      "purchase with no clone_trip_id means fulfillment was marked done without producing the " +
      "buyer's editable copy.",
    sql: `
      SELECT id, buyer_id, ready_made_trip_id, status, clone_trip_id
      FROM ready_made_purchases
      WHERE status = 'cloned' AND clone_trip_id IS NULL
      ORDER BY id;
    `,
  },
  {
    id: "template-purchases-completed-have-expert-earning",
    severity: "MONEY-INTEGRITY",
    rule:
      "server/routes.ts POST /api/expert-templates/:id/purchase/confirm — the atomic " +
      "pending_payment→completed transition and the createExpertEarning('template_sale') call are " +
      "meant to happen together for the confirm that WON the race; a completed purchase with zero " +
      "linked template_sale earnings for its expert means a sale closed with nothing credited.",
    sql: `
      SELECT tp.id, tp.expert_id, tp.price, tp.status
      FROM template_purchases tp
      WHERE tp.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM expert_earnings ee
          WHERE ee.reference_id = tp.id AND ee.reference_type = 'template_purchase'
        )
      ORDER BY tp.id;
    `,
  },
];

// ─────────────────────────────────────────────────────────────────────────────────
async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  try {
    await pg.connect();
  } catch (err) {
    console.error(`[invariants] DB not reachable at ${DB_URL}: ${err.message}`);
    console.error(
      `\nCold-boot recipe (identical to the journeys' — see scripts/journeys/README.md):\n` +
        `  PGDIR=/var/tmp/expws-pg\n` +
        `  mkdir -p "$PGDIR"\n` +
        `  /usr/lib/postgresql/16/bin/initdb -D "$PGDIR/data" -U postgres --auth=trust\n` +
        `  /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDIR/data" -o "-p 55442 -k $PGDIR" -l "$PGDIR/log" start\n` +
        `  /usr/lib/postgresql/16/bin/createdb -h "$PGDIR" -p 55442 -U postgres expws\n` +
        `Then re-run: node scripts/invariants.mjs --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"\n`,
    );
    process.exit(1);
  }

  const results = [];
  for (const inv of INVARIANTS) {
    try {
      const { rows } = await pg.query(inv.sql);
      results.push({ ...inv, offending: rows });
    } catch (err) {
      // A missing table/column on a schema this script hasn't been updated for is itself a
      // reportable condition, not a silent skip — surfaced as its own violation entry.
      results.push({
        ...inv,
        offending: [],
        queryError: err.message,
      });
    }
  }
  await pg.end().catch(() => {});

  const groups = { "MONEY-INTEGRITY": [], "DATA-HYGIENE": [] };
  for (const r of results) groups[r.severity].push(r);

  if (JSON_ONLY) {
    console.log(JSON.stringify({ dbUrl: DB_URL, results }, null, 2));
  } else {
    console.log(`\n[invariants] ${INVARIANTS.length} invariants checked against ${DB_URL}\n`);
    for (const severity of ["MONEY-INTEGRITY", "DATA-HYGIENE"]) {
      console.log(`═══ ${severity} ═══`);
      for (const r of groups[severity]) {
        const n = r.offending.length;
        const status = r.queryError
          ? "ERROR"
          : n === 0
            ? "OK"
            : r.expectedFindings
              ? "KNOWN-OPEN"
              : "VIOLATED";
        console.log(`\n[${status}] ${r.id}`);
        console.log(`  rule: ${r.rule}`);
        if (r.queryError) {
          console.log(`  query error: ${r.queryError}`);
          continue;
        }
        if (r.expectedFindings) console.log(`  note: ${r.expectedFindings}`);
        if (n === 0) {
          console.log(`  offending rows: 0`);
        } else {
          console.log(`  offending rows: ${n}`);
          for (const row of r.offending.slice(0, 20)) {
            console.log(`    - ${JSON.stringify(row)}`);
          }
          if (n > 20) console.log(`    ... and ${n - 20} more`);
        }
      }
      console.log("");
    }
  }

  // Exit code: 1 iff any invariant WITHOUT an `expectedFindings` label found offending rows, or
  // any query itself errored (a query error means an invariant could not be checked at all,
  // which must not be silently treated as "passed"). A `expectedFindings` invariant's nonzero
  // result is reported (and, per severity grouping, visible) but does not fail the run — it is a
  // documented, already-tracked condition, not something this run introduced.
  const hardFailures = results.filter(
    (r) => r.queryError || (!r.expectedFindings && r.offending.length > 0),
  );
  const knownOpen = results.filter((r) => !r.queryError && r.expectedFindings && r.offending.length > 0);

  if (!JSON_ONLY) {
    console.log(
      `${results.length} invariants: ${results.length - hardFailures.length - knownOpen.length} OK, ` +
        `${knownOpen.length} KNOWN-OPEN, ${hardFailures.length} VIOLATED/ERROR`,
    );
  }

  process.exit(hardFailures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[invariants] fatal:", err);
  process.exit(1);
});
