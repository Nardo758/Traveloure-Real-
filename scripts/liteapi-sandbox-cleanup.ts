/**
 * LITEAPI SANDBOX CLEANUP — the sandbox e2e gate's last step (S1-d-3c; ledger `2026-10-11-s1-d3b-sandbox-e2e`).
 *
 * A run that is cancelled, times out or fails between "book" and "cancel" can leave a live SANDBOX booking at
 * LiteAPI. This step runs whatever happened before it (`if: always()`), reads every live row the run wrote to
 * its own disposable database, finds the booking at LiteAPI — by the stored LiteAPI id, else by OUR client
 * reference (the row id) — and cancels any that LiteAPI does not already report CANCELLED. It prints one line
 * per row, and a summary.
 *
 * REFUSES unless: LITEAPI_ENV is `sandbox` (the config's own env), and DATABASE_URL points at localhost. It never
 * touches production, never books, and moves no money (Nuitée is merchant of record; a sandbox cancel is free).
 *
 * Run: npx tsx scripts/liteapi-sandbox-cleanup.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import { liteapiBookings } from "../shared/schema";
import { liteapiConfig } from "../server/config/liteapi.config";
import { createLiteapiClient } from "../server/services/liteapi-client";
import { bookingForClientReference, bookingStatusOf } from "../shared/liteapi-booking";

async function main(): Promise<number> {
  const cfg = liteapiConfig();
  if (!cfg || cfg.env !== "sandbox") {
    console.log("[liteapi-sandbox-cleanup] REFUSED: LiteAPI is not configured for sandbox. Nothing read or cancelled.");
    return 0;
  }
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.log(`[liteapi-sandbox-cleanup] REFUSED: DATABASE_URL host '${host || "<none>"}' is not a disposable local database.`);
    return 1;
  }
  const client = createLiteapiClient(cfg);
  const rows = await db
    .select({ id: liteapiBookings.id, status: liteapiBookings.status, liteapiBookingId: liteapiBookings.liteapiBookingId })
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.env, "sandbox"), inArray(liteapiBookings.status, ["booking", "confirmed", "cancelling", "needs_review"])));
  let cancelled = 0;
  let alreadyCancelled = 0;
  let notAtLiteapi = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      let bookingId = r.liteapiBookingId;
      if (!bookingId) bookingId = bookingForClientReference(await client.listBookingsByClientReference(r.id), r.id)?.liteapiBookingId ?? null;
      if (!bookingId) {
        notAtLiteapi++;
        console.log(`[liteapi-sandbox-cleanup] ${r.id} (${r.status}): no LiteAPI booking under this reference`);
        continue;
      }
      const theirs = bookingStatusOf(await client.getBooking(bookingId));
      if (theirs === "CANCELLED") {
        alreadyCancelled++;
        console.log(`[liteapi-sandbox-cleanup] ${r.id} (${r.status}): LiteAPI ${bookingId} already CANCELLED`);
        continue;
      }
      const after = bookingStatusOf(await client.cancelBooking(bookingId));
      cancelled++;
      console.log(`[liteapi-sandbox-cleanup] ${r.id} (${r.status}): LiteAPI ${bookingId} was ${theirs ?? "unknown"}, cancel answered ${after ?? "unknown"}`);
    } catch (err: any) {
      errors++;
      console.log(`[liteapi-sandbox-cleanup] ${r.id} (${r.status}): ERROR ${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
  console.log(`[liteapi-sandbox-cleanup] live rows ${rows.length}: cancelled ${cancelled}, already cancelled ${alreadyCancelled}, not at LiteAPI ${notAtLiteapi}, errors ${errors}`);
  return errors > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await pool.end();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
