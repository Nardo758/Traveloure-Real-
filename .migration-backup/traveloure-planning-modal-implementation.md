# Planning Modal - Implementation Guide

## ✅ What's Done

Created: `/src/app/components/PlanningModal.jsx`

A beautiful, fully-functional modal that captures:
- Destination(s) - single or multi-city
- Date range with validation
- Experience type (Travel, Wedding, Corporate, Event, Retreat)
- Number of travelers
- Special requests

## 🔌 How to Use It

### Example 1: "Take me There" Button (Single City)

In your city card component (TravelPulse, Discover page, etc.):

```jsx
"use client";

import { useState } from 'react';
import PlanningModal from '@/app/components/PlanningModal';

export default function CityCard({ city }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="city-card">
        <h3>{city.name}, {city.country}</h3>
        <button 
          onClick={() => setShowModal(true)}
          className="take-me-there-btn"
        >
          Take me There ✈️
        </button>
      </div>

      <PlanningModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        initialDestination={{
          city: city.name,
          country: city.country,
          cityId: city.id
        }}
        mode="single"
      />
    </>
  );
}
```

### Example 2: Multi-City Planning Button

In your navigation or homepage:

```jsx
"use client";

import { useState } from 'react';
import PlanningModal from '@/app/components/PlanningModal';

export default function MultiCityButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="multi-city-btn"
      >
        Plan Multi-City Trip 🗺️
      </button>

      <PlanningModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        mode="multi"
      />
    </>
  );
}
```

### Example 3: With Custom Success Handler

```jsx
<PlanningModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  initialDestination={{ city: "Tokyo", country: "Japan", cityId: "tokyo-jp" }}
  mode="single"
  onSuccess={(data) => {
    console.log('Generated trip:', data);
    // Custom handling - e.g., show a preview, send analytics, etc.
    router.push(`/experiences/${data.experienceType}?tripId=${data.tripId}`);
  }}
/>
```

---

## 🛠️ Backend Integration Needed

The modal calls your backend at: **`POST /ai/generate-itinerary/`**

You need to create this endpoint (or update existing one) to handle:

### Request Format:

```json
{
  "destinations": [
    {
      "city": "Paris",
      "country": "France",
      "cityId": "paris-fr"
    }
  ],
  "startDate": "2026-03-15",
  "endDate": "2026-03-19",
  "experienceType": "travel",
  "travelers": 2,
  "specialRequests": "Vegetarian meals, love art museums",
  "mode": "single"
}
```

### Expected Response:

```json
{
  "tripId": "trip_abc123",
  "itinerary": {
    "days": [
      {
        "date": "2026-03-15",
        "dayNumber": 1,
        "city": "Paris",
        "items": [
          {
            "id": "item_001",
            "type": "accommodation",
            "time": "14:00",
            "title": "Check-in: Le Marais Hotel",
            "duration": "4 nights",
            "price": 850.00,
            "location": { "lat": 48.8566, "lng": 2.3522 },
            "metadata": { "providerId": "hotel_123" }
          }
        ]
      }
    ],
    "summary": {
      "totalDays": 4,
      "totalActivities": 12,
      "estimatedTotal": 2450.00
    }
  },
  "expertRecommendations": [
    {
      "expertId": "expert_789",
      "name": "Sophie Laurent",
      "specialty": "Paris Local Expert"
    }
  ]
}
```

### Django Backend Example:

