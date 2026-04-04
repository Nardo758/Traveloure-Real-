from .views import track_api_usage
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)

def require_wallet_balance(api_name="API", cost_per_call=0.50):
    """
    Decorator to check wallet balance before API usage
    Usage: @require_wallet_balance("itinerary_generation", 0.50)
    """
    def decorator(view_func):
        def wrapper(self, request, *args, **kwargs):
            user = request.user
            
            # Track API usage and check balance
            success, message, remaining_credits, remaining_balance = track_api_usage(user, api_name, cost_per_call)
            
            if not success:
                return Response({
                    "error": message,
                    "remaining_credits": remaining_credits,
                    "remaining_balance": remaining_balance,
                    "required_credits": 1,
                    "api_name": api_name
                }, status=status.HTTP_402_PAYMENT_REQUIRED)
            
            # If successful, proceed with the original view
            response = view_func(self, request, *args, **kwargs)
            
            # Add wallet info to response
            if hasattr(response, 'data') and isinstance(response.data, dict):
                response.data['wallet_info'] = {
                    'api_used': api_name,
                    'credits_deducted': 1,
                    'remaining_credits': remaining_credits,
                    'remaining_balance': remaining_balance,
                    'cost_deducted': cost_per_call  # Keep for backward compatibility
                }
            
            return response
        
        return wrapper
    return decorator


def check_wallet_balance(user, required_amount=0.50):
    """
    Check if user has sufficient credits
    Returns: (has_credits, message, current_credits, current_balance)
    """
    from .models import Wallet
    
    try:
        wallet, created = Wallet.objects.get_or_create(user=user)
        
        # Debug logging
        logger.info(f"Checking wallet balance for user {user.email}: {wallet.get_credits()} credits, ${wallet.get_balance()} balance")
        
        if wallet.has_sufficient_credits():
            logger.info(f"User {user.email} has sufficient credits: {wallet.get_credits()}")
            return True, "Sufficient credits", wallet.get_credits(), float(wallet.get_balance())
        else:
            logger.info(f"User {user.email} has insufficient credits: {wallet.get_credits()}")
            return False, f"Insufficient credits. Required: 1 credit, Available: {wallet.get_credits()} credits", wallet.get_credits(), float(wallet.get_balance())
            
    except Exception as e:
        logger.error(f"Error checking wallet balance: {e}")
        return False, "Error checking wallet balance", 0, 0.0


def deduct_from_wallet(user, amount, description="API usage"):
    """
    Deduct amount from user's wallet
    Returns: (success, message, remaining_credits, remaining_balance)
    """
    return track_api_usage(user, description, amount) 


def check_anonymous_api_usage(ip_address, api_name):
    """
    Check if anonymous user (by IP) has already used this API
    Returns: (can_use, message)
    """
    from .models import AnonymousAPIUsage
    
    try:
        # Check if this IP has already used this API
        existing_usage = AnonymousAPIUsage.objects.filter(
            ip_address=ip_address,
            api_name=api_name
        ).first()
        
        if existing_usage:
            return False, f"This API has already been used from your IP address. Please login to continue using our services."
        
        return True, "API usage allowed for anonymous user"
        
    except Exception as e:
        logger.error(f"Error checking anonymous API usage: {e}")
        return False, "Error checking API usage"


def track_anonymous_api_usage(ip_address, api_name):
    """
    Track anonymous API usage by IP address
    Returns: (success, message)
    """
    from .models import AnonymousAPIUsage
    
    try:
        # Create usage record
        AnonymousAPIUsage.objects.create(
            ip_address=ip_address,
            api_name=api_name
        )
        return True, "Anonymous API usage tracked successfully"
        
    except Exception as e:
        logger.error(f"Error tracking anonymous API usage: {e}")
        return False, "Error tracking API usage"


def get_client_ip(request):
    """
    Get client IP address from request
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip 