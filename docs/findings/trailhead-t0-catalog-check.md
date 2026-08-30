# Operation Trailhead — T0 Affiliate / Catalog Verification

**Status:** OPEN — awaiting Leon-side / credentialed completion. See "Why the agent could not close these" below.
**Rule (from the dispatch):** each item's deliverable is a **yes/no with evidence** (screenshot or program-page cite). No program signup obligates anything downstream — this is capability mapping. Findings doc committed = the gate.

> **Why the agent could not close these from the session environment:**
> - Items 1–5 require authenticated access to affiliate dashboards (Travelpayouts, Impact) — the session has no such credentials. Capability mapping against a live account is Leon-side (or an agent explicitly given credentials).
> - Item 6 (registry URL verification) requires outbound web access to the tourism-board domains. The session's egress proxy **blocked all four** (`goa-tourism.com`, `visitporto.travel`, `foreveredinburgh.com`, `japan.travel`) — the D3 network policy does not allowlist them. These must be checked from a browser / environment where egress allows (Replit or local).
>
> The checklist below is structured so each item can be filled with a one-line verdict + an evidence link/screenshot path. §13: nothing here is marked verified until it actually is.

---

## 1. Stay links ride the existing Travelpayouts integration?
**Question:** Do Booking.com / Agoda / Hostelworld programs ride the EXISTING Travelpayouts integration — same partner ID, same link/deep-link mechanics as current flight/transport usage?
**Why it matters:** decides whether Stage-1 property content ships **monetized** from day one.
**Evidence to capture:** Travelpayouts dashboard showing the stay programs active under the same account/partner ID; a sample deep-link built through the existing rail.
**Verdict:** ☐ yes ☐ no — _________________________  (evidence: __________)

## 2. Klook program activation via Travelpayouts
**Question:** Can the Klook program be activated via Travelpayouts (the teamLab door; APAC anchor for Kyoto / Mumbai / Goa / Jaipur)? Note approval requirements + turnaround.
**Evidence to capture:** Klook program page in Travelpayouts; approval terms; expected turnaround.
**Verdict:** ☐ yes ☐ no — approval reqs: _________  turnaround: _________  (evidence: __________)

## 3. Tiqets + Go City activation via Travelpayouts
**Question:** Can Tiqets and Go City be activated via Travelpayouts (attraction floor for Edinburgh / Porto + pass coverage)?
**Evidence to capture:** both program pages in Travelpayouts; activation state.
**Verdict — Tiqets:** ☐ yes ☐ no — _________  (evidence: __________)
**Verdict — Go City:** ☐ yes ☐ no — _________  (evidence: __________)

## 4. Fever (Impact) scope covers Bogotá?
**Question:** Does the existing Fever relationship's content/link scope cover Bogotá (and any other LatAm city inventory)?
**Evidence to capture:** Impact dashboard for the Fever relationship; the covered-cities / inventory scope.
**Verdict:** ☐ yes ☐ no — LatAm cities covered: _________  (evidence: __________)

## 5. BookMyShow affiliate program
**Question:** Does a BookMyShow affiliate program exist, and is it open to non-India entities? (Mumbai events lens is affiliate-shaped or nothing.)
**Evidence to capture:** the BookMyShow affiliate/partner program page; eligibility terms for non-India entities.
**Verdict:** ☐ exists ☐ open to non-India — _________  (evidence: __________)

## 6. Registry URL verification (the four unverified DMO entries)
**Question:** Confirm each is live + correct; annotate the registry (`docs/planning/TRAILHEAD_ANCHOR_SOURCE_REGISTRY_v1.md`) with ✓ + the confirmed URL.
**Note:** session egress blocked all four — verify from a browser where egress allows.

| Registry entry | URL to confirm | Live? | Confirmed/redirect URL |
|---|---|---|---|
| Goa Tourism / GTDC | `goa-tourism.com` | ☐ | __________ |
| Visit Porto (city) | `visitporto.travel` (confirm domain) | ☐ | __________ |
| Forever Edinburgh (city) | `foreveredinburgh.com` (confirm domain) | ☐ | __________ |
| JNTO partnership page | `japan.travel` + the business/trade section | ☐ | __________ |

---

**When complete:** commit this doc filled in, and annotate the registry's unverified rows with ✓. Item 1's verdict is the one that gates Stage-1 economics — surface it first.
