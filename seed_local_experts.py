"""Seed local expert applications for all expert test accounts."""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

from django.contrib.auth import get_user_model
from authentication.models import LocalExpertForm
User = get_user_model()

experts = [
    # Kyoto (temple-guide, food already created)
    {"email": "kyoto-traditional-arts@traveloure.test", "data": {
        "languages": ["English", "Japanese"], "years_in_city": 12,
        "short_bio": "Master of ikebana, calligraphy, and kimono dressing. I bring ancient arts to life for modern travelers.",
        "services": ["Ikebana Workshop", "Calligraphy Class", "Kimono Experience", "Geisha District Tour"],
        "service_availability": 15, "price_expectation": 60,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "kyoto-neighborhood@traveloure.test", "data": {
        "languages": ["English", "Japanese"], "years_in_city": 25,
        "short_bio": "Third-generation Kyoto resident. I know every alley, every shop, every secret garden in this city.",
        "services": ["Neighborhood Walking Tour", "Local Market Tour", "Hidden Temples Tour", "Evening Stroll"],
        "service_availability": 30, "price_expectation": 35,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "kyoto-etiquette@traveloure.test", "data": {
        "languages": ["English", "Japanese", "Mandarin"], "years_in_city": 8,
        "short_bio": "Cultural etiquette coach. Learn to navigate Japanese customs with confidence — from onsen rules to temple manners.",
        "services": ["Etiquette Workshop", "Onsen Guide", "Business Culture Briefing", "Temple Manners Tour"],
        "service_availability": 20, "price_expectation": 45,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    # Edinburgh
    {"email": "edinburgh-whisky@traveloure.test", "data": {
        "languages": ["English"], "years_in_city": 18,
        "short_bio": "Certified whisky ambassador. From smoky Islay malts to smooth Speyside singles, I'll find your perfect dram.",
        "services": ["Whisky Tasting Experience", "Distillery Tour", "Whisky & Food Pairing", "Private Tasting"],
        "service_availability": 25, "price_expectation": 55,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "edinburgh-festival@traveloure.test", "data": {
        "languages": ["English", "French"], "years_in_city": 15,
        "short_bio": "Edinburgh Festival insider. Fringe, International, Book — I know which shows to see and which queues to skip.",
        "services": ["Festival Guide", "Show Curation", "Backstage Access", "Late-Night Comedy Tour"],
        "service_availability": 30, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "edinburgh-highlands@traveloure.test", "data": {
        "languages": ["English", "Scottish Gaelic"], "years_in_city": 30,
        "short_bio": "Born in the Highlands, based in Edinburgh. Glens, lochs, and castles — I know the land like the back of my hand.",
        "services": ["Highlands Day Trip", "Loch Ness Tour", "Castle Circuit", "Wild Camping Guide"],
        "service_availability": 20, "price_expectation": 65,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    # Cartagena
    {"email": "cartagena-romance@traveloure.test", "data": {
        "languages": ["English", "Spanish"], "years_in_city": 10,
        "short_bio": "Cartagena romance specialist. Proposals, anniversaries, honeymoons — I create unforgettable moments in the most romantic city in South America.",
        "services": ["Romantic Dinner Setup", "Proposal Planning", "Couples City Tour", "Sunset Boat Cruise"],
        "service_availability": 15, "price_expectation": 75,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "cartagena-culture@traveloure.test", "data": {
        "languages": ["English", "Spanish", "Portuguese"], "years_in_city": 20,
        "short_bio": "Cartagena historian and storyteller. 500 years of pirates, colonialism, and resilience — told through the city's walls and streets.",
        "services": ["Historical Walking Tour", "Palenque Cultural Visit", "Street Art Tour", "Colonial Architecture Tour"],
        "service_availability": 25, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "cartagena-food@traveloure.test", "data": {
        "languages": ["English", "Spanish"], "years_in_city": 15,
        "short_bio": "Caribbean flavors are my obsession. Ceviche to coconut rice, street food to fine dining — taste the real Cartagena.",
        "services": ["Street Food Tour", "Cooking Class", "Market Tour", "Fine Dining Guide"],
        "service_availability": 20, "price_expectation": 45,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "cartagena-beach@traveloure.test", "data": {
        "languages": ["English", "Spanish"], "years_in_city": 12,
        "short_bio": "Beach expert and island hopper. I know every secret beach, snorkeling spot, and beach bar from Baru to the Rosarios.",
        "services": ["Island Hopping Tour", "Snorkeling Guide", "Beach Day Planning", "Playa Blanca VIP"],
        "service_availability": 30, "price_expectation": 50,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    # Jaipur
    {"email": "jaipur-artisan@traveloure.test", "data": {
        "languages": ["English", "Hindi", "Rajasthani"], "years_in_city": 22,
        "short_bio": "Jaipur artisan advocate. Block printing, gem cutting, miniature painting — meet the hands that keep Rajasthan's crafts alive.",
        "services": ["Artisan Workshop Visit", "Block Printing Class", "Gem Cutting Demo", "Miniature Painting Lesson"],
        "service_availability": 20, "price_expectation": 35,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "jaipur-culture@traveloure.test", "data": {
        "languages": ["English", "Hindi"], "years_in_city": 18,
        "short_bio": "Rajput history nerd and palace fanatic. Every fort has a story, every palace has a secret. Let me tell you both.",
        "services": ["Palace Tour", "Fort Circuit", "Royal History Walk", "Elephant Village Visit"],
        "service_availability": 25, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "jaipur-food@traveloure.test", "data": {
        "languages": ["English", "Hindi"], "years_in_city": 15,
        "short_bio": "Jaipur's food scene from dal baati churma to modern fusion. I know every dhaba, every rooftop, every hidden gem.",
        "services": ["Street Food Tour", "Thali Experience", "Cooking Class", "Rooftop Dinner Guide"],
        "service_availability": 20, "price_expectation": 30,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "jaipur-photography@traveloure.test", "data": {
        "languages": ["English", "Hindi", "French"], "years_in_city": 10,
        "short_bio": "Jaipur through the lens. Pink walls, blue doors, golden light — I know exactly when and where to shoot for magic.",
        "services": ["Photography Tour", "Sunrise Fort Shoot", "Portrait Session", "Instagram Spot Guide"],
        "service_availability": 25, "price_expectation": 45,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    # Porto
    {"email": "porto-wine@traveloure.test", "data": {
        "languages": ["English", "Portuguese", "Spanish"], "years_in_city": 20,
        "short_bio": "Porto native and wine obsessive. From port cellars in Gaia to quintas in the Douro — I know every vintage worth tasting.",
        "services": ["Port Wine Tasting", "Douro Valley Tour", "Wine & Cheese Evening", "Cellar Crawl"],
        "service_availability": 25, "price_expectation": 55,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "porto-architecture@traveloure.test", "data": {
        "languages": ["English", "Portuguese"], "years_in_city": 15,
        "short_bio": "Architecture graduate turned guide. From azulejo tiles to Rem Koolhaas, Porto is an open-air museum and I'm your docent.",
        "services": ["Architecture Walking Tour", "Azulejo Trail", "Modern Porto Tour", "Bridges & Viewpoints"],
        "service_availability": 20, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "porto-food@traveloure.test", "data": {
        "languages": ["English", "Portuguese", "French"], "years_in_city": 12,
        "short_bio": "Francesinha fanatic and pastéis de nata purist. Porto eats from tascas to Michelin stars. Bring your appetite.",
        "services": ["Food Walking Tour", "Cooking Class", "Market & Tapas Tour", "Fine Dining Guide"],
        "service_availability": 20, "price_expectation": 40,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
    {"email": "porto-digital-nomad@traveloure.test", "data": {
        "languages": ["English", "Portuguese", "German"], "years_in_city": 5,
        "short_bio": "Digital nomad who chose Porto as home base. Best coworking spots, fast wifi cafes, and the expat community — I'll get you set up.",
        "services": ["Digital Nomad Setup Tour", "Coworking Space Guide", "Expat Community Intro", "Long-Stay Apartment Finding"],
        "service_availability": 30, "price_expectation": 35,
        "confirm_age": True, "t_and_c": True, "partnership": True, "status": "approved"
    }},
]

created = 0
for e in experts:
    user = User.objects.get(email=e["email"])
    if LocalExpertForm.objects.filter(user=user).exists():
        continue
    data = e["data"].copy()
    LocalExpertForm.objects.create(user=user, **data)
    created += 1
    print(f"  Created: {user.first_name} {user.last_name} ({user.city})")

print(f"\n✅ Expert applications: {created} created")
print(f"Total approved experts: {LocalExpertForm.objects.filter(status='approved').count()}")
