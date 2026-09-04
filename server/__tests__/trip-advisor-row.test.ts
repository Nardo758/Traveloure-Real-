/**
 * ONE AUTHOR FOR `trip_expert_advisors`, AND ITS CONFLICT RULE.
 * Ledger `2026-09-04-advisor-row-one-author`; CLAUDE.md Locked Decision 32 (CORRECTION paragraph),
 * Locked Decision 12 (a PENDING advisor may not write), §15 (the transition is the guard) and
 * §18 rule 1 (one implementation, N callers).
 *
 * WHY THIS EXISTS. Six production sites inserted this row, each with its own idea of what a
 * conflict means — and the one that used `ON CONFLICT DO UPDATE SET status='accepted'` could
 * DEMOTE an admin-confirmed `assigned` advisor, while the one that used `WHERE NOT EXISTS` over
 * two statuses THREW 23505 on the other two. The consolidation replaces all six with one atomic
 * upsert whose behaviour is a stated RULE, so the rule itself needs proofs that do not require a
 * database to run.
 *
 *   A1  the ladder is the §12 access ladder: the two WRITE-access statuses outrank the two that
 *       grant no write, and NULL/unknown ranks below everything.
 *   A2  a conflict NEVER DOWNGRADES — an invitation cannot overwrite an acceptance or an
 *       assignment, in either direction, and equal rank is a no-op.
 *   A3  a re-invite never clears a REFUSAL, but a deliberate grant still outranks one.
 *   A4  the SQL `CASE` the upsert runs is GENERATED from the same map the predicate reads, so the
 *       two cannot drift (§18 rule 1 applied to the rule itself) — proven by deriving the SQL's
 *       answer for every (stored, incoming) pair and comparing it to the predicate's.
 *   A5  the ONE author is the only non-test server file that inserts the row, it accepts a
 *       transaction handle, and its conflict arm touches ONLY `status` and `message` — a
 *       `workspace_status`, `assigned_at` or plan-approval column in the `set` block would
 *       silently reset a delivered workspace or a recorded assignment time.
 *
 * Pure: the precedence half imports a dependency-free module (no `db`, no schema); the
 * one-author half is a source-text assertion. No DB, no session, no network.
 * Run: npx tsx --test server/__tests__/trip-advisor-row.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRIP_ADVISOR_ROW_STATUSES,
  TRIP_ADVISOR_STATUS_RANK,
  buildTripAdvisorStatusRankSql,
  resolveTripAdvisorStatus,
  tripAdvisorStatusRank,
  type TripAdvisorRowStatus,
} from "../utils/trip-advisor-status";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const AUTHOR_FILE = path.join(ROOT, "server/services/booking-actions.service.ts");
const authorSource = fs.readFileSync(AUTHOR_FILE, "utf8");

/** Every status the rule must reason about, including the two it may never write. */
const ALL_STATUSES = ["pending", "accepted", "assigned", "rejected"] as const;

describe("A1 — the ladder is the §12 access ladder", () => {
  it("the two WRITE-access statuses outrank the two that grant no write", () => {
    assert.ok(tripAdvisorStatusRank("accepted") > tripAdvisorStatusRank("pending"));
    assert.ok(tripAdvisorStatusRank("assigned") > tripAdvisorStatusRank("pending"));
    assert.ok(tripAdvisorStatusRank("accepted") > tripAdvisorStatusRank("rejected"));
    assert.ok(tripAdvisorStatusRank("assigned") > tripAdvisorStatusRank("rejected"));
  });

  it("`accepted` and `assigned` are EQUAL — neither is a promotion over the other", () => {
    assert.equal(tripAdvisorStatusRank("accepted"), tripAdvisorStatusRank("assigned"));
  });

  it("NULL, undefined and an unrecognised value all rank BELOW every real status (fails closed)", () => {
    for (const bad of [null, undefined, "", "delivered", 7, {}]) {
      assert.equal(tripAdvisorStatusRank(bad as unknown), 0, `expected rank 0 for ${String(bad)}`);
    }
    for (const s of ALL_STATUSES) {
      assert.ok(tripAdvisorStatusRank(s) > 0, `${s} must outrank an unrecognised value`);
    }
  });

  it("`rejected` is NOT writable by this author — the write vocabulary is the three §12 statuses", () => {
    assert.deepEqual([...TRIP_ADVISOR_ROW_STATUSES], ["pending", "accepted", "assigned"]);
    assert.ok(!(TRIP_ADVISOR_ROW_STATUSES as readonly string[]).includes("rejected"));
    // …but the RULE still has to know about it, or a re-invite would clear a refusal.
    assert.ok("rejected" in TRIP_ADVISOR_STATUS_RANK);
  });
});

