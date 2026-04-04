"""
Seed script for 45 Traveloure test accounts.
Run via: docker compose exec web python manage.py shell < seed_test_accounts.py
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

from django.contrib.auth import get_user_model
User = get_user_model()

PASSWORD = "TestPass123!"

accounts = [
    # Original 5
    {"email": "test-travel-expert@traveloure.test", "username": "test-travel-expert", "first_name": "Travel", "last_name": "Expert", "is_local_expert": True},
    {"email": "test-local-expert@traveloure.test", "username": "test-local-expert", "first_name": "Local", "last_name": "Expert", "is_local_expert": True},
    {"email": "test-event-planner@traveloure.test", "username": "test-event-planner", "first_name": "Event", "last_name": "Planner"},
    {"email": "test-provider@traveloure.test", "username": "test-provider", "first_name": "Test", "last_name": "Provider", "is_service_provider": True},
    {"email": "test-ea@traveloure.test", "username": "test-ea", "first_name": "Test", "last_name": "EA"},

    # Kyoto - Local Experts
    {"email": "kyoto-temple-guide@traveloure.test", "username": "kyoto-temple-guide", "first_name": "Yuki", "last_name": "Tanaka", "city": "Kyoto", "country": "Japan", "is_local_expert": True},
    {"email": "kyoto-traditional-arts@traveloure.test", "username": "kyoto-trad-arts", "first_name": "Haruki", "last_name": "Sato", "city": "Kyoto", "country": "Japan", "is_local_expert": True},
    {"email": "kyoto-food@traveloure.test", "username": "kyoto-food", "first_name": "Aiko", "last_name": "Yamamoto", "city": "Kyoto", "country": "Japan", "is_local_expert": True},
    {"email": "kyoto-neighborhood@traveloure.test", "username": "kyoto-neighborhood", "first_name": "Kenji", "last_name": "Nakamura", "city": "Kyoto", "country": "Japan", "is_local_expert": True},
    {"email": "kyoto-etiquette@traveloure.test", "username": "kyoto-etiquette", "first_name": "Mei", "last_name": "Kobayashi", "city": "Kyoto", "country": "Japan", "is_local_expert": True},
    # Kyoto - Service Providers
    {"email": "kyoto-transport@traveloure.test", "username": "kyoto-transport", "first_name": "Takeshi", "last_name": "Ito", "city": "Kyoto", "country": "Japan", "is_service_provider": True},
    {"email": "kyoto-photography@traveloure.test", "username": "kyoto-photography", "first_name": "Sakura", "last_name": "Watanabe", "city": "Kyoto", "country": "Japan", "is_service_provider": True},
    {"email": "kyoto-stays@traveloure.test", "username": "kyoto-stays", "first_name": "Ryo", "last_name": "Suzuki", "city": "Kyoto", "country": "Japan", "is_service_provider": True},

    # Edinburgh - Local Experts
    {"email": "edinburgh-culture@traveloure.test", "username": "edinburgh-culture", "first_name": "Alistair", "last_name": "MacGregor", "city": "Edinburgh", "country": "UK", "is_local_expert": True},
    {"email": "edinburgh-whisky@traveloure.test", "username": "edinburgh-whisky", "first_name": "Fiona", "last_name": "Campbell", "city": "Edinburgh", "country": "UK", "is_local_expert": True},
    {"email": "edinburgh-festival@traveloure.test", "username": "edinburgh-festival", "first_name": "Hamish", "last_name": "Stewart", "city": "Edinburgh", "country": "UK", "is_local_expert": True},
    {"email": "edinburgh-highlands@traveloure.test", "username": "edinburgh-highlands", "first_name": "Morag", "last_name": "Fraser", "city": "Edinburgh", "country": "UK", "is_local_expert": True},
    # Edinburgh - Service Providers
    {"email": "edinburgh-transport@traveloure.test", "username": "edinburgh-transport", "first_name": "Angus", "last_name": "MacDonald", "city": "Edinburgh", "country": "UK", "is_service_provider": True},
    {"email": "edinburgh-photography@traveloure.test", "username": "edinburgh-photo", "first_name": "Isla", "last_name": "Robertson", "city": "Edinburgh", "country": "UK", "is_service_provider": True},
    {"email": "edinburgh-stays@traveloure.test", "username": "edinburgh-stays", "first_name": "Duncan", "last_name": "Murray", "city": "Edinburgh", "country": "UK", "is_service_provider": True},

    # Cartagena - Local Experts
    {"email": "cartagena-romance@traveloure.test", "username": "cartagena-romance", "first_name": "Valentina", "last_name": "Herrera", "city": "Cartagena", "country": "Colombia", "is_local_expert": True},
    {"email": "cartagena-culture@traveloure.test", "username": "cartagena-culture", "first_name": "Miguel", "last_name": "Castillo", "city": "Cartagena", "country": "Colombia", "is_local_expert": True},
    {"email": "cartagena-food@traveloure.test", "username": "cartagena-food", "first_name": "Sofia", "last_name": "Vargas", "city": "Cartagena", "country": "Colombia", "is_local_expert": True},
    {"email": "cartagena-beach@traveloure.test", "username": "cartagena-beach", "first_name": "Diego", "last_name": "Morales", "city": "Cartagena", "country": "Colombia", "is_local_expert": True},
    # Cartagena - Service Providers
    {"email": "cartagena-transport@traveloure.test", "username": "cartagena-transport", "first_name": "Andres", "last_name": "Reyes", "city": "Cartagena", "country": "Colombia", "is_service_provider": True},
    {"email": "cartagena-photography@traveloure.test", "username": "cartagena-photo", "first_name": "Camila", "last_name": "Torres", "city": "Cartagena", "country": "Colombia", "is_service_provider": True},
    {"email": "cartagena-stays@traveloure.test", "username": "cartagena-stays", "first_name": "Juan", "last_name": "Ospina", "city": "Cartagena", "country": "Colombia", "is_service_provider": True},
    {"email": "cartagena-luxury@traveloure.test", "username": "cartagena-luxury", "first_name": "Isabella", "last_name": "Mendoza", "city": "Cartagena", "country": "Colombia", "is_service_provider": True},
    {"email": "cartagena-concierge@traveloure.test", "username": "cartagena-concierge", "first_name": "Carlos", "last_name": "Rivera", "city": "Cartagena", "country": "Colombia", "is_service_provider": True},

    # Jaipur - Local Experts
    {"email": "jaipur-artisan@traveloure.test", "username": "jaipur-artisan", "first_name": "Priya", "last_name": "Sharma", "city": "Jaipur", "country": "India", "is_local_expert": True},
    {"email": "jaipur-culture@traveloure.test", "username": "jaipur-culture", "first_name": "Arjun", "last_name": "Singh", "city": "Jaipur", "country": "India", "is_local_expert": True},
    {"email": "jaipur-food@traveloure.test", "username": "jaipur-food", "first_name": "Deepa", "last_name": "Gupta", "city": "Jaipur", "country": "India", "is_local_expert": True},
    {"email": "jaipur-photography@traveloure.test", "username": "jaipur-photography", "first_name": "Vikram", "last_name": "Rathore", "city": "Jaipur", "country": "India", "is_local_expert": True},
    # Jaipur - Service Providers
    {"email": "jaipur-transport@traveloure.test", "username": "jaipur-transport", "first_name": "Ravi", "last_name": "Kumar", "city": "Jaipur", "country": "India", "is_service_provider": True},
    {"email": "jaipur-photo-service@traveloure.test", "username": "jaipur-photo-svc", "first_name": "Ananya", "last_name": "Mehra", "city": "Jaipur", "country": "India", "is_service_provider": True},
    {"email": "jaipur-stays@traveloure.test", "username": "jaipur-stays", "first_name": "Manish", "last_name": "Joshi", "city": "Jaipur", "country": "India", "is_service_provider": True},
    {"email": "jaipur-shopping@traveloure.test", "username": "jaipur-shopping", "first_name": "Neha", "last_name": "Agarwal", "city": "Jaipur", "country": "India", "is_service_provider": True},

    # Porto - Local Experts
    {"email": "porto-wine@traveloure.test", "username": "porto-wine", "first_name": "Joao", "last_name": "Ferreira", "city": "Porto", "country": "Portugal", "is_local_expert": True},
    {"email": "porto-architecture@traveloure.test", "username": "porto-architecture", "first_name": "Ana", "last_name": "Silva", "city": "Porto", "country": "Portugal", "is_local_expert": True},
    {"email": "porto-food@traveloure.test", "username": "porto-food", "first_name": "Pedro", "last_name": "Costa", "city": "Porto", "country": "Portugal", "is_local_expert": True},
    {"email": "porto-digital-nomad@traveloure.test", "username": "porto-digital-nomad", "first_name": "Mariana", "last_name": "Santos", "city": "Porto", "country": "Portugal", "is_local_expert": True},
    # Porto - Service Providers
    {"email": "porto-transport@traveloure.test", "username": "porto-transport", "first_name": "Tiago", "last_name": "Oliveira", "city": "Porto", "country": "Portugal", "is_service_provider": True},
    {"email": "porto-photography@traveloure.test", "username": "porto-photography", "first_name": "Ines", "last_name": "Pereira", "city": "Porto", "country": "Portugal", "is_service_provider": True},
    {"email": "porto-stays@traveloure.test", "username": "porto-stays", "first_name": "Miguel", "last_name": "Almeida", "city": "Porto", "country": "Portugal", "is_service_provider": True},
    {"email": "porto-winery@traveloure.test", "username": "porto-winery", "first_name": "Helena", "last_name": "Rodrigues", "city": "Porto", "country": "Portugal", "is_service_provider": True},
]

created = 0
skipped = 0

for acct in accounts:
    email = acct.pop("email")
    username = acct.pop("username")
    first_name = acct.pop("first_name")
    last_name = acct.pop("last_name", "")
    
    if User.objects.filter(email=email).exists():
        skipped += 1
        continue
    
    user = User.objects.create_user(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        password=PASSWORD,
        is_active=True,
        is_email_verified=True,
        **{k: v for k, v in acct.items()}
    )
    created += 1

print(f"\n✅ Done! Created: {created} | Skipped (already exist): {skipped} | Total in DB: {User.objects.count()}")
