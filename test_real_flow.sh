#!/bin/bash
# Real user flow test — every account goes through the actual API
BASE="http://localhost:8000"
PASS="TestPass123!"

login() {
  curl -s -X POST "$BASE/auth/login/" \
    -H "Content-Type: application/json" \
    -d "{\"email_or_username\":\"$1\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access'])" 2>/dev/null
}

admin_login() {
  curl -s -X POST "$BASE/auth/login/" \
    -H "Content-Type: application/json" \
    -d "{\"email_or_username\":\"admin@traveloure.test\",\"password\":\"AdminPass123!\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access'])" 2>/dev/null
}

echo "============================================"
echo "  TRAVELOURE FULL USER FLOW TEST"
echo "  All users in New York, USA"
echo "============================================"
echo ""

# ─── PHASE 1: LOCAL EXPERT APPLICATIONS ───────────────────────────
echo "══ PHASE 1: LOCAL EXPERT APPLICATIONS ══"
echo ""

# Create dummy files for expert uploads
echo "GOV ID DOCUMENT" > /tmp/gov_id.txt
echo "TRAVEL LICENSE" > /tmp/travel_license.txt

expert_submit() {
  local EMAIL=$1 TOKEN=$2
  local LANGUAGES=$3 YEARS=$4 BIO=$5 SERVICES=$6 AVAIL=$7 PRICE=$8
  
  RESP=$(curl -s -w "|||%{http_code}" -X POST "$BASE/auth/local-expert/create/" \
    -H "Authorization: Bearer $TOKEN" \
    -F "languages=$LANGUAGES" \
    -F "years_in_city=$YEARS" \
    -F "short_bio=$BIO" \
    -F "services=$SERVICES" \
    -F "service_availability=$AVAIL" \
    -F "price_expectation=$PRICE" \
    -F "confirm_age=true" \
    -F "t_and_c=true" \
    -F "partnership=true" \
    -F "gov_id=@/tmp/gov_id.txt" \
    -F "travel_licence=@/tmp/travel_license.txt")
  
  HTTP=$(echo "$RESP" | sed 's/.*|||//')
  BODY=$(echo "$RESP" | sed 's/|||.*//')
  echo "    HTTP: $HTTP"
}

