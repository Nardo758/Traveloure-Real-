# Traveloure Stripe Integration - Complete Guide

**Purpose:** Connect users → Stripe → service providers for marketplace payments

---

## 🏗️ Architecture Overview

```
User Books Service
       ↓
Your Platform (collects payment)
       ↓
    Stripe
       ↓
Service Provider (receives payout)
```

**You use: Stripe Connect** (marketplace solution)

---

## 🔧 Stripe Connect Setup

### What is Stripe Connect?

Stripe Connect lets you:
- ✅ Collect payments from users
- ✅ Automatically split payments to providers
- ✅ Take your platform fee
- ✅ Handle refunds
- ✅ Provider gets paid directly to their bank

### Account Types

**1. Platform Account (You)**
- Main Stripe account
- Receives all payments
- Distributes to providers

**2. Connected Accounts (Service Providers)**
- Each provider has their own Stripe account
- Gets payouts automatically
- Can view their earnings

---

## 📋 Step-by-Step Setup

### Step 1: Enable Stripe Connect

```bash
# In Replit, you already have Stripe installed
# Just need to configure Connect in your Stripe Dashboard

1. Go to: https://dashboard.stripe.com/connect/accounts/overview
2. Click "Get Started" with Connect
3. Choose: "Platform or Marketplace"
4. Account type: "Standard" (easiest for providers)
```

### Step 2: Backend Configuration

Create: `/authentication/stripe_connect.py`

```python
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

class StripeConnectService:
    """
    Handles Stripe Connect operations for marketplace payments
    """
    
    @staticmethod
    def create_connected_account(provider):
        """
        Create a Stripe Connect account for a service provider
        Called when provider completes onboarding
        """
        try:
            account = stripe.Account.create(
                type="standard",  # Provider manages their own Stripe account
                country="US",  # Provider's country
                email=provider.user.email,
                capabilities={
                    "card_payments": {"requested": True},
                    "transfers": {"requested": True},
                },
                business_type="individual",  # or "company"
                metadata={
                    "provider_id": str(provider.id),
                    "platform": "traveloure"
                }
            )
            
            # Save Stripe account ID to provider
            provider.stripe_account_id = account.id
            provider.stripe_account_status = "pending"
            provider.save()
            
            return account
            
        except stripe.error.StripeError as e:
            print(f"Error creating Stripe account: {e}")
            return None
    
    @staticmethod
    def create_account_link(provider, refresh_url, return_url):
        """
        Generate onboarding link for provider to complete Stripe setup
        """
        try:
            account_link = stripe.AccountLink.create(
                account=provider.stripe_account_id,
                refresh_url=refresh_url,  # Where to send if they need to restart
                return_url=return_url,    # Where to send when complete
                type="account_onboarding",
            )
            
            return account_link.url
            
        except stripe.error.StripeError as e:
            print(f"Error creating account link: {e}")
            return None
    
    @staticmethod
    def check_account_status(provider):
        """
        Check if provider has completed Stripe onboarding
        """
        try:
            account = stripe.Account.retrieve(provider.stripe_account_id)
            
            # Check if charges are enabled
            if account.charges_enabled:
                provider.stripe_account_status = "active"
                provider.can_receive_payments = True
            else:
                provider.stripe_account_status = "pending"
                provider.can_receive_payments = False
            
            provider.save()
            return account
            
        except stripe.error.StripeError as e:
            print(f"Error checking account: {e}")
            return None


class StripePaymentService:
    """
    Handles booking payments with automatic splits to providers
    """
    
    @staticmethod
    def create_booking_payment_intent(booking, user):
        """
        Create payment intent for a booking
        Automatically splits payment to provider
        """
        try:
            provider = booking.trip_item.provider
            
            # Check provider has active Stripe account
            if not provider.can_receive_payments:
                raise Exception("Provider cannot receive payments yet")
            
            # Calculate amounts
            service_amount = int(booking.amount * 100)  # Convert to cents
            platform_fee = int(service_amount * 0.15)   # 15% platform fee
            provider_payout = service_amount - platform_fee
            
            # Create payment intent with transfer to provider
            payment_intent = stripe.PaymentIntent.create(
                amount=service_amount,
                currency="usd",
                customer=user.stripe_customer_id,
                application_fee_amount=platform_fee,  # Your fee
                transfer_data={
                    "destination": provider.stripe_account_id,  # Provider gets paid
                },
                metadata={
                    "booking_id": str(booking.id),
                    "trip_id": str(booking.trip_id),
                    "provider_id": str(provider.id),
                    "user_id": str(user.id),
                },
                description=f"Booking: {booking.title}"
            )
            
            # Save payment intent ID to booking
            booking.payment_intent_id = payment_intent.id
            booking.payment_status = "pending"
            booking.save()
            
            return payment_intent
            
        except Exception as e:
            print(f"Error creating payment intent: {e}")
            raise
    
    @staticmethod
    def confirm_booking_payment(booking):
        """
        Called after successful payment to finalize booking
        """
        try:
            # Update booking status
            booking.status = "confirmed"
            booking.payment_status = "succeeded"
            booking.paid_at = timezone.now()
            booking.confirmation_code = generate_confirmation_code()
            booking.save()
            
            # Update provider earnings
            provider = booking.trip_item.provider
            provider.total_earnings += booking.provider_payout
            provider.pending_payout += booking.provider_payout
            provider.save()
            
            # Send notifications
            send_booking_confirmation_email(booking)
            notify_provider_new_booking(booking)
            
            return True
            
        except Exception as e:
            print(f"Error confirming payment: {e}")
            return False
    
    @staticmethod
    def process_refund(booking, refund_percentage=100):
        """
        Process refund for cancelled booking
        Stripe automatically reverses the transfer to provider
        """
        try:
            refund_amount = int((booking.amount * refund_percentage / 100) * 100)
            
            refund = stripe.Refund.create(
                payment_intent=booking.payment_intent_id,
                amount=refund_amount,
                reason="requested_by_customer",
                reverse_transfer=True,  # Takes money back from provider
                metadata={
                    "booking_id": str(booking.id),
                    "refund_percentage": refund_percentage
                }
            )
            
            # Update booking
            booking.status = "refunded"
            booking.refund_amount = refund_amount / 100
            booking.refunded_at = timezone.now()
            booking.save()
            
            # Update provider earnings
            provider = booking.trip_item.provider
            provider.total_earnings -= (refund_amount / 100)
            provider.save()
            
            return refund
            
        except Exception as e:
            print(f"Error processing refund: {e}")
            raise


def generate_confirmation_code():
    """Generate unique booking confirmation code"""
    import random
    import string
    return 'TRV' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
```

