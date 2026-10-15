-- 379 — LiteAPI cancel amounts (ledger `2026-10-15-liteapi-cancel-with-charges`).
-- A cancel's 200 states `cancellation_fee`, `refund_amount` and `currency`. They are stored on the booking row
-- exactly as LiteAPI returned them, for CANCELLED and CANCELLED_WITH_CHARGES alike. One additive nullable jsonb
-- column: no DEFAULT, no CHECK, no index, no FK, no backfill (NULL = not cancelled through LiteAPI, or cancelled
-- before this column). Declared in shared/schema.ts.
ALTER TABLE liteapi_bookings ADD COLUMN IF NOT EXISTS cancel_amounts jsonb;
