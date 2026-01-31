"""
AvailabilityService - Manages provider availability
Supports 3 types: calendar, toggle, inventory
"""

from django.utils import timezone
from datetime import date, time, timedelta
from typing import Optional, List
import json


class AvailabilityService:
    """
    Check and manage provider availability
    Supports all 3 availability types: calendar, toggle, inventory
    """
    
    @staticmethod
    def check_availability(provider, date: date, time: Optional[time] = None, quantity: int = 1) -> bool:
        """
        Check if provider is available for booking
        
        Args:
            provider: ServiceProviderForm object
            date: Date to check
            time: Optional time slot
            quantity: Number of slots needed
        
        Returns:
            bool: True if available
        """
        from authentication.models import ProviderAvailability
        
        # Get provider's availability settings
        try:
            availability = ProviderAvailability.objects.get(provider_id=provider.user_id)
        except ProviderAvailability.DoesNotExist:
            # No availability record - check provider's default
            return provider.is_available if hasattr(provider, 'is_available') else True
        
        availability_type = availability.availability_type
        
        if availability_type == 'toggle':
            return AvailabilityService._check_toggle(availability)
        
        elif availability_type == 'calendar':
            return AvailabilityService._check_calendar(availability, date)
        
        elif availability_type == 'inventory':
            return AvailabilityService._check_inventory(availability, date, time, quantity)
        
        return True
    
    @staticmethod
    def _check_toggle(availability) -> bool:
        """Check toggle-based availability (simple on/off)"""
        return availability.is_available
    
    @staticmethod
    def _check_calendar(availability, check_date: date) -> bool:
        """
        Check calendar-based availability
        Provider has blocked certain dates
        """
        date_str = check_date.isoformat()
        
        # Check if date is in blocked dates
        blocked_dates = availability.blocked_dates or []
        if date_str in blocked_dates:
            return False
        
        # Check if using whitelist approach
        if availability.available_dates:
            return date_str in availability.available_dates
        
        # Check recurring unavailability (e.g., every Monday)
        if availability.recurring_unavailable:
            day_name = check_date.strftime('%A').lower()
            for rule in availability.recurring_unavailable:
                if rule.get('day') == day_name:
                    return False
                # Check for specific dates (holidays, etc.)
                if rule.get('date') == date_str:
                    return False
        
        return True
    
    @staticmethod
    def _check_inventory(availability, check_date: date, check_time: Optional[time], quantity: int) -> bool:
        """
        Check inventory-based availability
        Provider has X slots per day/time
        """
        # Check daily capacity
        if availability.daily_capacity:
            current_bookings = availability.current_bookings or 0
            if current_bookings + quantity > availability.daily_capacity:
                return False
        
        # Check time slots if time-specific
        if check_time and availability.time_slots:
            time_str = check_time.strftime('%H:%M')
            
            for slot in availability.time_slots:
                if slot.get('time') == time_str:
                    slot_available = slot.get('available', True)
                    slot_booked = slot.get('booked', 0)
                    slot_capacity = slot.get('capacity', 1)
                    
                    if not slot_available:
                        return False
                    
                    if slot_booked + quantity > slot_capacity:
                        return False
                    
                    return True
            
            # Time slot not found
            return False
        
        return True
    
    @staticmethod
    def decrease_availability(provider, booking_date: date, quantity: int = 1):
        """
        Decrease available slots after booking confirmed
        Only applies to inventory type
        """
        from authentication.models import ProviderAvailability
        
        try:
            availability = ProviderAvailability.objects.get(provider_id=provider.user_id)
            
            if availability.availability_type == 'inventory':
                availability.current_bookings = (availability.current_bookings or 0) + quantity
                availability.save()
                
        except ProviderAvailability.DoesNotExist:
            pass
    
    @staticmethod
    def increase_availability(provider, booking_date: date, quantity: int = 1):
        """
        Increase available slots after cancellation
        Only applies to inventory type
        """
        from authentication.models import ProviderAvailability
        
        try:
            availability = ProviderAvailability.objects.get(provider_id=provider.user_id)
            
            if availability.availability_type == 'inventory':
                availability.current_bookings = max(0, (availability.current_bookings or 0) - quantity)
                availability.save()
                
        except ProviderAvailability.DoesNotExist:
            pass
    
    @staticmethod
    def block_date(provider, block_date: date):
        """
        Block a specific date (calendar type)
        """
        from authentication.models import ProviderAvailability
        
        availability, created = ProviderAvailability.objects.get_or_create(
            provider_id=provider.user_id,
            defaults={'availability_type': 'calendar'}
        )
        
        if availability.availability_type != 'calendar':
            raise ValueError("Provider does not use calendar-based availability")
        
        date_str = block_date.isoformat()
        blocked_dates = availability.blocked_dates or []
        
        if date_str not in blocked_dates:
            blocked_dates.append(date_str)
            availability.blocked_dates = blocked_dates
            availability.save()
    
    @staticmethod
    def unblock_date(provider, unblock_date: date):
        """
        Unblock a specific date (calendar type)
        """
        from authentication.models import ProviderAvailability
        
        try:
            availability = ProviderAvailability.objects.get(provider_id=provider.user_id)
            
            if availability.availability_type != 'calendar':
                raise ValueError("Provider does not use calendar-based availability")
            
            date_str = unblock_date.isoformat()
            blocked_dates = availability.blocked_dates or []
            
            if date_str in blocked_dates:
                blocked_dates.remove(date_str)
                availability.blocked_dates = blocked_dates
                availability.save()
                
        except ProviderAvailability.DoesNotExist:
            pass
    
    @staticmethod
    def get_available_dates(provider, start_date: date, end_date: date) -> List[str]:
        """
        Get list of available dates in range
        Useful for displaying available dates to users
        """
        from authentication.models import ProviderAvailability
        
        available_dates = []
        current_date = start_date
        
        try:
            availability = ProviderAvailability.objects.get(provider_id=provider.user_id)
        except ProviderAvailability.DoesNotExist:
            # No availability settings - all dates available
            while current_date <= end_date:
                available_dates.append(current_date.isoformat())
                current_date += timedelta(days=1)
            return available_dates
        
        while current_date <= end_date:
            if AvailabilityService.check_availability(provider, current_date):
                available_dates.append(current_date.isoformat())
            current_date += timedelta(days=1)
        
        return available_dates
    
    @staticmethod
    def set_toggle_availability(provider, is_available: bool):
        """
        Set toggle availability (on/off)
        """
        from authentication.models import ProviderAvailability
        
        availability, created = ProviderAvailability.objects.get_or_create(
            provider_id=provider.user_id,
            defaults={'availability_type': 'toggle'}
        )
        
        availability.is_available = is_available
        availability.save()
        
        # Also update provider's main availability field
        provider.is_available = is_available
        provider.save()
    
    @staticmethod
    def update_time_slots(provider, time_slots: List[dict]):
        """
        Update time slots for inventory type
        
        time_slots format:
        [
            {"time": "09:00", "available": true, "capacity": 5, "booked": 0},
            {"time": "14:00", "available": true, "capacity": 5, "booked": 2}
        ]
        """
        from authentication.models import ProviderAvailability
        
        availability, created = ProviderAvailability.objects.get_or_create(
            provider_id=provider.user_id,
            defaults={'availability_type': 'inventory'}
        )
        
        if availability.availability_type != 'inventory':
            raise ValueError("Provider does not use inventory-based availability")
        
        availability.time_slots = time_slots
        availability.save()
    
    @staticmethod
    def set_daily_capacity(provider, capacity: int):
        """
        Set daily capacity for inventory type
        """
        from authentication.models import ProviderAvailability
        
        availability, created = ProviderAvailability.objects.get_or_create(
            provider_id=provider.user_id,
            defaults={'availability_type': 'inventory'}
        )
        
        availability.daily_capacity = capacity
        availability.current_bookings = 0  # Reset
        availability.save()
