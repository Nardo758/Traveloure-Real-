from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, filters
from rest_framework.permissions import  IsAuthenticated, AllowAny, IsAdminUser
from rest_framework_simplejwt.tokens import RefreshToken
from .models import *
from .serializers import *
from .utils import CustomPagination
from collections import defaultdict
from django.conf import settings
import logging
from django.utils import timezone
import requests
from django.http import JsonResponse
from datetime import datetime,timedelta
from rest_framework import status
from django.shortcuts import redirect
from django.core.files.base import ContentFile
from django.http import HttpResponseRedirect
from django.db.models import Q, Avg
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from serviceproviderapp.models import AllService
from serviceproviderapp.serializers import AllServiceSerializer
from subscription.models import UserAndExpertContract
from ai_itinerary.models import ReviewRating
from subscription.serializers import UserAndExpertContractSerializer
from ai_itinerary.serializers import ReviewRatingSerializer, UserSerializer

logger = logging.getLogger('travelDNA')

API_KEY = settings.WEATHER_API_KEY2
FORECAST_URL = settings.FORECAST_URL

def get_future_weather(request):
    city = request.GET.get("city")
    date = request.GET.get("date")  # Format: YYYY-MM-DD

    if not city or not date:
        return JsonResponse({"error": "Please provide both city and date"}, status=400)

    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
        today = datetime.now().date()

        if target_date < today:
            return JsonResponse({"error": "Only future dates are allowed"}, status=400)

    except ValueError:
        return JsonResponse({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

    # Fetch 5-day forecast data
    url = f"{FORECAST_URL}?q={city}&appid={API_KEY}&units=metric"
    response = requests.get(url)
    data = response.json()

    if response.status_code == 200:
        forecast_data = []

        for forecast in data["list"]:
            forecast_time = datetime.utcfromtimestamp(forecast["dt"]).date()  # Convert timestamp to date
            
            if forecast_time == target_date:  # Compare dates properly
                forecast_data.append({
                    "date": forecast_time.strftime("%Y-%m-%d"),
                    "temperature": forecast["main"]["temp"],
                    "description": forecast["weather"][0]["description"],
                    "humidity": forecast["main"]["humidity"],
                    "wind_speed": forecast["wind"]["speed"]
                })

        if forecast_data:
            return JsonResponse({"city": city, "forecast": forecast_data})
        else:
            return JsonResponse({"error": "No forecast data available for this date"}, status=404)
    else:
        return JsonResponse({"error": "Weather data not found"}, status=404)
    
class TravelPreferenceAPIView(generics.RetrieveUpdateAPIView):
    queryset = User.objects.all()
    serializer_class = TravelPreferenceSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        user_id = self.kwargs.get('user_id')
        if not user_id:
            raise serializers.ValidationError("User Id not Found")
        user = User.objects.filter(id=user_id).first()
        if not user:
            raise serializers.ValidationError("User not Found")
        return user

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user)
        return Response({
            "message": "Fetched Successfully",
            "status": True,
            "data": serializer.data
        }, status=200)

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            for attr, value in serializer.validated_data.items():
                setattr(user, attr, value)
            user.save()
            return Response({
                "message": "Updated Successfully",
                "status": True,
                "data": serializer.data
            }, status=200)
        return Response({
            "message": "Validation Error",
            "status": False,
            "errors": serializer.errors
        }, status=400)

def generate_jwt_token(backend, user, response, *args, **kwargs):

    if backend.name == 'facebook':
        # If user does not exist, create it using Facebook data
        if user is None:
            email = response.get('email')
            name = response.get('name')
            picture = response.get('picture') if 'picture' in response else None
            facebook_id = response.get('id')
            if not email:
                return None
            username = email.split('@')[0]
            first_name = name.split(' ')[0] if name else ''
            last_name = ' '.join(name.split(' ')[1:]) if name and len(name.split(' ')) > 1 else ''
            user = User.objects.create(
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                is_email_verified=True,
                is_active=True
            )
            # Save profile picture if available
            profile_pic_url = None
            if picture:
                try:
                    # Facebook Graph API may return picture as dict
                    picture_url = picture.get('data', {}).get('url') if isinstance(picture, dict) else picture
                    if picture_url:
                        profile_pic_url = picture_url
                        response_img = requests.get(picture_url)
                        if response_img.status_code == 200:
                            avatar_content = ContentFile(response_img.content)
                            user.image.save(f"{user.id}_avatar.jpg", avatar_content)
                    else:
                        logger.info("[DEBUG] No picture URL found in Facebook response.")
                except Exception as e:
                    logger.info(f"[ERROR] Error downloading Facebook profile picture: {e}")
            else:
                logger.info("[DEBUG] No picture data in Facebook response.")
            # Store profile_pic_url in session
            kwargs['request'].session['profile_pic_url'] = profile_pic_url
        else:
            logger.info(f"[DEBUG] Existing user found: {user.email}, is_active: {user.is_active}")
            if not user.is_active:
                user.is_active = True
                user.save()
            try:
                refresh = RefreshToken.for_user(user)
                kwargs['request'].session['access_token'] = str(refresh.access_token)
                kwargs['request'].session['refresh_token'] = str(refresh)
                # Store Facebook info in session
                fb_info = {
                    "id": response.get("id"),
                    "name": response.get("name"),
                    "email": response.get("email"),
                }
                # Add profile picture URL if available
                picture = response.get('picture')
                profile_pic_url = None
                if picture:
                    picture_url = picture.get('data', {}).get('url') if isinstance(picture, dict) else picture
                    if picture_url:
                        profile_pic_url = picture_url
                        # Download and save profile picture for existing user if not already saved
                        if not hasattr(user, 'image') or not user.image:
                            try:
                                response_img = requests.get(picture_url)
                                if response_img.status_code == 200:
                                    avatar_content = ContentFile(response_img.content)
                                    user.image.save(f"{user.id}_avatar.jpg", avatar_content)
                                    user.save()
                                else:
                                    logger.info(f"[ERROR] Failed to download image, status: {response_img.status_code}")
                            except Exception as e:
                                logger.info(f"[ERROR] Error downloading Facebook profile picture for existing user: {e}")
                if hasattr(user, 'image') and user.image:
                    fb_info["profile_pic_url"] = user.image.url
                elif profile_pic_url:
                    fb_info["profile_pic_url"] = profile_pic_url
                else:
                    logger.info("[DEBUG] No profile picture available.")
                kwargs['request'].session['fb_info'] = fb_info
            except Exception as e:
                logger.info(f"[ERROR] Exception during token generation or session storage: {e}")
    logger.info("[generate_jwt_token] Pipeline step completed, returning None.")
    return None

class FacebookLoginSuccessView(APIView):
    """
    This view is the final redirect target after a successful Facebook login.
    It retrieves the JWT tokens from the session and returns them to the client.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        access_token = request.session.get('access_token')
        refresh_token = request.session.get('refresh_token')

        if not access_token or not refresh_token:
            return Response(
                {"error": "Could not retrieve tokens. Please try logging in again."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Clear tokens from session after retrieving them
        del request.session['access_token']
        del request.session['refresh_token']

        frontend_url = f"{settings.FRONTEND_URL}/facebook-login-success/?access={access_token}&refresh={refresh_token}"
        return redirect(frontend_url)

class FacebookTokenAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        access_token = request.session.get('access_token')
        refresh_token = request.session.get('refresh_token')
        fb_info = request.session.get('fb_info')

        if not access_token or not refresh_token or not fb_info:
            return Response({"error": "No token or Facebook info found in session."}, status=400)

        # Optionally clear session
        del request.session['access_token']
        del request.session['refresh_token']
        del request.session['fb_info']
        if 'profile_pic_url' in request.session:
            del request.session['profile_pic_url']

        return Response({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "facebook": fb_info
        })

def associate_by_email(backend, details, user=None, *args, **kwargs):
    if user:
        return None  # Already associated
    email = details.get('email')
    if not email:
        return None
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if User.objects.filter(email=email).exists():
        # Robust redirect to frontend with error if trying to sign up with existing email
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        error_url = f"{frontend_url}/login?error=email_exists&message=Email+already+registered+please+login+or+reset+password"
        return HttpResponseRedirect(error_url)
    return None