from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, filters
from rest_framework.permissions import  IsAuthenticated, AllowAny, IsAdminUser
from rest_framework_simplejwt.tokens import RefreshToken
from .models import *
from .serializers import *
import uuid
from .utils import generate_tokens,CustomPagination,ServiceProviderFilter  
from django.shortcuts import get_object_or_404
from rest_framework.serializers import Serializer
from .mixins import LoggingMixin
from collections import defaultdict
from django.conf import settings
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
import logging
from django.utils import timezone
import requests
from django.http import JsonResponse
from datetime import datetime,timedelta
from rest_framework import status
from django.shortcuts import redirect
from django.core.files.base import ContentFile
from django.http import HttpResponseRedirect
from django.db.models import Q
from rest_framework import serializers
from django_filters.rest_framework import DjangoFilterBackend

logger = logging.getLogger('travelDNA')


class UserRegistrationAPIView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        user_details = {
            "id": user.id,
            "email": user.email,
            "username": user.username
        }

        return Response({
            "message": "User registered successfully. Please check your email for verification link.",
            "status": True,
            "User_Details": user_details
        }, status=201)


class EmailVerificationAPIView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    lookup_field = 'token'
    queryset = EmailVerificationToken.objects.all()
    def get_serializer_class(self):
            return Serializer
    
    def retrieve(self, request, token):
        try:
            email_verification_token = self.get_queryset().get(token=token)
            user = email_verification_token.user
            user.is_email_verified = True
            user.save()
            email_verification_token.delete()
            
            return Response({"message":"Email verified successfully. Your account is activated.Please Login Now","status":True}, status=200)
        except EmailVerificationToken.DoesNotExist:
            return Response({"message":"Invalid token or token expired","status":False}, status=400)

class ResendEmailVerificationAPIView(generics.CreateAPIView):
    serializer_class = ResendEmailVerificationSerializer
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data.get('email')
        if not email:
            return Response({"message": "Username not found in session.", "status": False}, status=400)
        try:
            user = User.objects.get(email=email)
            email_verification_token = EmailVerificationToken.objects.get(user=user)
            new_token = str(uuid.uuid4())
            email_verification_token.token = new_token
            email_verification_token.save()
            email_subject = 'Resend Email Verification'
            
            send_verification_mail(request=request, email = user.email,user=user,token=new_token,subject = email_subject, template ='emails/email_verification.html',reverse_name='verify_email')
            
            
            return Response({"message": "Verification email resent successfully.", "status": True}, status=200)
        except User.DoesNotExist:
            return Response({"message": "User not found.", "status": False}, status=400)
        except EmailVerificationToken.DoesNotExist:
            return Response({"message": "Email verification token not found.", "status": False}, status=400)

class UserLoginAPIView(generics.CreateAPIView):
    serializer_class = UserLoginSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Retrieve validated user
        user = serializer.validated_data['user']
        # Generate authentication tokens
        tokens = generate_tokens(user)

        # Determine user roles
        roles = []
        if user.is_superuser:
            roles.append('admin')
        if user.is_local_expert:
            roles.append('local_expert')
        if user.is_service_provider:
            roles.append('service_provider')
        if not roles:
            roles.append('user')

        # Save login history
        # ip, location, browser = get_log_details(request=self.request)
        # LoginHistory.objects.create(user=user, ip=ip, location=location, browser=browser)

        return Response({
            "message": "Login Successfull",
            "status": True,
            "tokens": tokens,
            "email": user.email,
            "roles": roles,
            "user_info": {
                "id": str(user.id),
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "city": user.city,
                "country": user.country,
                "image": user.image.url if user.image else None,
                "cover_image": user.cover_image.url if user.cover_image else None,
                "is_local_expert": user.is_local_expert,
                "is_service_provider": user.is_service_provider,
                "is_email_verified": user.is_email_verified
            }
        }, status=200)
        