---

## 🎨 Frontend Integration

### Step 1: Install Stripe.js

Your Next.js frontend already likely has it, but if not:

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### Step 2: Checkout Component

Create: `/components/checkout/PaymentForm.jsx`

```jsx
"use client";

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { apiPost } from '@/lib/api';

// Load Stripe (use your publishable key)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ booking, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Create payment intent on backend
      const response = await apiPost('/api/bookings/create-payment-intent/', {
        bookingId: booking.id,
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const { clientSecret } = await response.json();

      // 2. Confirm payment with Stripe
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: elements.getElement(CardElement),
            billing_details: {
              name: booking.user.name,
              email: booking.user.email,
            },
          },
        }
      );

      if (stripeError) {
        setError(stripeError.message);
        setIsProcessing(false);
        return;
      }

      // 3. Confirm booking on backend
      if (paymentIntent.status === 'succeeded') {
        await apiPost('/api/bookings/confirm/', {
          bookingId: booking.id,
          paymentIntentId: paymentIntent.id,
        });

        onSuccess(booking);
      }

    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border border-gray-300 rounded-lg p-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className={`
          w-full py-3 rounded-lg font-semibold transition
          ${isProcessing || !stripe
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-700'
          }
        `}
      >
        {isProcessing ? 'Processing...' : `Pay $${booking.amount.toFixed(2)}`}
      </button>

      <p className="text-xs text-gray-600 text-center">
        Your payment is secure and encrypted. Platform fee included.
      </p>
    </form>
  );
}

export default function PaymentForm({ booking, onSuccess }) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm booking={booking} onSuccess={onSuccess} />
    </Elements>
  );
}
```

---

## 🔗 Backend API Endpoints

Add to `/api/bookings/views.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .stripe_connect import StripePaymentService

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment_intent(request):
    """
    Create Stripe payment intent for a booking
    """
    try:
        booking_id = request.data.get('bookingId')
        booking = Booking.objects.get(id=booking_id, user=request.user)
        
        # Create payment intent with provider split
        payment_intent = StripePaymentService.create_booking_payment_intent(
            booking=booking,
            user=request.user
        )
        
        return Response({
            'clientSecret': payment_intent.client_secret,
            'amount': booking.amount,
            'currency': 'usd'
        })
        
    except Booking.DoesNotExist:
        return Response(
            {'error': 'Booking not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_booking(request):
    """
    Confirm booking after successful payment
    """
    try:
        booking_id = request.data.get('bookingId')
        payment_intent_id = request.data.get('paymentIntentId')
        
        booking = Booking.objects.get(
            id=booking_id,
            user=request.user,
            payment_intent_id=payment_intent_id
        )
        
        # Finalize booking
        success = StripePaymentService.confirm_booking_payment(booking)
        
        if success:
            return Response({
                'success': True,
                'bookingId': str(booking.id),
                'confirmationCode': booking.confirmation_code
            })
        else:
            return Response(
                {'error': 'Failed to confirm booking'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
```