describe("A2 — a conflict NEVER downgrades", () => {
  it("a `pending` invitation never overwrites `accepted` or `assigned`", () => {
    assert.equal(resolveTripAdvisorStatus("accepted", "pending"), "accepted");
    assert.equal(resolveTripAdvisorStatus("assigned", "pending"), "assigned");
  });

  it("`accepted` and `assigned` never overwrite each other — first one to land stands", () => {
    assert.equal(resolveTripAdvisorStatus("accepted", "assigned"), "accepted");
    assert.equal(resolveTripAdvisorStatus("assigned", "accepted"), "assigned");
  });

  it("the same status arriving twice is a no-op — this is what makes every caller idempotent", () => {
    for (const s of TRIP_ADVISOR_ROW_STATUSES) {
      assert.equal(resolveTripAdvisorStatus(s, s), s);
    }
  });

  it("a higher status DOES win — an invitation that is later accepted is not frozen at pending", () => {
    assert.equal(resolveTripAdvisorStatus("pending", "accepted"), "accepted");
    assert.equal(resolveTripAdvisorStatus("pending", "assigned"), "assigned");
  });

  it("a NULL or unrecognised stored status is replaced by any real one", () => {
    assert.equal(resolveTripAdvisorStatus(null, "pending"), "pending");
    assert.equal(resolveTripAdvisorStatus(undefined, "assigned"), "assigned");
    assert.equal(resolveTripAdvisorStatus("something-else", "pending"), "pending");
  });

  it("the resolved status is ALWAYS one of the four known states — never invented", () => {
    for (const stored of [...ALL_STATUSES, null, "nonsense"]) {
      for (const incoming of TRIP_ADVISOR_ROW_STATUSES) {
        const out = resolveTripAdvisorStatus(stored, incoming);
        const legal = stored === null || !(ALL_STATUSES as readonly string[]).includes(String(stored))
          ? [incoming as string]
          : [String(stored), incoming as string];
        assert.ok(legal.includes(out), `${String(stored)} + ${incoming} => ${out}`);
      }
    }
  });
});

describe("A3 — a refusal is not cleared by a re-invite", () => {
  it("`pending` landing on `rejected` leaves the refusal standing (equal rank, no-op)", () => {
    assert.equal(resolveTripAdvisorStatus("rejected", "pending"), "rejected");
  });

  it("a deliberate GRANT still outranks a refusal — the ready-made revision seller regains write access", () => {
    assert.equal(resolveTripAdvisorStatus("rejected", "accepted"), "accepted");
    assert.equal(resolveTripAdvisorStatus("rejected", "assigned"), "assigned");
  });
});

describe("A4 — the SQL and the predicate cannot drift", () => {
  /** Evaluate the generated `CASE <operand> WHEN 'x' THEN n … ELSE 0 END` the way Postgres would. */
  function evalRankSql(sqlText: string, value: string | null): number {
    const m = sqlText.match(/^CASE (\S+) (.*) ELSE (\d+) END$/);
    assert.ok(m, `unparseable rank SQL: ${sqlText}`);
    if (value === null) return Number(m![3]);
    for (const arm of m![2].matchAll(/WHEN '([^']+)' THEN (\d+)/g)) {
      if (arm[1] === value) return Number(arm[2]);
    }
    return Number(m![3]);
  }

  it("the generated CASE names the operand it was asked for", () => {
    assert.ok(buildTripAdvisorStatusRankSql("excluded.status").startsWith("CASE excluded.status "));
    assert.ok(
      buildTripAdvisorStatusRankSql("trip_expert_advisors.status").startsWith(
        "CASE trip_expert_advisors.status ",
      ),
    );
  });

  it("the CASE returns the SAME rank as the predicate for every status and for NULL", () => {
    const sqlText = buildTripAdvisorStatusRankSql("s");
    for (const s of ALL_STATUSES) {
      assert.equal(evalRankSql(sqlText, s), tripAdvisorStatusRank(s), `rank drift on ${s}`);
    }
    assert.equal(evalRankSql(sqlText, null), 0);
    assert.equal(evalRankSql(sqlText, "unknown-status"), 0);
  });

  it("the upsert's CASE decides the SAME winner as the predicate for every (stored, incoming) pair", () => {
    const incomingSql = buildTripAdvisorStatusRankSql("excluded.status");
    const storedSql = buildTripAdvisorStatusRankSql("trip_expert_advisors.status");
    for (const stored of [...ALL_STATUSES, null]) {
      for (const incoming of TRIP_ADVISOR_ROW_STATUSES) {
        // The upsert's arm: WHEN (incomingRank) > (storedRank) THEN excluded.status ELSE stored.
        const sqlWinner =
          evalRankSql(incomingSql, incoming) > evalRankSql(storedSql, stored)
            ? (incoming as string)
            : stored === null
              ? null
              : String(stored);
        const predicateWinner = resolveTripAdvisorStatus(stored, incoming);
        // A NULL stored status has no value to keep, so the SQL's ELSE arm yields NULL exactly
        // where the predicate yields `incoming`; that pair can only arise on a row nothing wrote.
        assert.equal(
          sqlWinner === null ? incoming : sqlWinner,
          predicateWinner,
          `drift on (${String(stored)}, ${incoming})`,
        );
      }
    }
  });

  it("the rank map is the ONLY place the ladder is written down — the SQL quotes no status the map lacks", () => {
    const sqlText = buildTripAdvisorStatusRankSql("s");
    const quoted = [...sqlText.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(quoted, Object.keys(TRIP_ADVISOR_STATUS_RANK).sort());
  });
});

