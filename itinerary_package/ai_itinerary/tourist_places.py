import os
import json
from dotenv import load_dotenv
from openai import OpenAI
import requests
load_dotenv()
# Load API key

SERPAPI_API_KEY = os.getenv("SERP_API_KEY")
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
def get_events(query):
    url = "https://serpapi.com/search"
    params = {
        "google_domain": "google.com",
        "q": query,
        "engine": "google_maps",
        "tbm": "isch",
        "api_key": SERPAPI_API_KEY
    }

    try:
        response = requests.get(url, params=params)
        data = response.json()
        
        return data
    except Exception as e:
        print(f"⚠️ Error fetching events for {query}: {e}")
        return []

def ask_openai_with_serpapi(query, serp_results):
    client = OpenAI(api_key=OPENAI_API_KEY)

    serp_context = json.dumps(serp_results, indent=2)

    prompt = f"""
You are a smart travel assistant using both real-time event search data and your own knowledge.

User Query:
"{query}"

You also received real-time event data from a search engine:

[REAL-TIME DATA]:
{serp_context}

Using this data and your own knowledge:
- If the query is about a country, return 10–15 top tourist destinations.
- If it's about a city or place, return detailed tourist recommendations.

Each destination must include:
- country
- city
- place
- description
- latitude
- longitude
- activities (list)
- festivals (list)
- category ("beach", "adventure", "culture", "food", "nightlife", "wildlife", "cruise", "sightseeing","wellness","religious")
- best_months (e.g., October - March)
- image_url (URls should be the direct image url)

Output ONLY valid JSON under the key "places".
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional travel planner. Respond strictly in valid JSON format as requested."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7
        )

        text = response.choices[0].message.content.strip()
        print("\n==== OPENAI RAW RESPONSE ====")
        print(text)
        print("==== END RAW RESPONSE ====")

        if text.startswith("```"):
            text = text.strip("```json").strip("```")

        return json.loads(text)

    except Exception as e:
        print("❌ Error parsing OpenAI response:", e)
        return {"places": []}

def fetch_travel_data_agentic(query):
    serp_results = get_events(query)
    # Only send top 5 local_results (places) to OpenAI, not events
    filtered_results = []
    if isinstance(serp_results, dict) and 'local_results' in serp_results:
        places = serp_results['local_results'][:5]
        filtered_results = [
            {
                "title": p.get("title"),
                "address": p.get("address"),
                "link": p.get("website"),
                "image_url": p.get("thumbnail"),
                "rating": p.get("rating"),
                "latitude": p.get("gps_coordinates", {}).get("latitude"),
                "longitude": p.get("gps_coordinates", {}).get("longitude"),
                "description": p.get("snippet", ""),
            }
            for p in places
        ]
    elif isinstance(serp_results, list):
        filtered_results = serp_results[:5]
    else:
        filtered_results = []

    try:
        print("\n==== OPENAI DEBUGGING ====")
        print("Prompt Query:", query)
        print("SERP Results (sent to OpenAI):", json.dumps(filtered_results, indent=2, ensure_ascii=False))
        enriched_response = ask_openai_with_serpapi(query, filtered_results)
        print("OpenAI Response:", enriched_response)
        print("==== END OPENAI DEBUGGING ====")
        return enriched_response
    except Exception as e:
        print("❌ Error in ask_openai_with_serpapi:", e)
        return {"places": [], "error": str(e)}


# if __name__ == "__main__":
#     query = "Top tourist attractions in India" 
#     results = fetch_travel_data_agentic(query)

#     with open("places_data.json", "w", encoding="utf-8") as f:
#         json.dump(results, f, indent=2, ensure_ascii=False)
#     print('Work Done')