---

## 🎯 Provider Onboarding Flow

### Step 1: Provider Signs Up

When a service provider creates an account:

```python
# In your provider registration view
def complete_provider_registration(provider):
    # Create Stripe Connect account
    stripe_account = StripeConnectService.create_connected_account(provider)
    
    if stripe_account:
        # Generate onboarding link
        onboarding_url = StripeConnectService.create_account_link(
            provider=provider,
            refresh_url=f"{settings.DOMAIN}/provider/stripe-refresh/",
            return_url=f"{settings.DOMAIN}/provider/stripe-complete/"
        )
        
        return onboarding_url
    else:
        raise Exception("Failed to create Stripe account")
```

### Step 2: Provider Completes Stripe Onboarding

Provider clicks link → goes to Stripe → enters bank details → returns to your platform

```python
@api_view(['GET'])
def stripe_onboarding_complete(request):
    """
    Called when provider completes Stripe onboarding
    """
    provider = request.user.service_provider
    
    # Check account status
    account = StripeConnectService.check_account_status(provider)
    
    if account.charges_enabled:
        return Response({
            'success': True,
            'message': 'Payment setup complete! You can now receive bookings.',
            'canReceivePayments': True
        })
    else:
        return Response({
            'success': False,
            'message': 'Please complete your payment setup',
            'canReceivePayments': False
        })
```

---

## 💰 Money Flow Example

**Booking: $100 service**

```
User pays: $100
    ↓
Your platform receives: $100
    ↓
Stripe automatically splits:
    → Provider: $85 (goes directly to their bank)
    → Platform fee: $15 (stays with you)
```

**Provider never sees the full $100 - they get $85 automatically.**

---

## 🔔 Webhooks (Important!)

Stripe sends webhooks for payment events. You need to handle them:

```python
# /api/webhooks/stripe.py

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
import stripe

@csrf_exempt
def stripe_webhook(request):
    """
    Handle Stripe webhook events
    """
    payload = request.body
    sig_header = request.META['HTTP_STRIPE_SIGNATURE']
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError as e:
        return HttpResponse(status=400)
    
    # Handle events
    if event['type'] == 'payment_intent.succeeded':
        payment_intent = event['data']['object']
        booking_id = payment_intent['metadata']['booking_id']
        
        # Confirm booking
        booking = Booking.objects.get(id=booking_id)
        StripePaymentService.confirm_booking_payment(booking)
        
    elif event['type'] == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        # Handle failed payment
        
    elif event['type'] == 'account.updated':
        account = event['data']['object']
        # Provider account status changed
    
    return HttpResponse(status=200)
```

**Add to URLs:**
```python
path('webhooks/stripe/', stripe_webhook, name='stripe-webhook'),
```

**Configure in Stripe Dashboard:**
```
https://yourdomain.com/api/webhooks/stripe/
```

---

## ✅ Implementation Checklist

### Backend
- [ ] Install/configure Stripe Connect
- [ ] Create StripeConnectService class
- [ ] Create StripePaymentService class
- [ ] Add payment intent endpoint
- [ ] Add confirm booking endpoint
- [ ] Add webhook handler
- [ ] Add provider onboarding flow

### Frontend
- [ ] Install @stripe/stripe-js
- [ ] Create PaymentForm component
- [ ] Add to checkout page
- [ ] Handle success/error states
- [ ] Add provider onboarding UI

### Stripe Dashboard
- [ ] Enable Connect
- [ ] Get API keys (publishable + secret)
- [ ] Set up webhook endpoint
- [ ] Test with test mode

---

## 🧪 Testing

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0027 6000 3184`

**Test in Replit:**
```bash
# Use Stripe test mode keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 💡 Summary

**You DON'T need a separate "booking bot"** - you build this into your backend.

**Stripe Connect handles:**
- ✅ User payments
- ✅ Automatic splits to providers
- ✅ Your platform fee
- ✅ Refunds
- ✅ Provider payouts

**Next steps:**
1. Enable Stripe Connect in your dashboard
2. Add the backend code I provided
3. Add the frontend payment form
4. Test with test cards

Want me to help you implement any specific part? 🚀