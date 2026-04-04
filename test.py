import requests
import urllib.parse
import json

# SerpAPI and AWIN credentials
SERPAPI_KEY = "d6f8c9c4d6efb399e7871354a3413d2ef38cc43ddcea67d263ada6fcb46315b6"
AWIN_MID = "6776"
AWIN_AFF_ID = "1525451"

# Function to generate affiliate link
def generate_affiliate_link(original_url, awinmid, awinaffid):
    encoded_url = urllib.parse.quote(original_url, safe='')
    return f"https://www.awin1.com/cread.php?awinmid={awinmid}&awinaffid={awinaffid}&p={encoded_url}"

# Function to fetch hotel data
def get_hotel_details_with_aff_links(query, serpapi_key, awinmid, awinaffid):
    url = "https://serpapi.com/search"
    params = {
        "engine": "google",
        "q": query,
        "api_key": serpapi_key
    }

    response = requests.get(url, params=params)
    results = response.json()

    hotels_data = []
    for r in results.get("organic_results", []):
        link = r.get("link")
        if "booking.com" in link:
            hotel = {
                "title": r.get("title"),
                "description": r.get("snippet"),
                "booking_url": link,
                "thumbnail": r.get("thumbnail"),
                "affiliate_link": generate_affiliate_link(link, awinmid, awinaffid)
            }
            hotels_data.append(hotel)
    return hotels_data

# Run the script
if __name__ == "__main__":
    query = "hotels in paris site:booking.com"
    hotels = get_hotel_details_with_aff_links(query, SERPAPI_KEY, AWIN_MID, AWIN_AFF_ID)

    print("Hotel Details with AWIN Affiliate Links:\n")
    print(json.dumps(hotels, indent=2))
