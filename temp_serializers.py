from rest_framework import serializers
from .models import *
import re
from .models import TripSelectedHotel, TripSelectedService, TripSelectedPlace
from authentication.models import LocalExpertForm
from django.db.models import Avg

# class PlaceSerializer(serializers.Serializer):
#     id = serializers.CharField()
#     name = serializers.CharField()
#     description = serializers.CharField()
#     address = serializers.CharField()
#     rating = serializers.FloatField()
#     image_url = serializers.URLField()
#     website_url = serializers.URLField()

# class HotelSerializer(serializers.Serializer):
#     id = serializers.CharField()
#     name = serializers.CharField()
#     description = serializers.CharField()
#     address = serializers.CharField()
#     rating = serializers.FloatField()
#     image_url = serializers.URLField()
#     website_url = serializers.URLField()
#     price_range = serializers.CharField()

# class ServiceSerializer(serializers.Serializer):
#     id = serializers.CharField()
#     name = serializers.CharField()
#     description = serializers.CharField()
#     service_type = serializers.CharField()
#     price_range = serializers.CharField()
#     image_url = serializers.URLField()
#     website_url = serializers.URLField()

# class TripSerializer(serializers.ModelSerializer):
#     places = PlaceSerializer(many=True, read_only=True)
#     hotels = HotelSerializer(many=True, read_only=True)
#     services = ServiceSerializer(many=True, read_only=True)

#     class Meta:
#         model = Trip
#         fields = ['id', 'user', 'destination', 'start_date', 'end_date', 'budget', 'preferences', 
#                  'status', 'places', 'hotels', 'services', 'generated_itinerary']
#         read_only_fields = ['status', 'generated_itinerary']

# class TripCreateSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Trip
#         fields = ['title', 'start_date', 'end_date', 'destination', 'preferences']
#         extra_kwargs = {
#             'start_date': {'required': True},
#             'end_date': {'required': True},
#             'destination': {'required': True},
#             'preferences': {'required': True},
#             'title': {'required': False}
#         }

#     def validate(self, data):
#         if data['end_date'] <= data['start_date']:
#             raise serializers.ValidationError("End date must be after start date")
#         return data

# class SelectedPlaceSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = SelectedPlace
#         fields = [
#             'place_id',
#             'name',
#             'description',
#             'address',
#             'rating',
#             'image_url',
#             'website_url',
#             'visit_date',
#             'visit_time',
#             'notes',
#             'metadata'
#         ]
#         extra_kwargs = {
#             'place_id': {'required': True},
#             'name': {'required': True},
#             'description': {'required': False},
#             'address': {'required': False, 'allow_blank': True},  # Make address optional and allow blank
#             'rating': {'required': False},
#             'image_url': {'required': False},
#             'website_url': {'required': False},
#             'visit_date': {'required': False},
#             'visit_time': {'required': False},
#             'notes': {'required': False},
#             'metadata': {'required': False}
#         }

# class SelectedHotelSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = SelectedHotel
#         fields = [
#             'hotel_id',
#             'name',
#             'description',
#             'address',
#             'rating',
#             'price_range',
#             'image_url',
#             'website_url',
#             'check_in_date',
#             'check_out_date',
#             'notes',
#             'metadata'
#         ]
#         extra_kwargs = {
#             'hotel_id': {'required': True},
#             'name': {'required': True},
#             'description': {'required': False},
#             'address': {'required': False, 'allow_blank': True},
#             'rating': {'required': False},
#             'price_range': {'required': False},
#             'image_url': {'required': False},
#             'website_url': {'required': False},
#             'check_in_date': {'required': False},
#             'check_out_date': {'required': False},
#             'notes': {'required': False},
#             'metadata': {'required': False}
#         }

# class SelectedServiceSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = SelectedService
#         fields = [
#             'id',
#             'service_id',
#             'name',
#             'description',
#             'service_type',
#             'price_range',
#             'image_url',
#             'website_url',
#             'service_date',
#             'service_time',
#             'notes',
#             'metadata'
#         ]
#         extra_kwargs = {
#             'service_id': {'required': False},
#             'name': {'required': False},
#             'description': {'required': False},
#             'service_type': {'required': False},
#             'price_range': {'required': False},
#             'image_url': {'required': False},
#             'website_url': {'required': False},
#             'service_date': {'required': False},
#             'service_time': {'required': False},
#             'notes': {'required': False, 'allow_blank': True},
#             'metadata': {'required': False}
#         }

class GeneratedItinerarySerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneratedItinerary
        fields = ['id', 'trip', 'itinerary_data', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ReviewRatingSerializer(serializers.ModelSerializer):
    reviewer_username = serializers.CharField(source='reviewer.username', read_only=True)
    local_expert_username = serializers.CharField(source='local_expert.username', read_only=True)

    class Meta:
        model = ReviewRating
        fields = [
            'id', 'local_expert', 'local_expert_username',
            'reviewer', 'reviewer_username',
            'review', 'rating', 'created_at', 'updated_at'
        ]
        read_only_fields = ['reviewer', 'created_at', 'updated_at']

    def validate(self, data):
        request = self.context.get('request')
        if request:
            reviewer = request.user
            if reviewer == data['local_expert']:
                raise serializers.ValidationError("You can't review yourself.")
        return data

class UpdateItinerarySerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneratedItinerary
        fields = ['itinerary_data', 'status', 'error_message']

class ExpertUpdatedItinerarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpertUpdatedItinerary
        fields = ['id', 'trip', 'itinerary_data', 'message', 'status', 'created_at', 'created_by']
        read_only_fields = ['trip', 'created_by', 'created_at']


class TouristPlacesResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = TouristPlaceResults
        exclude = ['search']

class TouristPreferenceSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    preference = TouristPlacesResultSerializer()

    class Meta:
        model = TouristPreferences
        fields = ['id', 'user', 'preference']

    def get_user(self, obj):
        return {"id": obj.user.id,
        "email":  obj.user.email,
        "username":  obj.user.username,
        "first_name":  obj.user.first_name,
        "last_name":  obj.user.last_name}
    
class HelpGuideTripSerializer(serializers.ModelSerializer):
    class Meta:
        model = HelpGuideTrip
        fields = '__all__'

class TouristPlaceActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TouristHelpMeGuideActivities
        fields = "__all__"

class TouristHelpMeGuideEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TouristHelpMeGuideEvents
        fields = "__all__"

class TripWithServicesSerializer(serializers.ModelSerializer):
    hotels = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    places = serializers.SerializerMethodField()
    # flights = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = ['id', 'title', 'destination', 'start_date', 'end_date', 'places', 'hotels', 'services']

    def get_affiliate_trip(self, obj):
        if not hasattr(self, '_affiliate_trip_cache'):
            self._affiliate_trip_cache = {}
        if obj.id not in self._affiliate_trip_cache:
            self._affiliate_trip_cache[obj.id] = AffiliateTrip.objects.filter(trip=obj).first()
        return self._affiliate_trip_cache[obj.id]

    def get_places(self, obj):
        affiliate = self.get_affiliate_trip(obj)
        return affiliate.place_data if affiliate else []

    def get_hotels(self, obj):
        affiliate = self.get_affiliate_trip(obj)
        return affiliate.hotel_data if affiliate else []

    def get_services(self, obj):
        affiliate = self.get_affiliate_trip(obj)
        return affiliate.service_data if affiliate else []
    # def get_places(self, obj):
    #     places = TripSelectedPlace.objects.filter(trip=obj)
    #     (f"DEBUG: Found {places.count()} places for trip {obj.id}")
    #     # Return all places that have a name (indicating they were selected)
    #     filtered_places = []
    #     for place in places:
    #         if place.name and place.name.strip():
    #             filtered_places.append(place)
    #     return TripSelectedPlaceSerializer(filtered_places, many=True).data

    # def get_hotels(self, obj):
    #     hotels = TripSelectedHotel.objects.filter(trip=obj)
    #     # Return all hotels that have a name (indicating they were selected)
    #     filtered_hotels = []
    #     for hotel in hotels:
    #         if hotel.name and hotel.name.strip():
    #             filtered_hotels.append(hotel)
    #     return TripSelectedHotelSerializer(filtered_hotels, many=True).data

    # def get_services(self, obj):
    #     services = TripSelectedService.objects.filter(trip=obj)
    #     # Return all services that have a name (indicating they were selected)
    #     filtered_services = []
    #     for service in services:
    #         if service.name and service.name.strip():
    #             filtered_services.append(service)
    #     return TripSelectedServiceSerializer(filtered_services, many=True).data

    # def get_flights(self, obj):
    #     flights = TripSelectedFlight.objects.filter(trip=obj)
    #     # Return all flights that have a name (indicating they were selected)
    #     filtered_flights = []
    #     for flight in flights:
    #         if flight.name and flight.name.strip():
    #             filtered_flights.append(flight)
    #     return TripSelectedFlightSerializer(filtered_flights, many=True).data
    


class TripSelectedPlaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSelectedPlace
        fields = '__all__'


class TripSelectedHotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSelectedHotel
        fields = '__all__'


class TripSelectedServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSelectedService
        fields = '__all__'


class TripSelectedFlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSelectedFlight
        fields = '__all__'


class ShareTripSerializer(serializers.ModelSerializer):
    trip_selected_places = TripSelectedPlaceSerializer(many=True, read_only=True)
    trip_selected_hotels = TripSelectedHotelSerializer(many=True, read_only=True)
    trip_selected_services = TripSelectedServiceSerializer(many=True, read_only=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = '__all__'

    def get_user(self, obj):
        # Lazy import to avoid circular dependency
        return {
            "email": obj.user.email,
            "username": obj.user.username,
            "first_name": obj.user.first_name,
            "last_name": obj.user.last_name,
        }


class ShareGeneratedItinerarySerializer(serializers.ModelSerializer):
    trip = ShareTripSerializer()

    class Meta:
        model = GeneratedItinerary
        fields = '__all__'

class AffiliatePlatformSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliatePlatform
        fields = ['id', 'title', 'image_url', 'platform', 'base_url', 'created_at']
        read_only_fields = ['id', 'created_at']

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username","first_name","last_name",'image','about_me']

class UserAndExpertChatSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    receiver = UserSerializer(read_only=True)
    contract = serializers.SerializerMethodField()
    itinerary_submit = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = UserAndExpertChat
        fields = ["id", "sender", "receiver", "message", "attachment", "created_at","contract","itinerary_submit"]
    
    def get_contract(self, obj):
        if obj.contract:
            request = self.context.get('request')
            contract_data = {
                "id": str(obj.contract.id),
                "contract_title": obj.contract.title,
                "trip_to": obj.contract.trip_to,
                "description": obj.contract.description,
                "amount": str(obj.contract.amount),
                "status": obj.contract.status,
                "is_paid": obj.contract.is_paid,
                "attachment": request.build_absolute_uri(obj.contract.attachment.url) if obj.contract.attachment and request else (obj.contract.attachment.url if obj.contract.attachment else None),
                "created_at": obj.contract.created_at.isoformat(),
            }
            if request:
                if not request.user.is_local_expert:
                    if obj.contract.is_paid == False and obj.contract.status == "accepted":
                        contract_data['payment_url'] = obj.contract.payment_url 
            if not obj.contract.is_paid:
                contract_data['payment_url'] = obj.contract.payment_url
            return contract_data
        return None
    def get_itinerary_submit(self, obj):
        if obj.itinerary_submit:
            request = self.context.get('request')
            itinerary_data = {
                "id": str(obj.itinerary_submit.id),
                "title": obj.itinerary_submit.title,
                "description": obj.itinerary_submit.description,
                "location": obj.itinerary_submit.location,
                "status": obj.itinerary_submit.status,
                "created_at": obj.itinerary_submit.created_at.isoformat(),
                "attachment": request.build_absolute_uri(obj.itinerary_submit.attachment.url) if obj.itinerary_submit.attachment and request else (obj.itinerary_submit.attachment.url if obj.itinerary_submit.attachment else None),
            }
            return itinerary_data
        return None
    def to_representation(self, instance):
        """
        Override the default representation to return full attachment URL if it exists.
        """
        rep = super().to_representation(instance)
        request = self.context.get('request')

        if instance.attachment and hasattr(instance.attachment, 'url'):
            if request is not None:
                rep['attachment'] = request.build_absolute_uri(instance.attachment.url)
            else:
                rep['attachment'] = instance.attachment.url
        else:
            rep['attachment'] = None

        return rep

class LocalExpertListSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    languages = serializers.JSONField()
    years_in_city = serializers.IntegerField()
    short_bio = serializers.CharField()
    services = serializers.JSONField()
    service_availability = serializers.IntegerField()
    price_expectation = serializers.IntegerField()
    instagram_link = serializers.CharField()
    facebook_link = serializers.CharField()
    linkedin_link = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()

    class Meta:
        model = LocalExpertForm
        fields = [
            'id', 'user', 'languages', 'years_in_city', 'short_bio', 
            'services', 'service_availability', 'price_expectation',
            'instagram_link', 'facebook_link', 'linkedin_link', 
            'status', 'created_at'
        ]

    def get_user(self, obj):
        if obj.user:
            return {
                'id': obj.user.id,
                'first_name': obj.user.first_name,
                'last_name': obj.user.last_name,
                'email': obj.user.email,
                'phone_number': obj.user.phone_number,
                'profile_picture': obj.user.profile_picture.url if obj.user.profile_picture else None,
                'country': obj.user.country,
                'city': obj.user.city
            }
        return None    
    
class SubmitItineraryFeedbackSerializer(serializers.ModelSerializer):
    expert = UserSerializer(read_only=True)
    contract = serializers.SerializerMethodField()
    class Meta:
        model = SubmitItineraryFeedback
        fields = ['id', 'expert', 'contract', 'attachment', 'title', 'description', 'location', 'status', 'created_at']
        read_only_fields = ['id', 'expert', 'created_at', 'status']
    
    def get_contract(self, obj):
        if obj.contract:
            request = self.context.get('request')
            contract_data = {
                "id": str(obj.contract.id),
                "contract_title": obj.contract.title,
                "trip_to": obj.contract.trip_to,
                "description": obj.contract.description,
                "amount": str(obj.contract.amount),
                "status": obj.contract.status,
                "is_paid": obj.contract.is_paid,
                "attachment": request.build_absolute_uri(obj.contract.attachment.url) if obj.contract.attachment and request else (obj.contract.attachment.url if obj.contract.attachment else None),
                "created_at": obj.contract.created_at.isoformat(),
            }
            return contract_data
        return None
    

class AffiliateTripSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateTrip
        fields = '__all__'