"""Seed categories and affiliate platforms."""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

from ai_itinerary.models import TouristPlaceCategory, AffiliatePlatform
from django.utils import timezone

# Categories
categories = [
    "Beach", "Mountain", "Historical", "Cultural", "Adventure",
    "Wildlife", "Religious", "Food & Cuisine", "Nightlife", "Shopping",
    "Nature", "Architecture", "Museums", "Festivals",
]
cat_created = 0
for name in categories:
    _, created = TouristPlaceCategory.objects.get_or_create(name=name)
    if created: cat_created += 1
print(f"Categories: {cat_created} created, {len(categories) - cat_created} existed")

# Affiliate Platforms
platforms = [
    {"title": "Booking.com", "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png", "platform": "hotel", "base_url": "https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults=2&no_rooms=1"},
    {"title": "Expedia.com", "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png", "platform": "hotel", "base_url": "https://www.expedia.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&rooms=1&adults=2"},
    {"title": "Hotels.com", "image_url": "https://i.postimg.cc/TY7hvsST/hotels-imageeeee.png", "platform": "hotel", "base_url": "https://www.hotels.com/Hotel-Search?destination={city}&d1={checkin}&d2={checkout}&adults=2&rooms=1"},
    {"title": "Booking.com Car Rentals", "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png", "platform": "car", "base_url": "https://www.booking.com/cars/index.html?ss={city}&pickup_date={pickup_date}&dropoff_date={return_date}"},
    {"title": "Expedia Car Rentals", "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png", "platform": "car", "base_url": "https://www.expedia.com/carsearch?date1={pickup_date}&date2={return_date}&locn={city}"},
    {"title": "RentalCars.com", "image_url": "https://i.postimg.cc/Kv6STr3n/car-rental-image.png", "platform": "car", "base_url": "https://www.rentalcars.com/search?locationName={city}&pickUpDate={pickup_date}&dropOffDate={return_date}"},
    {"title": "Expedia Flights", "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png", "platform": "flight", "base_url": "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}"},
    {"title": "Booking.com Flights", "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png", "platform": "flight", "base_url": "https://flights.booking.com/fly-anywhere/?type=ONEWAY&adults=1&from={origin}&to={destination}&depart={depart}"},
    {"title": "Kiwi.com Flights", "image_url": "https://i.postimg.cc/2y5mHkCh/kiwi-image.png", "platform": "flight", "base_url": "https://www.kiwi.com/en/search/tiles/{origin}/{destination}/anytime/no-return"},
]
plat_created = 0
for p in platforms:
    _, created = AffiliatePlatform.objects.get_or_create(
        title=p['title'],
        defaults={
            'image_url': p['image_url'],
            'platform': p['platform'],
            'base_url': p['base_url']
        }
    )
    if created: plat_created += 1
print(f"Affiliate platforms: {plat_created} created, {len(platforms) - plat_created} existed")

# Verify plans exist
from subscription.models import Plan
plans = Plan.objects.all()
print(f"Plans in DB: {', '.join([f'{p.plan_name} (${p.amount})' for p in plans])}")