# Expert 1: Marcus Johnson — NYC Food
echo "1/21 Marcus Johnson (NYC Food)"
echo "  → Logging in..."
T=$(login "nyc-food@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-food@traveloure.test" "$T" \
    '["English","Spanish"]' 18 \
    "Born in Brooklyn, raised on pizza and dim sum. From dollar slices to Michelin tasting menus, I know every bite worth taking in all five boroughs." \
    '["Food Walking Tour","Pizza Crawl","Chinatown Deep Dive","Fine Dining Guide","Brunch Circuit"]' \
    25 55
fi
echo ""

# Expert 2: Elena Vasquez — NYC Culture  
echo "2/21 Elena Vasquez (NYC Culture)"
T=$(login "nyc-culture@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-culture@traveloure.test" "$T" \
    '["English","Spanish","Portuguese"]' 15 \
    "NYC cultural connector. Museums, galleries, street art, spoken word — I bridge the gap between tourist Manhattan and the real New York." \
    '["Museum Tour","Street Art Walk","Cultural Deep Dive","Gallery Hop","Harlem Renaissance Tour"]' \
    20 50
fi
echo ""

# Expert 3: Jordan Williams — NYC Nightlife
echo "3/21 Jordan Williams (NYC Nightlife)"
T=$(login "nyc-nightlife@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-nightlife@traveloure.test" "$T" \
    '["English"]' 12 \
    "NYC after dark. Speakeasies, rooftop bars, jazz clubs, and the underground scenes tourists never find. I know every door guy by name." \
    '["Speakeasy Crawl","Rooftop Bar Tour","Jazz Club Night","Brooklyn Nightlife","VIP Club Access"]' \
    20 65
fi
echo ""

# Expert 4: Sarah Chen — NYC History
echo "4/21 Sarah Chen (NYC History)"
T=$(login "nyc-history@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-history@traveloure.test" "$T" \
    '["English","Mandarin"]' 20 \
    "NYC historian and licensed guide. From Ellis Island to the High Line, 400 years of stories that shaped the world — told on the streets where they happened." \
    '["Historical Walking Tour","Ellis Island & Liberty","Lower Manhattan Origins","Civil Rights Trail","Architecture Tour"]' \
    30 45
fi
echo ""

# Expert 5: Kai Okonkwo — NYC Art
echo "5/21 Kai Okonkwo (NYC Art)"
T=$(login "nyc-art@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-art@traveloure.test" "$T" \
    '["English","French","Yoruba"]' 10 \
    "Artist and curator turned guide. MoMA to Bushwick warehouses, I show you art that makes you think — not just the stuff on postcards." \
    '["Gallery Tour","Street Art Safari","Artist Studio Visit","MoMA Deep Dive","Chelsea Gallery Walk"]' \
    15 60
fi
echo ""

# Expert 6: Rachel Goldstein — NYC Broadway
echo "6/21 Rachel Goldstein (NYC Broadway)"
T=$(login "nyc-broadway@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-broadway@traveloure.test" "$T" \
    '["English","Hebrew"]' 22 \
    "Former Broadway stage manager turned theater guide. Behind-the-scenes stories, best seats on a budget, and shows worth the hype." \
    '["Broadway Insider Tour","Show Recommendations","Theater District Walk","Off-Broadway Guide","Stage Door Experience"]' \
    25 50
fi
echo ""

# Expert 7: Damon Rivera — NYC Neighborhoods
echo "7/21 Damon Rivera (NYC Neighborhoods)"
T=$(login "nyc-neighborhoods@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  echo "  → Submitting expert application..."
  expert_submit "nyc-neighborhoods@traveloure.test" "$T" \
    '["English","Spanish"]' 30 \
    "Grew up in Washington Heights, lived in every borough. I dont do tourist traps — I show you the real neighborhoods, the real people, the real New York." \
    '["Neighborhood Deep Dive","Brooklyn Bridge to DUMBO","Harlem Walk","Queens World Tour","Lower East Side History"]' \
    30 40
fi
echo ""

# Also submit remaining expert accounts that were originally from other cities
# Using them as NYC experts now

echo "8/21 Yuki Tanaka (Temple Guide → NYC Asian Culture)"
T=$(login "kyoto-temple-guide@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Japanese"]' 8 \
    "Japanese cultural specialist in NYC. Tea ceremonies in Brooklyn, zen meditation in Central Park, and the best ramen spots you have never heard of." \
    '["Japanese Tea Ceremony","Zen Garden Tour","Asian Food Guide","Japanese Culture Workshop"]' \
    20 50
fi
echo ""

echo "9/21 Aiko Yamamoto (Food → NYC Japanese Food)"
T=$(login "kyoto-food@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Japanese","French"]' 6 \
    "Japanese-born food explorer in NYC. From East Village izakayas to Flushing dim sum, I find the authentic flavors hiding in plain sight." \
    '["Japanese Food Tour","Ramen Crawl","Flushing Market Tour","Sake Tasting"]' \
    20 45
fi
echo ""

echo "10/21 Alistair MacGregor (Culture → NYC European Heritage)"
T=$(login "edinburgh-culture@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Scottish Gaelic"]' 12 \
    "Scottish expat and NYC history nerd. European heritage sites, immigrant stories, and the best pubs in Manhattan — with proper pints." \
    '["European Heritage Walk","Immigration History Tour","Best Pubs Tour","Literary NYC"]' \
    25 45
fi
echo ""

echo "11/21 Fiona Campbell (Whisky → NYC Cocktail Scene)"
T=$(login "edinburgh-whisky@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English"]' 10 \
    "Certified whisky ambassador now exploring NYCs cocktail renaissance. From craft distilleries in Brooklyn to hidden bars in the Village." \
    '["Whisky Tasting NYC","Craft Cocktail Tour","Brooklyn Distillery Tour","Speakeasy History Walk"]' \
    20 55
fi
echo ""

echo "12/21 Valentina Herrera (Romance → NYC Romance)"
T=$(login "cartagena-romance@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Spanish"]' 8 \
    "NYC romance curator. Central Park proposals, rooftop dinners, Brooklyn Bridge walks at sunset — I create moments that last a lifetime." \
    '["Proposal Planning","Romantic Dinner Setup","Couples Walking Tour","Anniversary Surprise"]' \
    15 75
fi
echo ""

echo "13/21 Sofia Vargas (Food → NYC Latin Food)"
T=$(login "cartagena-food@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Spanish"]' 7 \
    "Colombian chef in NYC. Jackson Heights to the Bronx, I know every taco truck, empanada stand, and ceviche bar in the city." \
    '["Latin Food Tour","Jackson Heights World Tour","Colombian Food Guide","Street Food Crawl"]' \
    20 40
fi
echo ""

echo "14/21 Priya Sharma (Artisan → NYC South Asian Culture)"  
T=$(login "jaipur-artisan@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Hindi","Rajasthani"]' 9 \
    "South Asian culture guide in NYC. Little India in Jackson Heights, Diwali in Times Square, and the best chai you will ever have." \
    '["South Asian Culture Tour","Little India Walk","Bollywood Night","Indian Food Guide"]' \
    20 40
fi
echo ""

echo "15/21 Joao Ferreira (Wine → NYC Wine Scene)"
T=$(login "porto-wine@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Portuguese","Spanish"]' 6 \
    "Portuguese sommelier in NYC. Natural wine bars, rooftop tastings, and hidden wine shops. I find the bottles worth opening." \
    '["Wine Bar Crawl","Natural Wine Tour","Wine & Cheese Pairing","Sommelier Experience"]' \
    20 55
fi
echo ""

echo "16/21 Ana Silva (Architecture → NYC Architecture)"
T=$(login "porto-architecture@traveloure.test")
if [ -z "$T" ]; then echo "  ✗ Login failed"; else
  echo "  ✓ Logged in"
  expert_submit "" "$T" \
    '["English","Portuguese"]' 8 \
    "Architecture grad exploring NYC. Art Deco masterpieces, Brutalist gems, and the new Hudson Yards — I read buildings like books." \
    '["Architecture Walking Tour","Art Deco NYC","Brooklyn Brownstone Tour","Modern Architecture Tour"]' \
    20 45
fi
echo ""

echo ""
echo "══ EXPERT APPLICATIONS SUBMITTED ══"
echo ""

# ─── PHASE 2: ADMIN APPROVES ALL EXPERTS ──────────────────────────
echo "══ PHASE 2: ADMIN APPROVING ALL EXPERTS ══"
ADMIN=$(admin_login)
echo "Admin logged in"

# Get all pending expert applications
EXPERT_IDS=$(curl -s "$BASE/auth/manage-localexpert/" \
  -H "Authorization: Bearer $ADMIN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for e in d.get('all',{}).get('data',[]):
    if e.get('status') != 'approved':
        print(e['id'])
" 2>/dev/null)

count=0
for ID in $EXPERT_IDS; do
  curl -s -X PATCH "$BASE/auth/manage-localexpert/$ID/" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d '{"status":"approved"}' > /dev/null 2>&1
  count=$((count+1))
done
echo "Approved $count expert applications"
echo ""

# ─── PHASE 3: SERVICE PROVIDER APPLICATIONS ───────────────────────
echo "══ PHASE 3: SERVICE PROVIDER APPLICATIONS ══"
echo ""

# Dummy files for SP uploads
echo "BUSINESS LOGO" > /tmp/sp_logo.png
echo "BUSINESS LICENSE" > /tmp/sp_license.pdf
echo "GST TAX DOC" > /tmp/sp_gst.pdf

sp_submit() {
  local TOKEN=$1
  shift
  RESP=$(curl -s -w "|||%{http_code}" -X POST "$BASE/auth/service-provider/create/" \
    -H "Authorization: Bearer $TOKEN" \
    "$@" \
    -F "business_logo=@/tmp/sp_logo.png" \
    -F "business_license=@/tmp/sp_license.pdf" \
    -F "business_gst_tax=@/tmp/sp_gst.pdf")
  HTTP=$(echo "$RESP" | sed 's/.*|||//')
  echo "    HTTP: $HTTP"
}

echo "1/5 Anthony Rossi — Metro Black Car Service (Transport)"
T=$(login "nyc-transport@traveloure.test")
echo "  ✓ Logged in"
sp_submit "$T" \
  -F "business_name=Metro Black Car Service" \
  -F "name=Anthony Rossi" \
  -F "email=nyc-transport@traveloure.test" \
  -F "mobile=+12125551234" \
  -F "whatsapp=+12125551234" \
  -F "country=USA" \
  -F "address=450 West 33rd Street, New York, NY 10001" \
  -F "gst=US-EIN-12-3456789" \
  -F "business_type=Transportation" \
  -F 'service_offers=["Airport Transfer (JFK/LGA/EWR)","Manhattan Black Car","Hamptons Day Trip","Night Out Driver"]' \
  -F "description=NYCs reliable black car service. Airport pickups with flight tracking, Manhattan rides in under 10 minutes, and day trips to the Hamptons." \
  -F "instant_booking=true" \
  -F "t_and_c=true" -F "info_confirmation=true" -F "contact_request=true"
echo ""

echo "2/5 Mia Park — Gotham Lens Photography"
T=$(login "nyc-photography@traveloure.test")
echo "  ✓ Logged in"
sp_submit "$T" \
  -F "business_name=Gotham Lens Photography" \
  -F "name=Mia Park" \
  -F "email=nyc-photography@traveloure.test" \
  -F "mobile=+12125559876" \
  -F "whatsapp=+12125559876" \
  -F "country=USA" \
  -F "address=88 Fulton Street, DUMBO, Brooklyn, NY 11201" \
  -F "gst=US-EIN-98-7654321" \
  -F "business_type=Photography" \
  -F 'service_offers=["Couple Photoshoot","Brooklyn Bridge Session","Central Park Portrait","Proposal Photography","Rooftop Shoot"]' \
  -F "description=NYC through my lens. Brooklyn Bridge at sunrise, Central Park in fall, Times Square at midnight. 8 years shooting the city." \
  -F "instant_booking=true" \
  -F "t_and_c=true" -F "info_confirmation=true" -F "contact_request=true"
echo ""

echo "3/5 David Thompson — NYC Curated Stays"
T=$(login "nyc-stays@traveloure.test")
echo "  ✓ Logged in"
sp_submit "$T" \
  -F "business_name=NYC Curated Stays" \
  -F "name=David Thompson" \
  -F "email=nyc-stays@traveloure.test" \
  -F "mobile=+12125553456" \
  -F "whatsapp=+12125553456" \
  -F "country=USA" \
  -F "address=120 East 56th Street, New York, NY 10022" \
  -F "gst=US-EIN-45-6789012" \
  -F "business_type=Accommodation" \
  -F 'service_offers=["Midtown Luxury Apartment","SoHo Loft","Brooklyn Brownstone","Central Park View Suite"]' \
  -F "description=Hand-picked NYC apartments. SoHo lofts with exposed brick, Midtown suites near Broadway, Brooklyn brownstones with rooftop views." \
  -F "instant_booking=true" \
  -F "t_and_c=true" -F "info_confirmation=true" -F "contact_request=true"
echo ""

echo "4/5 Olivia Laurent — Laurent NYC Concierge"
T=$(login "nyc-luxury@traveloure.test")
echo "  ✓ Logged in"
sp_submit "$T" \
  -F "business_name=Laurent NYC Concierge" \
  -F "name=Olivia Laurent" \
  -F "email=nyc-luxury@traveloure.test" \
  -F "mobile=+12125557890" \
  -F "whatsapp=+12125557890" \
  -F "country=USA" \
  -F "address=One World Trade Center, New York, NY 10007" \
  -F "gst=US-EIN-67-8901234" \
  -F "business_type=Luxury Concierge" \
  -F 'service_offers=["Private Helicopter Tour","Michelin Reservations","VIP Broadway Tickets","Yacht Charter","Personal Shopper"]' \
  -F "description=New Yorks most exclusive experiences. Helicopters over Manhattan, impossible reservations, front-row Broadway, yacht parties on the Hudson." \
  -F "instant_booking=false" \
  -F "t_and_c=true" -F "info_confirmation=true" -F "contact_request=true"
echo ""

echo "5/5 Tyler Brooks — Brooklyn Events Co"
T=$(login "nyc-events@traveloure.test")
echo "  ✓ Logged in"
sp_submit "$T" \
  -F "business_name=Brooklyn Events Co" \
  -F "name=Tyler Brooks" \
  -F "email=nyc-events@traveloure.test" \
  -F "mobile=+12125554567" \
  -F "whatsapp=+12125554567" \
  -F "country=USA" \
  -F "address=250 Wythe Avenue, Williamsburg, Brooklyn, NY 11249" \
  -F "gst=US-EIN-23-4567890" \
  -F "business_type=Events & Experiences" \
  -F 'service_offers=["Rooftop Dinner Party","Brooklyn Brewery Tour","Live Music Night","Art Gallery Opening","Cooking Class"]' \
  -F "description=Curated NYC experiences beyond the guidebook. Rooftop dinners, brewery crawls in Williamsburg, secret comedy shows, and art openings." \
  -F "instant_booking=true" \
  -F "t_and_c=true" -F "info_confirmation=true" -F "contact_request=true"
echo ""

# ─── PHASE 4: ADMIN APPROVES ALL SPs ─────────────────────────────
echo "══ PHASE 4: ADMIN APPROVING ALL SPs ══"
ADMIN=$(admin_login)

SP_IDS=$(curl -s "$BASE/auth/manage-serviceprovider/" \
  -H "Authorization: Bearer $ADMIN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for sp in d.get('all',{}).get('data',[]):
    if sp.get('status') != 'approved':
        print(sp['id'])
" 2>/dev/null)

count=0
for ID in $SP_IDS; do
  curl -s -X PATCH "$BASE/auth/manage-serviceprovider/$ID/" \
    -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" \
    -d '{"status":"approved"}' > /dev/null 2>&1
  count=$((count+1))
done
echo "Approved $count SP applications"
echo ""

# ─── PHASE 5: VERIFICATION ───────────────────────────────────────
echo "══ PHASE 5: VERIFICATION ══"
TRAVELER=$(login "test-ea@traveloure.test")

echo "Local Experts:"
curl -s "$BASE/ai/local-experts/?page_size=50" \
  -H "Authorization: Bearer $TRAVELER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Total: {d[\"count\"]}')
for e in d.get('data',[]):
    u=e.get('user',{})
    print(f'  ✓ {u[\"first_name\"]} {u[\"last_name\"]} ({u.get(\"city\",\"?\")}) — {e[\"services\"][:2]}')
" 2>/dev/null

echo ""
echo "Service Providers (USA):"
curl -s "$BASE/auth/service-provider/view/USA/" \
  -H "Authorization: Bearer $TRAVELER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Total: {d[\"count\"]}')
for sp in d.get('data',[]):
    print(f'  ✓ {sp[\"first_name\"]} {sp[\"last_name\"]} — {sp.get(\"business_name\",\"pending\")} ({sp.get(\"business_type\",\"?\")})')
" 2>/dev/null

echo ""
echo "============================================"
echo "  FLOW TEST COMPLETE"
echo "============================================"
