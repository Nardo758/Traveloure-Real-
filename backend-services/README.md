# Traveloure Backend Services

Complete booking system services for the Traveloure platform.

## 📦 What's Included

### 1. **BookingBotService** (`booking_bot.py`)
Central booking orchestrator - the "booking bot"
- Processes mixed carts (instant + request + external)
- Coordinates with all other services
- Handles expert booking on behalf
- Confirms payments and updates database

### 2. **StripePaymentService** (`stripe_service.py`)
Handles all Stripe operations
- Creates payment intents
- Stripe Connect marketplace payments
- Automatic splits to providers
- Refund processing
- Provider/expert onboarding
- Webhook handling

### 3. **AvailabilityService** (`availability_service.py`)
Manages provider availability
- Supports 3 types: calendar, toggle, inventory
- Checks availability before booking
- Updates availability after booking/cancellation
- Gets available date ranges

### 4. **PricingService** (`pricing_service.py`)
Calculates pricing
- Supports 3 types: fixed, dynamic, quote-based
- Handles per-person pricing
- Group discounts
- Seasonal pricing
- Platform fee calculation
- Expert fee calculation
- Deposit calculation

### 5. **AffiliateService** (`affiliate_service.py`)
Generates external booking links
- Booking.com for accommodations
- Viator/GetYourGuide for activities
- OpenTable/Resy for meals
- Skyscanner for transport
- Affiliate tracking

---

## 🚀 Installation

### Step 1: Copy to Your Django Project

Copy the entire `backend-services` folder to your Django project:

```
your-project/
├── authentication/
│   ├── models.py
│   ├── views.py
│   └── services/           ← Create this folder
│       ├── __init__.py
│       ├── booking_bot.py
│       ├── stripe_service.py
│       ├── availability_service.py
│       ├── pricing_service.py
│       └── affiliate_service.py
```

### Step 2: Install Required Packages

```bash
pip install stripe
```