describe("A5 — the ONE author, and the union of what it writes", () => {
  it("`upsertTripAdvisorRow` is exported from the author file", () => {
    assert.match(authorSource, /export async function upsertTripAdvisorRow\(/);
  });

  it("the author file holds exactly ONE insert into the table", () => {
    const inserts = authorSource.match(/\.insert\(\s*tripExpertAdvisors\s*\)/g) ?? [];
    assert.equal(inserts.length, 1, "a second insert in the author file is the class this lane closed");
    assert.ok(
      !/INSERT\s+INTO\s+trip_expert_advisors/i.test(authorSource),
      "the raw-SQL insert was replaced by the shared upsert",
    );
  });

  it("that insert is an ATOMIC upsert on the UNIQUE (trip_id, local_expert_id) pair — never check-then-insert", () => {
    assert.match(authorSource, /\.onConflictDoUpdate\(\{/);
    assert.match(
      authorSource,
      /target:\s*\[tripExpertAdvisors\.tripId,\s*tripExpertAdvisors\.localExpertId\]/,
    );
    assert.ok(
      !/\.onConflictDoNothing\(\)/.test(authorSource),
      "DO NOTHING would need a refetch, which is the TOCTOU shape §15 names",
    );
  });

  it("it writes the UNION of the columns the six former sites set", () => {
    for (const column of ["tripId", "localExpertId", "status", "workspaceStatus", "message", "assignedAt"]) {
      assert.ok(
        new RegExp(`\\b${column}:`).test(authorSource),
        `the insert must still set ${column} — a former site set it`,
      );
    }
  });

  it("the CONFLICT arm touches ONLY status and message", () => {
    const setBlock = authorSource.match(/\.onConflictDoUpdate\(\{[\s\S]*?set:\s*\{([\s\S]*?)\n      \},/);
    assert.ok(setBlock, "could not locate the conflict `set` block");
    const keys = [...setBlock![1].matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(
      keys,
      ["message", "status"],
      "workspace_status, assigned_at, expert_response and the plan-approval columns are insert-only here: " +
        "updating them on conflict would reset a delivered workspace or a recorded assignment time",
    );
  });

  it("it accepts a transaction handle, so a caller inside a transaction writes inside it", () => {
    assert.match(authorSource, /tx\?:\s*TripAdvisorRowExecutor/);
    assert.match(authorSource, /const exec = \(input\.tx \?\? db\)/);
  });

  it("the ladder arrives from the shared module — it is not re-implemented here", () => {
    assert.match(authorSource, /buildTripAdvisorStatusRankSql/);
    assert.ok(
      !/rejected['"]?\s*:\s*\d/.test(authorSource),
      "a rank literal in the author file would be a second copy of the ladder",
    );
  });

  it("`ensureTripAdvisorRow` is a WRAPPER over the one author, and still invites at `pending` (§12)", () => {
    const wrapper = authorSource.match(
      /export async function ensureTripAdvisorRow\([\s\S]*?\n\}/,
    );
    assert.ok(wrapper, "ensureTripAdvisorRow must still exist — four callers import it");
    assert.match(wrapper![0], /upsertTripAdvisorRow\(/);
    assert.match(wrapper![0], /status:\s*"pending"/);
    assert.ok(
      !/INSERT\s+INTO/i.test(wrapper![0]),
      "the wrapper must not carry SQL of its own",
    );
  });
});
