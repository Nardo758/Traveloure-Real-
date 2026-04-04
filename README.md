# traveloure-backend

# TravlDna

## **Project Documentation**

https://docs.google.com/document/d/1bmTw3TlHm2F-z-ScXxTr3sjDBQsM-5SGDzjRtcGKjZ8/edit?tab=t.0


**API Documentation:**
https://docs.google.com/document/d/1bmTw

stripe listen --forward-to http://127.0.0.1:8000/plan/webhook/stripe/

# ENV File Content
```
OPENAI_API_KEY=""
WEATHER_API_KEY=""
SERP_API_KEY=""
FORECAST_URL=""
WEATHER_API_KEY2=""
FRONTEND_URL=""
GEMINI_API_KEY=""
SECRET_KEY=""
DEBUG="True"
EMAIL_BACKEND=""
EMAIL_HOST=""
EMAIL_PORT=""
EMAIL_HOST_USER=""
EMAIL_HOST_PASSWORD=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_SECURE_REFERRER_POLICY=""
GOOGLE_SECURE_CROSS_ORIGIN_OPENER_POLICY=""
GOOGLE_CERTIFICATE_URL=""
STRIPE_SECRET_KEY=""
STRIPE_PUBLIC_KEY=""
STRIPE_WEBHOOK_SECRET=""
DATABASE_NAME=""
DATABASE_USER=""
DATABASE_PASSWORD=""
DATABASE_PORT=""
DATABASE_HOST=""
```


# Shell command for Create Plans
_____________________________________________________________________________

from subscription.models import Plan

# Create Free plan
free_plan, created = Plan.objects.get_or_create(
    plan_name="Free",
    defaults={
        "amount": 0.00,
        "manual_itineraries": 10,
        "ai_itineraries": 2,
        "is_active": True,
        "duration_days": 365,  # 1 year
    }
)
print(f"Free plan {'created' if created else 'already exists'}")

# Create Basic plan
basic_plan, created = Plan.objects.get_or_create(
    plan_name="Basic",
    defaults={
        "amount": 5.00,
        "manual_itineraries": 20,
        "ai_itineraries": 5,
        "stripe_product_id": "prod_POdDwNrn97RnSg",
        "stripe_price_id": "price_1OZpx2JZ5fFY5Q8LhdvNDEPB",
        "is_active": True,
        "duration_days": 365,  # 1 year
    }
)
print(f"Basic plan {'created' if created else 'already exists'}")

# Create Premium plan
premium_plan, created = Plan.objects.get_or_create(
    plan_name="Premium",
    defaults={
        "amount": 10.00,
        "manual_itineraries": 50,
        "ai_itineraries": 15,
        "stripe_product_id": "prod_POf1MfoaOIA0iP",
        "stripe_price_id": "price_1OZrhKJZ5fFY5Q8L65UlWicC",
        "is_active": True,
        "duration_days": 365,  # 1 year
    }
)
print(f"Premium plan {'created' if created else 'already exists'}")

_____________________________________________________________________________


# Shell command for create Categories


from ai_itinerary.models import TouristPlaceCategory
from django.utils import timezone

categories = [
    "Beach",
    "Mountain",
    "Historical",
    "Cultural",
    "Adventure",
    "Wildlife",
    "Religious",
    "Food & Cuisine",
    "Nightlife",
    "Shopping",
    "Nature",
    "Architecture",
    "Museums",
    "Festivals",
]

for category_name in categories:
    TouristPlaceCategory.objects.get_or_create(
        name=category_name
    )

print(f"Created {len(categories)} categories")

____________________________________________________________________________________


    [
    {
      "title": "Booking.com",
      "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png",
      "platform": "hotel",
      "base_url": "https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults=2&no_rooms=1&sb_travel_purpose=leisure"
    },
    {
      "title": "Expedia.com",
      "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png",
      "platform": "hotel",
      "base_url": "https://www.expedia.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&rooms=1&adults=2"
    },
    {
      "title": "Hotels.com",
      "image_url": "https://i.postimg.cc/TY7hvsST/hotels-imageeeee.png",
      "platform": "hotel",
      "base_url": "https://www.hotels.com/Hotel-Search?destination={city}&d1={checkin}&d2={checkout}&adults=2&rooms=1"
    },
    {
      "title": "Booking.com Car Rentals",
      "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png",
      "platform": "car",
      "base_url": "https://www.booking.com/cars/index.html?ss={city}&pickup_date={pickup_date}&pickup_time=10%3A30&dropoff_date={return_date}&dropoff_time=12%3A30&age=30"
    },
    {
      "title": "Expedia Car Rentals",
      "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png",
      "platform": "car",
      "base_url": "https://www.expedia.com/carsearch?date1={pickup_date}&date2={return_date}&time1=1030AM&time2=1230PM&locn={city}"
    },
    {
      "title": "RentalCars.com",
      "image_url": "https://i.postimg.cc/Kv6STr3n/car-rental-image.png",
      "platform": "car",
      "base_url": "https://www.rentalcars.com/search?locationName={city}&pickUpDate={pickup_date}&pickUpTime=10%3A30&dropOffDate={return_date}&dropOffTime=12%3A30&driverAge=30"
    },
      {
    "title": "Expedia Flights",
    "image_url": "https://i.postimg.cc/gJSHZsjd/expedia-image.png",
    "platform": "flight",
    "base_url": "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT,fromType:A,toType:M&mode=search&options=carrier:,cabinclass:,maxhops:1,nopenalty:N&pageId=0&passengers=adults:1,children:0,infantinlap:N&trip=oneway"
  },
    {
        "title": "Booking.com Flights",
        "image_url": "https://i.postimg.cc/Y2DdGrLg/booking-image.png",
        "platform": "flight",
        "base_url": "https://flights.booking.com/fly-anywhere/?type=ONEWAY&adults=1&cabinClass=ECONOMY&children=&from={origin}.AIRPORT&to={destination}.COUNTRY&fromCountry=IN&toCountry=&fromLocationName={origin_name}&toLocationName={destination_name}&depart={depart}&sort=BEST&travelPurpose=leisure&toCountryCode={destination_code}&ca_source=flights_search_sb&aid=898409&label=affnetawin-index_pub-1525451_site-_pname-Traveloure_plc-_ts-_clkid-6776_1753809676_69b9cc44dd2b091f76c1a38812569ede"
    },
    {
      "title": "Kiwi.com Flights",
      "image_url": "https://i.postimg.cc/2y5mHkCh/kiwi-image.png",
      "platform": "flight",
      "base_url": "https://www.kiwi.com/en/search/tiles/{origin}-india-1/{destination}-india-1/anytime/no-return"
    }
  ]




  #stripe listen --forward-to localhost:8000/plan/webhook/stripe/