(Stripe is already in your requirements.txt, but verify it's there)

### Step 3: Configure Settings

Add to your Django `settings.py`:

```python
# Stripe Configuration (from Replit Secrets)
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')

# Domain for Stripe Connect return URLs
DOMAIN = os.environ.get('DOMAIN_URL', 'https://traveloure.com')
```

### Step 4: Add Models (If Not Already Exists)

Make sure your Django models include:
- `Booking`
- `BookingRequest`
- `ProviderAvailability`
- `ProviderPricing`
- `PlatformFee`

(These were created by the database migrations)

---

## 💡 Usage Examples

### Example 1: Process a Cart

```python
from authentication.services import BookingBotService

# User has items in cart
cart_items = [
    {'id': 'item-123', 'booking_type': 'instant'},
    {'id': 'item-456', 'booking_type': 'request'},
    {'id': 'item-789', 'booking_type': 'external'},
]

# Process the cart
result = BookingBotService.process_cart(
    user=request.user,
    cart_items=cart_items,
    payment_method='full'  # or 'deposit'
)

# Results
instant_bookings = result['instant_bookings']  # List of confirmed bookings
pending_requests = result['pending_requests']  # List of pending requests
external_links = result['external_links']      # List of affiliate links
payment_intent = result['payment_intent']      # Stripe payment intent
```

### Example 2: Check Availability

```python
from authentication.services import AvailabilityService
from authentication.models import ServiceProviderForm
from datetime import date

provider = ServiceProviderForm.objects.get(user_id='provider-123')

is_available = AvailabilityService.check_availability(
    provider=provider,
    date=date(2026, 3, 15),
    time=None,
    quantity=2
)

if is_available:
    # Proceed with booking
    pass
```

### Example 3: Get Price

```python
from authentication.services import PricingService
from datetime import date

price = PricingService.get_price(
    provider=provider,
    service_id=None,
    date=date(2026, 3, 15),
    travelers=2
)

print(f"Price: ${price}")
```

### Example 4: Calculate Fees

```python
from authentication.services import PricingService
from decimal import Decimal

fee_breakdown = PricingService.calculate_platform_fees(
    provider=provider,
    service_amount=Decimal('100.00'),
    category='activity'
)

print(f"Platform fee: ${fee_breakdown['platform_fee']}")
print(f"Provider receives: ${fee_breakdown['breakdown']['provider_receives']}")
```

### Example 5: Generate Affiliate Link

```python
from authentication.services import AffiliateService
from datetime import date

link = AffiliateService.generate_link(
    item_type='accommodation',
    destination='Paris, France',
    date=date(2026, 3, 15),
    metadata={'nights': 3, 'adults': 2}
)

print(f"Book at: {link['url']}")
print(f"Partner: {link['partner_name']}")
```

### Example 6: Create Payment Intent

```python
from authentication.services import StripePaymentService
from decimal import Decimal

payment_intent = StripePaymentService.create_payment_intent(
    user=request.user,
    bookings=[booking1, booking2],
    amount=Decimal('250.00'),
    is_deposit=False
)

# Return client_secret to frontend
client_secret = payment_intent['client_secret']
```

### Example 7: Confirm Booking After Payment

```python
from authentication.services import BookingBotService

success = BookingBotService.confirm_booking_payment(
    booking_id='booking-123',
    payment_intent_id='pi_abc123'
)

if success:
    # Send confirmation email
    pass
```

### Example 8: Expert Books on Behalf

```python
from authentication.services import BookingBotService

result = BookingBotService.expert_book_on_behalf(
    expert=expert_user,
    trip_item=trip_item,
    user=customer_user
)

if result['success']:
    booking = result['booking']
    # Booking confirmed
```

---

## 🔗 Integration with API Endpoints

These services are meant to be called from your Django API views:

```python
# views_api/bookings_api.py

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from authentication.services import BookingBotService

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_cart(request):
    """
    Process cart and create bookings
    """
    cart_items = request.data.get('cart_items', [])
    payment_method = request.data.get('payment_method', 'full')
    
    try:
        result = BookingBotService.process_cart(
            user=request.user,
            cart_items=cart_items,
            payment_method=payment_method
        )
        
        return Response({
            'success': True,
            'instant_bookings': [str(b.id) for b in result['instant_bookings']],
            'pending_requests': [str(r.id) for r in result['pending_requests']],
            'external_links': result['external_links'],
            'payment_required': float(result['payment_required']),
            'payment_intent': result['payment_intent'],
            'errors': result['errors']
        })
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=500)
```

---

## ⚙️ Configuration

### Affiliate Partner IDs

Update `affiliate_service.py` with your actual affiliate IDs:

```python
PARTNERS = {
    'booking_com': {
        'affiliate_id': 'YOUR_BOOKING_COM_AID',  # Replace with actual ID
    },
    'viator': {
        'affiliate_id': 'YOUR_VIATOR_AID',
    },
    # ... etc
}
```

Or use environment variables:

```python
'affiliate_id': os.environ.get('BOOKING_COM_AID', 'default_id'),
```

### Platform Fee Defaults

Platform fees are configured in the database (`platform_fees` table).

Default fees (already seeded):
- Global: 15%
- Accommodations: 7.5%
- Activities: 15%
- Meals: 5%
- Transport: 10%

### Stripe Connect

Enable Stripe Connect in your Stripe Dashboard:
1. Go to Connect settings
2. Choose "Platform or Marketplace"
3. Set return URLs for provider onboarding

---

## 🧪 Testing

### Unit Tests Example

```python
# tests/test_services.py

from django.test import TestCase
from authentication.services import PricingService
from decimal import Decimal

class PricingServiceTests(TestCase):
    def test_calculate_platform_fees(self):
        fee = PricingService.calculate_platform_fees(
            provider=self.provider,
            service_amount=Decimal('100.00'),
            category='activity'
        )
        
        self.assertEqual(fee['fee_percentage'], Decimal('15.00'))
        self.assertEqual(fee['platform_fee'], Decimal('15.00'))
```

---

## 🔍 Troubleshooting

### Import Errors

If you get import errors:

```python
# Make sure __init__.py exists in services folder
# And import like this:
from authentication.services import BookingBotService

# NOT like this:
from services.booking_bot import BookingBotService
```

### Stripe Errors

```python
# Check Stripe keys are set:
python manage.py shell
>>> from django.conf import settings
>>> print(settings.STRIPE_SECRET_KEY)
```

### Database Errors

If you get foreign key errors, make sure migrations ran:

```bash
python manage.py makemigrations
python manage.py migrate
```

---

## 📚 Service Dependencies

```
BookingBotService
  ├─ StripePaymentService  (for payments)
  ├─ AvailabilityService   (check availability)
  ├─ PricingService        (calculate prices)
  └─ AffiliateService      (external links)

StripePaymentService
  └─ (Stripe API)

AvailabilityService
  └─ ProviderAvailability model

PricingService
  ├─ ProviderPricing model
  └─ PlatformFee model

AffiliateService
  └─ (External APIs)
```

---

## 🚀 Next Steps

1. ✅ Services created
2. ⏳ Create API endpoints (Step 2)
3. ⏳ Build frontend components (Step 3)
4. ⏳ Connect Stripe (Step 4)
5. ⏳ Test end-to-end (Step 5)

---

## 📞 Support

Questions? Issues? Check:
- `TRAVELOURE_IMPLEMENTATION_PLAN.md` - Master plan
- `QUICK_START_GUIDE.md` - Quick reference
- Database migrations - `database-migrations.sql`

**Created by:** RocketMan 🚀  
**Date:** 2026-01-31