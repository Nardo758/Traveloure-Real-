"""Seed New York market — accounts, local experts, and service providers."""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

from django.contrib.auth import get_user_model
from authentication.models import LocalExpertForm, ServiceProviderForm
from subscription.models import Wallet
User = get_user_model()

PASSWORD = "TestPass123!"

# ── New York Accounts ──────────────────────────────────────────────

accounts = [
    # Local Experts
    {"email": "nyc-food@traveloure.test", "username": "NYC.Food1", "first_name": "Marcus", "last_name": "Johnson", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-culture@traveloure.test", "username": "NYC.Culture1", "first_name": "Elena", "last_name": "Vasquez", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-nightlife@traveloure.test", "username": "NYC.Nightlife1", "first_name": "Jordan", "last_name": "Williams", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-history@traveloure.test", "username": "NYC.History1", "first_name": "Sarah", "last_name": "Chen", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-art@traveloure.test", "username": "NYC.Art1", "first_name": "Kai", "last_name": "Okonkwo", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-broadway@traveloure.test", "username": "NYC.Broadway1", "first_name": "Rachel", "last_name": "Goldstein", "city": "New York", "country": "USA", "is_local_expert": True},
    {"email": "nyc-neighborhoods@traveloure.test", "username": "NYC.Hoods1", "first_name": "Damon", "last_name": "Rivera", "city": "New York", "country": "USA", "is_local_expert": True},
    # Service Providers
    {"email": "nyc-transport@traveloure.test", "username": "NYC.Transport1", "first_name": "Anthony", "last_name": "Rossi", "city": "New York", "country": "USA", "is_service_provider": True},
    {"email": "nyc-photography@traveloure.test", "username": "NYC.Photo1", "first_name": "Mia", "last_name": "Park", "city": "New York", "country": "USA", "is_service_provider": True},
    {"email": "nyc-stays@traveloure.test", "username": "NYC.Stays1", "first_name": "David", "last_name": "Thompson", "city": "New York", "country": "USA", "is_service_provider": True},
    {"email": "nyc-luxury@traveloure.test", "username": "NYC.Luxury1", "first_name": "Olivia", "last_name": "Laurent", "city": "New York", "country": "USA", "is_service_provider": True},
    {"email": "nyc-events@traveloure.test", "username": "NYC.Events1", "first_name": "Tyler", "last_name": "Brooks", "city": "New York", "country": "USA", "is_service_provider": True},
]

print("── Creating accounts ──")
for acct in accounts:
    email = acct["email"]
    if User.objects.filter(email=email).exists():
        print(f"  Exists: {acct['first_name']} {acct['last_name']}")
        continue
    user = User.objects.create_user(
        email=email, username=acct["username"],
        first_name=acct["first_name"], last_name=acct["last_name"],
        password=PASSWORD, is_active=True, is_email_verified=True,
        city=acct.get("city"), country=acct.get("country"),
        is_local_expert=acct.get("is_local_expert", False),
        is_service_provider=acct.get("is_service_provider", False),
    )
    Wallet.objects.get_or_create(user=user, defaults={"credits": 100, "balance": 100.00})
    print(f"  Created: {acct['first_name']} {acct['last_name']}")

# ── Local Expert Applications ──────────────────────────────────────

experts = [
    {"email": "nyc-food@traveloure.test", "data": {
        "languages": ["English", "Spanish"], "years_in_city": 18,
        "short_bio": "Born in Brooklyn, raised on pizza and dim sum. From $1 slices to Michelin-starred tasting menus, I know every bite worth taking in all five boroughs.",
        "services": ["Food Walking Tour", "Pizza Crawl", "Chinatown Deep Dive", "Fine Dining Guide", "Brunch Circuit"],
        "service_availability": 25, "price_expectation": 55,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-culture@traveloure.test", "data": {
        "languages": ["English", "Spanish", "Portuguese"], "years_in_city": 15,
        "short_bio": "NYC cultural connector. Museums, galleries, street art, spoken word — I bridge the gap between tourist Manhattan and the real New York.",
        "services": ["Museum Tour", "Street Art Walk", "Cultural Deep Dive", "Gallery Hop", "Harlem Renaissance Tour"],
        "service_availability": 20, "price_expectation": 50,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-nightlife@traveloure.test", "data": {
        "languages": ["English"], "years_in_city": 12,
        "short_bio": "NYC after dark. Speakeasies, rooftop bars, jazz clubs, and the underground scenes tourists never find. I know every door guy by name.",
        "services": ["Speakeasy Crawl", "Rooftop Bar Tour", "Jazz Club Night", "Brooklyn Nightlife", "VIP Club Access"],
        "service_availability": 20, "price_expectation": 65,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-history@traveloure.test", "data": {
        "languages": ["English", "Mandarin"], "years_in_city": 20,
        "short_bio": "NYC historian and licensed guide. From Ellis Island to the High Line, 400 years of stories that shaped the world — told on the streets where they happened.",
        "services": ["Historical Walking Tour", "Ellis Island & Liberty", "Lower Manhattan Origins", "Civil Rights Trail", "Architecture Tour"],
        "service_availability": 30, "price_expectation": 45,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-art@traveloure.test", "data": {
        "languages": ["English", "French", "Yoruba"], "years_in_city": 10,
        "short_bio": "Artist and curator turned guide. MoMA to Bushwick warehouses, I show you art that makes you think — not just the stuff on postcards.",
        "services": ["Gallery Tour", "Street Art Safari", "Artist Studio Visit", "MoMA Deep Dive", "Chelsea Gallery Walk"],
        "service_availability": 15, "price_expectation": 60,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-broadway@traveloure.test", "data": {
        "languages": ["English", "Hebrew"], "years_in_city": 22,
        "short_bio": "Former Broadway stage manager turned theater guide. Behind-the-scenes stories, best seats on a budget, and shows worth the hype (and which ones aren't).",
        "services": ["Broadway Insider Tour", "Show Recommendations", "Theater District Walk", "Off-Broadway Guide", "Stage Door Experience"],
        "service_availability": 25, "price_expectation": 50,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "nyc-neighborhoods@traveloure.test", "data": {
        "languages": ["English", "Spanish"], "years_in_city": 30,
        "short_bio": "Grew up in Washington Heights, lived in every borough. I don't do tourist traps — I show you the real neighborhoods, the real people, the real New York.",
        "services": ["Neighborhood Deep Dive", "Brooklyn Bridge to DUMBO", "Harlem Walk", "Queens World Tour", "Lower East Side History"],
        "service_availability": 30, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
]

print("\n── Creating expert applications ──")
for e in experts:
    user = User.objects.get(email=e["email"])
    if LocalExpertForm.objects.filter(user=user).exists():
        print(f"  Exists: {user.first_name} {user.last_name}")
        continue
    LocalExpertForm.objects.create(user=user, **e["data"])
    print(f"  Created: {user.first_name} {user.last_name} — {e['data']['services'][0]}")

# ── Service Provider Applications ──────────────────────────────────

providers = [
    {"email": "nyc-transport@traveloure.test", "data": {
        "business_name": "Metro Black Car Service", "name": "Anthony Rossi",
        "email": "nyc-transport@traveloure.test", "mobile": "+12125551234", "whatsapp": "+12125551234",
        "country": "USA", "address": "450 West 33rd Street, New York, NY 10001",
        "gst": "US-EIN-12-3456789", "business_type": "Transportation",
        "service_offers": ["Airport Transfer (JFK/LGA/EWR)", "Manhattan Black Car", "Day Trips to Hamptons", "Corporate Shuttle", "Night Out Driver"],
        "description": "NYC's reliable black car service. Town cars, SUVs, and sprinter vans. Airport pickups with flight tracking, Manhattan rides in under 10 minutes, and day trips upstate or to the Hamptons.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "nyc-photography@traveloure.test", "data": {
        "business_name": "Gotham Lens Photography", "name": "Mia Park",
        "email": "nyc-photography@traveloure.test", "mobile": "+12125559876", "whatsapp": "+12125559876",
        "country": "USA", "address": "88 Fulton Street, DUMBO, Brooklyn, NY 11201",
        "gst": "US-EIN-98-7654321", "business_type": "Photography",
        "service_offers": ["Couple Photoshoot", "Brooklyn Bridge Session", "Central Park Portrait", "Proposal Photography", "Instagram Tour", "Rooftop Shoot"],
        "description": "NYC through my lens. Brooklyn Bridge at sunrise, Central Park in fall, Times Square at midnight. 8 years shooting the city — I know every angle, every light, every secret spot.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "nyc-stays@traveloure.test", "data": {
        "business_name": "NYC Curated Stays", "name": "David Thompson",
        "email": "nyc-stays@traveloure.test", "mobile": "+12125553456", "whatsapp": "+12125553456",
        "country": "USA", "address": "120 East 56th Street, New York, NY 10022",
        "gst": "US-EIN-45-6789012", "business_type": "Accommodation",
        "service_offers": ["Midtown Luxury Apartment", "SoHo Loft", "Brooklyn Brownstone", "Budget Studio", "Central Park View Suite", "Long-Stay Discounts"],
        "description": "Hand-picked NYC apartments in the best neighborhoods. SoHo lofts with exposed brick, Midtown suites walking distance to Broadway, Brooklyn brownstones with rooftop views. Better than hotels, at better prices.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "nyc-luxury@traveloure.test", "data": {
        "business_name": "Laurent NYC Concierge", "name": "Olivia Laurent",
        "email": "nyc-luxury@traveloure.test", "mobile": "+12125557890", "whatsapp": "+12125557890",
        "country": "USA", "address": "One World Trade Center, New York, NY 10007",
        "gst": "US-EIN-67-8901234", "business_type": "Luxury Concierge",
        "service_offers": ["Private Helicopter Tour", "Michelin Restaurant Reservations", "VIP Broadway Tickets", "Yacht Charter", "Personal Shopper (5th Ave)", "Penthouse Party Planning"],
        "description": "New York's most exclusive experiences. Helicopter tours over Manhattan, impossible dinner reservations, front-row Broadway seats, and yacht parties on the Hudson. If you can dream it in NYC, I can make it happen.",
        "instant_booking": False, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "nyc-events@traveloure.test", "data": {
        "business_name": "Brooklyn Events Co", "name": "Tyler Brooks",
        "email": "nyc-events@traveloure.test", "mobile": "+12125554567", "whatsapp": "+12125554567",
        "country": "USA", "address": "250 Wythe Avenue, Williamsburg, Brooklyn, NY 11249",
        "gst": "US-EIN-23-4567890", "business_type": "Events & Experiences",
        "service_offers": ["Rooftop Dinner Party", "Brooklyn Brewery Tour", "Live Music Night", "Art Gallery Opening", "Cooking Class", "Team Building Events"],
        "description": "Curated NYC experiences beyond the guidebook. Rooftop dinners with skyline views, brewery crawls in Williamsburg, secret comedy shows, and art openings in Bushwick. We create memories, not itineraries.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
]

print("\n── Creating service provider applications ──")
for p in providers:
    user = User.objects.get(email=p["email"])
    if ServiceProviderForm.objects.filter(user=user).exists():
        print(f"  Exists: {p['data']['business_name']}")
        continue
    data = p["data"].copy()
    data["user"] = user
    ServiceProviderForm.objects.create(**data)
    print(f"  Created: {data['business_name']}")

# ── Summary ──────────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"NYC Market Summary:")
print(f"  Accounts: {User.objects.filter(city='New York').count()}")
print(f"  Local Experts: {LocalExpertForm.objects.filter(user__city='New York', status='approved').count()}")
print(f"  Service Providers: {ServiceProviderForm.objects.filter(user__city='New York', status='approved').count()}")
print(f"\nPlatform Totals:")
print(f"  Total users: {User.objects.count()}")
print(f"  Total experts: {LocalExpertForm.objects.filter(status='approved').count()}")
print(f"  Total SPs: {ServiceProviderForm.objects.filter(status='approved').count()}")
