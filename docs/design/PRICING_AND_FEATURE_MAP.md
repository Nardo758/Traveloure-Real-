# Pricing and Feature Map

Ledger source for the shared plan and fee-band foundation. Values are stored in
the database and read through server-side accessors; application code must not
carry replacement prices.

## Plan rows

| Key | Name | Price cents | Interval | Beta-free-until |
| --- | --- | ---: | --- | --- |
| `trip_pass` | Trip Pass | 1900 | `trip` | — |
| `plus_annual` | Plus (Annual) | 2500 | `year` | — |
| `pro_monthly` | Pro (Monthly) | 2900 | `month` | 2026-12-31 |

All plan rows are active from 2026-08-27. `allowances` is the extensible
server-owned JSON allowance surface; the current foundation does not add
entitlement consumption logic.

## Shared fee-band rows

| Key | Rate type | Value | Meaning |
| --- | --- | ---: | --- |
| `concierge:ai_task` | `flat_cents` | 299 | AI Concierge task fee |
| `concierge:booking_pct` | `percent` | 0.05 | Concierge booking percentage |
| `concierge:booking_cap_cents` | `flat_cents` | 4000 | Concierge booking-fee ceiling |
| `concierge:done_for_you_deposit_pct` | `percent` | 0.20 | Done-for-you deposit percentage |
| `provider:pro_band_step` | `count` | 1 | Provider Pro band step |
| `plans:plus_task_allowance` | `count` | 4 | Plus task allowance |
| `ready_made:platform_band` | `rule` | `inherit_expert` | Ready-made platform-band rule |

`flat_cents` values are integer cents. `count` values are unitless counts.
`rule` values use the row description as the rule payload and keep
`default_rate` at its required numeric sentinel of zero.

The reconciliation migration inserts missing rows but does not overwrite an
existing fee-band value. In particular, it does not alter the existing
`concierge:done_for_you_deposit_pct` value.

## Explicit exclusions

- `optimization_fees` remains the canonical optimizer fee source.
- No `optimizer:run` fee-band key is defined.
- Missing affiliate partners/rates are filed rather than invented. Existing
  affiliate rows remain governed by their current contracts.
- Trip Pass entitlement creation, Stripe payment handling, and allowance
  consumption are separate implementation lanes.