"""
AffiliateService - Generate affiliate links for external bookings
Integrates with Booking.com, Viator, OpenTable, etc.
"""

from datetime import date
from typing import Dict, Optional
from urllib.parse import urlencode


class AffiliateService:
    """
    Generate affiliate tracking links for external booking platforms
    """
    
    # Affiliate partner configurations
    PARTNERS = {
        'booking_com': {
            'name': 'Booking.com',
            'base_url': 'https://www.booking.com/searchresults.html',
            'affiliate_id': 'YOUR_BOOKING_COM_AID',  # Set via environment variable
            'categories': ['accommodation']
        },
        'expedia': {
            'name': 'Expedia',
            'base_url': 'https://www.expedia.com/Hotel-Search',
            'affiliate_id': 'YOUR_EXPEDIA_AID',
            'categories': ['accommodation']
        },
        'viator': {
            'name': 'Viator',
            'base_url': 'https://www.viator.com/searchResults/all',
            'affiliate_id': 'YOUR_VIATOR_AID',
            'categories': ['activity']
        },
        'getyourguide': {
            'name': 'GetYourGuide',
            'base_url': 'https://www.getyourguide.com/s/',
            'affiliate_id': 'YOUR_GYG_AID',
            'categories': ['activity']
        },
        'opentable': {
            'name': 'OpenTable',
            'base_url': 'https://www.opentable.com/s/',
            'affiliate_id': 'YOUR_OPENTABLE_AID',
            'categories': ['meal']
        },
        'resy': {
            'name': 'Resy',
            'base_url': 'https://resy.com/cities/',
            'affiliate_id': 'YOUR_RESY_AID',
            'categories': ['meal']
        },
        'skyscanner': {
            'name': 'Skyscanner',
            'base_url': 'https://www.skyscanner.com/transport/flights/',
            'affiliate_id': 'YOUR_SKYSCANNER_AID',
            'categories': ['transport']
        }
    }
    
    @staticmethod
    def generate_link(item_type: str, destination: str, date: date, metadata: Dict = None) -> Optional[Dict]:
        """
        Generate affiliate link based on item type and destination
        
        Args:
            item_type: 'accommodation', 'activity', 'meal', 'transport'
            destination: City/location name
            date: Booking date
            metadata: Additional item data
        
        Returns:
            {
                'url': str,
                'partner': str,
                'partner_name': str
            }
        """
        metadata = metadata or {}
        
        if item_type == 'accommodation':
            return AffiliateService._generate_accommodation_link(destination, date, metadata)
        
        elif item_type == 'activity':
            return AffiliateService._generate_activity_link(destination, date, metadata)
        
        elif item_type == 'meal':
            return AffiliateService._generate_meal_link(destination, date, metadata)
        
        elif item_type == 'transport':
            return AffiliateService._generate_transport_link(destination, date, metadata)
        
        return None
    
    @staticmethod
    def _generate_accommodation_link(destination: str, check_in: date, metadata: Dict) -> Dict:
        """
        Generate Booking.com or Expedia link for accommodation
        """
        # Default to Booking.com
        partner = 'booking_com'
        config = AffiliateService.PARTNERS[partner]
        
        # Calculate check-out (assume 1 night if not specified)
        from datetime import timedelta
        check_out = check_in + timedelta(days=metadata.get('nights', 1))
        
        # Build query parameters
        params = {
            'ss': destination,  # Search string
            'checkin': check_in.strftime('%Y-%m-%d'),
            'checkout': check_out.strftime('%Y-%m-%d'),
            'group_adults': metadata.get('adults', 2),
            'group_children': metadata.get('children', 0),
            'aid': config['affiliate_id'],
            'label': 'traveloure',  # Your tracking label
        }
        
        url = f"{config['base_url']}?{urlencode(params)}"
        
        return {
            'url': url,
            'partner': partner,
            'partner_name': config['name']
        }
    
    @staticmethod
    def _generate_activity_link(destination: str, activity_date: date, metadata: Dict) -> Dict:
        """
        Generate Viator or GetYourGuide link for activities
        """
        # Default to Viator
        partner = 'viator'
        config = AffiliateService.PARTNERS[partner]
        
        # Build query parameters
        # Viator uses destination slug format
        destination_slug = destination.lower().replace(' ', '-').replace(',', '')
        
        params = {
            'pid': config['affiliate_id'],
            'mcid': 'traveloure',
            'startDate': activity_date.strftime('%Y-%m-%d'),
        }
        
        # Add category filter if specified
        if 'category' in metadata:
            params['categoryId'] = metadata['category']
        
        url = f"{config['base_url']}/{destination_slug}?{urlencode(params)}"
        
        return {
            'url': url,
            'partner': partner,
            'partner_name': config['name']
        }
    
    @staticmethod
    def _generate_meal_link(destination: str, meal_date: date, metadata: Dict) -> Dict:
        """
        Generate OpenTable or Resy link for restaurant reservations
        """
        # Default to OpenTable
        partner = 'opentable'
        config = AffiliateService.PARTNERS[partner]
        
        # OpenTable search format
        params = {
            'covers': metadata.get('travelers', 2),
            'dateTime': meal_date.strftime('%Y-%m-%d'),
            'metroId': metadata.get('metro_id', ''),  # Would need to map cities to metro IDs
            'ref': config['affiliate_id']
        }
        
        # Build search query
        query = destination
        if 'cuisine' in metadata:
            query = f"{metadata['cuisine']} {destination}"
        
        url = f"{config['base_url']}?q={query}&{urlencode(params)}"
        
        return {
            'url': url,
            'partner': partner,
            'partner_name': config['name']
        }
    
    @staticmethod
    def _generate_transport_link(destination: str, travel_date: date, metadata: Dict) -> Dict:
        """
        Generate Skyscanner or other transport link
        """
        # Default to Skyscanner for flights
        partner = 'skyscanner'
        config = AffiliateService.PARTNERS[partner]
        
        origin = metadata.get('origin', 'anywhere')
        destination_code = metadata.get('destination_code', destination)
        
        # Skyscanner URL format: /from/to/date
        date_str = travel_date.strftime('%y%m%d')  # YYMMDD format
        
        url = f"{config['base_url']}{origin}/{destination_code}/{date_str}?associateid={config['affiliate_id']}"
        
        return {
            'url': url,
            'partner': partner,
            'partner_name': config['name']
        }
    
    @staticmethod
    def track_click(link_id: str, user_id: str):
        """
        Track when user clicks an affiliate link
        Useful for analytics and commission tracking
        """
        from authentication.models import AffiliateClick
        from django.utils import timezone
        
        try:
            AffiliateClick.objects.create(
                link_id=link_id,
                user_id=user_id,
                clicked_at=timezone.now()
            )
        except:
            pass  # Don't fail booking flow if tracking fails
    
    @staticmethod
    def get_partner_for_category(category: str) -> Optional[str]:
        """
        Get recommended affiliate partner for a category
        """
        for partner_key, partner_config in AffiliateService.PARTNERS.items():
            if category in partner_config.get('categories', []):
                return partner_key
        return None
    
    @staticmethod
    def customize_link(base_url: str, custom_params: Dict) -> str:
        """
        Add custom tracking parameters to any URL
        Useful for custom affiliate programs
        """
        separator = '&' if '?' in base_url else '?'
        return f"{base_url}{separator}{urlencode(custom_params)}"


# Optional: Create AffiliateClick model for tracking
"""
Add to your models.py:

class AffiliateClick(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    link_id = models.CharField(max_length=255)
    user_id = models.UUIDField()
    trip_item_id = models.UUIDField(null=True, blank=True)
    partner = models.CharField(max_length=50)
    clicked_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'affiliate_clicks'
        indexes = [
            models.Index(fields=['user_id']),
            models.Index(fields=['partner']),
        ]
"""
