from django.db import models
from django.contrib.auth import get_user_model
from django.db.models import JSONField
import uuid
from authentication.models import get_dynamic_storage
from subscription.models import UserAndExpertContract
User = get_user_model()

class Trip(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('planning', 'Planning'),
        ('confirmed', 'Confirmed'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ]

    INTEREST_CHOICES = [
        ('beach', 'Beach'),
        ('adventure', 'Adventure'),
        ('culture', 'Culture'),
        ('food', 'Food'),
        ('nightlife', 'Nightlife'),
        ('wildlife', 'Wildlife'),
        ('cruise', 'Cruise'),
        ('sightseeing', 'Sightseeing'),
        ('wellness', 'Wellness'),
        ('religious', 'Religious')
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='trips',null=True,blank=True)
    title = models.CharField(max_length=255, default='My Trip')
    start_date = models.DateField()
    end_date = models.DateField()
    destination = models.CharField(max_length=255)
    # interests = JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    number_of_travelers = models.PositiveIntegerField(default=1)
    preferences = JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Optional fields that can be added later
    # description = models.TextField(blank=True, null=True)
    # budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # special_requirements = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.destination} ({self.start_date} to {self.end_date})"

class GeneratedItinerary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.OneToOneField(Trip, on_delete=models.CASCADE, related_name='generated_itinerary')
    itinerary_data = JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    status = models.CharField(max_length=20, default='pending')
    error_message = models.TextField(blank=True)

    def __str__(self):
        return f"Itinerary for {self.trip.title}"


class TripExpertAdvisor(models.Model):
    '''
    Used When User Assigns Trip to Local Expert for Review/Modification
    '''
    STATUS_CHOICES = [
        ('pending', 'Pending'),         
        ('accepted', 'Accepted'),       
        ('rejected', 'Rejected'),      
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE)
    local_expert = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    message = models.TextField(blank=True, null=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('trip', 'local_expert')

class ReviewRating(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    local_expert = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reviews_received',
        limit_choices_to={'is_local_expert': True}
    )
    reviewer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reviews_given'
    )
    review = models.TextField()
    rating = models.IntegerField(choices=[(i, i) for i in range(6)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # unique_together = ('local_expert', 'reviewer')
        ordering = ['-created_at']

class ExpertUpdatedItinerary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.OneToOneField(Trip, on_delete=models.CASCADE, related_name='expert_updated_itinerary')
    itinerary_data = JSONField(default=dict)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='expert_updated_itineraries')
    
    class Meta:
        unique_together = ('trip', 'created_by')

class TouristPlacesSearches(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    search = models.CharField(null=False,blank=False)

class TouristPlaceResults(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    search = models.ForeignKey(TouristPlacesSearches,null=False, blank=False,on_delete=models.CASCADE)
    country = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    place = models.CharField(max_length=200)
    description = models.TextField()
    activities = models.JSONField()
    festivals = models.JSONField()
    # events = models.JSONField(blank=True, null=True)
    latitude = models.CharField(max_length=200,blank=True, null=True)
    longitude = models.CharField(max_length=200,blank=True, null=True)
    category = models.CharField(max_length=200)
    best_months = models.CharField(max_length=100)
    image_url = models.JSONField(default=list)

    def __str__(self):
        return f"{self.place} in {self.city}, {self.country}"
    
class TouristPreferences(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE,null=False,blank=False)
    preference = models.ForeignKey(TouristPlaceResults,on_delete=models.CASCADE,null=False,blank=False)

class TouristHelpMeGuideActivities(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL,null=True,blank=True)
    location = models.CharField(null=False,blank=False)
    activity = models.CharField(null=False,blank=False)
    
class TouristHelpMeGuideEvents(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL,null=True,blank=True)
    location = models.CharField(null=False,blank=False)
    event = models.JSONField(null=False,blank=False)

class TouristPlaceCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Tourist Place Category"
        verbose_name_plural = "Tourist Place Categories"

class HelpGuideTrip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE,null=False,blank=False)
    country = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    description = models.TextField()
    highlights = models.TextField()
    days = models.PositiveIntegerField()
    nights = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    old_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    start_date = models.DateField()
    end_date = models.DateField()
    inclusive = models.TextField()
    exclusive = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
    
class LiveEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    search = models.ForeignKey(TouristPlacesSearches, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    start_date = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    link = models.URLField(null=True, blank=True)
    image_url = models.URLField(null=True, blank=True)

class TripSelectedPlace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='trip_selected_places')
    place_id = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True,null=True)
    address = models.CharField(max_length=255, blank=True,null=True)
    rating = models.FloatField(null=True, blank=True)
    image_url = models.URLField(max_length=1000, blank=True,null=True)
    website_url = models.URLField(max_length=1000, blank=True,null=True)
    metadata = models.JSONField(default=dict, blank=True,null=True)

class TripSelectedHotel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='trip_selected_hotels')
    hotel_id = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True,null=True)
    address = models.CharField(max_length=255, blank=True,null=True)
    rating = models.FloatField(null=True, blank=True)
    price_range = models.CharField(max_length=50, blank=True,null=True)
    image_url = models.URLField(max_length=1000, blank=True,null=True)
    website_url = models.URLField(max_length=1000, blank=True,null=True)
    metadata = models.JSONField(default=dict, blank=True,null=True)