class LogoutAPIView(LoggingMixin, generics.ListAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            refresh_token = request.data.get("refresh_token")
            if not refresh_token:
                return Response({"error": "Refresh token is required"}, status=400)

            token = RefreshToken(refresh_token)
            user = User.objects.get(id=self.request.auth.get('user_id'))
            user.is_active=False
            user.save()
            token.blacklist()

            return Response({"message": "Logout successful"}, status=200)

        except Exception as e:
            return Response({"error": str(e)}, status=400)

class TokenRefreshAPIView(LoggingMixin, generics.CreateAPIView):
    permission_classes = [AllowAny]

    def create(self, request):
        refresh_token = request.data.get("refresh")

        if not refresh_token:
            return Response({"message": "Refresh token is required."}, status=400)

        try:
            decoded_token = RefreshToken(refresh_token)
            user_id = decoded_token.get("user_id")
            user = User.objects.get(id=user_id)

            if not user.is_active:
                return Response({"message": "User account is not active."}, status=403)

            tokens = generate_tokens(user)
            return Response(tokens, status=200)
        except Exception as e:
            return Response({"message": str(e)}, status=400)
        
class ForgotPasswordAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid():
            username_or_email = serializer.validated_data['email_or_username']
            if User.objects.filter(email=username_or_email).exists():
                user = User.objects.get(email=username_or_email)
            elif User.objects.filter(username=username_or_email).exists():
                user = User.objects.get(username=username_or_email)
            else:
                return Response("User not found.", status=404)
            uid = urlsafe_base64_encode(force_bytes(user.id))
            token = default_token_generator.make_token(user)
            reverse_name = 'forget_reset'
            subject = 'Forgot Password'
            send_verification_mail(request=request, email = user.email,user=user,token=token,subject = subject, template ='emails/forget_password.html',reverse_name = reverse_name,uid=uid)
            return Response({"message":"Password reset link sent to your email.","status":True}, status=200)
        return Response(serializer.errors, status=400)
    
class ForgetResetPasswordAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, uidb64, token):
        try:
            serializer = ForgetResetPasswordSerializer(data=request.data)
            if serializer.is_valid():
                uid = force_str(urlsafe_base64_decode(uidb64))
                user = User.objects.get(pk=uid)

                if user is not None and default_token_generator.check_token(user, token):
                    new_password = serializer.validated_data['new_password']
                    confirm_new_password = serializer.validated_data['confirm_new_password']
                    if new_password == confirm_new_password:
                        user.set_password(new_password)
                        user.save()
                        return Response({"message":"Password reset successfully.","status":True}, status=200)
                    else:
                        return Response({"message":"Passwords do not match.","status":False}, status=400)
                else:
                    return Response({"message":"Invalid token.","status":False}, status=400)
            else:
                logger.error(f"Something Went wrong while Resetting the password for{user.username}")
                return Response(serializer.errors, status=400)
        except Exception as e:
            logger.error(f"Unexpected Error Occured while Resetting the password")
            return Response({'error':f"Unexpected Error Occured : {str(e)}", 'status':False}, status=500)
        
class ChangePasswordAPIView(LoggingMixin, generics.UpdateAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"message": "Password changed successfully", "status": True}, status=200)

