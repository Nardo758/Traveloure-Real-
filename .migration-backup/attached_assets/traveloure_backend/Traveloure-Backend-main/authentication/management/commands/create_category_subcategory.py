import uuid
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from authentication.models import Category, SubCategory

User = get_user_model()


class Command(BaseCommand):
    help = "Seed default categories and subcategories"

    def handle(self, *args, **options):
        data = [
            {
                "name": "Itinerary Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Quick Destination Overview (2-4 Days)",
                        "price": "15",
                        "is_default": True,
                        "description": "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip."
                    },
                    {
                        "name": "Short Trip Planning (3-5 Days)",
                        "price": "15",
                        "is_default": True,
                        "description": "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip."
                    },
                    {
                        "name": "Standard Trip Planning (6-9 Days)",
                        "price": "15",
                        "is_default": True,
                        "description": "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip."
                    },
                    {
                        "name": "Extended Trip Planning (10-14 Days)",
                        "price": "15",
                        "is_default": True,
                        "description": "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip."
                    },
                ],
            },
            {
                "name": "Customized Travel Experiences",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Adventure Travel Itinerary",
                        "price": "25",
                        "is_default": True,
                        "description": "Tailored itineraries for adventure seekers, including activities like hiking, rafting, and wildlife safaris."
                    },
                    {
                        "name": "Cultural Immersion Itinerary",
                        "price": "25",
                        "is_default": True,
                        "description": "Experience the local culture with visits to historical sites, traditional markets, and cultural performances."
                    },
                    {
                        "name": "Luxury Travel Itinerary",
                        "price": "25",
                        "is_default": True,
                        "description": "Indulge in luxury with high-end accommodations, fine dining, and exclusive experiences."
                    },
                    {
                        "name": "Family-Friendly Itinerary",
                        "price": "25",
                        "is_default": True,
                        "description": "Plan a trip that caters to all ages with family-friendly activities and accommodations."
                    },
                ],
            },
            {
                "name": "Specialized Travel Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Honeymoon Itinerary",
                        "price": "30",
                        "is_default": True,
                        "description": "Romantic getaways with special activities and accommodations for newlyweds."
                    },
                    {
                        "name": "Solo Travel Itinerary",
                        "price": "30",
                        "is_default": True,
                        "description": "Itineraries designed for solo travelers, focusing on safety, social opportunities, and personal growth."
                    },
                    {
                        "name": "Group Travel Itinerary",
                        "price": "30",
                        "is_default": True,
                        "description": "Coordinated plans for group travel, including group activities and accommodations."
                    },
                    {
                        "name": "Wellness Retreat Itinerary",
                        "price": "30",
                        "is_default": True,
                        "description": "Focus on relaxation and rejuvenation with spa visits, yoga sessions, and healthy dining options."
                    },
                ],
            },
            {
                "name": "Seasonal and Event-Based Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Holiday Season Itinerary",
                        "price": "20",
                        "is_default": True,
                        "description": "Plan trips around major holidays with festive activities and events."
                    },
                    {
                        "name": "Festival and Event Itinerary",
                        "price": "20",
                        "is_default": True,
                        "description": "Experience local festivals and events with tailored itineraries."
                    },
                    {
                        "name": "Off-Season Travel Itinerary",
                        "price": "20",
                        "is_default": True,
                        "description": "Discover destinations during off-peak times for a unique experience and fewer crowds."
                    },
                    {
                        "name": "Seasonal Activity Itinerary",
                        "price": "20",
                        "is_default": True,
                        "description": "Plan trips around seasonal activities like skiing in winter or beach vacations in summer."
                    },
                ],
            },
            {
                "name": "Budget Travel Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Backpacking Itinerary",
                        "price": "10",
                        "is_default": True,
                        "description": "Affordable travel plans for backpackers, including budget accommodations and low-cost activities."
                    },
                    {
                        "name": "Budget City Break Itinerary",
                        "price": "10",
                        "is_default": True,
                        "description": "Cost-effective city break itineraries focusing on free or low-cost attractions."
                    },
                    {
                        "name": "Economical Road Trip Itinerary",
                        "price": "10",
                        "is_default": True,
                        "description": "Plan a budget-friendly road trip with affordable lodging and dining options."
                    },
                    {
                        "name": "Affordable Family Vacation Itinerary",
                        "price": "10",
                        "is_default": True,
                        "description": "Family vacation plans that maximize fun while minimizing costs."
                    },
                ],
            },
            {
                "name": "Adventure & Outdoor Travel Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Extreme Sports Itinerary",
                        "price": "35",
                        "is_default": True,
                        "description": "Itineraries for thrill-seekers looking to engage in extreme sports like skydiving, bungee jumping, and paragliding."
                    },
                    {
                        "name": "Nature Exploration Itinerary",
                        "price": "35",
                        "is_default": True,
                        "description": "Explore natural wonders with hiking, camping, and wildlife observation activities."
                    },
                    {
                        "name": "Water Adventure Itinerary",
                        "price": "35",
                        "is_default": True,
                        "description": "Plan trips centered around water activities such as scuba diving, snorkeling, and kayaking."
                    },
                    {
                        "name": "Mountain Adventure Itinerary",
                        "price": "35",
                        "is_default": True,
                        "description": "Experience mountain adventures with trekking, climbing, and skiing options."
                    },
                ],
            },
            {
                "name": "Photography & Content Creation Travel Planning",
                "user": None,
                "is_default": True,
                "sub_category": [
                    {
                        "name": "Photography-Focused Itinerary",
                        "price": "40",
                        "is_default": True,
                        "description": "Itineraries designed for photographers, highlighting scenic locations and optimal times for photography."
                    },
                    {
                        "name": "Social Media Content Creation Itinerary",
                        "price": "40",
                        "is_default": True,
                        "description": "Plan trips that provide ample opportunities for creating engaging social media content."
                    },
                    {
                        "name": "Vlogging Travel Itinerary",
                        "price": "40",
                        "is_default": True,
                        "description": "Itineraries tailored for vloggers, focusing on visually appealing locations and unique experiences."
                    },
                    {
                        "name": "Cinematic Travel Itinerary",
                        "price": "40",
                        "is_default": True,
                        "description": "Create cinematic travel experiences with itineraries that emphasize storytelling and visual impact."
                    },
                ],
            },
        ]

        for cat_data in data:
            # --- Category creation or skip ---
            category = Category.objects.filter(
                name=cat_data["name"],
                is_default=True,
                user=None,
            ).first()

            if category:
                self.stdout.write(self.style.WARNING(f"Category exists: {category.name}"))
            else:
                category = Category.objects.create(
                    name=cat_data["name"],
                    is_default=True,
                    user=None,
                )
                self.stdout.write(self.style.SUCCESS(f"Created category: {category.name}"))

            for sub in cat_data.get("sub_category", []):
                subcategory = SubCategory.objects.filter(
                    category=category,
                    name=sub["name"],
                    price=sub["price"],
                    user=None,
                ).first()

                if subcategory:
                    self.stdout.write(f"  → Exists: {subcategory.name}")
                    continue

                subcategory = SubCategory.objects.create(
                    category=category,
                    name=sub["name"],
                    price=sub["price"],
                    is_default=sub["is_default"],
                    user=None,
                )

                self.stdout.write(self.style.SUCCESS(f"  → Created subcategory: {subcategory.name}"))


        self.stdout.write(self.style.SUCCESS("\n Categories and Subcategories seeding complete."))