class TripSelectedService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='trip_selected_services')
    service_id = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True,null=True)
    service_type = models.CharField(max_length=50)
    price_range = models.CharField(max_length=50, blank=True,null=True)
    image_url = models.URLField(max_length=1000, blank=True,null=True)
    website_url = models.URLField(max_length=1000, blank=True,null=True)
    metadata = models.JSONField(default=dict, blank=True,null=True)

class TripOtherService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='trip_other_services')
    other_service = models.JSONField(default=dict)

class TripSelectedFlight(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='trip_selected_flights')
    flight_id = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True,null=True)
    origin = models.CharField(max_length=255, blank=True,null=True)
    destination = models.CharField(max_length=255, blank=True,null=True)
    departure_date = models.DateField(null=True, blank=True)
    return_date = models.DateField(null=True, blank=True)
    price_range = models.CharField(max_length=50, blank=True,null=True)
    image_url = models.URLField(max_length=1000, blank=True,null=True)
    website_url = models.URLField(max_length=1000, blank=True,null=True)
    metadata = models.JSONField(default=dict, blank=True,null=True)



class AffiliateTrip(models.Model): 
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="affiliate_trip")
    place_data = models.JSONField(default=list)
    hotel_data = models.JSONField(default=list)
    service_data = models.JSONField(default=list)
    # flight_service = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

class AffiliatePlatform(models.Model):
    PLATFORM_CHOICES = [
        ('hotel', 'Hotel'),
        ('car', 'Car'),
        ('flight', 'Flight'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=100)  # e.g., Booking.com
    image_url = models.URLField()             # logo url
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    base_url = models.TextField()             # URL template for affiliate link
    created_at = models.DateTimeField(auto_now_add=True)


class SubmitItineraryFeedback(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    expert = models.ForeignKey(User, on_delete=models.CASCADE, related_name='itinerary_feedbacks')
    contract = models.ForeignKey(UserAndExpertContract, on_delete=models.CASCADE, related_name='itinerary_feedbacks', null=True, blank=True)
    attachment = models.FileField(
        upload_to='itinerary_feedbacks/',
        storage=get_dynamic_storage(),  # Assuming this is secure
        null=True,
        blank=True
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    location = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)



class UserAndExpertChat(models.Model):
    id = models.UUIDField(primary_key=True, null=False, default=uuid.uuid4, blank=False)
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_sender")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_receiver", null=True)
    contract = models.ForeignKey(UserAndExpertContract, on_delete=models.CASCADE, related_name="contract_chat", null=True)
    message = models.TextField(null=True, blank=True)
    attachment = models.FileField(upload_to='trip_expert_advice/',storage=get_dynamic_storage(), null=True)
    itinerary_submit = models.ForeignKey(SubmitItineraryFeedback, on_delete=models.CASCADE, related_name="itinerary_submit_chat", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)