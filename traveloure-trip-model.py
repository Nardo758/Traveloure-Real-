# Django Model for Trips
# Add to your Django app (e.g., /ai/models.py or create new trips app)

from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid

User = get_user_model()

class Trip(models.Model):
    """
    Represents a user's trip (generated itinerary)
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('expert_review', 'Expert Review'),
        ('confirmed', 'Confirmed'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    EXPERIENCE_TYPE_CHOICES = [
        ('travel', 'Travel'),
        ('wedding', 'Wedding'),
        ('corporate', 'Corporate'),
        ('event', 'Event'),
        ('retreat', 'Retreat'),
    ]
    
    # Primary fields
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='trips')
    
    # Trip details
    destinations = models.JSONField(
        help_text="Array of destination objects: [{city, country, cityId}]"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    experience_type = models.CharField(
        max_length=20, 
        choices=EXPERIENCE_TYPE_CHOICES,
        default='travel'
    )
    travelers = models.PositiveIntegerField(default=1)
    
    # Itinerary data (AI-generated)
    itinerary = models.JSONField(
        null=True,
        blank=True,
        help_text="Full itinerary object with days, items, summary"
    )
    
    # Special requests from user
    special_requests = models.TextField(blank=True)
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Expert assignment
    expert = models.ForeignKey(
        'authentication.LocalExpert',  # Adjust to your expert model path
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_trips'
    )
    expert_notes = models.TextField(blank=True)
    expert_modified_at = models.DateTimeField(null=True, blank=True)
    
    # Booking reference (once confirmed)
    booking_reference = models.CharField(max_length=50, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Metadata
    is_public = models.BooleanField(
        default=False,
        help_text="Whether this trip is shareable publicly"
    )
    share_token = models.CharField(
        max_length=64,
        blank=True,
        help_text="Token for public sharing"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['start_date']),
            models.Index(fields=['share_token']),
        ]
    
    def __str__(self):
        cities = ', '.join([d.get('city', 'Unknown') for d in self.destinations])
        return f"{self.user.email} - {cities} ({self.start_date})"
    
    @property
    def duration_days(self):
        """Calculate trip duration in days"""
        return (self.end_date - self.start_date).days + 1
    
    @property
    def estimated_total(self):
        """Get estimated total cost from itinerary summary"""
        if self.itinerary and 'summary' in self.itinerary:
            return self.itinerary['summary'].get('estimatedTotal', 0)
        return 0
    
    def generate_share_token(self):
        """Generate a unique share token for public sharing"""
        import secrets
        self.share_token = secrets.token_urlsafe(32)
        self.save()
        return self.share_token


class TripItem(models.Model):
    """
    Individual items within a trip (activities, meals, accommodations, transport)
    Extracted from itinerary JSON for easier querying/booking
    """
    ITEM_TYPE_CHOICES = [
        ('accommodation', 'Accommodation'),
        ('activity', 'Activity'),
        ('meal', 'Meal'),
        ('transport', 'Transportation'),
    ]
    
    BOOKING_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    ]
    
    # Primary fields
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='items')
    
    # Item details
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Scheduling
    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    duration = models.CharField(max_length=50, blank=True)  # "2 hours", "3 nights"
    
    # Pricing
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_estimated = models.BooleanField(
        default=True,
        help_text="Whether price is estimated or confirmed"
    )
    
    # Location
    location_name = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(
        max_digits=9, 
        decimal_places=6, 
        null=True, 
        blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, 
        decimal_places=6, 
        null=True, 
        blank=True
    )
    
    # Provider linkage
    provider = models.ForeignKey(
        'authentication.ServiceProvider',  # Adjust to your provider model
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trip_items'
    )
    
    # Booking details
    booking_status = models.CharField(
        max_length=20,
        choices=BOOKING_STATUS_CHOICES,
        default='pending'
    )
    confirmation_code = models.CharField(max_length=100, blank=True)
    
    # Additional metadata
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional item-specific data"
    )
    
    # Order within day
    order = models.PositiveIntegerField(default=0)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['date', 'order', 'time']
        indexes = [
            models.Index(fields=['trip', 'date']),
            models.Index(fields=['item_type', 'booking_status']),
        ]
    
    def __str__(self):
        return f"{self.title} ({self.item_type}) - {self.date}"


class ExpertHandoff(models.Model):
    """
    Tracks when a user sends their trip to an expert for refinement
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
    ]
    
    # Primary fields
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='expert_handoffs')
    expert = models.ForeignKey(
        'authentication.LocalExpert',
        on_delete=models.CASCADE,
        related_name='handoff_requests'
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Itinerary versions
    original_itinerary = models.JSONField(
        help_text="AI-generated itinerary before expert modification"
    )
    modified_itinerary = models.JSONField(
        null=True,
        blank=True,
        help_text="Expert-modified itinerary"
    )
    
    # Communication
    expert_notes = models.TextField(blank=True)
    user_feedback = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    user_approved_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Handoff: {self.trip} → {self.expert} ({self.status})"
    
    def accept(self):
        """Expert accepts the handoff request"""
        self.status = 'in_progress'
        self.accepted_at = timezone.now()
        self.save()
    
    def complete(self, modified_itinerary, notes=''):
        """Expert completes the modification"""
        self.modified_itinerary = modified_itinerary
        self.expert_notes = notes
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save()
        
        # Update trip with expert modifications
        self.trip.itinerary = modified_itinerary
        self.trip.expert = self.expert
        self.trip.expert_modified_at = timezone.now()
        self.trip.status = 'expert_review'
        self.trip.save()
    
    def user_approve(self):
        """User approves expert's modifications"""
        self.user_approved_at = timezone.now()
        self.save()
        
        # Update trip status
        self.trip.status = 'confirmed'
        self.trip.save()


# Migration file will be generated with:
# python manage.py makemigrations
# python manage.py migrate
