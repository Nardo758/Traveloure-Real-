# OPERATION TRAILHEAD — Anchor Source Registry v1 (eight markets)

**Purpose:** the human-curated seed for `dmo_sources` expansion (Stage 2) and T1's source-coverage column. Humans curate SOURCES (this file); the machine discovers CONTENT (Tavily, slot-derived queries). Long-tail discovery is deliberately absent — that's the pipeline's job.
**Legend — Access:** SCRAPE (public site via existing attributed path, facts/links/coords only) · AFF-TP (affiliate live via Travelpayouts) · AFF-NET (affiliate via another network, named) · TRADE (B2B/trade portal, expert-rail wholesale endgame) · PARTNER (formal content partnership outreach) · OPEN (open license).
**Rights posture:** every SCRAPE entry = facts, names, addresses, coordinates, links, event dates. Never descriptions/photos from commercial sources; DMO editorial only with partnership or explicit license. Verified-this-week entries marked ✓; unmarked = high-confidence, verify at registry-sync time.

---

## CROSS-MARKET (all eight)
| Source | Type | Access | Notes |
|---|---|---|---|
| Wikivoyage + Wikimedia | Open content | OPEN | CC BY-SA; attribution required; destination prose + POI seeds |
| OpenStreetMap | Geo | OPEN | Already attributed platform-wide (ODbL) |
| UNESCO World Heritage | Institutional | SCRAPE | Site facts; Kyoto/Edinburgh/Porto/Cartagena/Jaipur all hold listings |
| Nager.Date + PredictHQ | Events/holidays | existing | Already in trend stack; feeds `travel_pulse_calendar_events` → R33 spotlight |
| **Viator** | OTA affiliate | AFF-TP ✓ | Global tours/activities floor for every market |
| **GetYourGuide** | OTA affiliate | AFF-TP ✓ | Global; strong Europe |
| **Tiqets** | OTA affiliate | AFF-TP ✓ | 3,000+ venues, museums/attractions, ~8–9% |
| **Klook** | OTA affiliate | AFF-TP ✓ | APAC anchor; network-exclusive door for teamLab class |
| **Booking / Agoda / Hostelworld** | Stay affiliate | AFF-TP ✓ (network level) | **T0 verifies stay links ride the existing integration** |
| Go City | Pass affiliate | AFF-TP ✓ | Multi-attraction passes where cities covered |
| Civitatis | OTA affiliate | pipeline | Iberia/LatAm strength — Porto, Bogotá, Cartagena |
| Fever (Impact) | Events affiliate | AFF-NET (Impact) | Event/experience inventory, LatAm + Europe cities |

## KYOTO (Tier 1 — wedge)
| Source | Type | Access | Notes |
|---|---|---|---|
| Kyoto City Tourism Association (kyoto.travel) | City DMO | SCRAPE → PARTNER | Already the seeded registry anchor; partnership = rights + credibility |
| JNTO | National DMO | SCRAPE → PARTNER | Cross-checks + national event calendar |
| **teamLab Biovortex Kyoto** | Branded operator | AFF-TP→Klook ✓ | **Network-exclusive: official channels are own site + Klook only** — the exhibit for the operator-tier pattern |
| e-ticketed temples/shrines (Nijō-jō, major sub-temples) | Operators | SCRAPE + OTA rung | Facts direct; bookability via Klook/Tiqets where listed |
| Kyoto City Official Events (city + KCTA calendars) | Events | SCRAPE | Matsuri dates → spotlight substrate |
| Kyoto Open Data (city portal) | Open | OPEN | Facilities, districts |

## EDINBURGH
| Source | Type | Access | Notes |
|---|---|---|---|
| VisitScotland | National DMO | SCRAPE → PARTNER | Also runs a travel-trade program — dual door |
| Forever Edinburgh (city) | City DMO | SCRAPE | City-grain events + neighborhoods |
| **Historic Environment Scotland** | Branded operator (70+ sites incl. Edinburgh Castle) | SCRAPE + TRADE ✓ | **Trade-portal pattern: Group Sales account, trade rates, min annual spend, applications reviewed Oct–Jan** — expert-rail wholesale endgame; consumer interim via Tiqets/GYG |
| Edinburgh Festivals (Fringe, EIF, Tattoo) | Event operators | SCRAPE + AFF rung | THE demand-surge anchors; Tattoo tickets operator-direct |
| National Museums Scotland / NGS | Operators | SCRAPE | Free-entry anchors; facts only |

## PORTO
| Source | Type | Access | Notes |
|---|---|---|---|
| Turismo de Portugal (visitportugal) | National DMO | SCRAPE → PARTNER | |
| Visit Porto (city) | City DMO | SCRAPE | |
| Port wine lodges (Sandeman, Taylor's, Graham's…) | Branded operators | SCRAPE + OTA rung | Tastings bookable via GYG/Civitatis; venue class for events lens |
| Livraria Lello, Casa da Música, WOW | Branded operators | SCRAPE + OTA rung | Lello e-tickets; WOW = event venue cluster |
| Porto Open Data (cmp portal) | Open | OPEN | |

