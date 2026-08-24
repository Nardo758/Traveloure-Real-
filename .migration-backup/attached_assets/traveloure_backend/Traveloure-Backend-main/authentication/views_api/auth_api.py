from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from rest_framework.permissions import  IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from authentication.models import *
from authentication.serializers import *
import uuid
from authentication.utils import generate_tokens
from django.shortcuts import get_object_or_404
from rest_framework.serializers import Serializer
from authentication.mixins import LoggingMixin
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
import logging
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken


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
        
        # Generate tokens manually to get access to expiry
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token
        
        # Determine user roles - always include 'user' as base role
        roles = []  # All users get the 'user' role
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

        # Convert timestamp to ISO format
        from datetime import datetime
        expires_datetime = datetime.fromtimestamp(access_token['exp'])
        expires_iso = expires_datetime.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        # Create the exact response structure you want
        response_data = {
            "user": {
                "id": str(user.id),
                "name": f"{user.first_name} {user.last_name}".strip(),
                "email": user.email,
                "last_name": user.last_name,
                "roles": roles,
                "toggle_role": user.toggle_role
            },
            "expires": expires_iso,
            "accessToken": str(access_token),
            "refreshToken": str(refresh),
            "backendData": {
                "access": str(access_token),
                "refresh": str(refresh),
                "accessToken": str(access_token),  # Added at backendData level too
                "refreshToken": str(refresh),      # Added at backendData level too
                "user": {
                    "email": user.email,
                    "name": f"{user.first_name} {user.last_name}".strip(),
                    "image": user.image.url if user.image else None,
                    "is_local_expert": user.is_local_expert,
                    "id": str(user.id),
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "toggle_role": user.toggle_role
                }
            },
            "expiresAt": None
        }

        return Response(response_data, status=200)
        
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
    permission_classes = [IsAuthenticated]

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
        profile_instance = self.get_object()
        if str(profile_instance.id) != self.request.auth.get('user_id'):
            return Response({"error": "You have no permission to update another user's profile", "status": False}, status=400)
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
    

class RoleToggleView(generics.UpdateAPIView):
    serializer_class = RoleToggleSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return get_object_or_404(User, id=self.request.user.id)

    def update(self, request, *args, **kwargs):
        user_instance = self.get_object()
        if str(user_instance.id) != self.kwargs.get("id"):
            return Response({"error": "You have no permission to update another user's role", "status": False}, status=400)
        
        serializer = self.get_serializer(user_instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': "Role Updated Successfully", "status": True}, status=200)

        return Response({"error": serializer.errors}, status=400)