class UserProfile(LoggingMixin,generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        queryset = User.objects.filter(id=self.request.auth.get('user_id'))
        return queryset
    
class UserProfileUpdateView(LoggingMixin,generics.UpdateAPIView):
    serializer_class = UpdateProfileSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['patch']

    def get_object(self):
        return get_object_or_404(User, id=self.request.user.id)
    def update(self, request, *args, **kwargs):
        # Verify the URL id matches the authenticated user
        url_id = self.kwargs.get('id')
        if url_id and str(request.user.id) != url_id:
            return Response({"error": "You have no permission to update another user's profile", "status": False}, status=403)
        profile_instance = self.get_object()
        old_cover_image = profile_instance.cover_image
        old_image = profile_instance.image
        serializer = self.get_serializer(profile_instance, data=request.data, partial=True)
        if serializer.is_valid():
            profile_instance.updated_at = timezone.now()
            if 'cover_image' in request.data and old_cover_image:
                old_cover_image.delete(save=False)

            # If new profile image is provided, delete the old one
            if 'image' in request.data and old_image:
                old_image.delete(save=False)
            serializer.save()
            return Response({'message': "Profile Updated Successfully", "status": True}, status=200)
        
        return Response({"error": serializer.errors}, status=400)


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
    
class SearchLocalExertAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        search = request.query_params.get('search', '')
        
        # Base query for local experts
        experts = User.objects.using('default').filter(is_local_expert=True)
        
        # Only apply search filter if search parameter is provided and not empty
        if search and search.strip():
            experts = experts.filter(
                Q(city__icontains=search) | Q(country__icontains=search)
            )

        serializer = UserWithReviewsSerializer(experts, many=True)
        return Response({
            "message": "Experts fetched Successfully",
            "data": serializer.data,
            "status": True
        }, status=200)
    
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
    print("=== generate_jwt_token called ===")
    print("backend:", backend)
    print("user:", user)
    print("response:", response)
    print("request in kwargs:", 'request' in kwargs)
    if backend.name == 'facebook':
        # If user does not exist, create it using Facebook data
        if user is None:
            print("[DEBUG] User not found, creating new user from Facebook data...")
            email = response.get('email')
            name = response.get('name')
            picture = response.get('picture') if 'picture' in response else None
            facebook_id = response.get('id')
            if not email:
                print('[ERROR] No email in Facebook response, not creating user.')
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
            print(f"[DEBUG] New user created: {user.email}, is_active: {user.is_active}")
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
                        print("[DEBUG] Profile picture saved.")
                    else:
                        print("[DEBUG] No picture URL found in Facebook response.")
                except Exception as e:
                    print(f"[ERROR] Error downloading Facebook profile picture: {e}")
            else:
                print("[DEBUG] No picture data in Facebook response.")
            # Store profile_pic_url in session
            kwargs['request'].session['profile_pic_url'] = profile_pic_url
        else:
            print(f"[DEBUG] Existing user found: {user.email}, is_active: {user.is_active}")
            if not user.is_active:
                print(f"[DEBUG] User {user.email} is inactive, activating now.")
                user.is_active = True
                user.save()
            try:
                refresh = RefreshToken.for_user(user)
                print("Generated tokens:", str(refresh.access_token), str(refresh))
                # Store tokens in session to be retrieved by the final view
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
                        print(f"[DEBUG] Found Facebook profile picture URL: {profile_pic_url}")
                        # Download and save profile picture for existing user if not already saved
                        if not hasattr(user, 'image') or not user.image:
                            try:
                                response_img = requests.get(picture_url)
                                if response_img.status_code == 200:
                                    avatar_content = ContentFile(response_img.content)
                                    user.image.save(f"{user.id}_avatar.jpg", avatar_content)
                                    user.save()
                                    print(f"[DEBUG] Profile picture saved for existing user: {user.email}")
                                else:
                                    print(f"[ERROR] Failed to download image, status: {response_img.status_code}")
                            except Exception as e:
                                print(f"[ERROR] Error downloading Facebook profile picture for existing user: {e}")
                if hasattr(user, 'image') and user.image:
                    fb_info["profile_pic_url"] = user.image.url
                    print(f"[DEBUG] Using stored profile picture: {user.image.url}")
                elif profile_pic_url:
                    fb_info["profile_pic_url"] = profile_pic_url
                    print(f"[DEBUG] Using Facebook profile picture: {profile_pic_url}")
                else:
                    print("[DEBUG] No profile picture available.")
                kwargs['request'].session['fb_info'] = fb_info
                print("Tokens and Facebook info stored in session.")
            except Exception as e:
                print(f"[ERROR] Exception during token generation or session storage: {e}")
    print("[generate_jwt_token] Pipeline step completed, returning None.")
    return None

class FacebookLoginSuccessView(APIView):
    """
    This view is the final redirect target after a successful Facebook login.
    It retrieves the JWT tokens from the session and returns them to the client.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        print("=== FacebookLoginSuccessView GET called ===")
        access_token = request.session.get('access_token')
        refresh_token = request.session.get('refresh_token')
        print("Session access_token:", access_token)
        print("Session refresh_token:", refresh_token)

        if not access_token or not refresh_token:
            print("Could not retrieve tokens from session.")
            return Response(
                {"error": "Could not retrieve tokens. Please try logging in again."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Clear tokens from session after retrieving them
        del request.session['access_token']
        del request.session['refresh_token']

        print("Redirecting to frontend with tokens.")
        frontend_url = f"https://traveloure.com/facebook-login-success/?access={access_token}&refresh={refresh_token}"
        return redirect(frontend_url)

class FacebookTokenAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        print("=== FacebookTokenAPIView GET called ===")
        access_token = request.session.get('access_token')
        refresh_token = request.session.get('refresh_token')
        fb_info = request.session.get('fb_info')
        print("Session access_token:", access_token)
        print("Session refresh_token:", refresh_token)
        print("Session fb_info:", fb_info)

        if not access_token or not refresh_token or not fb_info:
            print("Could not retrieve tokens or Facebook info from session.")
            return Response({"error": "No token or Facebook info found in session."}, status=400)

        # Optionally clear session
        del request.session['access_token']
        del request.session['refresh_token']
        del request.session['fb_info']
        if 'profile_pic_url' in request.session:
            del request.session['profile_pic_url']

        print("Returning tokens and Facebook info to client.")
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


class LocalExpertCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        # Prevent duplicate form submission for the same user
        if LocalExpertForm.objects.filter(user=user).exists():
            return Response(
                {'message': 'You have already submitted the Local Expert form. You cannot submit it again.', 'status': False},
                status=400
            )
        
        serializer = LocalExpertCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Save the local expert form (serializer will handle user updates)
            serializer.save()
            
            return Response({
                'message': 'Your Request for Becoming a Local Expert is submitted Successfully. You will be notified once you are verified. Stay Still',
                'status': True
            }, status=200)
        
        return Response({'message': serializer.errors, 'status': False}, status=400)
    
class LocalExpertAdminListAPIView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    pagination_class = CustomPagination
    queryset = LocalExpertForm.objects.all().order_by('-created_at')
    serializer_class = LocalExpertFormListSerializer

    def list(self, request, *args, **kwargs):
        # Paginated all experts
        response = super().list(request, *args, **kwargs)
        # Non-paginated accepted, rejected, and pending experts
        accepted_qs = LocalExpertForm.objects.filter(status='approved').order_by('-created_at')
        rejected_qs = LocalExpertForm.objects.filter(status='rejected').order_by('-created_at')
        pending_qs = LocalExpertForm.objects.filter(status='pending').order_by('-created_at')
        accepted_data = self.get_serializer(accepted_qs, many=True).data
        rejected_data = self.get_serializer(rejected_qs, many=True).data
        pending_data = self.get_serializer(pending_qs, many=True).data
        response.data = {
            'all': response.data,
            'accepted': accepted_data,
            'rejected': rejected_data,
            'pending': pending_data
        }
        return response

class LocalExpertAdminDetailUpdateAPIView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    queryset = LocalExpertForm.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return LocalExpertRegisterationStatusSerializer
        return LocalExpertFormListSerializer

    def retrieve(self, request,*args, **kwargs):
        queryset = self.get_object()
        serializers = self.get_serializer(queryset, context={'request': request})
        return Response({'message':"Fetched Successfully","status":True,"data":serializers.data},status=200)
    
    def update(self, request,*args,**kwargs):
        queryset = self.get_object()
        serializer = self.get_serializer(queryset, partial=True, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({'message':"Status Updated Successfully",'status':True},status=200)
        return Response({'message':f"Error Occured: {serializer.errors}","status":False},status=400)
    

class CreateServiceProviderFormView(generics.CreateAPIView):
    serializer_class = ServiceProviderCreateFormSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user
        try:
            form = ServiceProviderForm.objects.get(user=user)
            if form.status == 'pending':
                return Response(
                    {"detail": "Your application is already under review."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif form.status == 'approved':
                return Response(
                    {"detail": "You have already been approved as a Service Provider."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif form.status == 'rejected':
                # Update existing form with new data and reset status
                serializer = self.get_serializer(form, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save(status='pending')
                return Response(
                    {"detail": "Your rejected application has been updated and resubmitted."},
                    status=status.HTTP_200_OK
                )

        except ServiceProviderForm.DoesNotExist:
            # Create new form
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(user=user, status='pending')
            return Response(
                {"detail": "Application submitted successfully."},
                status=status.HTTP_201_CREATED
            )

class RetrieveServiceProviderStatus(generics.ListAPIView):
    serializer_class = ServiceProviderFormSerializer
    permission_classes = [IsAuthenticated]
    queryset = ServiceProviderForm.objects.all()
    

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(user=request.user).first()
        if not queryset:
            return Response({'message':"Not Found","status":False},status=404)
        serializer = self.get_serializer(instance = queryset)
        return Response({'message':'Fetched Successfully','data':serializer.data,'status':True},status=200)
    
class ManageServiceProviderFormListView(generics.ListAPIView):
    serializer_class = ServiceProviderFormSerializer
    permission_classes = [IsAdminUser]
    queryset = ServiceProviderForm.objects.all().order_by('-created_at')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status']
    search_fields = ['business_name', 'email', 'mobile']

    def list(self, request, *args, **kwargs):
        # Paginated all service providers
        response = super().list(request, *args, **kwargs)
        # Non-paginated accepted, rejected, and pending service providers
        accepted_qs = ServiceProviderForm.objects.filter(status='approved').order_by('-created_at')
        rejected_qs = ServiceProviderForm.objects.filter(status='rejected').order_by('-created_at')
        pending_qs = ServiceProviderForm.objects.filter(status='pending').order_by('-created_at')
        accepted_data = self.get_serializer(accepted_qs, many=True).data
        rejected_data = self.get_serializer(rejected_qs, many=True).data
        pending_data = self.get_serializer(pending_qs, many=True).data
        response.data = {
            'all': response.data,
            'accepted': accepted_data,
            'rejected': rejected_data,
            'pending': pending_data
        }
        return response

class ManageServiceProviderFormDetailUpdateView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    queryset = ServiceProviderForm.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return AdminServiceProviderUpdateStatusSerializer
        return ServiceProviderFormSerializer

    def retrieve(self, request,*args, **kwargs):
        queryset = self.get_object()
        serializers = self.get_serializer(queryset, context={'request': request})
        return Response({'message':"Fetched Successfully","status":True,"data":serializers.data},status=200)

    def update(self, request, *args, **kwargs):
        queryset = self.get_object()
        serializer = self.get_serializer(queryset, partial=True, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({'message':"Status Updated Successfully",'status':True},status=200)
        return Response({'message':f"Error Occured: {serializer.errors}","status":False},status=400)

class LocalExpertMyApplicationAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            form = LocalExpertForm.objects.get(user=request.user)
            serializer = LocalExpertFormListSerializer(form, context={'request': request})
            return Response({'message': 'Fetched Successfully', 'status': True, 'data': serializer.data}, status=200)
        except LocalExpertForm.DoesNotExist:
            return Response({'message': 'No application found for this user.', 'status': False}, status=404)

class ServiceProviderMyApplicationAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            form = ServiceProviderForm.objects.get(user=request.user)
            serializer = ServiceProviderFormSerializer(form, context={'request': request})
            return Response({'message': 'Fetched Successfully', 'status': True, 'data': serializer.data}, status=200)
        except ServiceProviderForm.DoesNotExist:
            return Response({'message': 'No application found for this user.', 'status': False}, status=404)
        
class ServiceProviderDashboardAPIView(generics.ListAPIView):
    permission_classes = [IsAdminUser]

    def list(self, request, *args, **kwargs):
        search_query = request.query_params.get('search', '').strip().lower()
        thirty_days_ago = timezone.now() - timedelta(days=30)

        all_forms = ServiceProviderForm.objects.select_related('user').all()
        total_count = all_forms.count()
        total_pending = all_forms.filter(status='pending').count()
        total_active = all_forms.filter(user__is_active=True).count()
        total_new_last_30_days = all_forms.filter(created_at__gte=thirty_days_ago).count()

        if search_query:
            forms = all_forms.filter(
                Q(user__country__icontains=search_query) |
                Q(user__city__icontains=search_query)
            )
        else:
            forms = all_forms

        location_summary = defaultdict(lambda: {
            'total': 0,
            'total_accepted': 0,
            'total_pending': 0,
            'total_rejected': 0,
            'cities': defaultdict(lambda: {'accepted': 0, 'pending': 0, 'rejected': 0})
        })

        for form in forms:
            user = form.user
            country = (user.country or 'Unknown').strip()
            city = (user.city or 'Unknown').strip()
            status = form.status.lower()

            status_key = 'accepted' if status == 'approved' else 'rejected' if status == 'rejected' else 'pending'

            location_summary[country]['total'] += 1
            location_summary[country][f'total_{status_key}'] += 1
            location_summary[country]['cities'][city][status_key] += 1

        structured_summary = []
        for country, data in location_summary.items():
            country_data = {
                'country': country,
                'total': data['total'],
                'total_accepted': data['total_accepted'],
                'total_pending': data['total_pending'],
                'total_rejected': data['total_rejected'],
                'cities': []
            }

            for city, stats in data['cities'].items():
                country_data['cities'].append({
                    'city': city,
                    'total': stats['accepted'] + stats['pending'] + stats['rejected'],
                    'accepted': stats['accepted'],
                    'pending': stats['pending'],
                    'rejected': stats['rejected'],
                })

            structured_summary.append(country_data)

        return Response({
            "count": total_count,
            "total_pending": total_pending,
            "total_active": total_active,
            "total_new_last_30_days": total_new_last_30_days,
            "summary": structured_summary
        })
    
class LocalExpertDashboardAPIView(generics.ListAPIView):
    permission_classes = [IsAdminUser]

    def list(self, request, *args, **kwargs):
        search_query = request.query_params.get('search', '').strip().lower()
        thirty_days_ago = timezone.now() - timedelta(days=30)

        # === Unfiltered forms for totals ===
        all_forms = LocalExpertForm.objects.select_related('user').all()

        total_count = all_forms.count()
        total_pending = all_forms.filter(status='pending').count()
        total_active = all_forms.filter(user__is_active=True).count()
        total_new_last_30_days = all_forms.filter(created_at__gte=thirty_days_ago).count()

        # === Filtered forms for summary only ===
        if search_query:
            forms = all_forms.filter(
                Q(user__country__icontains=search_query) |
                Q(user__city__icontains=search_query)
            )
        else:
            forms = all_forms

        # === Location-wise summary ===
        location_summary = defaultdict(lambda: {
            'total': 0,
            'total_accepted': 0,
            'total_pending': 0,
            'total_rejected': 0,
            'cities': defaultdict(lambda: {'accepted': 0, 'pending': 0, 'rejected': 0})
        })

        for form in forms:
            user = form.user
            if not user:
                continue

            country = (user.country or 'Unknown').strip()
            city = (user.city or 'Unknown').strip()
            status = form.status.lower()

            status_key = 'accepted' if status == 'approved' else 'rejected' if status == 'rejected' else 'pending'

            location_summary[country]['total'] += 1
            location_summary[country][f'total_{status_key}'] += 1
            location_summary[country]['cities'][city][status_key] += 1

        # === Convert to structured list format ===
        structured_summary = []
        for country, data in location_summary.items():
            country_data = {
                'country': country,
                'total': data['total'],
                'total_accepted': data['total_accepted'],
                'total_pending': data['total_pending'],
                'total_rejected': data['total_rejected'],
                'cities': []
            }

            for city, stats in data['cities'].items():
                country_data['cities'].append({
                    'city': city,
                    'total': stats['accepted'] + stats['pending'] + stats['rejected'],
                    'accepted': stats['accepted'],
                    'pending': stats['pending'],
                    'rejected': stats['rejected'],
                })

            structured_summary.append(country_data)

        return Response({
            "count": total_count,
            "total_pending": total_pending,
            "total_active": total_active,
            "total_new_last_30_days": total_new_last_30_days,
            "summary": structured_summary
        })
    

class ServiceProviderByCountryAPIView(generics.ListAPIView):
    serializer_class = ManageServiceProviderLISTSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        country_name = self.kwargs.get('country_name', '').strip()
        search = self.request.query_params.get('search', '').strip()
        status = self.request.query_params.get('status', '').strip().lower()

        # Start with service providers filtered by country
        users = User.objects.filter(
    Q(country__icontains=country_name) | Q(city__icontains=country_name),
    is_service_provider=True
)

        # Apply search on basic user fields
        if search:
            users = users.filter(
                Q(email__icontains=search) |
                Q(username__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        # Filter by status from ServiceProviderForm
        if status:
            user_ids = ServiceProviderForm.objects.filter(status__iexact=status).values_list('user_id', flat=True)
            users = users.filter(id__in=user_ids)

        return users.order_by('-created_at')


class LocalExpertByCountryAPIView(generics.ListAPIView):
    serializer_class = ManageLocalExpertLISTSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        country_name = self.kwargs.get('country_name', '').strip()
        search = self.request.query_params.get('search', '').strip()
        status = self.request.query_params.get('status', '').strip().lower()

        # Start with service providers filtered by country
        users = User.objects.filter(Q(country__icontains=country_name) | Q(city__icontains=country_name),is_local_expert=True)

        # Apply search on basic user fields
        if search:
            users = users.filter(
                Q(email__icontains=search) |
                Q(username__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        # Filter by status from ServiceProviderForm
        if status:
            user_ids = LocalExpertForm.objects.filter(status__iexact=status).values_list('user_id', flat=True)
            users = users.filter(id__in=user_ids)

        return users.order_by('-created_at')