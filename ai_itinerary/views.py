from rest_framework import status, generics, mixins, viewsets
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.conf import settings
from .models import *
from .serializers import *
import requests
import os
from dotenv import load_dotenv
import json
from django.shortcuts import get_object_or_404
from .utils import *
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Q, Max
from collections import Counter
import random
from django.db import transaction
from .tourist_places import fetch_travel_data_agentic
from openai import OpenAI
from .utils import fetch_live_events,fetch_images_via_serp_api,ChatPagination
from datetime import datetime
import demjson3
from ai_itinerary.models import TripSelectedPlace, TripSelectedHotel, TripSelectedService
from .serializers import AffiliatePlatformSerializer
from .models import AffiliatePlatform
from datetime import datetime
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import stripe

load_dotenv()
SERP_API_KEY = os.getenv('SERP_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

class TripCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Step 1: Create trip
        serializer = TripCreateSerializer(data=request.data)
        if serializer.is_valid():
            trip = serializer.save(user=request.user)
            
            # Step 2: Search places using SERP API
            search_query = f"best tourist and popular places to visit in {trip.destination}"
            if trip.preferences:
                prefs = trip.preferences if isinstance(trip.preferences, list) else []
                if prefs:
                    interests_str = " and ".join(prefs)
                    search_query = f"best {interests_str} places in {trip.destination}"

            places_params = {
                "engine": "google_maps",
                "q": search_query,
                "hl": "en",
                "api_key": SERP_API_KEY,

            }

            try:
                response = requests.get("https://serpapi.com/search", params=places_params)
                places_data = response.json()

                if 'local_results' in places_data:
                    places = []
                    for place in places_data['local_results']:
                        place_data = {
                            'place_id': place.get('place_id', ''),
                            'name': place.get('title', ''),
                            'description': place.get('snippet', ''),
                            'address': place.get('address', ''),
                            'rating': float(place.get('rating', 0)),
                            'image_url': place.get('thumbnail', ''),
                            'website_url': place.get('website', ''),
                            'metadata': {
                                'reviews_count': place.get('reviews', 0),
                                'hours': place.get('hours', {}),
                                'phone': place.get('phone', '')
                            }
                        }
                        places.append(place_data)
                    filtered_places = [place for place in places if place.get('image_url') and place.get('website_url')]
                    return Response({
                        'trip_id': trip.id,
                        'message': 'Trip created and places found successfully',
                        'places': filtered_places,
                        'next_step': 'save_places'
                    }, status=status.HTTP_201_CREATED)
                
                return Response({
                    'trip_id': trip.id,
                    'message': 'Trip created but no places found',
                    'places': [],
                    'next_step': 'save_places'
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response({
                    'trip_id': trip.id,
                    'error': str(e),
                    'message': 'Trip created but failed to fetch places'
                }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class SaveSelectedPlacesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        trip_id = request.data.get('trip_id')
        places = request.data.get('places', [])

        if not trip_id:
            return Response({'error': 'Trip ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            trip = Trip.objects.get(id=trip_id, user=request.user)
        except Trip.DoesNotExist:
            return Response({'error': 'Trip not found'}, status=status.HTTP_404_NOT_FOUND)

        # Save selected places
        TripSelectedPlace.objects.filter(trip=trip).delete()
        for place_data in places:
            TripSelectedPlace.objects.create(
                trip=trip,
                place_id=place_data.get('place_id', ''),
                name=place_data.get('name', ''),
                description=place_data.get('description', ''),
                address=place_data.get('address', ''),
                rating=place_data.get('rating', None),
                image_url=place_data.get('image_url', ''),
                website_url=place_data.get('website_url', ''),
                metadata=place_data.get('metadata', {})
            )

        # Search hotels using SERP API
        hotels_params = {
            "engine": "google_hotels",
            "q": f"hotels in {trip.destination}",
            "check_in_date": trip.start_date.strftime('%Y-%m-%d'),
            "check_out_date": trip.end_date.strftime('%Y-%m-%d'),
            "hl": "en",
            "api_key": SERP_API_KEY,

            "currency": "USD"
        }

        try:
            response = requests.get("https://serpapi.com/search", params=hotels_params)
            hotels_data = response.json()

            if 'properties' in hotels_data:
                hotels = []
                for hotel in hotels_data['properties']:
                    hotel_data = {
                        'hotel_id': hotel.get('property_token', ''),
                        'name': hotel.get('name', ''),
                        'description': hotel.get('description', ''),
                        'address': hotel.get('address', ''),
                        'rating': float(hotel.get('overall_rating', 0)),
                        'price_range': f"{hotel.get('rate_per_night', {}).get('lowest', 'N/A')} - {hotel.get('rate_per_night', {}).get('highest', 'N/A')}",
                        'image_url': hotel.get('images', [{}])[0].get('thumbnail', '') if hotel.get('images') else '',
                        'website_url': hotel.get('link', ''),
                        'metadata': {
                            'amenities': hotel.get('amenities', []),
                            'reviews_count': hotel.get('reviews', 0),
                            'check_in_time': hotel.get('check_in_time', ''),
                            'check_out_time': hotel.get('check_out_time', ''),
                            'hotel_class': hotel.get('hotel_class', ''),
                            'location_rating': hotel.get('location_rating', 0)
                        }
                    }
                    hotels.append(hotel_data)
                filtered_hotels = [hotel for hotel in hotels if hotel.get('image_url') and hotel.get('website_url')]
                return Response({
                    'trip_id': trip.id,
                    'message': 'Places saved and hotels found successfully',
                    'hotels': filtered_hotels,
                    'next_step': 'save_hotels'
                })
            
            return Response({
                'trip_id': trip.id,
                'message': 'Places saved but no hotels found',
                'hotels': [],
                'next_step': 'save_hotels',
                'debug_info': hotels_data  # Add debug info to response
            })

        except Exception as e:
            return Response({
                'trip_id': trip.id,
                'error': str(e),
                'message': 'Places saved but failed to fetch hotels'
            })

class SaveSelectedHotelsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        trip_id = request.data.get('trip_id')
        hotels = request.data.get('hotels', [])

        if not trip_id:
            return Response({'error': 'Trip ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            trip = Trip.objects.get(id=trip_id, user=request.user)
        except Trip.DoesNotExist:
            return Response({'error': 'Trip not found'}, status=status.HTTP_404_NOT_FOUND)

        # Save selected hotels
        TripSelectedHotel.objects.filter(trip=trip).delete()
        for hotel_data in hotels:
            TripSelectedHotel.objects.create(
                trip=trip,
                hotel_id=hotel_data.get('hotel_id', ''),
                name=hotel_data.get('name', ''),
                description=hotel_data.get('description', ''),
                address=hotel_data.get('address', ''),
                rating=hotel_data.get('rating', None),
                price_range=hotel_data.get('price_range', ''),
                image_url=hotel_data.get('image_url', ''),
                website_url=hotel_data.get('website_url', ''),
                metadata=hotel_data.get('metadata', {})
            )

        # Search services using SERP API
        services_params = {
            "engine": "google_maps",
            "q": f"transport services in {trip.destination}",
            "hl": "en",
            "api_key": SERP_API_KEY,

        }

        try:
            response = requests.get("https://serpapi.com/search", params=services_params)
            services_data = response.json()     
            # Check if we have local_results directly in the response
            if "local_results" in services_data:
                local_results = services_data.get("local_results", [])
                services = []
                
                for service in local_results:
                    service_data = {
                        'service_id': service.get('place_id', ''),
                        'name': service.get('title', ''),
                        'description': service.get('snippet', ''),
                        'service_type': 'transport',
                        'price_range': service.get('price', ''),
                        'image_url': service.get('thumbnail', ''),
                        'website_url': service.get('website', ''),
                        'metadata': {
                            'reviews_count': service.get('reviews', 0),
                            'hours': service.get('hours', {}),
                            'phone': service.get('phone', '')
                        }
                    }
                    services.append(service_data)
                filtered_services = [service for service in services if service.get('image_url')]
                return Response({
                    'trip_id': trip.id,
                    'message': 'Hotels saved and services found successfully',
                    'services': filtered_services,
                    'next_step': 'save_services'
                })
            # Original code for place_results structure
            place_results = services_data.get("place_results", {})
            people_also = place_results.get("people_also_search_for", [])
            services = []

            for item in people_also:
                local_results = item.get("local_results", [])
                for service in local_results:
                    service_data = {
                        'service_id': service.get('place_id', ''),
                        'name': service.get('title', ''),
                        'description': service.get('snippet', ''),
                        'service_type': 'transport',
                        'price_range': service.get('price', ''),
                        'image_url': service.get('thumbnail', ''),
                        'website_url': service.get('website', ''),
                        'metadata': {
                            'reviews_count': service.get('reviews', 0),
                            'hours': service.get('hours', {}),
                            'phone': service.get('phone', '')
                        }
                    }
                    services.append(service_data)
                filtered_services = [service for service in services if service.get('image_url')]
                return Response({
                    'trip_id': trip.id,
                    'message': 'Hotels saved and services found successfully',
                    'services': filtered_services,
                    'next_step': 'save_services'
                })
            
            return Response({
                'trip_id': trip.id,
                'message': 'Hotels saved but no services found',
                'services': [],
                'next_step': 'save_services',
                'debug_info': services_data
            })

        except Exception as e:
            return Response({
                'trip_id': trip.id,
                'error': str(e),
                'message': 'Hotels saved but failed to fetch services'
            })

class SaveSelectedServicesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        trip_id = request.data.get('trip_id')
        services_data = request.data.get('services', [])

        if not trip_id:
            return Response({'error': 'Trip ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            trip = Trip.objects.get(id=trip_id, user=request.user)
        except Trip.DoesNotExist:
            return Response({'error': 'Trip not found'}, status=status.HTTP_404_NOT_FOUND)

        # Step 1: Save Services
        TripSelectedService.objects.filter(trip=trip).delete()
        for data in services_data:
            TripSelectedService.objects.create(
                trip=trip,
                service_id=data.get('service_id', ''),
                name=data.get('name', ''),
                description=data.get('description', ''),
                service_type=data.get('service_type', ''),
                price_range=data.get('price_range', ''),
                image_url=data.get('image_url', ''),
                website_url=data.get('website_url', ''),
                metadata=data.get('metadata', {})
            )

        # Step 2: Gather Trip Data
        try:
            places = TripSelectedPlace.objects.filter(trip=trip)
            hotels = TripSelectedHotel.objects.filter(trip=trip)
            services = TripSelectedService.objects.filter(trip=trip)
            duration = (trip.end_date - trip.start_date).days + 1

            trip_data = self._build_trip_data(trip, places, hotels, services)
            prompt = self._build_prompt(trip, duration, trip_data)

            # Step 3: Generate Itinerary
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a travel itinerary expert."},
                    {"role": "user", "content": prompt}
                ]
            )

            # itinerary_data = json.loads(response.choices[0].message.content)
            raw_response = response.choices[0].message.content
            match = re.search(r"```json(.*?)```", raw_response, re.DOTALL)

            if match:
                json_str = match.group(1).strip()
            else:
                json_str = raw_response.strip()

            itinerary_data = json.loads(json_str)
            self._enrich_metadata(itinerary_data, places, hotels, services)

            # Save to DB
            itinerary, created = GeneratedItinerary.objects.update_or_create(
                trip=trip,
                defaults={'itinerary_data': itinerary_data, 'status': 'completed'}
            )
            trip.status = 'confirmed'
            trip.save()

            return Response({
                'trip_id': trip.id,
                'itinerary_id': str(itinerary.id),
                'message': 'Services saved and itinerary generated successfully',
                'itinerary': itinerary_data
            })

        except Exception as e:
            print("Itinerary generation failed:--> ", str(e))
            GeneratedItinerary.objects.update_or_create(
                trip=trip,
                defaults={'status': 'error', 'error_message': str(e)}
            )
            return Response({
                'trip_id': trip.id,
                'error': str(e),
                'message': 'Services saved but failed to generate itinerary'
            })

    def _save_service(self, data, trip):
        try:
            defaults = {
                'service_id': f"service_{random.randint(10000, 99999)}",
                'name': "Unnamed Service",
                'service_type': "other",
                'description': "",
                'price_range': "",
                'image_url': "",
                'website_url': "",
                'notes': "",
                'metadata': {},
                'trip': trip.id
            }
            for key, val in defaults.items():
                if not data.get(key):
                    data[key] = val

            if isinstance(data['metadata'], str):
                try:
                    data['metadata'] = json.loads(data['metadata'])
                except json.JSONDecodeError:
                    data['metadata'] = {}

            serializer = SelectedServiceSerializer(data=data)
            if serializer.is_valid():
                serializer.save(trip=trip)
            else:
                print(f"Invalid service data: {serializer.errors}")
        except Exception as e:
            print(f"Exception saving service: {str(e)}")

    def _build_trip_data(self, trip, places, hotels, services):
        return {
            'destination': trip.destination,
            'start_date': trip.start_date.strftime('%Y-%m-%d'),
            'end_date': trip.end_date.strftime('%Y-%m-%d'),
            'interests': getattr(trip, 'preferences', []),
            'places': [
                {
                    'name': p.name,
                    'description': p.description or '',
                    'address': p.address or '',
                    'rating': p.rating or 0,
                    'visit_date': p.visit_date.strftime('%Y-%m-%d') if p.visit_date else None,
                    'visit_time': p.visit_time.strftime('%H:%M') if p.visit_time else None,
                    'metadata': p.metadata or {}
                } for p in places
            ],
            'hotels': [
                {
                    'name': h.name,
                    'address': h.address or '',
                    'check_in_date': h.check_in_date.strftime('%Y-%m-%d') if h.check_in_date else None,
                    'check_out_date': h.check_out_date.strftime('%Y-%m-%d') if h.check_out_date else None,
                    'check_in_time': h.metadata.get('check_in_time', '') if h.metadata else '',
                    'check_out_time': h.metadata.get('check_out_time', '') if h.metadata else '',
                    'metadata': h.metadata or {}
                } for h in hotels
            ],
            'services': [
                {
                    'name': s.name,
                    'type': s.service_type,
                    'service_date': s.service_date.strftime('%Y-%m-%d') if s.service_date else None,
                    'service_time': s.service_time.strftime('%H:%M') if s.service_time else None,
                    'metadata': s.metadata or {}
                } for s in services
            ]
        }

    def _build_prompt(self, trip, duration, trip_data):
        return f"""
You are a professional travel planner assistant with deep expertise in {trip.destination}.

Create a complete and realistic {duration}-day itinerary using the trip data below. The output must be:
- A valid JSON object only (no markdown, no extra commentary)
- Wrapped inside a ```json code block
- Strictly following the schema provided

**Trip Data:**
{json.dumps(trip_data, indent=2)}

**Respond ONLY with JSON in this format:**

```json
{{
  "title": "Detailed {duration}-Day Itinerary for {trip.destination}",
  "description": "Comprehensive travel plan including selected and recommended activities",
  "city": "{trip.destination.split(',')[0].strip()}",
  "state": "State if available",
  "country": "Country if available",
  "price": "Total budget with profit",
  "highlights": "Key attractions and experiences",
  "inclusive": [
    "All selected hotel accommodations",
    "All selected transport services",
    "Entry tickets to selected attractions",
    "Professional guide services where specified",
    "24/7 trip support",
    "Daily breakfast at hotels",
    "All taxes and service charges"
  ],
  "exclusive": [
    "International flights",
    "Travel insurance",
    "Personal expenses",
    "Meals not specified",
    "Optional activities",
    "Tips and gratuities"
  ],
  "start_point": "Starting location",
  "end_point": "Ending location",
  "start_date": "{trip.start_date.strftime('%Y-%m-%d')}",
  "end_date": "{trip.end_date.strftime('%Y-%m-%d')}",
  "interests": {json.dumps(trip.preferences)},
  "itinerary": [
    {{
      "day_number": 1,
      "title": "Day title",
      "description": "Day description",
      "activities": [
        {{
          "time": "HH:MM",
          "activity": "Description",
          "location": "Place name",
          "duration": "X hours",
          "notes": "e.g. travel time, tips, potential issues",
          "type": "place/hotel/service/suggestion",
          "metadata": {{
            "booking_required": true,
            "estimated_cost": "X USD",
            "transport_mode": "walk/car/public transport",
            "transport_service": "service name if applicable",
            "image_url": "URL from selected place/hotel/service",
            "website_url": "URL from selected place/hotel/service",
            "rating": "Rating if available",
            "address": "Full address",
            "phone": "Contact number if available"
          }}
        }}
      ]
    }}
  ],
  "summary": {{
    "total_places": X,
    "total_hotels": X,
    "total_services": X,
    "hotel_coverage": "Fully covered / Missing nights / Overbooked",
    "service_coverage": "All services assigned / Unused / Missing slots",
    "recommendations": [
      "Add another hotel for night 2",
      "Swap Day 3 activities due to weather",
      "Too many places on Day 4 – consider splitting",
      "Additional activities suggestions based on interests"
    ],
    "weather_impact": "How the weather affected the plan",
    "transport_plan": "Summary of transport services usage",
    "budget_breakdown": {{
      "total_cost": "X USD",
      "hotel_costs": "X USD",
      "transport_costs": "X USD",
      "activity_costs": "X USD",
      "meal_costs": "X USD",
      "trip_planner_profit": "X USD (15% of total cost)",
      "total_with_profit": "X USD"
    }},
    "important_notes": [
      "Booking requirements for specific attractions",
      "Weather-related recommendations",
      "Local customs and etiquette",
      "Emergency contact information"
    ]
  }}
}}"""

    def _enrich_metadata(self, itinerary, places, hotels, services):
        for day in itinerary.get('itinerary', []):
            for act in day.get('activities', []):
                obj = None
                if act['type'] == 'place':
                    obj = places.filter(name=act['location']).first()
                elif act['type'] == 'hotel':
                    obj = hotels.filter(name=act['location']).first()
                elif act['type'] == 'service':
                    obj = services.filter(name=act['location']).first()

                if obj:
                    act['metadata'].update({
                        'image_url': getattr(obj, 'image_url', ''),
                        'website_url': getattr(obj, 'website_url', ''),
                        'rating': getattr(obj, 'rating', ''),
                        'address': getattr(obj, 'address', ''),
                        'phone': obj.metadata.get('phone', '') if obj.metadata else ''
                    })


class ItineraryAssigningToExpertAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """Assign an itinerary to a local expert"""
        itinerary_id = request.data.get('trip_id')
        expert_id = request.data.get('expert_id')
        message = request.data.get('message', None)

        if not itinerary_id or not expert_id:
            return Response({'error': "Itinerary ID and Expert ID are required", 'status': False}, status=400)

        itinerary_instance = get_object_or_404(Trip, id=itinerary_id)
        expert_instance = get_object_or_404(User, id=expert_id, is_local_expert=True)

        try:
            with transaction.atomic():
                # Check if there's a rejected advisor for this trip — clean up if so
                rejected_advisors = TripExpertAdvisor.objects.filter(
                    trip=itinerary_instance, status='rejected'
                )
                if rejected_advisors.exists():
                    # Remove rejected advisor's itinerary entry to allow reassignment
                    ExpertUpdatedItinerary.objects.filter(
                        trip=itinerary_instance,
                        created_by__in=rejected_advisors.values_list('local_expert', flat=True)
                    ).delete()
                    rejected_advisors.delete()

                # Check if trip already has an active (pending/accepted) expert
                active_advisor = TripExpertAdvisor.objects.filter(
                    trip=itinerary_instance, status__in=['pending', 'accepted']
                ).first()
                if active_advisor:
                    return Response({
                        'error': 'This trip already has an assigned expert. Remove the current expert before assigning a new one.',
                        'current_expert': str(active_advisor.local_expert.id),
                        'status': False
                    }, status=400)

                # Create TripExpertAdvisor
                TripExpertAdvisor.objects.create(
                    trip=itinerary_instance,
                    local_expert=expert_instance,
                    status='pending',
                    message=message or None
                )

                # Create ExpertUpdatedItinerary (delete old one first if exists)
                ExpertUpdatedItinerary.objects.filter(trip=itinerary_instance).delete()
                ExpertUpdatedItinerary.objects.create(
                    trip=itinerary_instance,
                    created_by=expert_instance,
                    status='pending',
                    message='Initial Itinerary'
                )

        except Exception as e:
            return Response({
                'error': 'Assignment failed.',
                'details': str(e),
                'status': False
            }, status=400)

        return Response({
            'message': "Trip has been successfully assigned to the local expert",
            'status': True
        }, status=200)
    

class ExpertItineraryDecisionAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        advisor_instances = TripExpertAdvisor.objects.filter(local_expert=user).order_by('-assigned_at')

        data = []
        for advisor in advisor_instances:
            itinerary = advisor.trip
            data.append({
                "advisor_id": advisor.id,
                "itinerary_title": itinerary.title,
                "itinerary_id": itinerary.id,
                "created_by": itinerary.user.username,
                "created_at": itinerary.created_at,
                "status": advisor.status,
                "assigned_at": advisor.assigned_at
            })

        return Response({"message": "Data Fetched Successfully", "data": data, "status": True}, status=200)

    def post(self, request, *args, **kwargs):
        advisor_id = request.data.get('advisor_id')
        decision = request.data.get('decision')

        advisor = get_object_or_404(TripExpertAdvisor, id=advisor_id, local_expert=request.user)

        if decision not in ['accepted', 'rejected']:
            return Response({'error': 'Invalid decision', 'status': False}, status=400)

        advisor.status = decision
        advisor.save()

        return Response({'message': f'Invitation {decision} successfully', 'status': True}, status=200)

class ItineraryChatAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request,*args, **kwargs):
        """
        Fetch chat messages for a specific itinerary between user and expert
        """

        pk = self.kwargs.get('pk')
        advisor = get_object_or_404(TripExpertAdvisor, id=pk)

        if request.user != advisor.local_expert and request.user != advisor.trip_expert.trip_planner:
            return Response({"error": "Not authorized to view this chat."}, status=403)

        messages = TripExpertAdvisorChat.objects.filter(trip_expert=advisor).order_by("-created_at")
        serializer = TripExpertAdvisorChatSerializer(messages, many=True)
        return Response({"message": "Chat fetched", "data": serializer.data, "status": True}, status=200)

    def post(self, request,*args, **kwargs):
        pk = self.kwargs.get('pk')
        advisor = get_object_or_404(TripExpertAdvisor, id=pk)

        if request.user != advisor.local_expert and request.user != advisor.trip.user:
            return Response({"error": "Not authorized to send message."}, status=403)

        serializer = TripExpertAdvisorChatSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(sender=request.user, trip_expert=advisor)
            return Response({"message": "Message sent", "data": serializer.data, "status": True}, status=201)
        return Response({"error": serializer.errors, "status": False}, status=400)
    
class ReviewCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data.copy()
        serializer = ReviewRatingSerializer(data=data, context={'request': request})

        if serializer.is_valid():
            local_expert = serializer.validated_data['local_expert']
            reviewer = request.user

            if ReviewRating.objects.filter(local_expert=local_expert, reviewer=reviewer).exists():
                return Response(
                    {"detail": "You have already reviewed this expert."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            serializer.save(reviewer=reviewer)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class PublicExpertReviewListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, expert_id):
        try:
            expert = User.objects.get(id=expert_id, is_local_expert=True)
        except User.DoesNotExist:
            return Response({'detail': 'Local expert not found.'}, status=status.HTTP_404_NOT_FOUND)

        reviews = ReviewRating.objects.filter(local_expert=expert)
        serializer = ReviewRatingSerializer(reviews, many=True)
        return Response(serializer.data)
    
class MyWrittenReviewsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        reviews = ReviewRating.objects.filter(reviewer=user)
        serializer = ReviewRatingSerializer(reviews, many=True)
        return Response(serializer.data)
    
class ListItineraryAPIView(APIView):
    def get(self, request,*args, **kwargs):
        print(f"User: {request.user}, Authenticated: {request.user.is_authenticated}")
        
        # Get all trips for this user
        user_trips = Trip.objects.filter(user=request.user)
        print(f"User trips count: {user_trips.count()}")
        
        # Get all generated itineraries for this user
        my_itinerary = GeneratedItinerary.objects.filter(trip__user=request.user).all()
        print(f"Generated itineraries count: {my_itinerary.count()}")
        
        serializer = GeneratedItinerarySerializer(my_itinerary, many=True)
        return Response(serializer.data)


class GeneratedItineraryDetailAPIView(APIView):
    def get(self, request, id, *args, **kwargs):
        try:
            itinerary = GeneratedItinerary.objects.get(id=id)
        except GeneratedItinerary.DoesNotExist:
            return Response({'message': 'Generated itinerary not found', 'status': False}, status=404)
        serializer = GeneratedItinerarySerializer(itinerary)
        return Response(serializer.data)


class UpdateItinerary(APIView):
    def patch(self, request,*args, **kwargs):
        trip_id = kwargs.get('trip_id',None)
        if not trip_id :
            return Response({'message':"No trip id provided",'status':False}, status= 400)
        
        instance = Trip.objects.filter(id=trip_id).first()
        if not instance:
            return Response({'message':"No Trip Found",'status':False}, status= 404)
        
        ai_trip = GeneratedItinerary.objects.filter(trip=instance).first()
        if not ai_trip:
            return Response({'message':"No AI Trip Found",'status':False}, status= 404)
    

        if instance.user == request.user:
            serializer = UpdateItinerarySerializer(ai_trip, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response({'message':"itinerary updated successfully",'status':True},status=200)
            else:
                return Response({'message': "Validation failed", 'errors': serializer.errors, 'status': False}, status=400)

        else:
            return Response({'message':"No Permission to Update the Itinerary",'status':False}, status=403)

class ExpertUpdatedItineraryView(APIView):
    def get(self, request, trip_id):
        trip = get_object_or_404(Trip, id=trip_id)

        expert_assignment = TripExpertAdvisor.objects.filter(trip=trip, status='accepted').first()

        if request.user != trip.user and (not expert_assignment or request.user != expert_assignment.local_expert):
            return Response({'message': "Permission denied", 'status': False}, status=403)

        itineraries = ExpertUpdatedItinerary.objects.filter(trip=trip).order_by('-created_at')
        serializer = ExpertUpdatedItinerarySerializer(itineraries, many=True)
        return Response({'data': serializer.data, 'status': True}, status=200)

    def patch(self, request, trip_id):
        trip = get_object_or_404(Trip, id=trip_id)

        # Ensure the user is the assigned expert
        expert_assignment = TripExpertAdvisor.objects.filter(
            trip=trip,
            local_expert=request.user,
            status='accepted'
        ).first()

        if not expert_assignment:
            return Response({'message': "Only the assigned local expert can update the itinerary", 'status': False}, status=403)

        message = request.data.get("message")
        if not message:
            return Response({'message': "Message is required", 'status': False}, status=400)

        # Get the existing ExpertUpdatedItinerary
        itinerary_instance = ExpertUpdatedItinerary.objects.filter(
            trip=trip,
            created_by=request.user
        ).first()

        if not itinerary_instance:
            return Response({'message': "No existing itinerary found to update", 'status': False}, status=404)

        serializer = ExpertUpdatedItinerarySerializer(
            itinerary_instance,
            data=request.data,
            partial=True  # PATCH allows partial update
        )

        if serializer.is_valid():
            try:
                with transaction.atomic():
                    serializer.save(
                        trip=trip,
                        created_by=request.user,
                        status='pending'
                    )
                return Response({'message': "Itinerary updated", 'data': serializer.data, 'status': True}, status=200)
            except Exception as e:
                return Response({'message': "Update failed", 'error': str(e), 'status': False}, status=500)

        return Response({'message': "Validation failed", 'errors': serializer.errors, 'status': False}, status=400)

class DecisionExpertUpdatedItineraryAPIView(APIView):
    def patch(self, request, id):
        status = request.data.get('status')
        if status not in ['accepted', 'rejected']:
            return Response({'message': "Invalid status", 'status': False}, status=400)

        try:
            expert_itinerary = ExpertUpdatedItinerary.objects.get(id=id)
        except ExpertUpdatedItinerary.DoesNotExist:
            return Response({'message': "Expert itinerary not found", 'status': False}, status=404)

        trip = expert_itinerary.trip
        generated_itinerary = getattr(trip, 'generated_itinerary', None)

        if not generated_itinerary:
            return Response({'message': "Generated itinerary does not exist for this trip", 'status': False}, status=404)
        if request.user != generated_itinerary.trip.user:
            return Response({'message': "Permission denied", 'status': False}, status=403)
        message = None
        if status == 'accepted':
            generated_itinerary.itinerary_data = expert_itinerary.itinerary_data
            generated_itinerary.status = 'completed'
            generated_itinerary.error_message = ''
            generated_itinerary.updated_at = timezone.now()
            expert_itinerary.status = 'accepted'
            generated_itinerary.save()
            message = "Generated itinerary updated from expert successfully"
        else:
            expert_itinerary.itinerary_data = generated_itinerary.itinerary_data
            expert_itinerary.status = 'rejected'
            expert_itinerary.save()
            message = "Expert Itinerary is rejected."

        return Response({'message': message, 'status': True}, status=200)
    

class DiscoverPlacesAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        query = request.GET.get("search", "").strip()
        location = query.title() if query else None
        places = None
        search_obj = None
        events = []
        gpt_error = None

        if query:
            search_obj = TouristPlacesSearches.objects.filter(search__iexact=query).first()

            if search_obj:
                places = TouristPlaceResults.objects.filter(search=search_obj)
            else:
                data_list = fetch_travel_data_agentic(f"Top Tourist Attraction Places to visit in {query}?")

                if not data_list or "places" not in data_list or not data_list["places"]:
                    gpt_error = data_list.get("error") if data_list else "No response from OpenAI"
                else:
                    search_obj = TouristPlacesSearches.objects.create(search=query)

                    for item in data_list["places"]:
                        try:
                            country = item.get("country", "").strip()
                            city = item.get("city", "").strip()
                            place_name = item.get("place", "").strip()

                            search_query = f"beautiful and attractive images of {place_name} in {country}"
                            images = fetch_images_via_serp_api(search_query, SERP_API_KEY)
                            

                            if not TouristPlaceResults.objects.filter(
                                country__iexact=country,
                                city__iexact=city,
                                place__iexact=place_name
                            ).exists():
                                TouristPlaceResults.objects.create(
                                    search=search_obj,
                                    country=country,
                                    city=city,
                                    place=place_name,
                                    description=item.get("description", ""),
                                    activities=item.get("activities", []),
                                    festivals=item.get("festivals", []),
                                    latitude=item.get("latitude"),
                                    longitude=item.get("longitude"),
                                    category=item.get("category", ""),
                                    best_months=item.get("best_months", ""),
                                    image_url=images
                                )
                        except Exception as e:
                            print(f"Error saving place: {e} - {item}")

                    places = TouristPlaceResults.objects.filter(search=search_obj)

            try:
                events_data = fetch_live_events(query, datetime.now().year, SERP_API_KEY)
                events = [
                    {
                        "title": event.get("title", ""),
                        "start_date": event.get("date", {}).get("start_date", ""),
                        "address": event.get("address", ""),
                        "link": event.get("link", ""),
                        "image_url": event.get("thumbnail", ""),
                        "venue": event.get("venue", ""),
                        "ticket_info": event.get("ticket_info", "")
                    }
                    for event in events_data
                ]
            except Exception as e:
                print(f"Failed to fetch live events: {e}")
                events = []

        else:
            all_searches = TouristPlacesSearches.objects.all()
            if not all_searches.exists():
                return Response({"error": "No cached searches found."}, status=status.HTTP_404_NOT_FOUND)

            # Get all searches that have places with data
            searches_with_data = []
            for search in all_searches:
                places = TouristPlaceResults.objects.filter(search=search)
                if places.exists():
                    searches_with_data.append(search)
            
            if not searches_with_data:
                return Response({"error": "No places with data found."}, status=status.HTTP_404_NOT_FOUND)

            search_obj = random.choice(searches_with_data)
            location = search_obj.search
            places = TouristPlaceResults.objects.filter(search=search_obj)
            events = []

        if not places or not places.exists():
            # Build response without empty arrays
            response_data = {
                "location": location,
                "gpt_error": gpt_error,
                "error": "No places found."
            }
            
            # Only include live_events if it has data
            if events:
                response_data["live_events"] = events
                
            return Response(response_data, status=status.HTTP_404_NOT_FOUND)

        categories = TouristPlaceCategory.objects.all().values_list('name', flat=True)

        activity_counter = Counter()
        for place in places:
            if isinstance(place.activities, list):
                activity_counter.update(place.activities)

        popular_activities = [
            {"name": name, "count": count}
            for name, count in activity_counter.most_common()
        ]

        # Filter places that have meaningful data in must_go_places
        must_go_places = []
        for p in places:
            # Check if place has meaningful data (not empty/null)
            if (p.place and p.place.strip() and 
                p.city and p.city.strip() and 
                p.description and p.description.strip()):
                
                must_go_places.append({
                    "id": p.id,
                    "place": p.place,
                    "city": p.city,
                    "category": p.category,
                    "image_url": p.image_url,
                    "description": p.description,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                })

        # If no meaningful must_go_places found, return error
        if not must_go_places:
            response_data = {
                "location": location,
                "gpt_error": gpt_error,
                "error": "No places found."
            }
            
            # Only include live_events if it has data
            if events:
                response_data["live_events"] = events
                
            return Response(response_data, status=status.HTTP_404_NOT_FOUND)

        # Build response with conditional fields
        response_data = {
            "location": location,
            "gpt_error": gpt_error
        }
        
        # Only include categories if they exist
        if categories:
            response_data["categories"] = list(categories)
            
        # Only include popular_activities if they exist
        if popular_activities:
            response_data["popular_activities"] = popular_activities
            
        # Include must_go_places (we already filtered for meaningful data)
        response_data["must_go_places"] = must_go_places
            
        # Only include live_events if they exist
        if events:
            response_data["live_events"] = events

        return Response(response_data)
    
class TouristPreferenceListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TouristPreferenceSerializer

    def get_queryset(self):
        return TouristPreferences.objects.filter(user=self.request.user)
    def list(self,request,*args,**kwargs):
        instances = self.get_queryset()
        serializer = TouristPreferenceSerializer(instances,many=True)
        return Response({'message':"Fetched Successfully","data":serializer.data,"status":True}, status=200)
    def create(self, request, *args, **kwargs):
        place_id = request.data.get('place_id')
        if not place_id:
            return Response({"error": "place_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            place = TouristPlaceResults.objects.get(id=place_id)
        except TouristPlaceResults.DoesNotExist:
            return Response({"error": "Tourist place not found","status":False}, status=status.HTTP_404_NOT_FOUND)

        pref, created = TouristPreferences.objects.get_or_create(
            user=request.user, preference=place
        )

        if not created:
            return Response({"message": "Already in preferences","status":True}, status=status.HTTP_200_OK)

        serializer = self.get_serializer(pref)
        return Response({"message":"Preference added Successfully","status":True}, status=status.HTTP_201_CREATED)


class TouristPreferenceDestroyAPIView(mixins.DestroyModelMixin,
                                      generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    queryset = TouristPreferences.objects.all()
    serializer_class = TouristPreferenceSerializer

    def delete(self, request, *args, **kwargs):
        place_id = request.data.get('place_id')
        if not place_id:
            return Response({"error": "place_id is required","status":False}, status=status.HTTP_400_BAD_REQUEST)
        try:
            pref = self.get_queryset().get(user=request.user, preference_id=place_id)
            pref.delete()
            return Response({"message": "Preference removed","status":True}, status=status.HTTP_200_OK)
        except TouristPreferences.DoesNotExist:
            return Response({"error": "Preference not found","status":False}, status=status.HTTP_404_NOT_FOUND)
        

class TouristPreferenceActivityListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TouristPlaceActivitySerializer

    def get_queryset(self):
        return TouristHelpMeGuideActivities.objects.filter(user=self.request.user)
    
    def list(self,request,*args,**kwargs):
        instances = self.get_queryset()
        serializer = TouristPlaceActivitySerializer(instances,many=True)
        return Response({'message':"Fetched Successfully","data":serializer.data,"status":True}, status=200)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response({"message":"Acttivity Preference added Successfully","status":True}, status=status.HTTP_201_CREATED)


class TouristPreferenceActivityDestroyAPIView(mixins.DestroyModelMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    queryset = TouristHelpMeGuideActivities.objects.all()
    serializer_class = TouristPlaceActivitySerializer

    def delete(self, request, *args, **kwargs):
        activity_id = self.kwargs.get('activity_id')
        if not activity_id:
            return Response({"error": "Preference not found","status":False}, status=status.HTTP_404_NOT_FOUND)
        pref = self.get_queryset().get(user=request.user,id=activity_id)
        pref.delete()
        return Response({"message": "Activity Preference removed","status":True}, status=status.HTTP_200_OK)
    
class TouristPreferenceEventListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TouristHelpMeGuideEventSerializer

    def get_queryset(self):
        return TouristHelpMeGuideEvents.objects.filter(user=self.request.user)
    
    def list(self,request,*args,**kwargs):
        instances = self.get_queryset()
        serializer = TouristHelpMeGuideEventSerializer(instances,many=True)
        return Response({'message':"Fetched Successfully","data":serializer.data,"status":True}, status=200)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response({"message":"Event Preference added Successfully","status":True}, status=status.HTTP_201_CREATED)


class TouristPreferenceEventDestroyAPIView(mixins.DestroyModelMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    queryset = TouristHelpMeGuideEvents.objects.all()
    serializer_class = TouristHelpMeGuideEventSerializer

    def delete(self, request, *args, **kwargs):
        event_id = self.kwargs.get('event_id')
        if not event_id:
            return Response({"error": "Event Preference not found","status":False}, status=status.HTTP_404_NOT_FOUND)
        pref = self.get_queryset().get(user=request.user,id=event_id)
        pref.delete()
        return Response({"message": "Event Preference removed","status":True}, status=status.HTTP_200_OK)
    

class CategoryListAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        categories = TouristPlaceCategory.objects.all().order_by('name')
        category_list = [
            {
                "id": category.id,
                "name": category.name,
                "created_at": category.created_at,
                "updated_at": category.updated_at
            }
            for category in categories
        ]
        
        return Response({
            "categories": category_list,
            "count": len(category_list)
        })


class GenerateItineraryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        start_date = parse_date(request.data.get("start_date"))
        end_date = parse_date(request.data.get("end_date"))
        place_ids = request.data.get("place_ids", [])

        if not place_ids or not isinstance(place_ids, list):
            return Response({"error": "place_ids must be a list of IDs."}, status=status.HTTP_400_BAD_REQUEST)
        
        if not start_date or not end_date or end_date <= start_date:
            return Response({"error": "Invalid start or end date."}, status=status.HTTP_400_BAD_REQUEST)

        tourist_places = TouristPlaceResults.objects.filter(id__in=place_ids)

        if tourist_places.count() != len(place_ids):
            return Response({"error": "Some place IDs are invalid."}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure all places are from the same country
        country_set = set(tourist_places.values_list("country", flat=True))
        if len(country_set) != 1:
            return Response({"error": "All selected places must be from the same country."}, status=status.HTTP_400_BAD_REQUEST)

        total_days = (end_date - start_date).days
        categories = {
            "Nightlife": [],
            "Religious": [],
            "Food": [],
            "Adventure": []
        }

        prompt = self.build_prompt(tourist_places, start_date, end_date, total_days, categories)

        try:
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a professional travel planner. Respond strictly in valid JSON format as requested."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7
            )
            raw_result = response.choices[0].message.content.strip()

            itinerary_data = json.loads(raw_result)

            inclusive = ", ".join(itinerary_data.get("inclusive", []))
            exclusive = ", ".join(itinerary_data.get("exclusive", []))
            places = itinerary_data.get("places", [])
            day_by_day_plan = itinerary_data.get("day_by_day_plan", {})

            summary_description = f"Trip from {itinerary_data.get('start_point')} to {itinerary_data.get('end_point')} over {itinerary_data.get('number_of_days')} days."

            trip = HelpGuideTrip.objects.create(
                user=user,
                country=tourist_places.first().country,
                state="",
                city=tourist_places.first().city,
                title=f"Trip to {tourist_places.first().city}",
                description=summary_description,
                highlights=", ".join([p["highlights"] for p in places if "highlights" in p]),
                days=itinerary_data.get("number_of_days", total_days),
                nights=itinerary_data.get("number_of_nights", total_days - 1),
                price=itinerary_data.get("price", []),
                old_price=itinerary_data.get("old_price", []),
                start_date=start_date,
                end_date=end_date,
                inclusive=inclusive,
                exclusive=exclusive,
                metadata={
                    "places": places,
                    "day_by_day_plan": day_by_day_plan
                }
            )

            serializer = HelpGuideTripSerializer(trip)
            return Response({
                "message": "Itinerary created successfully.", 
                "trip_id": str(trip.id),
                "data": serializer.data
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def build_prompt(self, places, start_date, end_date, days, categories):
        place_summaries = ""
        for p in places:
            place_summaries += (
                f"\n- {p.place} ({p.category}) in {p.city}: {p.description}. "
                f"Activities: {', '.join(p.activities or [])}. Festivals: {', '.join(p.festivals or [])}."
            )

        format_description = """
Return the itinerary in the following JSON format:
{
  "start_point": "City name",
  "end_point": "City name",
  "number_of_days": 5,
  "number_of_nights": 4,
  "price":x.00, (THe Price will be the estimated cost of the whole trip in Dollars)
  "old_price":x.00, (Old Price will be slight less than the Actual Price.)
  "places": [
    {
      "name": "Place Name",
      "city": "City",
      "category": "e.g. Religious / Food / Adventure / Nightlife",
      "highlights": "Short highlight of this place",
      "day": 1
    },
    ...
  ],
  "inclusive": ["Hotels", "Sightseeing", "Transportation"],
  "exclusive": ["Flights", "Personal expenses"],
  "day_by_day_plan": {
    "Day 1": "Visit X, Y, Z...",
    "Day 2": "...",
    ...
  }
}
"""

        prompt = f"""
I am planning a trip from {start_date} to {end_date}, which is {days} days long.

Here are the selected tourist places:{place_summaries}

Please generate a realistic, exciting, and balanced itinerary in valid JSON using this structure:
{format_description}

The itinerary should include categories such as nightlife, religious, food, and adventure. Assign them accordingly. Choose a start_point and end_point from the cities involved.
Include a list of what's inclusive and exclusive, and provide a clear day-by-day plan for the whole trip.
"""
        return prompt
    

"""
class TripExploreView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        print("DEBUG: /ai/explore/ endpoint hit", flush=True)
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        destination = request.data.get('destination')
        preferences = request.data.get('preferences', [])

        if not all([start_date, end_date, destination]):
            return Response({'error': 'start_date, end_date, and destination are required'}, status=400)

        # === 1. Check for existing trip ===
        trip = Trip.objects.filter(destination=destination).first()
        if trip:

            places = SelectedPlace.objects.filter(destination=destination)
            hotels = SelectedHotel.objects.filter(destination=destination)
            services = SelectedService.objects.filter(destination=destination)

            return Response({
                'trip_id': trip.id,
                'places': [self.serialize_place(p) for p in places],
                'hotels': [self.serialize_hotel(h) for h in hotels],
                'services': [self.serialize_service(s) for s in services]
            })

        # === 2. Create SerpAPI queries ===
        search_query = f"top tourist attractions in {destination}"
        if preferences:
            preferences_str = " and ".join(preferences)
            search_query = f"best {preferences_str} places in {destination}"

        places_params = {
            "engine": "google_maps",
            "q": search_query,
            "hl": "en",
            "api_key": SERP_API_KEY,
            "location": destination
        }

        hotels_params = {
            "engine": "google_hotels",
            "q": f"hotels in {destination}",
            "check_in_date": start_date,
            "check_out_date": end_date,
            "hl": "en",
            "api_key": SERP_API_KEY,
            "currency": "USD"
        }

        services_params = {
            "engine": "google_maps",
            "q": f"transport services in {destination}",
            "hl": "en",
            "api_key": SERP_API_KEY,
            "location": destination
        }

        try:
            places_data = requests.get("https://serpapi.com/search", params=places_params).json()
            print("SERP places_data:", places_data, flush=True)
            hotels_data = requests.get("https://serpapi.com/search", params=hotels_params).json()
            print("SERP hotels_data:", hotels_data, flush=True)
            services_data = requests.get("https://serpapi.com/search", params=services_params).json()
            print("SERP services_data:", services_data, flush=True)

            # === 3. Create Trip and store data ===
            trip = Trip.objects.create(
                user=request.user,  # Associate trip with the current user
                title=f"{destination} Trip",
                start_date=start_date,
                end_date=end_date,
                destination=destination,
                preferences=preferences
            )

            # === Parse and Save Places ===
            places = self.parse_places(places_data)
            for p in places:
                SelectedPlace.objects.create(destination=destination,**p)

            # === Parse and Save Hotels ===
            hotels = self.parse_hotels(hotels_data)
            for h in hotels:
                SelectedHotel.objects.create(destination=destination,**h)

            # === Parse and Save Services ===
            services = self.parse_services(services_data)
            for s in services:
                SelectedService.objects.create(destination=destination,**s)

            return Response({
                'trip_id': trip.id,
                'places': places,
                'hotels': hotels,
                'services': services
            })

        except Exception as e:
            return Response({'error': str(e)}, status=500)

    def parse_places(self, data):
        results = []
        for p in data.get("local_results", []):
            if p.get('thumbnail') and p.get('website'):
                results.append({
                    'place_id': p.get('place_id'),
                    'name': p.get('title'),
                    'description': p.get('snippet', ''),
                    'address': p.get('address', ''),
                    'rating': p.get('rating', 0),
                    'image_url': p.get('thumbnail'),
                    'website_url': p.get('website'),
                    'metadata': {
                        'reviews_count': p.get('reviews', 0),
                        'hours': p.get('hours', {}),
                        'phone': p.get('phone', '')
                    }
                })
        return results

    def parse_hotels(self, data):
        results = []
        for h in data.get("properties", []):
            print("\n\nHotels data: --> ", h)
            image_url = h.get('images', [{}])[0].get('thumbnail', '')
            if image_url and h.get('link'):
                results.append({
                    'hotel_id': h.get('property_token'),
                    'name': h.get('name'),
                    'description': h.get('description', ''),
                    'address': h.get('address', ''),
                    'rating': h.get('overall_rating', 0),
                    'price_range': f"{h.get('rate_per_night', {}).get('lowest', '')} - {h.get('rate_per_night', {}).get('highest', '')}",
                    'image_url': image_url,
                    'website_url': h.get('link'),
                    'metadata': {
                        'amenities': h.get('amenities', []),
                        'reviews_count': h.get('reviews', 0),
                        'check_in_time': h.get('check_in_time', ''),
                        'check_out_time': h.get('check_out_time', ''),
                        'hotel_class': h.get('hotel_class', ''),
                        'location_rating': h.get('location_rating', 0)
                    }
                })
        return results

    def parse_services(self, data):
        results = []
        for s in data.get("local_results", []):
            if s.get('thumbnail'):
                results.append({
                    'service_id': s.get('place_id'),
                    'name': s.get('title'),
                    'description': s.get('snippet', ''),
                    'service_type': 'transport',
                    'price_range': s.get('price', ''),
                    'image_url': s.get('thumbnail'),
                    'website_url': s.get('website'),
                    'metadata': {
                        'reviews_count': s.get('reviews', 0),
                        'hours': s.get('hours', {}),
                        'phone': s.get('phone', '')
                    }
                })
        return results

    def serialize_place(self, obj):
        return {
            'place_id': obj.place_id,
            'name': obj.name,
            'description': obj.description,
            'address': obj.address,
            'rating': obj.rating,
            'image_url': obj.image_url,
            'website_url': obj.website_url,
            'metadata': obj.metadata
        }

    def serialize_hotel(self, obj):
        return {
            'hotel_id': obj.hotel_id,
            'name': obj.name,
            'description': obj.description,
            'address': obj.address,
            'rating': obj.rating,
            'price_range': obj.price_range,
            'image_url': obj.image_url,
            'website_url': obj.website_url,
            'metadata': obj.metadata
        }

    def serialize_service(self, obj):
        return {
            'service_id': obj.service_id,
            'name': obj.name,
            'description': obj.description,
            'service_type': obj.service_type,
            'price_range': obj.price_range,
            'image_url': obj.image_url,
            'website_url': obj.website_url,
            'metadata': obj.metadata
        }
"""

class TripSubmitView(APIView):
    permission_classes = [IsAuthenticated]  # Changed to require authentication for wallet

    def post(self, request):
        # Check wallet balance first
        from subscription.wallet_utils import check_wallet_balance
        user = request.user
        
        has_credits, message, current_credits, current_balance = check_wallet_balance(user, 0.50)
        if not has_credits:
            return Response({
                "error": message,
                "remaining_credits": current_credits,
                "remaining_balance": current_balance,
                "required_credits": 1,
                "api_name": "generate_explore"
            }, status=402)
        
        # Deduct from wallet
        from subscription.views import track_api_usage
        success, message, remaining_credits, remaining_balance = track_api_usage(user, "generate_explore", 0.50)
        if not success:
            return Response({
                "error": message,
                "remaining_credits": remaining_credits,
                "remaining_balance": remaining_balance,
                "required_credits": 1,
                "api_name": "generate_explore"
            }, status=402)
        trip_id = request.data.get('trip_id')
        places = request.data.get('places', [])
        hotels = request.data.get('hotels', [])
        services = request.data.get('services', [])
        flights = request.data.get('flights', [])  # Add flights
        notes = request.data.get('notes',[])
        
        # Get affiliate data if provided
        affiliate_hotels = request.data.get('hotels', [])  # This will be affiliate data
        affiliate_cars = request.data.get('cars', [])      # This will be affiliate data
        affiliate_flights = request.data.get('flights', []) # This will be affiliate data

        if not trip_id:
            return Response({'error': 'Missing trip_id'}, status=400)

        try:
            # Only fetch the trip, no related model queries
            trip = Trip.objects.get(id=trip_id)
            print("Fetched Trip:", trip)
            
            # If user is authenticated and trip doesn't have a user, associate it
            if request.user.is_authenticated and not trip.user:
                trip.user = request.user
                trip.save()
                print(f"Associated trip {trip.id} with user {request.user}")


            print(f"Saving {len(places)} places for trip {trip.id}")
            for place in places:
                print(f"  - Place: {place.get('name', 'No name')} (ID: {place.get('place_id', 'No ID')})")
                TripSelectedPlace.objects.create(
                    trip=trip,
                    place_id=place.get('place_id', ''),
                    name=place.get('name', ''),
                    description=place.get('description', ''),
                    address=place.get('address', ''),
                    rating=place.get('rating', None),
                    image_url=place.get('image_url', ''),
                    website_url=place.get('website_url', ''),
                    metadata=place.get('metadata', {})
                )

            print(f"Saving {len(hotels)} hotels for trip {trip.id}")
            for hotel in hotels:
                print(f"  - Hotel: {hotel.get('name', 'No name')} (ID: {hotel.get('hotel_id', 'No ID')})")
                TripSelectedHotel.objects.create(
                    trip=trip,
                    hotel_id=hotel.get('hotel_id', ''),
                    name=hotel.get('name', ''),
                    description=hotel.get('description', ''),
                    address=hotel.get('address', ''),
                    rating=hotel.get('rating', None),
                    price_range=hotel.get('price_range', ''),
                    image_url=hotel.get('image_url', ''),
                    website_url=hotel.get('website_url', ''),
                    metadata=hotel.get('metadata', {})
                )

            print(f"Saving {len(services)} services for trip {trip.id}")
            for service in services:
                print(f"  - Service: {service.get('name', 'No name')} (ID: {service.get('service_id', 'No ID')})")
                TripSelectedService.objects.create(
                    trip=trip,
                    service_id=service.get('service_id', ''),
                    name=service.get('name', ''),
                    description=service.get('description', ''),
                    service_type=service.get('service_type', ''),
                    price_range=service.get('price_range', ''),
                    image_url=service.get('image_url', ''),
                    website_url=service.get('website_url', ''),
                    metadata=service.get('metadata', {})
                )

            print(f"Saving {len(flights)} flights for trip {trip.id}")
            for flight in flights:
                print(f"  - Flight: {flight.get('name', 'No name')} (ID: {flight.get('flight_id', 'No ID')})")
                TripSelectedFlight.objects.create(
                    trip=trip,
                    flight_id=flight.get('flight_id', ''),
                    name=flight.get('name', ''),
                    description=flight.get('description', ''),
                    origin=flight.get('origin', ''),
                    destination=flight.get('destination', ''),
                    departure_date=flight.get('departure_date'),
                    return_date=flight.get('return_date'),
                    price_range=flight.get('price_range', ''),
                    image_url=flight.get('image_url', ''),
                    website_url=flight.get('website_url', ''),
                    metadata=flight.get('metadata', {})
                )
            # --- End save logic ---

            # Clean up service metadata (in-memory only)
            for service in services:
                if isinstance(service.get('metadata'), str):
                    try:
                        service['metadata'] = json.loads(service['metadata'])
                    except:
                        service['metadata'] = {}

            print("Preparing to generate AI itinerary...")
            duration = (trip.end_date - trip.start_date).days + 1
            print("Duration:", duration)

            # Use in-memory provided data
            trip_data_for_prompt = self._build_trip_data(trip, places, hotels, services)
            print("Trip data for prompt generated.")

            prompt = self._build_prompt(trip, duration, trip_data_for_prompt,notes)
            print("Prompt generated.")

            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a travel itinerary expert."},
                    {"role": "user", "content": prompt}
                ]
            )

            raw_response = response.choices[0].message.content
            print("Raw response:", raw_response)

            # Extract JSON from markdown-style block or fallback
            match = re.search(r"```json(.*?)```", raw_response, re.DOTALL)
            json_str = match.group(1).strip() if match else raw_response.strip()
            try:
                itinerary = demjson3.decode(json_str)
            except demjson3.JSONDecodeError as e:
                return Response({'error': f'Invalid itinerary JSON: {str(e)}'}, status=500)

            print("Parsed Itinerary:", itinerary)

            # Enrich with in-memory data
            self._enrich_metadata(itinerary, places, hotels, services)

            itinerary_obj, created = GeneratedItinerary.objects.update_or_create(
                trip=trip,
                defaults={'itinerary_data': itinerary, 'status': 'completed'}
            )
            trip.status = 'confirmed'
            trip.save()

            # Prepare response with affiliate data
            response_data = {
                'message': 'Trip created and itinerary generated',
                'trip_id': str(trip.id),
                'itinerary_id': str(itinerary_obj.id),
                'itinerary': itinerary,
                'wallet_info': {
                    'api_used': 'generate_explore',
                    'credits_deducted': 1,
                    'remaining_credits': remaining_credits,
                    'remaining_balance': remaining_balance,
                    'cost_deducted': 0.50  # Keep for backward compatibility
                }
            }
            
            # Add affiliate data if provided
            if affiliate_hotels:
                response_data['hotels'] = affiliate_hotels
            if affiliate_cars:
                response_data['cars'] = affiliate_cars
            if affiliate_flights:
                response_data['flights'] = affiliate_flights
                
            return Response(response_data)

        except Exception as e:
            return Response({'error': str(e)}, status=500)
        
    def _save_service(self, data, trip):
        try:
            defaults = {
                'service_id': f"service_{random.randint(10000, 99999)}",
                'name': "Unnamed Service",
                'service_type': "other",
                'description': "",
                'price_range': "",
                'image_url': "",
                'website_url': "",
                'notes': "",
                'metadata': {},
                'trip': trip.id
            }
            for key, val in defaults.items():
                if not data.get(key):
                    data[key] = val

            if isinstance(data['metadata'], str):
                try:
                    data['metadata'] = json.loads(data['metadata'])
                except json.JSONDecodeError:
                    data['metadata'] = {}

            serializer = SelectedServiceSerializer(data=data)
            if serializer.is_valid():
                serializer.save(trip=trip)
            else:
                print(f"Invalid service data: {serializer.errors}")
        except Exception as e:
            print(f"Exception saving service: {str(e)}")

    def _build_trip_data(self, trip, places, hotels, services):
        data = {
            'destination': trip.destination,
            'start_date': trip.start_date.strftime('%Y-%m-%d'),
            'end_date': trip.end_date.strftime('%Y-%m-%d'),
            'preferences': getattr(trip, 'preferences', []),
            'places': [
                {
                    'name': p.get('name', ''),
                    'description': p.get('description', ''),
                    'address': p.get('address', ''),
                    'rating': p.get('rating', 0),
                    'visit_date': p.get('visit_date'),
                    'visit_time': p.get('visit_time'),
                    'metadata': p.get('metadata', {})
                } for p in places
            ],
            'hotels': [
                {
                    'name': h.get('name', ''),
                    'address': h.get('address', ''),
                    'check_in_date': h.get('check_in_date'),
                    'check_out_date': h.get('check_out_date'),
                    'check_in_time': h.get('metadata', {}).get('check_in_time', ''),
                    'check_out_time': h.get('metadata', {}).get('check_out_time', ''),
                    'metadata': h.get('metadata', {})
                } for h in hotels
            ],
            'services': [
                {
                    'name': s.get('name', ''),
                    'type': s.get('service_type', ''),
                    'service_date': s.get('service_date'),
                    'service_time': s.get('service_time'),
                    'metadata': s.get('metadata', {})
                } for s in services
            ]
        }
        print(data)
        return data

    def _build_prompt(self, trip, duration, trip_data,notes):
        return f"""
Expert planner for {trip.destination}. Build a {duration}-day itinerary from:
{json.dumps(trip_data, indent=2)}
User notes: {notes}
Return ONLY a JSON block like:

**Respond ONLY with JSON in this format:**

```json
{{
  "title": "Detailed {duration}-Day Itinerary for {trip.destination}",
  "description": "Comprehensive travel plan including selected and recommended activities",
  "city": "{trip.destination.split(',')[0].strip()}",
  "state": "State if available",
  "country": "Country if available",
  "price": "Total budget with profit",
  "highlights": "Key attractions and experiences",
  "inclusive": [
    "All selected hotel accommodations",
    "All selected transport services",
    "Entry tickets to selected attractions",
    "Professional guide services where specified",
    "24/7 trip support",
    "Daily breakfast at hotels",
    "All taxes and service charges"
  ],
  "exclusive": [
    "International flights",
    "Travel insurance",
    "Personal expenses",
    "Meals not specified",
    "Optional activities",
    "Tips and gratuities"
  ],
  "start_point": "Starting location",
  "end_point": "Ending location",
  "start_date": "{trip.start_date.strftime('%Y-%m-%d')}",
  "end_date": "{trip.end_date.strftime('%Y-%m-%d')}",
  "preferences": {json.dumps(trip.preferences)},
  "itinerary": [
    {{
      "day_number": 1,
      "title": "Day title",
      "description": "Day description",
      "activities": [
        {{
          "time": "HH:MM",
          "activity": "Description",
          "location": "Place name",
          "duration": "X hours",
          "notes": "e.g. travel time, tips, potential issues",
          "type": "place/hotel/service/suggestion",
          "metadata": {{
            "booking_required": true,
            "estimated_cost": "X USD",
            "transport_mode": "walk/car/public transport",
            "transport_service": "service name if applicable",
            "image_url": "URL from selected place/hotel/service",
            "website_url": "URL from selected place/hotel/service",
            "rating": "Rating if available",
            "address": "Full address",
            "phone": "Contact number if available"
          }}
        }}
      ]
    }}
  ],
  "summary": {{
    "total_places": X,
    "total_hotels": X,
    "total_services": X,
    "hotel_coverage": "Fully covered / Missing nights / Overbooked",
    "service_coverage": "All services assigned / Unused / Missing slots",
    "recommendations": [
      "Add another hotel for night 2",
      "Swap Day 3 activities due to weather",
      "Too many places on Day 4 – consider splitting",
      "Additional activities suggestions based on preferences"
    ],
    "weather_impact": "How the weather affected the plan",
    "transport_plan": "Summary of transport services usage",
    "budget_breakdown": {{
      "total_cost": "X USD",
      "hotel_costs": "X USD",
      "transport_costs": "X USD",
      "activity_costs": "X USD",
      "meal_costs": "X USD",
      "trip_planner_profit": "X USD (15% of total cost)",
      "total_with_profit": "X USD"
    }},
    "important_notes": [
      "Booking requirements for specific attractions",
      "Weather-related recommendations",
      "Local customs and etiquette",
      "Emergency contact information"
    ]
  }}
}}"""

    def _enrich_metadata(self, itinerary, places, hotels, services):
        for day in itinerary.get('itinerary', []):
            for act in day.get('activities', []):
                obj = None
    
                if act['type'] == 'place':
                    obj = next((p for p in places if p.get('name') == act['location']), None)
                elif act['type'] == 'hotel':
                    obj = next((h for h in hotels if h.get('name') == act['location']), None)
                elif act['type'] == 'service':
                    obj = next((s for s in services if s.get('name') == act['location']), None)
    
                if obj:
                    metadata = obj.get('metadata', {}) if isinstance(obj, dict) else getattr(obj, 'metadata', {})
                    act['metadata'].update({
                        'image_url': obj.get('image_url', '') if isinstance(obj, dict) else getattr(obj, 'image_url',   ''),
                        'website_url': obj.get('website_url', '') if isinstance(obj, dict) else getattr(obj,    'website_url', ''),
                        'rating': obj.get('rating', '') if isinstance(obj, dict) else getattr(obj, 'rating', ''),
                        'address': obj.get('address', '') if isinstance(obj, dict) else getattr(obj, 'address', ''),
                        'phone': metadata.get('phone', '') if isinstance(metadata, dict) else ''
                    })


class ShareAItineraryAPIView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = ShareGeneratedItinerarySerializer
    queryset = GeneratedItinerary.objects.select_related('trip').all()
    lookup_field = "id"

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


from .service_utils import get_booking_hotels, get_car_rentals
import time
class AffiliateTripExploreAPIView(generics.CreateAPIView):
    queryset = Trip.objects.all()
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        start_time = datetime.now()
        print(f"[{start_time}] STARTED processing AffiliateTripExploreAPIView")

        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        destination = request.data.get('destination')
        preferences = request.data.get('preferences', {})

        if not all([start_date, end_date, destination]):
            return Response({'error': 'start_date, end_date, and destination are required'}, status=400)

        user = request.user if request.user.is_authenticated else None

        trip = Trip.objects.create(
            user=user,
            start_date=start_date,
            end_date=end_date,
            destination=destination,
            preferences=preferences
        )

        # After trip creation
        print(f"[{datetime.now()}] Trip created")

        search_query = f"top tourist attractions in {destination}"
        places_params = {
            "engine": "google_maps",
            "q": search_query,
            "hl": "en",
            "api_key": SERP_API_KEY,
            "location": destination
        }

        try:
            place_data_raw = requests.get("https://serpapi.com/search", params=places_params).json()
            print(f"[{datetime.now()}] Fetched place data from SerpAPI")
            places = self.parse_places(place_data_raw)
            print(f"[{datetime.now()}] Parsed place data")
        except Exception as e:
            place_data_raw = {'error': str(e)}
            places = []

        hotel_data = get_booking_hotels(city=destination,check_in_date=start_date,check_out_date=end_date)
        print(f"[{datetime.now()}] Hotel data fetched")

        service_data = get_car_rentals(city=destination)
        print(f"[{datetime.now()}] Car rental service data fetched")

        AffiliateTrip.objects.create(
            trip=trip,
            place_data=places,
            hotel_data=hotel_data,
            service_data=service_data
        )
        print(f"[{datetime.now()}] AffiliateTrip record created")

        data = {
            "trip_id": trip.id,
            'place_data': places,
            'hotel_data': hotel_data,
            'service_data': service_data
        }

        end_time = datetime.now()
        print(f"[{end_time}] COMPLETED AffiliateTripExploreAPIView - Total duration: {(end_time - start_time).total_seconds()} seconds")

        return Response({'message': "Fetched Successfully", 'data': data, 'status': True}, status=200)
    
    def parse_places(self, data):
        results = []
        for p in data.get("local_results", []):
            if p.get('thumbnail') and p.get('website'):
                results.append({
                    'place_id': p.get('place_id'),
                    'name': p.get('title'),
                    'description': p.get('snippet', ''),
                    'address': p.get('address', ''),
                    'rating': p.get('rating', 0),
                    'image_url': p.get('thumbnail'),
                    'website_url': p.get('website'),
                    'metadata': {
                        'reviews_count': p.get('reviews', 0),
                        'hours': p.get('hours', {}),
                        'phone': p.get('phone', '')
                    }
                })
        return results

class AffiliatePlatformBulkCreateAPIView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        serializer = AffiliatePlatformSerializer(data=request.data, many=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class AffiliatePlatformExploreAPIView(APIView):
    permission_classes = []  # Allow both authenticated and anonymous users
    """
    POST: expects {destination, start_date, end_date, origin (for flights, optional)}
    Returns: trip_id, places (from SERP/DB), hotels/cars/flights (from DB, with dynamic affiliate links)
    
    For Anonymous Users: Free, but only 1 time per IP address
    For Authenticated Users: $0.50 per API call from wallet
    """
    def post(self, request):
        from subscription.wallet_utils import get_client_ip, check_anonymous_api_usage, track_anonymous_api_usage
        from subscription.wallet_utils import check_wallet_balance
        from subscription.views import track_api_usage
        
        # Get client IP
        client_ip = get_client_ip(request)
        
        # Check if user is authenticated
        if request.user.is_authenticated:
            # Authenticated user - use wallet system
            user = request.user
            
            has_credits, message, current_credits, current_balance = check_wallet_balance(user, 0.50)
            if not has_credits:
                return Response({
                    "error": message,
                    "remaining_credits": current_credits,
                    "remaining_balance": current_balance,
                    "required_credits": 1,
                    "api_name": "affiliate_explore",
                    "user_type": "authenticated",
                    "recharge_url": "/plan/wallet/recharge/"
                }, status=402)
            
            # Deduct from wallet
            success, message, remaining_credits, remaining_balance = track_api_usage(user, "affiliate_explore", 0.50)
            if not success:
                return Response({
                    "error": message,
                    "remaining_credits": remaining_credits,
                    "remaining_balance": remaining_balance,
                    "required_credits": 1,
                    "api_name": "affiliate_explore",
                    "user_type": "authenticated",
                    "recharge_url": "/plan/wallet/recharge/"
                }, status=402)
            
            user_type = "authenticated"
            wallet_info = {
                'api_used': 'affiliate_explore',
                'credits_deducted': 1,
                'remaining_credits': remaining_credits,
                'remaining_balance': remaining_balance,
                'cost_deducted': 0.50,  # Keep for backward compatibility
                'user_type': 'authenticated'
            }
        else:
            # Anonymous user - check IP-based usage
            can_use, message = check_anonymous_api_usage(client_ip, "affiliate_explore")
            if not can_use:
                return Response({
                    "error": message,
                    "user_type": "anonymous",
                    "api_name": "affiliate_explore"
                }, status=429)  # Too Many Requests
            
            # Track anonymous usage
            success, message = track_anonymous_api_usage(client_ip, "affiliate_explore")
            if not success:
                return Response({
                    "error": "Error tracking API usage",
                    "user_type": "anonymous",
                    "api_name": "affiliate_explore"
                }, status=500)
            
            user_type = "anonymous"
            wallet_info = {
                'api_used': 'affiliate_explore',
                'cost_deducted': 0.00,
                'remaining_credits': None,
                'remaining_balance': None,
                'user_type': 'anonymous',
                'message': 'Free trial usage. Login to continue using our services.'
            }
        destination = request.data.get('destination')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        origin = request.data.get('origin', 'Delhi')  # Default to 'Delhi' if not provided
        if not destination or not start_date or not end_date:
            return Response({'error': 'destination, start_date, end_date required'}, status=400)

        # 1. CREATE TRIP
        from datetime import datetime
        trip_data = {
            'title': f"Trip to {destination}",
            'start_date': datetime.strptime(start_date, '%Y-%m-%d').date(),
            'end_date': datetime.strptime(end_date, '%Y-%m-%d').date(),
            'destination': destination,
            'status': 'draft'
        }
        
        # Set user if request is authenticated
        if request.user.is_authenticated:
            trip_data['user'] = request.user
            
        trip = Trip.objects.create(**trip_data)

        # 2. CHECK FOR EXISTING PLACES IN DB
        existing_places = TripSelectedPlace.objects.filter(
            trip__destination__iexact=destination
        ).values('place_id', 'name', 'description', 'address', 'rating', 'image_url', 'website_url', 'metadata')
        
        if existing_places.exists():
            # Use existing places from DB
            places = []
            for place in existing_places:
                places.append({
                    'place_id': place['place_id'],
                    'name': place['name'],
                    'description': place['description'] or '',
                    'address': place['address'] or '',
                    'rating': place['rating'] or 0,
                    'image_url': place['image_url'] or '',
                    'website_url': place['website_url'] or '',
                    'metadata': place['metadata'] or {}
                })
            print(f"Found {len(places)} existing places for {destination} in database")
        else:
            # 3. FETCH PLACES from SERP API
            search_query = f"top tourist attractions in {destination}"
            places_params = {
                "engine": "google_maps",
                "q": search_query,
                "hl": "en",
                "api_key": SERP_API_KEY,
                "location": destination
            }
            try:
                place_data_raw = requests.get("https://serpapi.com/search", params=places_params).json()
                places = self.parse_places(place_data_raw)
                
                # 4. SAVE PLACES TO DB for future use
                for place in places:
                    TripSelectedPlace.objects.create(
                        trip=trip,
                        place_id=place['place_id'],
                        name=place['name'],
                        description=place['description'],
                        address=place['address'],
                        rating=place['rating'],
                        image_url=place['image_url'],
                        website_url=place['website_url'],
                        metadata=place['metadata']
                    )
                print(f"Saved {len(places)} new places for {destination} to database")
            except Exception as e:
                print(f"Error fetching places: {e}")
                places = []

        # 5. HOTELS from DB
        hotels = self.get_affiliate_results('hotel', destination, start_date, end_date)
        # 6. CARS from DB
        cars = self.get_affiliate_results('car', destination, start_date, end_date)
        # 7. FLIGHTS from DB (needs origin)
        flights = []
        if origin:
            flights = self.get_affiliate_results('flight', destination, start_date, end_date, origin=origin)

        return Response({
            'trip_id': str(trip.id),
            'places': places,
            'hotels': hotels,
            'cars': cars,
            'flights': flights,
            'wallet_info': wallet_info
        }, status=200)

    def parse_places(self, data):
        results = []
        for p in data.get("local_results", []):
            if p.get('thumbnail') and p.get('website'):
                results.append({
                    'place_id': p.get('place_id'),
                    'name': p.get('title'),
                    'description': p.get('snippet', ''),
                    'address': p.get('address', ''),
                    'rating': p.get('rating', 0),
                    'image_url': p.get('thumbnail'),
                    'website_url': p.get('website'),
                    'metadata': {
                        'reviews_count': p.get('reviews', 0),
                        'hours': p.get('hours', {}),
                        'phone': p.get('phone', '')
                    }
                })
        return results

    def get_affiliate_results(self, platform, destination, start_date, end_date, origin=None):
        qs = AffiliatePlatform.objects.filter(platform=platform)
        print(f"Found {qs.count()} affiliate platforms for {platform}")
        for plat in qs:
            print(f"Platform: {plat.title}, Base URL: {plat.base_url}")
        
        results = []
        for plat in qs:
            affiliate_link = self.generate_affiliate_link(plat, platform, destination, start_date, end_date, origin)
            if affiliate_link is not None:  # Only include results with valid affiliate links
                results.append({
                    'title': plat.title,
                    'image_url': plat.image_url,
                    'platform': plat.platform,
                    'affiliate_link': affiliate_link
                })
        return results

    def generate_affiliate_link(self, plat, platform, destination, start_date, end_date, origin=None):
        import urllib.parse
        from datetime import datetime

        awin_mid = "6776"
        awin_aff_id = "1525451"
        url = plat.base_url

        # Static airport mapping (expand as needed)
        airports = {
            "delhi": "Delhi (DEL - Indira Gandhi Intl.)",
            "goa": "Goa (GOI - All Airports)"
            # Add more as needed
        }

        # Helper function to safely format URL with fallback parameters
        def safe_format_url(template, **kwargs):
            try:
                return template.format(**kwargs)
            except KeyError as e:
                # If a key is missing, try with a subset of parameters
                missing_key = str(e).strip("'")
                print(f"Warning: Missing key '{missing_key}' in URL template for {plat.title}")
                # Remove the problematic key from kwargs and try again
                kwargs_copy = kwargs.copy()
                if missing_key in kwargs_copy:
                    del kwargs_copy[missing_key]
                try:
                    return template.format(**kwargs_copy)
                except KeyError:
                    # If still failing, return None
                    print(f"Error: Could not format URL template for {plat.title}")
                    return None

        if platform == 'car':
            if "expedia" in plat.title.lower():
                pickup_date = datetime.strptime(start_date, "%Y-%m-%d").strftime("%m%%2F%d%%2F%Y")
                return_date = datetime.strptime(end_date, "%Y-%m-%d").strftime("%m%%2F%d%%2F%Y")
                url = f"https://www.expedia.com/carsearch?date1={pickup_date}&date2={return_date}&time1=1030AM&time2=1230PM&locn={urllib.parse.quote_plus(destination)}"
            elif "rentalcars" in plat.title.lower():
                # Build RentalCars URL manually like in zzz.py
                pickup_date_str = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m-%d")
                return_date_str = datetime.strptime(end_date, "%Y-%m-%d").strftime("%Y-%m-%d")
                url = f"https://www.rentalcars.com/search?locationName={urllib.parse.quote_plus(destination)}&pickUpDate={pickup_date_str}&pickUpTime=10%3A30&dropOffDate={return_date_str}&dropOffTime=12%3A30&driverAge=30"
            elif "booking" in plat.title.lower():
                pickup_date_str = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m-%d")
                return_date_str = datetime.strptime(end_date, "%Y-%m-%d").strftime("%Y-%m-%d")
                url = f"https://www.booking.com/cars/index.html?ss={urllib.parse.quote(destination)}&pickup_date={pickup_date_str}&pickup_time=10%3A30&dropoff_date={return_date_str}&dropoff_time=12%3A30&age=30"
            else:
                # Fallback to template formatting
                url = safe_format_url(url,
                    pickup_date=start_date,
                    return_date=end_date,
                    city=urllib.parse.quote_plus(destination),
                    pickup_date_formatted=start_date,
                    return_date_formatted=end_date
                )

        elif platform == 'flight' and origin:
            origin_full = airports.get(origin.lower(), origin)
            destination_full = airports.get(destination.lower(), destination)
            
            if "expedia" in plat.title.lower():
                expedia_date = datetime.strptime(start_date, "%Y-%m-%d").strftime("%m/%d/%Y")
                # Build Expedia URL manually like in zzz.py
                url = (
                    f"https://www.expedia.com/Flights-Search?"
                    f"leg1=from:{urllib.parse.quote(origin_full)},"
                    f"to:{urllib.parse.quote(destination_full)},"
                    f"departure:{expedia_date}TANYT,fromType:A,toType:M"
                    f"&mode=search&options=carrier:,cabinclass:,maxhops:1,nopenalty:N"
                    f"&pageId=0&passengers=adults:1,children:0,infantinlap:N"
                    f"&trip=oneway"
                )
            elif "booking" in plat.title.lower():
                dep_date_str = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m-%d")
                # Build Booking.com URL manually like in zzz.py
                url = f"https://flights.booking.com/flights/{origin.lower()}.AIRPORT-{destination.lower()}.AIRPORT/?type=ONEWAY&adults=1&cabinClass=ECONOMY&from={origin.lower()}.AIRPORT&to={destination.lower()}.AIRPORT&depart={dep_date_str}&sort=BEST&travelPurpose=leisure"
            elif "kiwi" in plat.title.lower():
                # Build Kiwi.com URL manually like in zzz.py but use actual destination
                # Extract country from destination or use a default
                country_suffix = "-india-1"  # Default fallback
                if destination.lower() in ["oakland", "san francisco", "los angeles", "new york"]:
                    country_suffix = "-united-states-1"
                elif destination.lower() in ["london", "manchester"]:
                    country_suffix = "-united-kingdom-1"
                elif destination.lower() in ["paris", "lyon"]:
                    country_suffix = "-france-1"
                elif destination.lower() in ["berlin", "munich"]:
                    country_suffix = "-germany-1"
                elif destination.lower() in ["toronto", "vancouver"]:
                    country_suffix = "-canada-1"
                
                # Determine origin country suffix
                origin_country_suffix = "-india-1"  # Default fallback
                if origin.lower() in ["oakland", "san francisco", "los angeles", "new york"]:
                    origin_country_suffix = "-united-states-1"
                elif origin.lower() in ["london", "manchester"]:
                    origin_country_suffix = "-united-kingdom-1"
                elif origin.lower() in ["paris", "lyon"]:
                    origin_country_suffix = "-france-1"
                elif origin.lower() in ["berlin", "munich"]:
                    origin_country_suffix = "-germany-1"
                elif origin.lower() in ["toronto", "vancouver"]:
                    origin_country_suffix = "-canada-1"
                
                url = f"https://www.kiwi.com/en/?origin={origin.lower()}{origin_country_suffix}&destination={destination.lower()}{country_suffix}&outboundDate=anytime&inboundDate=no-return"
                print(f"Kiwi URL generated: {url}")
            else:
                # Fallback to template formatting
                url = safe_format_url(url,
                    origin=origin,
                    destination=destination,
                    depart=start_date,
                    origin_name=origin,
                    destination_name=destination
                )

        elif platform == 'hotel':
            if "booking" in plat.title.lower():
                url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(destination)}&checkin={start_date}&checkout={end_date}&group_adults=2&no_rooms=1&sb_travel_purpose=leisure"
            elif "expedia" in plat.title.lower():
                url = f"https://www.expedia.com/Hotel-Search?destination={urllib.parse.quote_plus(destination)}&startDate={start_date}&endDate={end_date}&rooms=1&adults=2"
            elif "hotels" in plat.title.lower():
                url = f"https://www.hotels.com/Hotel-Search?destination={urllib.parse.quote_plus(destination)}&d1={start_date}&d2={end_date}&adults=2&rooms=1"
            else:
                # Fallback to template formatting
                url = safe_format_url(url,
                city=urllib.parse.quote_plus(destination),
                checkin=start_date,
                    checkout=end_date,
                    city_name=urllib.parse.quote_plus(destination),
                    checkin_date=start_date,
                    checkout_date=end_date
            )

        if url is None:
            return None
            
        try:
            encoded_url = urllib.parse.quote(url, safe='')
            affiliate_link = f"https://www.awin1.com/cread.php?awinmid={awin_mid}&awinaffid={awin_aff_id}&p={encoded_url}"
            print(f"Generated affiliate link for {plat.title}: {affiliate_link}")
            return affiliate_link
        except Exception as e:
            # Log the error and return a fallback URL
            print(f"Error generating affiliate link for {plat.title}: {str(e)}")
            print(f"URL template: {plat.base_url}")
            print(f"Parameters: platform={platform}, destination={destination}, start_date={start_date}, end_date={end_date}, origin={origin}")
            return None

class AffiliatePlatformBulkUpsertAPIView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        data = request.data
        if not isinstance(data, list):
            return Response({'error': 'Payload must be a list'}, status=400)
        results = []
        for item in data:
            title = item.get('title')
            platform = item.get('platform')
            if not title or not platform:
                continue
            obj, created = AffiliatePlatform.objects.update_or_create(
                title=title, platform=platform,
                defaults={
                    'image_url': item.get('image_url', ''),
                    'base_url': item.get('base_url', '')
                }
            )
            results.append({
                'id': str(obj.id),
                'title': obj.title,
                'image_url': obj.image_url,
                'platform': obj.platform,
                'base_url': obj.base_url,
                'created_at': obj.created_at
            })
        return Response({'results': results}, status=200)


class ChatListAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        latest_chats = (
            UserAndExpertChat.objects
            .filter(Q(sender=user) | Q(receiver=user))
            .values("sender", "receiver")
            .annotate(latest=Max("created_at"))
            .order_by("-latest")
        )

        seen = set()
        results = []

        for chat in latest_chats:
            partner_id = chat["receiver"] if chat["sender"] == user.id else chat["sender"]
            if not partner_id or partner_id in seen:
                continue
            seen.add(partner_id)

            try:
                partner = User.objects.get(id=partner_id)
            except User.DoesNotExist:
                continue

            latest_chat = (
                UserAndExpertChat.objects.filter(
                    Q(sender=user, receiver=partner) | Q(sender=partner, receiver=user)
                ).order_by("-created_at").first()
            )

            if latest_chat:
                results.append({
                    "user": UserSerializer(partner).data,
                    "chat": UserAndExpertChatSerializer(latest_chat).data
                })

        return Response(results)
    

class ChatViewSet(viewsets.ModelViewSet):
    """
    /chats/<receiver_id>/           -> list, create (multipart for attachments)
    /chats/<receiver_id>/<pk>/      -> retrieve, update, partial_update, destroy
    """
    serializer_class = UserAndExpertChatSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ChatPagination

    def get_queryset(self):
        user = self.request.user
        receiver_id = self.kwargs.get("receiver_id")
        return UserAndExpertChat.objects.filter(
            Q(sender=user, receiver_id=receiver_id) |
            Q(sender_id=receiver_id, receiver=user)
        ).order_by("-created_at")

    def perform_create(self, serializer):
        chat = serializer.save(
            sender=self.request.user,
            receiver_id=self.kwargs.get("receiver_id")
        )
        # Broadcast after saving (covers attachments too)
        self.broadcast_new_or_updated_chat(chat)

    def perform_update(self, serializer):
        chat = serializer.save()
        self.broadcast_new_or_updated_chat(chat)

    def perform_destroy(self, instance):
        # copy to broadcast after deletion
        snapshot = instance
        super().perform_destroy(instance)
        self.broadcast_delete_chat(snapshot)

    # Optional: restrict edits/deletes to the sender only
    def get_object(self):
        obj = super().get_object()
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            if obj.sender_id != self.request.user.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can modify only your own messages.")
        return obj
    

    def chat_group_name(self, a_id, b_id) -> str:
        a, b = sorted([str(a_id), str(b_id)])
        return f"chat_{a}_{b}"

    def broadcast_new_or_updated_chat(self, chat_obj):
        channel_layer = get_channel_layer()
        data = ChatSerializer(chat_obj).data
        sender_id = chat_obj.sender_id
        receiver_id = chat_obj.receiver_id
    
        # Receiver notification
        async_to_sync(channel_layer.group_send)(
            f"user_{receiver_id}",
            {"type": "new_message_notification", "payload": data}
        )
    
        # Room broadcast
        room = self.chat_group_name(sender_id, receiver_id)
        async_to_sync(channel_layer.group_send)(
            room,
            {"type": "chat_message", "payload": data}
        )

    def broadcast_delete_chat(self,chat_obj):
        channel_layer = get_channel_layer()
        payload = {"id": str(chat_obj.id), "deleted": True}
        sender_id = chat_obj.sender_id
        receiver_id = chat_obj.receiver_id

        # Receiver notification about deletion (optional)
        async_to_sync(channel_layer.group_send)(
            f"user_{receiver_id}",
            {"type": "new_message_notification", "payload": payload}
        )

        # Room broadcast
        room = self.chat_group_name(sender_id, receiver_id)
        async_to_sync(channel_layer.group_send)(
            room,
            {"type": "chat_message", "payload": payload}
        )


class LocalExpertListAPIView(generics.ListAPIView):
    """List all approved local experts."""
    serializer_class = LocalExpertListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        from authentication.models import LocalExpertForm
        return LocalExpertForm.objects.filter(status='approved').select_related('user')