## BOGOTÁ
| Source | Type | Access | Notes |
|---|---|---|---|
| IDT — Instituto Distrital de Turismo (bogota.gov.co / visitbogota) | City DMO ✓ | SCRAPE → PARTNER | Official city tourism institute; "Bogotá, Your Home" catalog = 103 attractions/39 routes — a ready-made anchor list |
| ProColombia (colombia.travel) | National DMO | SCRAPE → PARTNER | |
| Museo del Oro / Botero (Banrep cultural) | Operators | SCRAPE | Facts; mostly free/low-fee entry |
| Monserrate | Branded operator | SCRAPE + OTA rung | Funicular tickets; OTA-covered |
| Fever Bogotá | Events affiliate | AFF-NET (Impact) | Event inventory for the experiences lens |

## CARTAGENA
| Source | Type | Access | Notes |
|---|---|---|---|
| Corpoturismo (cartagenadeindias.travel) | City DMO ✓ | SCRAPE → PARTNER | Official DMO; site verified live |
| Castillo San Felipe / Fortificaciones | Operators (UNESCO) | SCRAPE + OTA rung | Ticketed; OTA-covered via Civitatis/Viator |
| Rosario Islands operators | Operator cluster | OTA rung only | High fake-ticket/tout risk — **official-channel rule applies hard here**; bookable only via recognized OTA feeds |
| Event venues (walled-city hotels/casas for events lens) | Venues | SCRAPE | Facts + links; wedding-destination market — events templates lean heavily here |

## MUMBAI
| Source | Type | Access | Notes |
|---|---|---|---|
| MTDC (mtdc.co) | State DMO ✓ | SCRAPE → PARTNER | Maharashtra Tourism Development Corp — verified |
| Incredible India (tourism.gov.in) | National DMO | SCRAPE | |
| Gateway/Elephanta (ASI sites) | Operators | SCRAPE + OTA rung | ASI e-ticketing exists; OTA coverage via Klook/Viator |
| CSMVS Museum, NCPA | Operators | SCRAPE | Culture anchors; NCPA = events calendar |
| BookMyShow | Events platform | SCRAPE-facts / future AFF | India's event-ticketing monopoly — affiliate program worth a T0-adjacent check; events lens needs it |

## GOA
| Source | Type | Access | Notes |
|---|---|---|---|
| Goa Tourism / GTDC (goa-tourism.com) | State DMO | SCRAPE → PARTNER | GTDC also operates hotels/boats (RTDC-like) |
| Old Goa churches (ASI/UNESCO) | Operators | SCRAPE | Facts; mostly free entry |
| Beach-shack + water-sports clusters | Operator long-tail | pipeline | This is Tavily's job, not registry — noted to prevent hand-curation creep |
| Wedding/event venue cluster (resorts) | Venues | SCRAPE + stay-AFF | Goa = India's destination-wedding capital; events templates lean here; stays via Booking/Agoda rung |

## JAIPUR
| Source | Type | Access | Notes |
|---|---|---|---|
| Rajasthan Tourism (tourism.rajasthan.gov.in) | State DMO ✓ | SCRAPE → PARTNER | Verified; RTDC (rtdc.tourism.rajasthan.gov.in) is the ops arm — hotels, Palace on Wheels |
| Amber Fort / DoA monuments (composite e-tickets) | Operators | SCRAPE + OTA rung | Composite-ticket system; Klook/Viator coverage |
| **City Palace Jaipur (royal trust)** | Branded operator | SCRAPE + PARTNER | Trust-run, own ticketing — Xcaret-class candidate for direct outreach |
| Heritage-hotel event venues (Rambagh class) | Venues | SCRAPE + stay-AFF | Destination-wedding lens; palace weddings = premium template class |
| Jaipur Literature Festival + fair calendar | Events | SCRAPE | Surge anchors → spotlight substrate |

---

## PATTERNS THE REGISTRY ENCODES (for the brief's operator tier)
1. **Network-exclusive** (teamLab): the OTA affiliate IS the operator door — Klook signup is a T0 item.
2. **Trade-portal** (HES, likely DoA Rajasthan): B2B rates, min-spend — expert-rail wholesale endgame, consumer interim via OTA rung.
3. **OTA-covered long tail** (most ticketed attractions): the waterfall's affiliate rung inherits them; no registry entry needed beyond the anchor class.
4. **Trust/independent** (City Palace Jaipur): direct partnership candidates once traffic exists — Stage 6 logic.
5. **High-fraud clusters** (Rosario Islands): official-channel-or-recognized-OTA rule enforced hard; scraped "tickets here" URLs never become booking links.

## T0 ADDITIONS THIS REGISTRY PRODUCES
- Travelpayouts: confirm stay programs (Booking/Agoda/Hostelworld) ride the existing integration · activate Klook + Tiqets + Go City programs.
- Impact: confirm Fever content/link scope covers Bogotá (+ any LatAm cities).
- BookMyShow affiliate check (Mumbai events lens).
- Verify the four unverified DMO URLs at registry-sync time (marked unchecked above).
