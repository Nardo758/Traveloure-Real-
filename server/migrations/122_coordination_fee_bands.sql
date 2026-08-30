-- Phase 4.1 (§7/§8): move the coordination-fee constants into admin-editable config.
--
-- The event coordination fee is max(floor, percent * budget). Until now the two
-- ratified parameters — $499 floor and 8% — lived as hardcoded constants in
-- server/services/optimization-fee.service.ts (the documented §8 pre-existing
-- exception, "pending migration to config, Phase 4.1 TODO"). This seed lands the
-- config rows so an admin can tune them in the fee-bands UI; the service reads
-- through fee_bands and falls back to the same constants only when a row is
-- absent (so this is behavior-neutral on a fresh apply).
--
-- Two rows because the fee needs two parameters and fee_bands stores one rate
-- per band:
--   * coordination_floor   — rate_type='flat',    default_rate stores DOLLARS (499.00)
--   * coordination_percent — rate_type='percent', default_rate stores a FRACTION (0.08 = 8%)
--
-- Idempotent: ON CONFLICT (band_key) DO NOTHING (band_key is UNIQUE) — never
-- overwrites an admin-tuned value. Mirrors the 064 concierge-band seed pattern.
-- Rate-neutral for every existing surface: only resolveCoordinationFee reads
-- these keys, and it produced the identical numbers from the constants before.
INSERT INTO fee_bands
  (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  (
    'coordination_floor',
    'flat',
    499.00,
    NULL,
    NULL,
    'Coordination fee floor',
    'Minimum event-coordination fee in DOLLARS. The charged fee is max(this floor, coordination_percent * budget). Admin-configurable; ratified default $499.',
    true
  ),
  (
    'coordination_percent',
    'percent',
    0.08,
    NULL,
    NULL,
    'Coordination fee percent',
    'Event-coordination fee as a FRACTION of the event budget (0.08 = 8%). The charged fee is max(coordination_floor, this percent * budget). Admin-configurable; ratified default 8%.',
    true
  )
ON CONFLICT (band_key) DO NOTHING;
