---
name: Fee band scope split
description: Display/diagnostic fee surfaces vs the real per-item charge resolver — state scope explicitly when moving literals into fee_bands.
---
Rule: when moving a fee literal into fee_bands, identify which surface it actually controls. The cart charge + fee-preview paths resolve per-item rates via resolveCommissionRates(); calculateCommission (commissionCalculator.ts) is the DB-free typed display/diagnostic breakdown.
**Why:** the old EXPERIENCE_CART 0.30 literal "matched no actual charged rate" (R3/F6 note in payments.routes.ts); a completion review rejected the migration until the diagnostic-only scope was documented and covered by a DB-backed test.
**How to apply:** document the surface at the band-key constant and migration header; add a test proving an admin band edit changes the resolved value and a missing/inactive band fails loudly (requireX pattern, no silent fallback).
