"""Traveloure Business Plan v1.4 — Year-1 scenario model.
Every rate below is a ratified fee row (source named); every volume figure is an ASSUMPTION
and is printed in the assumptions table. Year 1 = the 12 months from the first market launch.
"""
from collections import OrderedDict

# ---- Ratified fee rows (source: docs/design/PRICING_AND_FEATURE_MAP.md + migrations) ----
FEE = dict(
    provider_beta_flat=0.10,        # fee_bands beta_flat (mig 033) — active provider policy during beta
    expert_new=0.15,                # fee_bands expert_new (mig 033) — beta cohort platform take
    expert_standard=0.25,           # fee_bands expert_standard (mig 033)
    traveler_fee_pct=0.07,          # traveler_service_fee (map §5)
    traveler_fee_cap=25.00,         # traveler_service_fee.max_amount $25.00
    optimizer_run=5.99,             # optimization_fees (mig 076) trip/experience
    ai_task=2.99,                   # concierge:ai_task (mig 258)
    trip_pass=19.00,                # plans.trip_pass (mig 258)
    pro_monthly=29.00,              # plans.pro_monthly (mig 258), beta-free until 2026-12-31
    affiliate_partner_commission=0.08,  # affiliate:<partner> bands seeded 0.08 "confirm per contract"
    stripe_pct=0.029, stripe_flat=0.30, # processing, absorbed by platform (REVENUE_MODEL.md §1)
    booking_concierge_fee=0.05,     # fee_bands expert_concierge_booking (mig 066) — 5% on top of the concierge service price
    booking_concierge_cap=40.00,    # fee_bands expert_concierge_booking.max_amount (mig 311) — min(price × rate, cap) per line, base = the concierge listing's own price
    booking_concierge_expert_share=0.75,  # fee_bands expert_concierge_booking_expert_share (mig 311) — LD 51: 75% of the fee to the listing owner at completion, 25% stays platform revenue
)

# ---- Markets (v1.3 §6.8 sequence, forward-dated; Month 1 = first launch month) ----
MARKETS = OrderedDict([
    # name: (launch_month, providers_at_target, expert_share_of_providers, AOV_usd, rm_cost_per_month)
    ("Mumbai",    (1,  30, 17/30, 90,  1500)),
    ("Bogotá",    (2,  25, 15/25, 85,  2000)),
    ("Goa",       (4,  20, 13/20, 95,  1500)),
    ("Kyoto",     (5,  25, 19/25, 180, 4000)),
    ("Edinburgh", (7,  20, 14/20, 150, 4000)),
    ("Cartagena", (8,  25, 15/25, 140, 2000)),
    ("Jaipur",    (10, 20, 13/20, 100, 1500)),
    ("Porto",     (11, 20, 13/20, 120, 3000)),
])
LAUNCH_INVESTMENT = {"Mumbai":5000,"Bogotá":4000,"Goa":3500,"Kyoto":5500,"Edinburgh":3000,"Cartagena":4500,"Jaipur":3500,"Porto":3500}

SCENARIOS = {
    #                         bookings/active provider/month, ramp months to full, bookings per plan,
    #                         paid runs per plan, ai tasks per plan, pass attach, affiliate bookings per plan,
    #                         affiliate AOV, share of platform bookings that are expert services, fee-waived share
    "Low":  dict(bc_attach=0.05, bc_price=20,  bpp=0.75, ramp=3, bookings_per_plan=1.5, runs=0.20, tasks=0.10, pass_attach=0.05, aff_per_plan=0.3, aff_aov=140, expert_mix=0.30, waived=0.15, pro_take=0.10),
    "Base": dict(bc_attach=0.10, bc_price=25,  bpp=1.50, ramp=2, bookings_per_plan=2.0, runs=0.35, tasks=0.20, pass_attach=0.10, aff_per_plan=0.5, aff_aov=150, expert_mix=0.30, waived=0.20, pro_take=0.20),
    "High": dict(bc_attach=0.15, bc_price=30,  bpp=3.00, ramp=1, bookings_per_plan=2.5, runs=0.50, tasks=0.30, pass_attach=0.15, aff_per_plan=0.7, aff_aov=160, expert_mix=0.35, waived=0.25, pro_take=0.30),
}
RM_HIRES = [(1,1500),(2,2000),(5,4000),(7,4000),(11,3000)]  # India, Colombia, Japan, UK, Portugal
FIXED = dict(ai_cost_per_plan=0.35, tavily_cap=150, hosting=500, pro_billing_from_month=3)

