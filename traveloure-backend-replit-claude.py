# Backend API for Itinerary Generation - Using Replit's Claude AI
# Add to: /ai/views_api/itinerary_generator.py

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from anthropic import Anthropic
import json
import os
from datetime import datetime
from django.conf import settings

# Initialize Anthropic client (Replit provides API key automatically)
client = Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_itinerary(request):
    """
    Generate AI-powered itinerary using Replit's Claude integration
    """
    try:
        data = request.data
        
        # Extract and validate input
        destinations = data.get('destinations', [])
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        experience_type = data.get('experienceType', 'travel')
        travelers = data.get('travelers', 2)
        special_requests = data.get('specialRequests', '')
        mode = data.get('mode', 'single')
        
        if not destinations or not start_date or not end_date:
            return Response(
                {'error': 'Missing required fields: destinations, startDate, endDate'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate trip duration
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        days = (end - start).days + 1
        
        # Build destination string
        if len(destinations) == 1:
            destinations_str = f"{destinations[0]['city']}, {destinations[0]['country']}"
        else:
            destinations_str = ', '.join([f"{d['city']}" for d in destinations])
        
        # Build Claude prompt
        prompt = f"""Create a detailed {days}-day {experience_type} itinerary for {travelers} traveler(s).

**Destinations:** {destinations_str}
**Dates:** {start_date} to {end_date}
**Experience Type:** {experience_type}
**Special Requests:** {special_requests if special_requests else 'None'}

Generate a comprehensive itinerary with:
1. Day-by-day schedule (morning/afternoon/evening)
2. Accommodation recommendations with realistic pricing
3. Restaurant suggestions (3 meals per day, consider dietary restrictions)
4. Activities and experiences (mix of popular and hidden gems)
5. Transportation details (airport transfers, local transit, inter-city travel for multi-city)
6. Estimated costs in USD

Return ONLY a JSON object (no markdown, no explanation) with this exact structure:

{{
  "days": [
    {{
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "city": "City Name",
      "items": [
        {{
          "id": "item_001",
          "type": "accommodation|activity|meal|transport",
          "time": "HH:MM",
          "title": "Short descriptive title",
          "duration": "X hours" or "X nights",
          "price": 0.00,
          "location": {{"lat": 0.0, "lng": 0.0}},
          "metadata": {{
            "category": "culture|food|adventure|relaxation",
            "address": "Full address",
            "providerId": null,
            "notes": "Special notes"
          }}
        }}
      ]
    }}
  ],
  "summary": {{
    "totalDays": {days},
    "totalActivities": 0,
    "totalMeals": 0,
    "estimatedTotal": 0.00,
    "breakdown": {{
      "accommodation": 0.00,
      "activities": 0.00,
      "meals": 0.00,
      "transportation": 0.00,
      "miscellaneous": 0.00
    }}
  }}
}}

Important guidelines:
- Include realistic coordinates for all locations
- Price activities between $20-200, meals $15-80, accommodations $80-300/night
- For multi-city trips, add inter-city transportation items
- Check-in accommodation on day 1, check-out on last day
- Balance activity types (don't overload with museums)
- Include free time / rest periods
- Consider travel time between locations
"""

        # Call Claude via Replit's integration
        message = client.messages.create(
            model="claude-sonnet-4-5",  # Latest Claude model
            max_tokens=8000,
            temperature=0.7,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
        
        # Extract JSON from response
        response_text = message.content[0].text
        
        # Try to parse JSON (Claude should return pure JSON)
        try:
            itinerary_json = json.loads(response_text)
        except json.JSONDecodeError:
            # If Claude wrapped it in markdown, extract it
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.rfind("```")
                response_text = response_text[json_start:json_end].strip()
                itinerary_json = json.loads(response_text)
            else:
                raise ValueError("Failed to parse AI response as JSON")
        
        # Create Trip record in database
        from authentication.models import Trip  # Adjust import path
        
        trip = Trip.objects.create(
            user=request.user,
            destinations=destinations,
            start_date=start_date,
            end_date=end_date,
            experience_type=experience_type,
            travelers=travelers,
            special_requests=special_requests,
            itinerary=itinerary_json,
            status='draft'
        )
        
        # Find matching experts (if LocalExpert model exists)
        expert_recommendations = []
        try:
            from authentication.models import LocalExpert
            
            for dest in destinations:
                experts = LocalExpert.objects.filter(
                    locations__icontains=dest['city'],
                    is_active=True,
                    is_approved=True
                ).select_related('user')[:3]
                
                for expert in experts:
                    expert_recommendations.append({
                        'expertId': str(expert.id),
                        'name': f"{expert.user.first_name} {expert.user.last_name}",
                        'specialty': expert.specialty if hasattr(expert, 'specialty') else 'Local Expert',
                        'matchScore': 0.85  # Could implement real matching algorithm
                    })
        except Exception as e:
            print(f"Error fetching experts: {e}")
            # Continue without experts
        
        # Return success response
        return Response({
            'success': True,
            'tripId': str(trip.id),
            'itinerary': itinerary_json,
            'expertRecommendations': expert_recommendations[:5],  # Top 5
            'message': f'Generated {days}-day itinerary for {destinations_str}'
        }, status=status.HTTP_201_CREATED)
        
    except json.JSONDecodeError as e:
        return Response(
            {'error': f'Failed to parse AI response: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        print(f"Error in generate_itinerary: {str(e)}")
        return Response(
            {'error': f'Failed to generate itinerary: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_trip(request, trip_id):
    """
    Get a specific trip by ID
    """
    try:
        from authentication.models import Trip
        
        trip = Trip.objects.get(
            id=trip_id,
            user=request.user
        )
        
        return Response({
            'tripId': str(trip.id),
            'destinations': trip.destinations,
            'startDate': trip.start_date.isoformat(),
            'endDate': trip.end_date.isoformat(),
            'experienceType': trip.experience_type,
            'travelers': trip.travelers,
            'itinerary': trip.itinerary,
            'status': trip.status,
            'specialRequests': trip.special_requests,
            'createdAt': trip.created_at.isoformat(),
        })
        
    except Trip.DoesNotExist:
        return Response(
            {'error': 'Trip not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_trip(request, trip_id):
    """
    Update trip itinerary (for customizations)
    """
    try:
        from authentication.models import Trip
        
        trip = Trip.objects.get(
            id=trip_id,
            user=request.user
        )
        
        # Update allowed fields
        if 'itinerary' in request.data:
            trip.itinerary = request.data['itinerary']
        if 'status' in request.data:
            trip.status = request.data['status']
        
        trip.save()
        
        return Response({
            'success': True,
            'message': 'Trip updated successfully',
            'tripId': str(trip.id)
        })
        
    except Trip.DoesNotExist:
        return Response(
            {'error': 'Trip not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Add to your /ai/urls.py:
"""
from django.urls import path
from .views_api.itinerary_generator import (
    generate_itinerary, 
    get_trip, 
    update_trip
)

urlpatterns = [
    path('generate-itinerary/', generate_itinerary, name='generate-itinerary'),
    path('trips/<uuid:trip_id>/', get_trip, name='get-trip'),
    path('trips/<uuid:trip_id>/update/', update_trip, name='update-trip'),
]
"""
