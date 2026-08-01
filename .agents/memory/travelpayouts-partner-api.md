---
name: Travelpayouts partner statistics API
description: Which Travelpayouts endpoints actually exist for commission stats/balance and how auth works
---

The legacy-looking endpoints `/v1/statistics/payments` and `/v1/statistics/balance` on api.travelpayouts.com **do not exist** (404) — code calling them silently reports $0 forever.

Real endpoints (verified live with the account token):
- `POST /statistics/v1/execute_query` — raw action rows (campaign_id, campaign_name_en, action_id, sub_id, paid/processing_profit_usd, state, type). Filters require a date filter; raw and aggregated fields cannot be mixed in one query. Pagination via offset/limit (max 300).
- `GET /statistics/v1/get_fields_list` — discover valid fields.
- `GET /finance/v2/get_user_balance` and `/finance/v2/get_user_actions_affecting_balance?campaign_id=N`.

**Auth:** `X-Access-Token: <TRAVELPAYOUTS_TOKEN>` header — NOT `?token=` query param.

**Why:** commission stats/reconciliation for all Travelpayouts programs (incl. WeGoTrip campaign #150, attributed via `?sub_id=<marker>`) come from these unfiltered queries; new programs are covered automatically without per-program polling.

**How to apply:** any Travelpayouts stats/reconciliation work should go through `tpPartnerFetch` / `fetchTravelpayoutsActions` in the travelpayouts services rather than hand-rolled URLs.