def run(name, s):
    months = range(1, 13)
    tot = dict(gmv=0, bookings=0, plans=0, provider_take=0, expert_take=0, traveler_fee=0, runs=0, tasks=0,
               passes=0, affiliate_gmv=0, affiliate_comm=0, pro=0, rm=0, launch=0, ai=0, stripe=0,
               bc_fee=0, bc_comm=0)
    per_market = {}
    for m, (launch, target, expert_share, aov, rm_cost) in MARKETS.items():
        mk = dict(gmv=0, bookings=0)
        tot["launch"] += LAUNCH_INVESTMENT[m]
        for mo in months:
            if mo < launch:
                continue
            age = mo - launch  # 0 in launch month
            active = target * min(1.0, (age + 1) / s["ramp"])
            bookings = active * s["bpp"]
            gmv = bookings * aov
            plans = bookings / s["bookings_per_plan"]
            exp_b = bookings * s["expert_mix"]; prov_b = bookings - exp_b
            tot["provider_take"] += prov_b * aov * FEE["provider_beta_flat"]
            tot["expert_take"]   += exp_b * aov * FEE["expert_new"]
            fee_each = min(aov * FEE["traveler_fee_pct"], FEE["traveler_fee_cap"])
            tot["traveler_fee"]  += bookings * (1 - s["waived"]) * fee_each
            tot["runs"]   += plans * s["runs"] * FEE["optimizer_run"]
            tot["tasks"]  += plans * s["tasks"] * FEE["ai_task"]
            tot["passes"] += plans * s["pass_attach"] * FEE["trip_pass"]
            # Booking Concierge: a traveler buys an expert's facilitation service for the plan's partner items
            bc_lines = plans * s["bc_attach"]
            # LD 51 (migration 311): the 5% fee is min(price × rate, cap) per line, and only the platform's
            # 25% retained share is platform revenue — the other 75% mints to the listing owner at completion.
            bc_fee_per_line = min(s["bc_price"] * FEE["booking_concierge_fee"], FEE["booking_concierge_cap"])
            tot["bc_fee"]  += bc_lines * bc_fee_per_line * (1 - FEE["booking_concierge_expert_share"])
            tot["bc_comm"] += bc_lines * s["bc_price"] * FEE["expert_new"]
            aff_gmv = plans * s["aff_per_plan"] * s["aff_aov"]
            tot["affiliate_gmv"]  += aff_gmv
            tot["affiliate_comm"] += aff_gmv * FEE["affiliate_partner_commission"]
            if mo >= FIXED["pro_billing_from_month"]:
                tot["pro"] += active * s["pro_take"] * FEE["pro_monthly"]
            tot["ai"] += plans * FIXED["ai_cost_per_plan"]
            tot["stripe"] += bookings * (aov * FEE["stripe_pct"] + FEE["stripe_flat"])
            tot["gmv"] += gmv; tot["bookings"] += bookings; tot["plans"] += plans
            mk["gmv"] += gmv; mk["bookings"] += bookings
        per_market[m] = mk
    # Five regional managers by REGION (v1.3 §6.8: Americas 2, Europe 1, Japan 1, India 1), hired at that region's first launch
    for hire_month, cost in RM_HIRES:
        tot["rm"] += cost * (12 - hire_month + 1)
    tot["tavily"] = FIXED["tavily_cap"] * 12
    tot["hosting"] = FIXED["hosting"] * 12
    revenue = (tot["provider_take"] + tot["expert_take"] + tot["traveler_fee"] + tot["runs"] + tot["tasks"] + tot["passes"]
               + tot["affiliate_comm"] + tot["pro"] + tot["bc_fee"] + tot["bc_comm"])
    costs = tot["rm"] + tot["launch"] + tot["ai"] + tot["stripe"] + tot["tavily"] + tot["hosting"]
    return tot, per_market, revenue, costs

def money(x): return f"${x:,.0f}"

out = []
out.append("### Scenario results (Year 1, 12 months from first launch)\n")
out.append("| Line | Low | Base | High | Source of the rate |")
out.append("|---|---|---|---|---|")
res = {n: run(n, s) for n, s in SCENARIOS.items()}
rows = [
 ("Platform-rail GMV (provider + expert bookings)", "gmv", "AOV × bookings (assumption)"),
 ("Bookings (platform rail)", "bookings", "assumption"),
 ("Plans created", "plans", "bookings ÷ bookings-per-plan (assumption)"),
 ("Provider commission", "provider_take", "`beta_flat` 10% (mig 033)"),
 ("Expert commission", "expert_take", "`expert_new` 15% (mig 033)"),
 ("Traveler service fee", "traveler_fee", "`traveler_service_fee` 7% cap $25"),
 ("Optimization runs", "runs", "`optimization_fees` $5.99"),
 ("AI Concierge tasks", "tasks", "`concierge:ai_task` $2.99"),
 ("Trip Pass", "passes", "`plans.trip_pass` $19"),
 ("Booking Concierge fee, platform's 25% retained share (5% of listing price, capped $40, 75% to the listing owner)", "bc_fee", "`expert_concierge_booking` 5%/$40 cap + `expert_concierge_booking_expert_share` 75% (mig 311)"),
 ("Commission on Booking Concierge services", "bc_comm", "`expert_new` 15% (mig 033)"),
 ("Affiliate GMV (partner-collected)", "affiliate_gmv", "assumption"),
 ("Affiliate commission received", "affiliate_comm", "`affiliate:<partner>` 8% — unverified per contract"),
 ("Pro subscriptions", "pro", "`plans.pro_monthly` $29 from month 3"),
]
for label, key, src in rows:
    f = (lambda x: f"{x:,.0f}") if key in ("bookings","plans") else money
    out.append(f"| {label} | {f(res['Low'][0][key])} | {f(res['Base'][0][key])} | {f(res['High'][0][key])} | {src} |")
