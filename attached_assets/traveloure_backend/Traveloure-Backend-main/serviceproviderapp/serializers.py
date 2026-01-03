from rest_framework import serializers
from .models import AllService
from ai_itinerary.serializers import UserSerializer


class AllServiceSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    location = serializers.CharField(max_length=255, required=True, help_text="Service location is required")
    
    class Meta:
        model = AllService
        fields = '__all__'
    
    def validate_location(self, value):
        """Ensure location is not empty or just whitespace"""
        if not value or not value.strip():
            raise serializers.ValidationError("Location cannot be empty.")
        return value.strip()

class ServiceStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllService
        fields = ['id', 'form_status']

class ServiceDashboardSerializer(serializers.Serializer):
    total_earnings = serializers.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    active_services_count = serializers.IntegerField(default=0)
    services_booked_count = serializers.IntegerField(default=0)
    average_rating = serializers.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    services_list = AllServiceSerializer(many=True, read_only=True)
    bookings_list = serializers.ListField(default=list)
    feedback_list = serializers.ListField(default=list)