---
name: Travelpayouts partner statistics API
description: Which Travelpayouts endpoints actually exist for commission stats/balance and how auth works
---

The legacy-looking endpoints `/v1/statistics/payments` and `/v1/statistics/balance` on api.travelpayouts.com **do not exist** (404) — code calling them silently reports $0 forever if errors are swallowed.

Real endpoints (verified live against the account token, Aug 2026):
- `POST /statistics/v1/execute_query` — raw action rows per campaign. A date filter is mandatory; raw and aggregated fields cannot be mixed in one query; paginate with offset/limit (max 300). `GET /statistics/v1/get_fields_list` discovers valid fields.
- `GET /finance/v2/get_user_balance` and `/finance/v2/get_user_actions_affecting_balance`.

**Auth:** `X-Access-Token: <TRAVELPAYOUTS_TOKEN>` header — NOT a `?token=` query param.

**Why:** the account-wide (unfiltered) query covers every Travelpayouts program automatically, including WeGoTrip (campaign #150, attributed via `?sub_id=<marker>`), so no per-program polling is needed when new programs are added.

**How to apply:** any new Travelpayouts stats/reconciliation code must hit these endpoints with header auth; never trust a $0 result from a hand-rolled URL without checking the HTTP status.
