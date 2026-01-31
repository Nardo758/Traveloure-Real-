"""
PricingService - Calculate pricing for bookings
Supports 3 types: fixed, dynamic, quote-based
Also handles platform fees and expert fees
"""

from decimal import Decimal
from datetime import date
from typing import Dict, Optional


class PricingService:
    """
    Calculate pricing for services
    Supports all 3 pricing types: fixed, dynamic, quote-based
    """
    
    @staticmethod
    def get_price(provider, service_id: Optional[str], date: date, travelers: int = 1) -> Decimal:
        """
        Get price for service on specific date
        
        Args:
            provider: ServiceProviderForm object
            service_id: Specific service (optional)
            date: Booking date
            travelers: Number of travelers
        
        Returns:
            Decimal: Final price
        """
        from authentication.models import ProviderPricing
        
        # Get pricing configuration
        try:
            if service_id:
                pricing = ProviderPricing.objects.get(
                    provider_id=provider.user_id,
                    service_id=service_id
                )
            else:
                pricing = ProviderPricing.objects.filter(
                    provider_id=provider.user_id,
                    service_id__isnull=True
                ).first()
        except ProviderPricing.DoesNotExist:
            # No pricing config - use provider's base price
            return Decimal(provider.base_price or 0)
        
        pricing_type = pricing.pricing_type
        
        if pricing_type == 'fixed':
            return PricingService._get_fixed_price(pricing, travelers)
        
        elif pricing_type == 'dynamic':
            return PricingService._get_dynamic_price(pricing, date, travelers)
        
        elif pricing_type == 'quote_based':
            return PricingService._get_quote_estimate(pricing, travelers)
        
        return Decimal('0.00')
    
    @staticmethod
    def _get_fixed_price(pricing, travelers: int) -> Decimal:
        """Get fixed price (with optional per-person calculation)"""
        base_price = Decimal(pricing.base_price or 0)
        
        if pricing.per_person:
            total = base_price * travelers
        else:
            total = base_price
        
        # Apply group discount if applicable
        if pricing.group_discounts and travelers > 1:
            discount = PricingService._calculate_group_discount(
                pricing.group_discounts,
                travelers
            )
            total = total * (1 - discount)
        
        return total
    
    @staticmethod
    def _get_dynamic_price(pricing, booking_date: date, travelers: int) -> Decimal:
        """Get dynamic price based on date/season"""
        base_price = Decimal(pricing.base_price or 0)
        
        # Check for date-specific overrides first
        if pricing.date_overrides:
            date_str = booking_date.isoformat()
            for override in pricing.date_overrides:
                if override.get('date') == date_str:
                    return Decimal(override.get('price', base_price))
        
        # Apply seasonal pricing
        if pricing.seasonal_pricing:
            multiplier = PricingService._get_seasonal_multiplier(
                pricing.seasonal_pricing,
                booking_date
            )
            base_price = base_price * Decimal(str(multiplier))
        
        # Apply per-person and group discounts
        if pricing.per_person:
            total = base_price * travelers
        else:
            total = base_price
        
        if pricing.group_discounts and travelers > 1:
            discount = PricingService._calculate_group_discount(
                pricing.group_discounts,
                travelers
            )
            total = total * (1 - discount)
        
        return total
    
    @staticmethod
    def _get_quote_estimate(pricing, travelers: int) -> Decimal:
        """
        Get estimate for quote-based pricing
        Returns midpoint of range
        """
        if pricing.estimated_range_min and pricing.estimated_range_max:
            min_price = Decimal(pricing.estimated_range_min)
            max_price = Decimal(pricing.estimated_range_max)
            return (min_price + max_price) / 2
        
        return Decimal(pricing.base_price or 0)
    
    @staticmethod
    def _calculate_group_discount(group_discounts, travelers: int) -> Decimal:
        """
        Calculate group discount percentage
        
        group_discounts format:
        [
            {"min_people": 5, "discount_percent": 10},
            {"min_people": 10, "discount_percent": 20}
        ]
        """
        applicable_discount = 0
        
        for discount in group_discounts:
            min_people = discount.get('min_people', 0)
            discount_percent = discount.get('discount_percent', 0)
            
            if travelers >= min_people:
                applicable_discount = max(applicable_discount, discount_percent)
        
        return Decimal(str(applicable_discount)) / 100
    
    @staticmethod
    def _get_seasonal_multiplier(seasonal_pricing, booking_date: date) -> float:
        """
        Get seasonal pricing multiplier
        
        seasonal_pricing format:
        [
            {
                "season": "peak",
                "dates": ["2026-12-20", "2026-12-31"],
                "multiplier": 1.5
            }
        ]
        """
        date_str = booking_date.isoformat()
        
        for season in seasonal_pricing:
            dates = season.get('dates', [])
            
            # Check if date is in season
            if len(dates) == 2:
                # Date range
                start_date = dates[0]
                end_date = dates[1]
                if start_date <= date_str <= end_date:
                    return season.get('multiplier', 1.0)
            elif date_str in dates:
                # Specific dates
                return season.get('multiplier', 1.0)
        
        return 1.0  # No seasonal adjustment
    
    @staticmethod
    def calculate_deposit(price: Decimal, provider) -> Decimal:
        """
        Calculate required deposit amount
        """
        from authentication.models import ProviderPricing
        
        if not provider.requires_deposit:
            return Decimal('0.00')
        
        # Check if provider has custom deposit settings
        try:
            pricing = ProviderPricing.objects.filter(
                provider_id=provider.user_id
            ).first()
            
            if pricing and pricing.requires_deposit:
                if pricing.deposit_type == 'fixed':
                    return Decimal(pricing.deposit_amount or 0)
                elif pricing.deposit_type == 'percentage':
                    percentage = Decimal(pricing.deposit_percentage or 30) / 100
                    return price * percentage
        except:
            pass
        
        # Use provider's default deposit percentage
        percentage = Decimal(provider.deposit_percentage or 30) / 100
        return price * percentage
    
    @staticmethod
    def calculate_platform_fees(provider, service_amount: Decimal, category: str) -> Dict:
        """
        Calculate platform fees based on category and provider overrides
        
        Returns:
            {
                'platform_fee': Decimal,           # Fee amount kept by platform
                'provider_deduction': Decimal,     # Amount deducted from provider payout
                'fee_percentage': Decimal,         # Effective fee percentage
                'breakdown': {...}                 # Detailed breakdown
            }
        """
        from authentication.models import PlatformFee
        
        # Find applicable fee (priority: provider > category > global)
        applicable_fee = None
        
        # Check provider-specific override
        provider_fee = PlatformFee.objects.filter(
            fee_type='provider',
            provider_id=provider.user_id,
            is_active=True
        ).order_by('-priority').first()
        
        if provider_fee:
            applicable_fee = provider_fee
        else:
            # Check category-specific fee
            category_fee = PlatformFee.objects.filter(
                fee_type='category',
                category=category,
                is_active=True
            ).order_by('-priority').first()
            
            if category_fee:
                applicable_fee = category_fee
            else:
                # Use global default
                global_fee = PlatformFee.objects.filter(
                    fee_type='global',
                    is_active=True
                ).order_by('-priority').first()
                
                applicable_fee = global_fee
        
        if not applicable_fee:
            # No fee configuration found - use 15% default
            fee_percentage = Decimal('15.00')
            fee_amount = service_amount * (fee_percentage / 100)
        else:
            if applicable_fee.fee_type_method == 'percentage':
                fee_percentage = Decimal(applicable_fee.fee_percentage or 15)
                fee_amount = service_amount * (fee_percentage / 100)
            else:  # fixed
                fee_amount = Decimal(applicable_fee.fee_fixed_amount or 0)
                fee_percentage = (fee_amount / service_amount * 100) if service_amount > 0 else Decimal('0')
            
            # Apply min/max constraints
            if applicable_fee.min_fee and fee_amount < Decimal(applicable_fee.min_fee):
                fee_amount = Decimal(applicable_fee.min_fee)
            if applicable_fee.max_fee and fee_amount > Decimal(applicable_fee.max_fee):
                fee_amount = Decimal(applicable_fee.max_fee)
        
        return {
            'platform_fee': fee_amount,
            'provider_deduction': fee_amount,  # Provider receives: service_amount - fee_amount
            'fee_percentage': fee_percentage,
            'breakdown': {
                'service_amount': service_amount,
                'fee_amount': fee_amount,
                'provider_receives': service_amount - fee_amount,
                'fee_type': applicable_fee.fee_type if applicable_fee else 'default',
                'fee_id': str(applicable_fee.id) if applicable_fee else None
            }
        }
    
    @staticmethod
    def calculate_expert_fee(expert_profile, booking_amount: Decimal) -> Decimal:
        """
        Calculate expert fee based on their configuration
        """
        fee_type = expert_profile.booking_fee_type
        
        if fee_type == 'percentage':
            percentage = Decimal(expert_profile.booking_fee_percentage or 10) / 100
            fee = booking_amount * percentage
        elif fee_type == 'fixed':
            fee = Decimal(expert_profile.booking_fee_fixed or 0)
        elif fee_type == 'hourly':
            # For hourly, would need hours worked (not implemented here)
            fee = Decimal(expert_profile.booking_fee_hourly or 0)
        else:
            fee = Decimal('0.00')
        
        # Apply minimum fee if set
        if expert_profile.min_booking_fee:
            min_fee = Decimal(expert_profile.min_booking_fee)
            fee = max(fee, min_fee)
        
        return fee
    
    @staticmethod
    def get_price_breakdown(provider, service_id: Optional[str], date: date, travelers: int, category: str) -> Dict:
        """
        Get complete price breakdown for display to user
        
        Returns full breakdown including service price, platform fee, total
        """
        # Get service price
        service_price = PricingService.get_price(provider, service_id, date, travelers)
        
        # Calculate platform fee
        fee_breakdown = PricingService.calculate_platform_fees(provider, service_price, category)
        
        # Calculate deposit if applicable
        deposit = PricingService.calculate_deposit(service_price, provider) if provider.requires_deposit else None
        
        total_amount = service_price + fee_breakdown['platform_fee']
        
        return {
            'service_price': service_price,
            'platform_fee': fee_breakdown['platform_fee'],
            'total_amount': total_amount,
            'deposit_amount': deposit,
            'balance_amount': total_amount - deposit if deposit else None,
            'provider_receives': service_price - fee_breakdown['provider_deduction'],
            'breakdown': {
                'base_price': service_price,
                'travelers': travelers,
                'per_person': service_price / travelers if travelers > 1 else service_price,
                'fee_percentage': fee_breakdown['fee_percentage'],
                'requires_deposit': provider.requires_deposit,
                'deposit_percentage': provider.deposit_percentage if provider.requires_deposit else None
            }
        }
