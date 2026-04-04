"""Seed service provider applications for all SP test accounts."""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

from django.contrib.auth import get_user_model
from authentication.models import ServiceProviderForm
User = get_user_model()

providers = [
    # Kyoto
    {"email": "kyoto-photography@traveloure.test", "data": {
        "business_name": "Sakura Lens Photography", "name": "Sakura Watanabe",
        "email": "kyoto-photography@traveloure.test", "mobile": "+81901112233", "whatsapp": "+81901112233",
        "country": "Japan", "address": "45 Gion-machi, Higashiyama-ku, Kyoto",
        "gst": "JP9876543210", "business_type": "Photography",
        "service_offers": ["Vacation Photography", "Temple Photoshoots", "Couple Sessions", "Group Tours"],
        "description": "Professional travel photography in Kyoto. Capture your memories at temples, bamboo groves, and hidden gardens. 10+ years experience.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "kyoto-stays@traveloure.test", "data": {
        "business_name": "Suzuki Ryokan & Stays", "name": "Ryo Suzuki",
        "email": "kyoto-stays@traveloure.test", "mobile": "+81903334455", "whatsapp": "+81903334455",
        "country": "Japan", "address": "12 Nishijin, Kamigyo-ku, Kyoto",
        "gst": "JP5544332211", "business_type": "Accommodation",
        "service_offers": ["Traditional Ryokan", "Machiya Townhouse", "Budget Guesthouse", "Luxury Suite"],
        "description": "Authentic Kyoto stays. Traditional ryokan with tatami rooms, onsen baths, and kaiseki breakfast. Also modern machiya townhouses.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    # Edinburgh
    {"email": "edinburgh-transport@traveloure.test", "data": {
        "business_name": "Highland Express", "name": "Angus MacDonald",
        "email": "edinburgh-transport@traveloure.test", "mobile": "+441311234567", "whatsapp": "+441311234567",
        "country": "UK", "address": "88 Royal Mile, Edinburgh EH1 1SB",
        "gst": "GB123456789", "business_type": "Transportation",
        "service_offers": ["Airport Transfers", "Highland Day Trips", "Castle Route Tours", "Private Chauffeur"],
        "description": "Premium transport across Edinburgh and the Scottish Highlands. Luxury vehicles, local drivers who double as guides.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "edinburgh-photography@traveloure.test", "data": {
        "business_name": "Edinburgh Frames", "name": "Isla Robertson",
        "email": "edinburgh-photography@traveloure.test", "mobile": "+441319876543", "whatsapp": "+441319876543",
        "country": "UK", "address": "15 Grassmarket, Edinburgh EH1 2HS",
        "gst": "GB987654321", "business_type": "Photography",
        "service_offers": ["Portrait Sessions", "Wedding Photography", "City Tour Photography", "Event Coverage"],
        "description": "Capturing Edinburgh's magic. From Arthur's Seat sunrises to Old Town alleys. Professional photography for travelers and couples.",
        "instant_booking": False, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "edinburgh-stays@traveloure.test", "data": {
        "business_name": "Murray's Edinburgh Lodges", "name": "Duncan Murray",
        "email": "edinburgh-stays@traveloure.test", "mobile": "+441315556677", "whatsapp": "+441315556677",
        "country": "UK", "address": "22 New Town, Edinburgh EH2 4PH",
        "gst": "GB112233445", "business_type": "Accommodation",
        "service_offers": ["City Center Flats", "Georgian Townhouse", "Budget Hostel", "Luxury Apartment"],
        "description": "Hand-picked Edinburgh stays in the heart of the city. Georgian elegance meets modern comfort. Walking distance to everything.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    # Cartagena
    {"email": "cartagena-transport@traveloure.test", "data": {
        "business_name": "Caribe Rides", "name": "Andres Reyes",
        "email": "cartagena-transport@traveloure.test", "mobile": "+573001234567", "whatsapp": "+573001234567",
        "country": "Colombia", "address": "Calle 35 #4-20, Centro Historico, Cartagena",
        "gst": "CO900123456", "business_type": "Transportation",
        "service_offers": ["Airport Pickup", "Island Hopping Boats", "City Tours", "Rosario Islands Transfer"],
        "description": "Cartagena transport made easy. Boats to the islands, AC vehicles through the city, and airport pickups with cold towels.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "cartagena-photography@traveloure.test", "data": {
        "business_name": "Foto Caribe", "name": "Camila Torres",
        "email": "cartagena-photography@traveloure.test", "mobile": "+573009876543", "whatsapp": "+573009876543",
        "country": "Colombia", "address": "Plaza Santo Domingo, Cartagena",
        "gst": "CO900654321", "business_type": "Photography",
        "service_offers": ["Couple Photoshoots", "Old Town Sessions", "Beach Photography", "Sunset Shoots"],
        "description": "Colorful Cartagena through my lens. Vibrant streets, romantic balconies, and Caribbean sunsets. Your memories, beautifully captured.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "cartagena-stays@traveloure.test", "data": {
        "business_name": "Casa Colonial Stays", "name": "Juan Ospina",
        "email": "cartagena-stays@traveloure.test", "mobile": "+573005551234", "whatsapp": "+573005551234",
        "country": "Colombia", "address": "Calle del Arsenal #8B-55, Getsemani, Cartagena",
        "gst": "CO900789012", "business_type": "Accommodation",
        "service_offers": ["Colonial Boutique Hotel", "Rooftop Apartment", "Budget Room", "Luxury Villa with Pool"],
        "description": "Stay in the soul of Cartagena. Restored colonial houses in Getsemani and the walled city. Rooftop pools, courtyards, and Caribbean vibes.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "cartagena-luxury@traveloure.test", "data": {
        "business_name": "Lujo Cartagena", "name": "Isabella Mendoza",
        "email": "cartagena-luxury@traveloure.test", "mobile": "+573007778899", "whatsapp": "+573007778899",
        "country": "Colombia", "address": "Bocagrande, Carrera 1 #5-50, Cartagena",
        "gst": "CO900345678", "business_type": "Luxury Concierge",
        "service_offers": ["Yacht Charter", "Private Chef", "VIP Nightlife", "Luxury Villa Rental"],
        "description": "Cartagena's premier luxury concierge. Yachts, private chefs, VIP access, and the finest villas. We make the impossible happen.",
        "instant_booking": False, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "cartagena-concierge@traveloure.test", "data": {
        "business_name": "Rivera Concierge Services", "name": "Carlos Rivera",
        "email": "cartagena-concierge@traveloure.test", "mobile": "+573002223344", "whatsapp": "+573002223344",
        "country": "Colombia", "address": "Hotel Santa Clara, Cartagena",
        "gst": "CO900567890", "business_type": "Concierge",
        "service_offers": ["Restaurant Reservations", "Event Planning", "Personal Shopping", "Custom Experiences"],
        "description": "Your personal concierge in Cartagena. From impossible dinner reservations to surprise proposals, I handle it all.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    # Jaipur
    {"email": "jaipur-transport@traveloure.test", "data": {
        "business_name": "Royal Rajasthan Rides", "name": "Ravi Kumar",
        "email": "jaipur-transport@traveloure.test", "mobile": "+919876543210", "whatsapp": "+919876543210",
        "country": "India", "address": "MI Road, Jaipur 302001, Rajasthan",
        "gst": "08AABCU9603R1ZM", "business_type": "Transportation",
        "service_offers": ["Airport Transfer", "Jaipur City Tour", "Rajasthan Circuit", "Camel Safari Transport"],
        "description": "Royal rides through the Pink City and beyond. AC SUVs, vintage cars for special occasions, and drivers who know every fort and palace.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "jaipur-photo-service@traveloure.test", "data": {
        "business_name": "Pink City Photography", "name": "Ananya Mehra",
        "email": "jaipur-photo-service@traveloure.test", "mobile": "+919876111222", "whatsapp": "+919876111222",
        "country": "India", "address": "Hawa Mahal Road, Jaipur 302002",
        "gst": "08BBCDU1234R1ZN", "business_type": "Photography",
        "service_offers": ["Palace Photoshoots", "Traditional Dress Sessions", "Couple Photography", "Festival Coverage"],
        "description": "Jaipur in all its glory. Shoot at Amber Fort, Hawa Mahal, and hidden stepwells. Traditional Rajasthani outfits available for shoots.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "jaipur-stays@traveloure.test", "data": {
        "business_name": "Haveli Heritage Stays", "name": "Manish Joshi",
        "email": "jaipur-stays@traveloure.test", "mobile": "+919876333444", "whatsapp": "+919876333444",
        "country": "India", "address": "Nahargarh Road, Jaipur 302001",
        "gst": "08CCDEU5678R1ZO", "business_type": "Accommodation",
        "service_offers": ["Heritage Haveli", "Palace Hotel", "Budget Guesthouse", "Rooftop Suite"],
        "description": "Sleep like royalty in Jaipur. Restored havelis with courtyard pools, palace hotels with peacock gardens, and rooftop views of the fort.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "jaipur-shopping@traveloure.test", "data": {
        "business_name": "Rajasthan Bazaar Guide", "name": "Neha Agarwal",
        "email": "jaipur-shopping@traveloure.test", "mobile": "+919876555666", "whatsapp": "+919876555666",
        "country": "India", "address": "Johari Bazaar, Jaipur 302003",
        "gst": "08DDEFU9012R1ZP", "business_type": "Shopping Guide",
        "service_offers": ["Jewelry Shopping Tour", "Textile Market Guide", "Handicraft Workshops", "Custom Tailoring"],
        "description": "Navigate Jaipur's legendary bazaars like a local. Gemstones, block-printed textiles, blue pottery, and no tourist markups.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    # Porto
    {"email": "porto-transport@traveloure.test", "data": {
        "business_name": "Porto Rides", "name": "Tiago Oliveira",
        "email": "porto-transport@traveloure.test", "mobile": "+351912345678", "whatsapp": "+351912345678",
        "country": "Portugal", "address": "Rua de Santa Catarina 112, Porto",
        "gst": "PT509876543", "business_type": "Transportation",
        "service_offers": ["Airport Transfer", "Douro Valley Day Trip", "City Tuk-Tuk Tour", "Private Driver"],
        "description": "See Porto and the Douro Valley in comfort. From riverside tuk-tuk tours to vineyard visits in the valley. English and French spoken.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "porto-photography@traveloure.test", "data": {
        "business_name": "Porto Moments", "name": "Ines Pereira",
        "email": "porto-photography@traveloure.test", "mobile": "+351919876543", "whatsapp": "+351919876543",
        "country": "Portugal", "address": "Ribeira, Porto",
        "gst": "PT501234567", "business_type": "Photography",
        "service_offers": ["Ribeira Photoshoot", "Port Wine Cellar Sessions", "Couple Photography", "Azulejo Tile Backdrops"],
        "description": "Porto's beauty through my camera. Dom Luis Bridge at sunset, colorful Ribeira streets, and intimate port wine cellar sessions.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "porto-stays@traveloure.test", "data": {
        "business_name": "Almeida Guesthouses", "name": "Miguel Almeida",
        "email": "porto-stays@traveloure.test", "mobile": "+351915551234", "whatsapp": "+351915551234",
        "country": "Portugal", "address": "Rua das Flores 45, Porto",
        "gst": "PT505678901", "business_type": "Accommodation",
        "service_offers": ["Ribeira Apartment", "Azulejo-Tiled Suite", "Budget Room", "Douro View Penthouse"],
        "description": "Stay in Porto's soul. Riverside apartments, tile-covered suites in the old town, and penthouses with Douro views. All hand-curated.",
        "instant_booking": True, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
    {"email": "porto-winery@traveloure.test", "data": {
        "business_name": "Rodrigues Wine Experiences", "name": "Helena Rodrigues",
        "email": "porto-winery@traveloure.test", "mobile": "+351917778899", "whatsapp": "+351917778899",
        "country": "Portugal", "address": "Vila Nova de Gaia, Porto",
        "gst": "PT509012345", "business_type": "Wine Tourism",
        "service_offers": ["Port Wine Tasting", "Cellar Tours", "Douro Valley Vineyard Visit", "Wine & Cheese Pairing"],
        "description": "Portugal's finest wines, guided by a certified sommelier. Port cellars in Gaia, quintas in the Douro, and private tastings you won't find online.",
        "instant_booking": False, "t_and_c": True, "info_confirmation": True, "contact_request": True, "status": "approved"
    }},
]

created = 0
skipped = 0
for p in providers:
    user = User.objects.get(email=p["email"])
    if ServiceProviderForm.objects.filter(user=user).exists():
        skipped += 1
        continue
    data = p["data"].copy()
    data["user"] = user
    ServiceProviderForm.objects.create(**data)
    created += 1
    print(f"  Created: {data['business_name']} ({user.city}, {user.country})")

print(f"\n✅ SP Applications: {created} created, {skipped} skipped")
print(f"Total approved SPs: {ServiceProviderForm.objects.filter(status='approved').count()}")