Create: `/ai/views_api/itinerary_generator.py`

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import openai
import json
from datetime import datetime, timedelta

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_itinerary(request):
    """
    Generate AI-powered itinerary based on user preferences
    """
    try:
        data = request.data
        
        # Validate input
        destinations = data.get('destinations', [])
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        experience_type = data.get('experienceType', 'travel')
        travelers = data.get('travelers', 2)
        special_requests = data.get('specialRequests', '')
        mode = data.get('mode', 'single')
        
        if not destinations or not start_date or not end_date:
            return Response(
                {'error': 'Missing required fields'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate trip duration
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        days = (end - start).days + 1
        
        # Build AI prompt
        destinations_str = ', '.join([f"{d['city']}, {d['country']}" for d in destinations])
        
        prompt = f"""Create a detailed {days}-day {experience_type} itinerary for {travelers} traveler(s) visiting {destinations_str}.
        
Start Date: {start_date}
End Date: {end_date}
Special Requests: {special_requests if special_requests else 'None'}

Generate a JSON itinerary with:
1. Day-by-day schedule with morning/afternoon/evening activities
2. Accommodation recommendations
3. Restaurant suggestions (consider dietary restrictions if mentioned)
4. Transportation between locations
5. Estimated costs in USD

Format the response as a JSON object matching this structure:
{{
  "days": [
    {{
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "city": "City Name",
      "items": [
        {{
          "id": "unique_id",
          "type": "accommodation|activity|meal|transport",
          "time": "HH:MM",
          "title": "Item title",
          "duration": "X hours/nights",
          "price": 0.00,
          "location": {{"lat": 0, "lng": 0}},
          "metadata": {{}}
        }}
      ]
    }}
  ],
  "summary": {{
    "totalDays": {days},
    "totalActivities": 0,
    "estimatedTotal": 0.00
  }}
}}

Focus on authentic local experiences, hidden gems, and practical logistics."""

        # Call OpenAI API (or your preferred AI service)
        openai.api_key = settings.OPENAI_API_KEY
        
        response = openai.ChatCompletion.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are a world-class travel planner creating detailed, personalized itineraries."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" },
            temperature=0.7
        )
        
        itinerary_json = json.loads(response.choices[0].message.content)
        
        # Create Trip record in database
        trip = Trip.objects.create(
            user=request.user,
            destinations=destinations,
            start_date=start_date,
            end_date=end_date,
            experience_type=experience_type,
            travelers=travelers,
            itinerary=itinerary_json,
            status='draft'
        )
        
        # Find matching experts
        expert_recommendations = []
        for dest in destinations:
            experts = LocalExpert.objects.filter(
                locations__icontains=dest['city'],
                is_active=True
            ).values('id', 'user__first_name', 'user__last_name', 'specialty')[:3]
            
            expert_recommendations.extend([
                {
                    'expertId': str(expert['id']),
                    'name': f"{expert['user__first_name']} {expert['user__last_name']}",
                    'specialty': expert['specialty']
                }
                for expert in experts
            ])
        
        return Response({
            'tripId': str(trip.id),
            'itinerary': itinerary_json,
            'expertRecommendations': expert_recommendations[:5]
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
```

Add to your `/ai/urls.py`:

```python
from django.urls import path
from .views_api.itinerary_generator import generate_itinerary

urlpatterns = [
    # ... existing routes
    path('generate-itinerary/', generate_itinerary, name='generate-itinerary'),
]
```

---

## 📦 Experience Builder Integration

Once the modal generates an itinerary, it stores data in `sessionStorage` and navigates to the experience builder.

### In your Experience Builder page:

```jsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ExperienceBuilderPage() {
  const [itinerary, setItinerary] = useState(null);
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId');

  useEffect(() => {
    // Load from sessionStorage (fresh generation) or API (existing trip)
    const pendingItinerary = sessionStorage.getItem('pendingItinerary');
    
    if (pendingItinerary) {
      const data = JSON.parse(pendingItinerary);
      setItinerary(data);
      sessionStorage.removeItem('pendingItinerary');
    } else if (tripId) {
      // Fetch existing trip
      fetchTrip(tripId);
    }
  }, [tripId]);

  const fetchTrip = async (id) => {
    try {
      const response = await fetch(`/api/trips/${id}`);
      const data = await response.json();
      setItinerary(data);
    } catch (error) {
      console.error('Error fetching trip:', error);
    }
  };

  if (!itinerary) {
    return <div>Loading your itinerary...</div>;
  }

  return (
    <div>
      {/* Render timeline, map, cart, etc. */}
      <h1>Your Trip to {itinerary.destinations[0].city}</h1>
      {/* ... rest of your experience builder UI */}
    </div>
  );
}
```

---

## 🎨 Styling Notes

The modal uses Tailwind CSS (already in your project). Key classes:
- Purple accent color (`purple-600`, `purple-700`) - matches Traveloure brand
- Responsive grid layouts
- Smooth transitions and hover states
- Accessible focus states

If you want to customize colors, search/replace:
- `purple-600` → your brand color
- `purple-50` → lighter variant
- `purple-900` → darker variant

---

## ✅ Testing Checklist

- [ ] Modal opens on "Take me There" click
- [ ] Can add/remove destinations (multi-city mode)
- [ ] Date validation works (future dates, end > start)
- [ ] Experience type selection works
- [ ] Traveler count increment/decrement works
- [ ] Special requests textarea has character limit
- [ ] Backend API returns valid itinerary JSON
- [ ] Navigation to experience builder works
- [ ] sessionStorage data loads correctly
- [ ] Error messages display properly
- [ ] Loading state shows during generation
- [ ] Modal closes on cancel or success

---

## 🚀 Next Steps

1. **Create the backend endpoint** (`/ai/generate-itinerary/`)
2. **Add modal to your city cards** (TravelPulse, Discover pages)
3. **Add multi-city button** (homepage, navigation)
4. **Update Experience Builder** to load pendingItinerary
5. **Test end-to-end flow**
6. **Add analytics tracking** (modal opens, generations, conversions)

---

## 💡 Enhancement Ideas

Once the basic flow works, consider adding:

- **City autocomplete** - Google Places API integration
- **Budget selector** - Budget/Moderate/Luxury tier
- **Travel pace** - Slow/Medium/Fast for multi-city
- **Days per city** - Manual allocation for multi-city
- **Progress indicator** - Multi-step wizard UI
- **Preview mode** - Quick preview before full navigation
- **Save for later** - Draft trips without full generation
- **Social sharing** - Share planned trips

---

**Questions? Issues?**

Let me know and I'll help you debug or customize!

🚀 **RocketMan**