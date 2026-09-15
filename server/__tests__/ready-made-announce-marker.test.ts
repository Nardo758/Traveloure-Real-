/**
 * D-18 — A DELIVERED READY-MADE PURCHASE RECORDS THAT IT WAS ANNOUNCED.
 *
 * Decision-maker ruling 2026-09-15, punchlist **D-18** = option A; ledger
 * `2026-09-15-d18-announced-marker`; migration 297.
 *
 * Ledger `2026-09-14-readymade-notifications` closed the DUPLICATE-SEND half of the buyer's
 * delivery notice completely and stated its own LIVENESS gap out loud: a process dying between the
 * atomic `paid → cloned` claim and the send left a purchase that was DELIVERED and ANNOUNCED TO
 * NOBODY, with nothing recording the fact and therefore nothing able to retry it.
 * `ready_made_purchases.notified_at` is that record.
 *
 * WHAT THESE HOLD (pure + static source pins — no DB, no server, no network; the behavioural
 * halves that need real rows live in `ready-made-announce-marker.db.test.ts`):
 *
 *   A1  THE GRACE IS CONFIG, NOT A LITERAL. It comes from `server/config/`, on the `envDays`
 *       pattern, and an unparseable or negative env value falls BACK rather than silently
 *       disabling the window.
 *   A2  §19 — THE COLUMN IS NOT CLIENT-SETTABLE. `insertReadyMadePurchaseSchema` omits
 *       `notifiedAt`, so a crafted body cannot stamp it. A client that could stamp this column
 *       could silence its own undelivered-purchase finding.
 *   A3  §18 rule 1 — ONE STAMP SITE. `storage.markReadyMadePurchaseNotified` is called from
 *       exactly one file under `server/` (comments stripped): the shared notifier.
 *   A4  §17 — THE DETECTOR NEVER STAMPS. The drift job neither calls the stamp method nor writes
 *       `notified_at` in any statement of its own; it only SELECTs the column.
 *   A5  §15 — THE STAMP IS AN ATOMIC CONDITIONAL. The storage writer's WHERE carries
 *       `isNull(...notifiedAt)`, so the statement is the guard and a second stamp is a no-op by
 *       construction rather than by a check-then-update.
 *   A6  §17 — THE JOB'S HAND-OFF GOES TO THE EXISTING SHARED SENDER, and the exception kind it
 *       may raise is declared in the one vocabulary.
 *
 * Run: npx tsx --test server/__tests__/ready-made-announce-marker.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { insertReadyMadePurchaseSchema, RECONCILIATION_EXCEPTION_KINDS } from "../../shared/schema";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Strip block and line comments so every pin below reads CODE, never prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readStripped(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "migrations") continue;
      walkTs(rel, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

const JOB = "server/jobs/stripeReconciliation.ts";
const NOTIFIER = "server/services/ready-made-notifications.service.ts";
const CONFIG = "server/config/ready-made-announce.config.ts";

describe("D-18 — the announce marker (migration 297)", () => {
  // ── A1 ──────────────────────────────────────────────────────────────────────────────────────
  it("A1: the announce grace is CONFIG on the envDays pattern, with a fallback that never disables it", async () => {
    const src = readStripped(CONFIG);
    assert.match(
      src,
      /process\.env\[key\]/,
      "the window reads an env var — an operator must be able to move it without a code change",
    );
    assert.match(
      src,
      /READY_MADE_ANNOUNCE_GRACE_MINUTES/,
      "and the env key is NAMED in the module, not assembled somewhere else",
    );

    // The fallback arm, exercised through the module's own exported value under the default env.
    const mod = await import("../config/ready-made-announce.config");
    assert.equal(typeof mod.READY_MADE_ANNOUNCE_GRACE_MINUTES, "number");
    assert.ok(
      mod.READY_MADE_ANNOUNCE_GRACE_MINUTES > 0,
      "a zero-or-negative default would make the detector indict a purchase the instant it is delivered",
    );
    assert.equal(
      mod.READY_MADE_ANNOUNCE_GRACE_MS,
      mod.READY_MADE_ANNOUNCE_GRACE_MINUTES * 60 * 1000,
      "the milliseconds are DERIVED from the minutes — never a second literal that can drift (§18 rule 1)",
    );

    // §8 — this is a LIVENESS window and nothing else. No rate, no fee, no money multiplier.
    assert.doesNotMatch(
      src,
      /\b(?:fee|rate|commission|margin|percent)\b/i,
      "§8: a liveness window may not acquire a fee/rate vocabulary",
    );
  });

  // ── A2 ──────────────────────────────────────────────────────────────────────────────────────
  it("A2: §19 — `notifiedAt` is OMITTED from the insert schema, so a body cannot stamp it", () => {
    const parsed = insertReadyMadePurchaseSchema.parse({
      buyerId: "u-1",
      readyMadeTripId: "rm-1",
      stripePaymentIntentId: "pi_test",
      pricePaidCents: 1234,
      // A crafted body claiming the buyer was already told.
      notifiedAt: new Date("2020-01-01T00:00:00Z"),
    } as Record<string, unknown>);
    assert.equal(
      (parsed as Record<string, unknown>).notifiedAt,
      undefined,
      "the announcement marker is the ONE sender's to write — a client that could stamp it could " +
        "silence its own undelivered-purchase finding",
    );
  });

  // ── A3 ──────────────────────────────────────────────────────────────────────────────────────
  it("A3: §18 rule 1 — exactly ONE file under server/ calls the stamp, and it is the shared sender", () => {
    const callers = walkTs("server").filter((rel) =>
      /markReadyMadePurchaseNotified\s*\(/.test(readStripped(rel)),
    );
    // `storage.ts` DEFINES the method (interface + implementation); it does not call it.
    const definitionSites = callers.filter((rel) => rel === "server/storage.ts");
    const callSites = callers.filter((rel) => rel !== "server/storage.ts");
    assert.deepEqual(
      callSites,
      [NOTIFIER],
      "the stamp has ONE caller by ruling — a second one would be a second author of 'the buyer " +
        "was told', which is the drift class §18 rule 1 names",
    );
    assert.deepEqual(definitionSites, ["server/storage.ts"], "and exactly one definition site");
  });

  // ── A4 ──────────────────────────────────────────────────────────────────────────────────────
  it("A4: §17 — the drift job READS the marker and never writes it", () => {
    const job = readStripped(JOB);
    assert.match(job, /notified_at/, "the job reads the column — that is what the detection is");
    assert.doesNotMatch(
      job,
      /markReadyMadePurchaseNotified/,
      "§17 detect-don't-repair: a detector that stamped 'announced' without sending anything " +
        "would silence the very finding it exists to raise",
    );
    assert.doesNotMatch(
      job,
      /SET[\s\S]{0,80}notified_at/i,
      "and it writes no statement of its own against the column",
    );
    // The job DOES name `notifiedAt` — on its row type and in its mapper, both of which are
    // READS. The pin is therefore on the WRITE shapes, which is the distinction that matters: a
    // blanket "the name never appears" would forbid the detection itself.
    assert.doesNotMatch(
      job,
      /\.set\(\s*\{[^}]*notifiedAt/,
      "nor through the ORM's own update",
    );
    assert.doesNotMatch(
      job,
      /UPDATE\s+ready_made_purchases/i,
      "and it issues no raw UPDATE against the purchase table at all",
    );
  });

  // ── A5 ──────────────────────────────────────────────────────────────────────────────────────
  it("A5: §15 — the stamp's WHERE is the guard, so a second stamp is a no-op by construction", () => {
    const storage = readStripped("server/storage.ts");
    const fn = storage.slice(storage.indexOf("async markReadyMadePurchaseNotified"));
    assert.ok(fn.length > 0, "the method exists on the storage class");
    const body = fn.slice(0, fn.indexOf("\n  }"));
    assert.match(
      body,
      /isNull\(\s*readyMadePurchases\.notifiedAt\s*\)/,
      "the `notified_at IS NULL` predicate lives INSIDE the UPDATE — a check-then-update would be " +
        "the TOCTOU bug §15 names, not a guard",
    );
    assert.match(body, /\.returning\(/, "and the result reports whether THIS call won the stamp");
  });

  // ── A6 ──────────────────────────────────────────────────────────────────────────────────────
  it("A6: §17's narrow exception — the job hands off to the EXISTING shared sender, and names one kind", () => {
    const job = readStripped(JOB);
    assert.match(
      job,
      /notifyBuyerOfReadyMadeDelivery\(/,
      "recovery arriving late = handing the row to the writer that already owns the send",
    );
    assert.doesNotMatch(
      job,
      /enqueueEmail\(|createNotificationOnce\(/,
      "the job composes no message and sends nothing itself — that is the sender's whole job",
    );
    assert.ok(
      RECONCILIATION_EXCEPTION_KINDS.includes("rm_delivery_not_announced" as never),
      "the finding is declared in the ONE drift vocabulary, never invented at the call site",
    );
    assert.match(
      job,
      /kind:\s*"rm_delivery_not_announced"[\s\S]{0,200}severity:\s*"warning"/,
      "§13: the money is right and the product was delivered — what is wrong is that the buyer " +
        "does not know, which is a warning, not a critical",
    );
  });

  // ── A7 ──────────────────────────────────────────────────────────────────────────────────────
  it("A7: the sender stamps on EXISTENCE, not on insertion — the half-finished state is the point", () => {
    const src = readStripped(NOTIFIER);
    const stampAt = src.indexOf("markReadyMadePurchaseNotified");
    const emailGateAt = src.indexOf("if (!notified) return");
    assert.ok(stampAt > 0 && emailGateAt > 0, "both the stamp and the email gate are present");
    assert.ok(
      stampAt < emailGateAt,
      "the stamp runs BEFORE the `notified` early return: a pass that finds the bell row already " +
        "there is looking at exactly the state the column records (row written, stamp never " +
        "reached), so it stamps and does NOT re-send",
    );
  });
});
