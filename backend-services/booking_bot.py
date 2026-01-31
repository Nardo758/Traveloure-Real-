"""
BookingBotService - Central booking orchestrator
Handles all booking types and coordinates with other services
"""

from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from typing import List, Dict, Optional
import uuid

from .stripe_service import StripePaymentService
from .availability_service import AvailabilityService
from .pricing_service import PricingService
from .affiliate_service import AffiliateService


class BookingBotService:
    """
    Central booking orchestrator - the "booking bot"
    Processes carts, handles payments, coordinates all booking types
    """
    
    @staticmethod
    @transaction.atomic
    def process_cart(user, cart_items: List[Dict], payment_method: str = 'full') -> Dict:
        """
        Process entire cart with mixed booking types
        
        Args:
            user: Django user object
            cart_items: List of trip items to book
            payment_method: 'full' or 'deposit'
        
        Returns:
            {
                'instant_bookings': [...],    # Confirmed immediately
                'pending_requests': [...],    # Awaiting provider approval
                'external_links': [...],       # For user to book elsewhere
                'payment_required': Decimal,   # Amount to charge now
                'payment_intent': {...},       # Stripe payment intent if applicable
                'errors': [...]                # Any errors encountered
            }
        """
        from authentication.models import Booking, BookingRequest, TripItem
        
        results = {
            'instant_bookings': [],
            'pending_requests': [],
            'external_links': [],
            'payment_required': Decimal('0.00'),
            'payment_intent': None,
            'errors': []
        }
        
        # Separate items by booking type
        instant_items = []
        request_items = []
        external_items = []
        
        for item_data in cart_items:
            try:
                # Get TripItem from database
                trip_item = TripItem.objects.get(id=item_data['id'])
                
                if trip_item.booking_type == 'instant':
                    instant_items.append(trip_item)
                elif trip_item.booking_type == 'request':
                    request_items.append(trip_item)
                elif trip_item.booking_type == 'external':
                    external_items.append(trip_item)
                    
            except TripItem.DoesNotExist:
                results['errors'].append(f"Trip item {item_data['id']} not found")
        
        # Process instant bookings
        if instant_items:
            instant_result = BookingBotService._process_instant_bookings(
                user, instant_items, payment_method
            )
            results['instant_bookings'] = instant_result['bookings']
            results['payment_required'] = instant_result['total_amount']
            results['payment_intent'] = instant_result.get('payment_intent')
            results['errors'].extend(instant_result.get('errors', []))
        
        # Submit booking requests
        if request_items:
            request_result = BookingBotService._submit_booking_requests(user, request_items)
            results['pending_requests'] = request_result['requests']
            results['errors'].extend(request_result.get('errors', []))
        
        # Generate external links
        if external_items:
            external_result = BookingBotService._generate_external_links(external_items)
            results['external_links'] = external_result['links']
        
        return results
    
    @staticmethod
    def _process_instant_bookings(user, trip_items: List, payment_method: str) -> Dict:
        """
        Process instant-book items
        Checks availability, creates bookings, processes payment
        """
        from authentication.models import Booking, ServiceProviderForm
        
        bookings = []
        total_amount = Decimal('0.00')
        errors = []
        
        for trip_item in trip_items:
            try:
                # Get provider
                provider = ServiceProviderForm.objects.get(user_id=trip_item.provider_id)
                
                # Check availability
                if not provider.instant_booking_enabled:
                    errors.append(f"{trip_item.title} does not support instant booking")
                    continue
                
                available = AvailabilityService.check_availability(
                    provider=provider,
                    date=trip_item.date,
                    time=trip_item.time,
                    quantity=trip_item.trip.travelers
                )
                
                if not available:
                    errors.append(f"{trip_item.title} is no longer available")
                    continue
                
                # Get price (may be different from estimated)
                final_price = PricingService.get_price(
                    provider=provider,
                    service_id=None,
                    date=trip_item.date,
                    travelers=trip_item.trip.travelers
                )
                
                # Calculate fees
                fee_breakdown = PricingService.calculate_platform_fees(
                    provider=provider,
                    service_amount=final_price,
                    category=trip_item.item_type
                )
                
                # Determine payment amount (deposit or full)
                if payment_method == 'deposit' and provider.requires_deposit:
                    deposit_amount = PricingService.calculate_deposit(final_price, provider)
                    balance_amount = final_price + fee_breakdown['platform_fee'] - deposit_amount
                else:
                    deposit_amount = None
                    balance_amount = None
                
                # Create booking
                booking = Booking.objects.create(
                    user=user,
                    trip=trip_item.trip,
                    trip_item=trip_item,
                    provider_id=provider.user_id,
                    booking_type='instant',
                    status='pending_payment',
                    title=trip_item.title,
                    booking_date=trip_item.date,
                    booking_time=trip_item.time,
                    travelers=trip_item.trip.travelers,
                    service_amount=final_price,
                    platform_fee=fee_breakdown['platform_fee'],
                    total_amount=final_price + fee_breakdown['platform_fee'],
                    provider_payout=final_price - fee_breakdown['provider_deduction'],
                    payment_method=payment_method,
                    deposit_amount=deposit_amount,
                    balance_amount=balance_amount,
                    special_requests=trip_item.trip.special_requests,
                    metadata={
                        'fee_breakdown': fee_breakdown,
                        'original_price': float(trip_item.price)
                    }
                )
                
                bookings.append(booking)
                
                # Add to payment total
                if payment_method == 'deposit' and deposit_amount:
                    total_amount += deposit_amount
                else:
                    total_amount += booking.total_amount
                    
            except ServiceProviderForm.DoesNotExist:
                errors.append(f"Provider not found for {trip_item.title}")
            except Exception as e:
                errors.append(f"Error booking {trip_item.title}: {str(e)}")
        
        # Create payment intent if we have bookings
        payment_intent = None
        if bookings and total_amount > 0:
            try:
                payment_intent = StripePaymentService.create_payment_intent(
                    user=user,
                    bookings=bookings,
                    amount=total_amount,
                    is_deposit=(payment_method == 'deposit')
                )
            except Exception as e:
                errors.append(f"Payment intent creation failed: {str(e)}")
        
        return {
            'bookings': bookings,
            'total_amount': total_amount,
            'payment_intent': payment_intent,
            'errors': errors
        }
    
    @staticmethod
    def _submit_booking_requests(user, trip_items: List) -> Dict:
        """
        Submit booking requests to providers
        """
        from authentication.models import BookingRequest, ServiceProviderForm
        from datetime import timedelta
        
        requests = []
        errors = []
        
        for trip_item in trip_items:
            try:
                # Get provider
                provider = ServiceProviderForm.objects.get(user_id=trip_item.provider_id)
                
                if not provider.request_booking_enabled:
                    errors.append(f"{trip_item.title} does not accept booking requests")
                    continue
                
                # Create booking request
                booking_request = BookingRequest.objects.create(
                    user=user,
                    trip_item=trip_item,
                    provider_id=provider.user_id,
                    status='pending_provider',
                    requested_date=trip_item.date,
                    requested_time=trip_item.time,
                    travelers=trip_item.trip.travelers,
                    special_requests=trip_item.trip.special_requests,
                    expires_at=timezone.now() + timedelta(hours=48),
                    response_expires_at=timezone.now() + timedelta(hours=48)
                )
                
                requests.append(booking_request)
                
                # Send notification to provider
                BookingBotService._notify_provider_request(provider, booking_request)
                
            except ServiceProviderForm.DoesNotExist:
                errors.append(f"Provider not found for {trip_item.title}")
            except Exception as e:
                errors.append(f"Error submitting request for {trip_item.title}: {str(e)}")
        
        return {
            'requests': requests,
            'errors': errors
        }
    
    @staticmethod
    def _generate_external_links(trip_items: List) -> Dict:
        """
        Generate affiliate links for external bookings
        """
        links = []
        
        for trip_item in trip_items:
            if trip_item.external_url:
                # URL already exists
                links.append({
                    'trip_item_id': str(trip_item.id),
                    'title': trip_item.title,
                    'url': trip_item.external_url,
                    'partner': trip_item.affiliate_partner
                })
            else:
                # Generate affiliate link
                affiliate_link = AffiliateService.generate_link(
                    item_type=trip_item.item_type,
                    destination=trip_item.location_name,
                    date=trip_item.date,
                    metadata=trip_item.metadata
                )
                
                if affiliate_link:
                    # Update trip item with generated link
                    trip_item.external_url = affiliate_link['url']
                    trip_item.affiliate_partner = affiliate_link['partner']
                    trip_item.save()
                    
                    links.append({
                        'trip_item_id': str(trip_item.id),
                        'title': trip_item.title,
                        'url': affiliate_link['url'],
                        'partner': affiliate_link['partner']
                    })
        
        return {'links': links}
    
    @staticmethod
    def confirm_booking_payment(booking_id: str, payment_intent_id: str) -> bool:
        """
        Confirm booking after successful payment
        """
        from authentication.models import Booking, ServiceProviderForm
        
        try:
            booking = Booking.objects.get(id=booking_id)
            
            # Update booking status
            booking.status = 'confirmed'
            booking.payment_status = 'succeeded'
            booking.confirmed_at = timezone.now()
            booking.confirmation_code = BookingBotService._generate_confirmation_code()
            
            if booking.payment_method == 'deposit':
                booking.deposit_paid = True
            else:
                booking.deposit_paid = True
                booking.balance_paid = True
            
            booking.save()
            
            # Update trip item
            booking.trip_item.booking_status = 'confirmed'
            booking.trip_item.confirmation_code = booking.confirmation_code
            booking.trip_item.save()
            
            # Update provider earnings
            provider = ServiceProviderForm.objects.get(user_id=booking.provider_id)
            provider.total_earnings += booking.provider_payout
            provider.pending_payout += booking.provider_payout
            provider.total_bookings += 1
            provider.save()
            
            # Decrease availability
            AvailabilityService.decrease_availability(
                provider=provider,
                date=booking.booking_date,
                quantity=booking.travelers
            )
            
            # Send notifications
            BookingBotService._notify_booking_confirmed(booking)
            
            return True
            
        except Exception as e:
            print(f"Error confirming booking: {e}")
            return False
    
    @staticmethod
    def expert_book_on_behalf(expert, trip_item, user) -> Dict:
        """
        Personal assistant expert books on user's behalf
        Uses user's saved payment method
        """
        from authentication.models import LocalExpertForm, Booking
        
        # Verify expert has PA privileges
        expert_profile = LocalExpertForm.objects.get(user_id=expert.id)
        if not expert_profile.can_book_on_behalf:
            return {
                'success': False,
                'error': 'Expert does not have booking privileges'
            }
        
        # Process as instant booking but track as expert-assisted
        result = BookingBotService._process_instant_bookings(
            user=user,
            trip_items=[trip_item],
            payment_method='full'
        )
        
        if result['bookings']:
            booking = result['bookings'][0]
            booking.expert_id = expert.id
            booking.booking_type = 'expert_assisted'
            
            # Calculate expert fee
            expert_fee = PricingService.calculate_expert_fee(
                expert_profile=expert_profile,
                booking_amount=booking.service_amount
            )
            booking.expert_fee = expert_fee
            booking.total_amount += expert_fee
            booking.save()
            
            # Update expert earnings
            expert_profile.total_bookings_assisted += 1
            expert_profile.total_earnings += expert_fee
            expert_profile.save()
        
        return {
            'success': len(result['bookings']) > 0,
            'booking': result['bookings'][0] if result['bookings'] else None,
            'errors': result['errors']
        }
    
    @staticmethod
    def _generate_confirmation_code() -> str:
        """Generate unique confirmation code"""
        import random
        import string
        return 'TRV' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
    
    @staticmethod
    def _notify_provider_request(provider, booking_request):
        """Send notification to provider about new booking request"""
        # TODO: Implement email/SMS notification
        pass
    
    @staticmethod
    def _notify_booking_confirmed(booking):
        """Send confirmation notifications"""
        # TODO: Implement email/SMS to user and provider
        pass
