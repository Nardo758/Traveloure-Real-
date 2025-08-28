from django.contrib import admin
from .models import *

# Enhanced admin interfaces for AI Itinerary models

@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ['id', 'user_email', 'title', 'destination', 'start_date', 'end_date', 'created_at']
    list_filter = ['start_date', 'end_date', 'created_at', 'status']
    search_fields = ['title', 'destination', 'user__email']
    readonly_fields = ['id', 'created_at']
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'N/A'
    user_email.short_description = 'User Email'

@admin.register(GeneratedItinerary)
class GeneratedItineraryAdmin(admin.ModelAdmin):
    list_display = ['id', 'trip_title', 'user_email', 'created_at']
    search_fields = ['trip_id__title', 'trip_id__user__email']
    readonly_fields = ['id', 'created_at']
    
    def trip_title(self, obj):
        return obj.trip_id.title if obj.trip_id else 'N/A'
    
    def user_email(self, obj):
        return obj.trip_id.user.email if obj.trip_id and obj.trip_id.user else 'N/A'
    
    trip_title.short_description = 'Trip Title'
    user_email.short_description = 'User Email'

@admin.register(TripExpertAdvisor)
class TripExpertAdvisorAdmin(admin.ModelAdmin):
    list_display = ['id', 'trip_title', 'user_email', 'expert_email', 'status', 'assigned_at']
    list_filter = ['status', 'assigned_at']
    search_fields = ['trip__title', 'trip__user__email', 'local_expert__email']
    readonly_fields = ['id', 'assigned_at']
    
    def trip_title(self, obj):
        return obj.trip.title if obj.trip else 'N/A'
    
    def user_email(self, obj):
        return obj.trip.user.email if obj.trip and obj.trip.user else 'N/A'
    
    def expert_email(self, obj):
        return obj.local_expert.email if obj.local_expert else 'N/A'
    
    trip_title.short_description = 'Trip Title'
    user_email.short_description = 'User Email'
    expert_email.short_description = 'Expert Email'

@admin.register(UserAndExpertChat)
class UserAndExpertChatAdmin(admin.ModelAdmin):
    list_display = ['id', 'sender_email', 'receiver_email', 'message_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['sender__email', 'receiver__email', 'message']
    readonly_fields = ['created_at']
    
    def sender_email(self, obj):
        return obj.sender.email if obj.sender else 'N/A'
    
    def receiver_email(self, obj):
        return obj.receiver.email if obj.receiver else 'N/A'
    
    def message_preview(self, obj):
        return obj.message[:50] + '...' if len(obj.message) > 50 else obj.message
    
    sender_email.short_description = 'Sender Email'
    receiver_email.short_description = 'Receiver Email'
    message_preview.short_description = 'Message'

@admin.register(ReviewRating)
class ReviewRatingAdmin(admin.ModelAdmin):
    list_display = ['id', 'user_email', 'expert_email', 'rating', 'created_at']
    list_filter = ['rating', 'created_at']
    search_fields = ['user__email', 'expert__email', 'review']
    readonly_fields = ['created_at']
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'N/A'
    
    def expert_email(self, obj):
        return obj.expert.email if obj.expert else 'N/A'
    
    user_email.short_description = 'User Email'
    expert_email.short_description = 'Expert Email'

# Register remaining models with basic admin
admin.site.register(SelectedHotel)
admin.site.register(SelectedPlace)
admin.site.register(SelectedService)
admin.site.register(TripExpertAdvisorChat)
admin.site.register(ExpertUpdatedItinerary)
admin.site.register(TouristPlacesSearches)
admin.site.register(TouristPlaceResults)
admin.site.register(TouristPreferences)
admin.site.register(TouristHelpMeGuideActivities)
admin.site.register(TouristHelpMeGuideEvents)
admin.site.register(TouristPlaceCategory)
admin.site.register(HelpGuideTrip)
admin.site.register(LiveEvent)
admin.site.register(TripSelectedPlace)
admin.site.register(TripSelectedHotel)
admin.site.register(TripSelectedService)
admin.site.register(TripSelectedFlight)
admin.site.register(AffiliateTrip)
admin.site.register(AffiliatePlatform)