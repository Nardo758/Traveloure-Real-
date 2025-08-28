import requests
from django.conf import settings
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination


def get_weather_forecast(city, country, start_date, end_date):
    """
    Fetch weather forecast data for a city between start_date and end_date.
    
    Args:
        city (str): City name
        country (str): Country name
        start_date (str): Start date in YYYY-MM-DD format
        end_date (str): End date in YYYY-MM-DD format
        
    Returns:
        dict: Dictionary with weather data for each day
    """
    try:
        # Format location with country for better accuracy
        location = f"{city},{country}"
        
        # Fetch weather data for the entire date range
        url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{location}/{start_date}/{end_date}?unitGroup=metric&key={settings.WEATHER_API_KEY}&include=days"
        
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        # Extract daily forecasts
        weather_data = {}
        if "days" in data:
            for day in data["days"]:
                date = day["datetime"]
                weather_data[date] = {
                    "temp_min": day.get("tempmin", 0),
                    "temp_max": day.get("tempmax", 0),
                    "conditions": day.get("conditions", "Unknown"),
                    "precip_prob": day.get("precipprob", 0),
                    "precip_amount": day.get("precip", 0),
                    "humidity": day.get("humidity", 0),
                    "wind_speed": day.get("windspeed", 0),
                    "description": day.get("description", "")
                }
        
        return weather_data
    
    except Exception as e:
        print(f"Error fetching weather data: {str(e)}")
        # Return empty dict if weather data can't be fetched
        return {}

def get_weather_summary(weather_data):
    """
    Generate a summary of weather conditions for the entire trip.
    
    Args:
        weather_data (dict): Dictionary with weather data for each day
        
    Returns:
        str: Summary of weather conditions
    """
    if not weather_data:
        return "Weather data not available for this location and date range."
    
    # Count days with different conditions
    conditions_count = {}
    for date, data in weather_data.items():
        condition = data["conditions"]
        if condition in conditions_count:
            conditions_count[condition] += 1
        else:
            conditions_count[condition] = 1
    
    # Calculate average temperatures
    total_min = sum(data["temp_min"] for data in weather_data.values())
    total_max = sum(data["temp_max"] for data in weather_data.values())
    avg_min = total_min / len(weather_data)
    avg_max = total_max / len(weather_data)
    
    # Generate summary
    summary = f"Weather Summary: {len(weather_data)} days\n"
    summary += f"Temperature Range: {avg_min:.1f}°C to {avg_max:.1f}°C\n"
    summary += "Conditions: "
    
    for condition, count in conditions_count.items():
        percentage = (count / len(weather_data)) * 100
        summary += f"{condition} ({percentage:.0f}%), "
    
    # Check for rain probability
    rainy_days = sum(1 for data in weather_data.values() if data["precip_prob"] > 30)
    if rainy_days > 0:
        summary += f"\nRain expected on {rainy_days} days."
    
    return summary 
def fetch_live_events(location: str, year: int, serp_api_key: str):
    """
    Fetch live events from Google Events API using SerpAPI and add image thumbnails via image search.
    """
    query = f"Events in {location}"
    params = {
        "engine": "google_events",
        "q": query,
        "location": location,
        "hl": "en",
        "gl": "us",
        "api_key": serp_api_key,
        "no_cache": "true"  # Force fresh results
    }

    try:
        response = requests.get("https://serpapi.com/search", params=params)
        
        if response.status_code == 200:
            data = response.json()
            events = data.get("events_results", [])

            for event in events:
                if not event.get("thumbnail"):
                    search_query = f"{event.get('title', '')} event in {location}"
                    image_results = fetch_images_via_serp_api(search_query, serp_api_key)
                    if image_results:
                        event["thumbnail"] = image_results # Assign first image

            return events
        else:
            print(f"Failed to fetch events: {response.status_code}, {response.text}")
            return []
    except Exception as e:
        print(f"Error fetching events for {location}: {e}")
        return []
    
def fetch_images_via_serp_api(query, api_key, max_images=3):
        serp_url = "https://serpapi.com/search.json"
        params = {
            "q": query,
            "tbm": "isch",  # image search
            "api_key": api_key
        }
        response = requests.get(serp_url, params=params)
        data = response.json()

        thumbnails = []
        suggested = data.get("images_results", [])
        for item in suggested:
            thumb = item.get("original")
            if thumb:
                thumbnails.append(thumb)

        return thumbnails[:5]


class ChatPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'limit'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'count':self.page.paginator.count,
            'total_pages':self.page.paginator.num_pages,
            'data': data,
            'status': True
        })