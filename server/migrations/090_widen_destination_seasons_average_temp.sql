-- SUPERSEDED by migration 091 (091_average_temp_to_text.sql).
-- Migration 091 converts average_temp directly to TEXT, making this intermediate
-- varchar(60) widening unnecessary. This file is kept as a no-op so the migration
-- ledger sequence remains intact.
SELECT 1;
