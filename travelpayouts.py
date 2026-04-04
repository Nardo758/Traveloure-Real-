import requests, urllib.parse

def get_location_id(city, token):
    resp = requests.get("https://engine.hotellook.com/api/v2/lookup.json",
        params={"query": city, "lang":"en", "lookFor":"both", "token": token})
    resp.raise_for_status()
    for loc in resp.json()["results"]["locations"]:
        if "India" in loc["fullName"]:
            return loc["id"]
    return None

def fetch_hotels(location_id, token, partner_id):
    resp = requests.get("https://engine.hotellook.com/api/v2/cache.json",
        params={
            "locationId": location_id,
            "currency": "INR",
            "checkIn": "2025-07-18",
            "checkOut": "2025-07-19",
            "limit": 20,
            "token": token
        })
    resp.raise_for_status()
    hotels = resp.json()
    return [
        {
            "name": h["hotelName"],
            "price": h["priceFrom"],
            "stars": h.get("stars", "N/A"),
            "image": f"https://photo.hotellook.com/image_v2/limit/h{h['hotelId']}_0/800/520.auto",
            "affiliate_link": f"https://search.hotellook.com/?hotelId={h['hotelId']}&language=en&marker={partner_id}",
        }
        for h in hotels
    ]

token = "305c14e552664938f7a9969d82525c95"
partner_id = "649332"
location_id = get_location_id("punjab", token)
if location_id:
    hotels = fetch_hotels(location_id, token, partner_id)
    for h in hotels:
        print(h)