out.append(f"| **Platform revenue** | **{money(res['Low'][2])}** | **{money(res['Base'][2])}** | **{money(res['High'][2])}** | sum of fee lines |")
crow = [("Regional managers (5, by region, hired at first launch in region)", "rm"), ("Market launch investment (v1.3 §6.8)", "launch"),
        ("AI model spend", "ai"), ("Stripe processing (absorbed)", "stripe"), ("Tavily cap", "tavily"), ("Hosting", "hosting")]
for label, key in crow:
    out.append(f"| {label} | ({money(res['Low'][0][key])}) | ({money(res['Base'][0][key])}) | ({money(res['High'][0][key])}) | assumption |")
out.append(f"| **Operating result before engineering** | **{money(res['Low'][2]-res['Low'][3])}** | **{money(res['Base'][2]-res['Base'][3])}** | **{money(res['High'][2]-res['High'][3])}** | revenue − costs |")
take = {n: res[n][2] / (res[n][0]['gmv'] + res[n][0]['affiliate_gmv']) for n in res}
out.append(f"| Blended take on all GMV | {take['Low']:.1%} | {take['Base']:.1%} | {take['High']:.1%} | derived |")
out.append("\n### Per-market platform-rail GMV (Base)\n")
out.append("| Market | Launch month | Providers at target | AOV (assumed) | Year-1 bookings | Year-1 GMV | v1.3 target | v1.3 target implies bookings / provider / month |")
out.append("|---|---|---|---|---|---|---|---|")
v13 = {"Mumbai":150000,"Bogotá":120000,"Goa":130000,"Kyoto":200000,"Edinburgh":180000,"Cartagena":150000,"Jaipur":140000,"Porto":130000}
for m,(launch,target,es,aov,rm) in MARKETS.items():
    mk = res["Base"][1][m]
    active_months = 12 - launch + 1
    implied = v13[m] / aov / target / active_months
    out.append(f"| {m} | {launch} | {target} | ${aov} | {mk['bookings']:,.0f} | {money(mk['gmv'])} | {money(v13[m])} | {implied:.1f} |")
out.append("\n### Assumptions (every one is tunable; none is a fee row)\n")
out.append("| Assumption | Low | Base | High |")
out.append("|---|---|---|---|")
names = [("Share of plans that buy a Booking Concierge service","bc_attach"),("Expert's Booking Concierge price (USD)","bc_price"),("Bookings per active provider per month","bpp"),("Months for a market to reach its provider target","ramp"),("Bookings per plan","bookings_per_plan"),
         ("Paid optimization runs per plan","runs"),("Paid AI tasks per plan","tasks"),("Trip Pass attach rate per plan","pass_attach"),
         ("Affiliate bookings per plan","aff_per_plan"),("Affiliate booking value","aff_aov"),("Share of platform bookings that are expert services","expert_mix"),
         ("Share of bookings with the traveler fee waived (Trip Pass / rails)","waived"),("Share of active providers on Pro once billing starts","pro_take")]
for label,key in names:
    out.append(f"| {label} | {SCENARIOS['Low'][key]} | {SCENARIOS['Base'][key]} | {SCENARIOS['High'][key]} |")
out.append(f"| AI model cost per plan | ${FIXED['ai_cost_per_plan']} | same | same |")
out.append(f"| Tavily spend | ${FIXED['tavily_cap']}/mo cap (`TAVILY_MONTHLY_CAP_USD`) | same | same |")
out.append(f"| Hosting | ${FIXED['hosting']}/mo | same | same |")
out.append(f"| Pro billing starts | month {FIXED['pro_billing_from_month']} (assumes first launch ≈ Nov 2026; `beta_free_until` 2026-12-31) | same | same |")
out.append("| Regional manager cost per month | India $1,500 · Colombia $2,000 · Portugal $3,000 · UK / Japan $4,000 | same | same |")
out.append("| Plus revenue | $0 — `PLUS_SALES_ENABLED` is off until a draft fires end-to-end in a stocked market (LD 26) | same | same |")
out.append("| Engineering, product and founder cost | not modelled — outside the operating model | same | same |")
print("\n".join(out))
