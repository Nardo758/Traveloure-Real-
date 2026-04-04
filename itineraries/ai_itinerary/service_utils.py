import requests
import urllib.parse
import json
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Define global environment variables
SERPAPI_KEY = os.environ.get("SERP_API_KEY")
AWIN_MID = os.environ.get("AWIN_MID")
AWIN_AFF_ID = os.environ.get("AWIN_AFF_ID")


def generate_affiliate_link(original_url):
    encoded_url = urllib.parse.quote(original_url, safe='')
    return f"https://www.awin1.com/cread.php?awinmid={AWIN_MID}&awinaffid={AWIN_AFF_ID}&p={encoded_url}"


def get_booking_hotels(city, check_in_date=None, check_out_date=None):
    if not check_in_date or not check_out_date:
        return {'error': 'Missing `check_in_date` or `check_out_date` parameter.'}

    url = "https://serpapi.com/search"
    params = {
        "engine": "google_hotels",
        "q": f"hotels in {city}",
        "hl": "en",
        "api_key": SERPAPI_KEY,
        "check_in_date": check_in_date,     # YYYY-MM-DD
        "check_out_date": check_out_date
    }

    response = requests.get(url, params=params)
    results = response.json()

    hotels_data = []
    for hotel in results.get("ads", []):
        booking_link = hotel.get("link", "")
        hotel_data = {
                "name": hotel.get("name"),
                "address": hotel.get("address"),
                "price": hotel.get("price"),
                "rating": hotel.get("rating"),
                "reviews": hotel.get("reviews"),
                "thumbnail": hotel.get("thumbnail"),
                "booking_url": booking_link,
                "affiliate_link": generate_affiliate_link(booking_link)
            }
        hotels_data.append(hotel_data)
    return hotels_data


def get_car_rentals(city):
    url = "https://serpapi.com/search"
    params = {
        "engine": "google",
        "q": f"car rental in {city}",
        "hl": "en",
        "api_key": SERPAPI_KEY
    }

    response = requests.get(url, params=params)
    results = response.json()

    cars_data = []
    for result in results.get("organic_results", []):
        link = result.get("link", "")
        if any(domain in link for domain in ["rentalcars.com", "expedia.com", "kayak.com", "avis.com", "enterprise.com"]):
            car_data = {
                "title": result.get("title"),
                "snippet": result.get("snippet"),
                "displayed_link": result.get("displayed_link"),
                "link": link,
                "affiliate_link": generate_affiliate_link(link)
            }
            cars_data.append(car_data)

    return cars_data
