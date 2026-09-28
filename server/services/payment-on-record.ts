/**
 * The SERVER half of "payment on record" (ledger `2026-09-28-no-payment-no-earnings`): the ONE SQL
 * form of `hasPaymentOnRecord` (`shared/payment-on-record.ts`) and the ONE builder of the stamp.
 *
 * The stamp is written only by the paid transitions, inside the transaction of their atomic flip —
 * NOT in a savepoint: a stamp that fails must roll the flip back, because a paid row without its
 * stamp would read as unpaid to every earning path. The funnel revenue event is DERIVED from the
 * stamp this returns, never the reverse.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  PAID_CHARGE_KEY,
  PAID_CHARGE_STATUSES,
  paidChargeOf,
  type PaidCharge,
  type PaidChargeStatus,
} from "@shared/payment-on-record";

/** SQL predicate over a `booking_details` column: TRUE only for a row carrying a paid stamp. */
export function paymentOnRecordSql(bookingDetailsColumn: SQL | any): SQL {
  const statuses = sql.join(
    PAID_CHARGE_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  return sql`(COALESCE(${bookingDetailsColumn}, '{}'::jsonb) #>> ${`{${PAID_CHARGE_KEY},status}`}::text[]) IN (${statuses})`;
}

/**
 * The jsonb expression a paid flip SETs `booking_details` to: the existing details MERGED with the
 * stamp (never assigned — every other key survives). `amountDollars` null is stored as JSON null.
 */
export function paidChargeMergeSql(status: PaidChargeStatus, amountDollars: number | null): SQL {
  const amount = amountDollars === null || !Number.isFinite(amountDollars) ? null : amountDollars;
  return sql`COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
    ${PAID_CHARGE_KEY}::text,
    jsonb_build_object(
      'status', ${status}::text,
      'amount', ${amount === null ? sql`NULL::numeric` : sql`${String(amount)}::numeric`},
      'at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )`;
}

/**
 * Stamps the booking inside the caller's transaction and returns the stamp as written. Throws on a
 * failed write, so the caller's paid flip rolls back with it (never a paid row with no stamp).
 */
export async function stampPaidCharge(
  tx: any,
  bookingId: string,
  status: PaidChargeStatus,
  amountDollars: number | null,
): Promise<PaidCharge> {
  const res = await tx.execute(sql`
    UPDATE service_bookings
    SET booking_details = ${paidChargeMergeSql(status, amountDollars)}
    WHERE id = ${bookingId}
    RETURNING booking_details
  `);
  const stamp = paidChargeOf((res.rows[0] as any)?.booking_details);
  if (!stamp) throw new Error(`[payment-on-record] stamp not written for booking ${bookingId}`);
  return stamp;
}
