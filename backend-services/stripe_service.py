"""
StripePaymentService - Handles all Stripe operations
Includes Stripe Connect for marketplace payments
"""

import stripe
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
from typing import List, Dict, Optional

# Stripe API key (Replit will provide this via secrets)
stripe.api_key = settings.STRIPE_SECRET_KEY


class StripePaymentService:
    """
    Handles all Stripe payment operations
    Supports marketplace payments with Stripe Connect
    """
    
    @staticmethod
    def create_payment_intent(user, bookings: List, amount: Decimal, is_deposit: bool = False) -> Dict:
        """
        Create Stripe payment intent for bookings
        Automatically splits payment to providers via Connect
        
        Args:
            user: Django user object
            bookings: List of Booking objects
            amount: Total amount to charge
            is_deposit: Whether this is a deposit payment
        
        Returns:
            Payment intent details with client_secret
        """
        try:
            # Get or create Stripe customer
            customer_id = StripePaymentService._get_or_create_customer(user)
            
            # Calculate total and prepare transfers
            transfers = []
            total_cents = int(amount * 100)
            
            for booking in bookings:
                # Get provider's Stripe account
                from authentication.models import ServiceProviderForm
                provider = ServiceProviderForm.objects.get(user_id=booking.provider_id)
                
                if not provider.stripe_account_id:
                    raise ValueError(f"Provider {provider.business_name} has no Stripe account")
                
                if not provider.can_receive_payments:
                    raise ValueError(f"Provider {provider.business_name} cannot receive payments")
                
                # Calculate provider payout (service amount - provider's share of fee)
                provider_payout = booking.provider_payout
                
                transfers.append({
                    'amount': int(provider_payout * 100),  # cents
                    'destination': provider.stripe_account_id,
                    'booking_id': str(booking.id)
                })
            
            # Create payment intent
            # Note: For multiple providers, we'll use separate transfers
            # For single provider, use direct charge with application_fee
            
            if len(transfers) == 1:
                # Single provider - direct charge
                payment_intent = stripe.PaymentIntent.create(
                    amount=total_cents,
                    currency='usd',
                    customer=customer_id,
                    application_fee_amount=total_cents - transfers[0]['amount'],
                    transfer_data={
                        'destination': transfers[0]['destination'],
                    },
                    metadata={
                        'user_id': str(user.id),
                        'booking_ids': ','.join([str(b.id) for b in bookings]),
                        'is_deposit': str(is_deposit)
                    },
                    description=f"Booking: {bookings[0].title}"
                )
            else:
                # Multiple providers - charge platform, then transfer
                payment_intent = stripe.PaymentIntent.create(
                    amount=total_cents,
                    currency='usd',
                    customer=customer_id,
                    metadata={
                        'user_id': str(user.id),
                        'booking_ids': ','.join([str(b.id) for b in bookings]),
                        'is_deposit': str(is_deposit),
                        'transfers': str(transfers)
                    },
                    description=f"Bookings: {len(bookings)} items"
                )
            
            # Save payment intent ID to bookings
            intent_field = 'stripe_deposit_intent_id' if is_deposit else 'stripe_payment_intent_id'
            for booking in bookings:
                setattr(booking, intent_field, payment_intent.id)
                booking.payment_status = 'pending'
                booking.save()
            
            return {
                'payment_intent_id': payment_intent.id,
                'client_secret': payment_intent.client_secret,
                'amount': amount,
                'is_deposit': is_deposit
            }
            
        except stripe.error.StripeError as e:
            raise Exception(f"Stripe error: {str(e)}")
        except Exception as e:
            raise Exception(f"Payment intent creation failed: {str(e)}")
    
    @staticmethod
    def charge_balance(booking) -> Dict:
        """
        Charge remaining balance for deposit bookings
        """
        if not booking.balance_amount or booking.balance_paid:
            raise ValueError("No balance to charge")
        
        try:
            # Get provider
            from authentication.models import ServiceProviderForm
            provider = ServiceProviderForm.objects.get(user_id=booking.provider_id)
            
            # Get customer
            customer_id = StripePaymentService._get_or_create_customer(booking.user)
            
            # Create payment intent for balance
            balance_cents = int(booking.balance_amount * 100)
            
            payment_intent = stripe.PaymentIntent.create(
                amount=balance_cents,
                currency='usd',
                customer=customer_id,
                payment_method=booking.user.default_payment_method,  # Use saved payment method
                off_session=True,  # Charge without user present
                confirm=True,
                transfer_data={
                    'destination': provider.stripe_account_id,
                },
                metadata={
                    'booking_id': str(booking.id),
                    'type': 'balance_payment'
                },
                description=f"Balance payment: {booking.title}"
            )
            
            if payment_intent.status == 'succeeded':
                booking.stripe_balance_intent_id = payment_intent.id
                booking.balance_paid = True
                booking.payment_status = 'succeeded'
                booking.save()
                
                return {
                    'success': True,
                    'payment_intent_id': payment_intent.id
                }
            else:
                return {
                    'success': False,
                    'error': 'Balance payment failed'
                }
                
        except stripe.error.StripeError as e:
            raise Exception(f"Balance charge failed: {str(e)}")
    
    @staticmethod
    def process_refund(booking, refund_percentage: int = 100) -> Dict:
        """
        Process refund for cancelled booking
        Stripe automatically reverses transfers to providers
        """
        try:
            # Calculate refund amount
            refund_amount = (booking.total_amount * refund_percentage) / 100
            refund_cents = int(refund_amount * 100)
            
            # Get the payment intent ID
            payment_intent_id = booking.stripe_payment_intent_id or booking.stripe_deposit_intent_id
            
            if not payment_intent_id:
                raise ValueError("No payment intent found for booking")
            
            # Create refund
            refund = stripe.Refund.create(
                payment_intent=payment_intent_id,
                amount=refund_cents,
                reason='requested_by_customer',
                reverse_transfer=True,  # Reverses provider payout
                metadata={
                    'booking_id': str(booking.id),
                    'refund_percentage': refund_percentage
                }
            )
            
            if refund.status == 'succeeded':
                # Update booking
                booking.status = 'refunded'
                booking.refund_amount = refund_amount
                booking.refund_status = 'succeeded'
                booking.refunded_at = timezone.now()
                booking.save()
                
                # Update provider earnings
                from authentication.models import ServiceProviderForm
                provider = ServiceProviderForm.objects.get(user_id=booking.provider_id)
                provider.total_earnings -= booking.provider_payout
                if provider.pending_payout >= booking.provider_payout:
                    provider.pending_payout -= booking.provider_payout
                provider.save()
                
                return {
                    'success': True,
                    'refund_id': refund.id,
                    'amount': refund_amount
                }
            else:
                return {
                    'success': False,
                    'error': 'Refund processing failed'
                }
                
        except stripe.error.StripeError as e:
            raise Exception(f"Refund failed: {str(e)}")
    
    @staticmethod
    def onboard_provider(provider) -> str:
        """
        Create Stripe Connect account for service provider
        Returns onboarding link URL
        """
        try:
            # Create Stripe Connect account
            account = stripe.Account.create(
                type='standard',  # Provider manages own Stripe dashboard
                country='US',
                email=provider.email,
                capabilities={
                    'card_payments': {'requested': True},
                    'transfers': {'requested': True},
                },
                business_type='individual',  # or 'company'
                metadata={
                    'provider_id': str(provider.user_id),
                    'business_name': provider.business_name
                }
            )
            
            # Save Stripe account ID
            provider.stripe_account_id = account.id
            provider.stripe_account_status = 'pending'
            provider.save()
            
            # Generate onboarding link
            account_link = stripe.AccountLink.create(
                account=account.id,
                refresh_url=f"{settings.DOMAIN}/provider/stripe-refresh/",
                return_url=f"{settings.DOMAIN}/provider/stripe-complete/",
                type='account_onboarding',
            )
            
            return account_link.url
            
        except stripe.error.StripeError as e:
            raise Exception(f"Provider onboarding failed: {str(e)}")
    
    @staticmethod
    def check_provider_status(provider) -> Dict:
        """
        Check if provider has completed Stripe onboarding
        """
        try:
            if not provider.stripe_account_id:
                return {
                    'can_receive_payments': False,
                    'status': 'not_started'
                }
            
            account = stripe.Account.retrieve(provider.stripe_account_id)
            
            # Update provider status
            if account.charges_enabled:
                provider.stripe_account_status = 'active'
                provider.can_receive_payments = True
                provider.stripe_onboarding_completed_at = timezone.now()
            else:
                provider.stripe_account_status = 'restricted'
                provider.can_receive_payments = False
            
            provider.save()
            
            return {
                'can_receive_payments': account.charges_enabled,
                'status': provider.stripe_account_status,
                'details_submitted': account.details_submitted
            }
            
        except stripe.error.StripeError as e:
            return {
                'can_receive_payments': False,
                'status': 'error',
                'error': str(e)
            }
    
    @staticmethod
    def onboard_expert(expert) -> str:
        """
        Create Stripe Connect account for local expert (for receiving fees)
        """
        try:
            from authentication.models import User
            expert_user = User.objects.get(id=expert.user_id)
            
            account = stripe.Account.create(
                type='standard',
                country='US',
                email=expert_user.email,
                capabilities={
                    'card_payments': {'requested': True},
                    'transfers': {'requested': True},
                },
                metadata={
                    'expert_id': str(expert.user_id),
                    'type': 'local_expert'
                }
            )
            
            expert.stripe_account_id = account.id
            expert.stripe_account_status = 'pending'
            expert.save()
            
            account_link = stripe.AccountLink.create(
                account=account.id,
                refresh_url=f"{settings.DOMAIN}/expert/stripe-refresh/",
                return_url=f"{settings.DOMAIN}/expert/stripe-complete/",
                type='account_onboarding',
            )
            
            return account_link.url
            
        except stripe.error.StripeError as e:
            raise Exception(f"Expert onboarding failed: {str(e)}")
    
    @staticmethod
    def _get_or_create_customer(user) -> str:
        """
        Get or create Stripe customer for user
        """
        if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
            return user.stripe_customer_id
        
        try:
            customer = stripe.Customer.create(
                email=user.email,
                name=f"{user.first_name} {user.last_name}",
                metadata={
                    'user_id': str(user.id)
                }
            )
            
            # Save customer ID to user
            user.stripe_customer_id = customer.id
            user.save()
            
            return customer.id
            
        except stripe.error.StripeError as e:
            raise Exception(f"Customer creation failed: {str(e)}")
    
    @staticmethod
    def handle_webhook(payload: bytes, sig_header: str) -> Dict:
        """
        Handle Stripe webhook events
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            raise Exception("Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise Exception("Invalid signature")
        
        # Handle event types
        if event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']
            StripePaymentService._handle_payment_success(payment_intent)
            
        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            StripePaymentService._handle_payment_failed(payment_intent)
            
        elif event['type'] == 'account.updated':
            account = event['data']['object']
            StripePaymentService._handle_account_updated(account)
        
        return {'received': True}
    
    @staticmethod
    def _handle_payment_success(payment_intent):
        """Handle successful payment webhook"""
        from authentication.models import Booking
        
        booking_ids = payment_intent['metadata'].get('booking_ids', '').split(',')
        
        for booking_id in booking_ids:
            try:
                booking = Booking.objects.get(id=booking_id)
                booking.payment_status = 'succeeded'
                booking.save()
            except Booking.DoesNotExist:
                pass
    
    @staticmethod
    def _handle_payment_failed(payment_intent):
        """Handle failed payment webhook"""
        from authentication.models import Booking
        
        booking_ids = payment_intent['metadata'].get('booking_ids', '').split(',')
        
        for booking_id in booking_ids:
            try:
                booking = Booking.objects.get(id=booking_id)
                booking.payment_status = 'failed'
                booking.status = 'payment_failed'
                booking.save()
            except Booking.DoesNotExist:
                pass
    
    @staticmethod
    def _handle_account_updated(account):
        """Handle provider account status changes"""
        from authentication.models import ServiceProviderForm, LocalExpertForm
        
        # Check if it's a provider or expert
        metadata = account.get('metadata', {})
        
        if 'provider_id' in metadata:
            try:
                provider = ServiceProviderForm.objects.get(stripe_account_id=account['id'])
                provider.can_receive_payments = account.get('charges_enabled', False)
                provider.stripe_account_status = 'active' if provider.can_receive_payments else 'restricted'
                provider.save()
            except ServiceProviderForm.DoesNotExist:
                pass
        
        elif 'expert_id' in metadata:
            try:
                expert = LocalExpertForm.objects.get(stripe_account_id=account['id'])
                expert.can_receive_payments = account.get('charges_enabled', False)
                expert.stripe_account_status = 'active' if expert.can_receive_payments else 'restricted'
                expert.save()
            except LocalExpertForm.DoesNotExist:
                pass
