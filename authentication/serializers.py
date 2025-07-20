from .models import *
from rest_framework import serializers
import re
import uuid
from django.conf import settings
from django.db.models import Q
from .utils import send_verification_mail, generate_unique_username, generate_random_password
from django.utils.timezone import now
from subscription.models import Plan, Subscription
from ai_itinerary.models import ReviewRating, Trip, SelectedHotel, SelectedService
from ai_itinerary.serializers import TripWithServicesSerializer
from django.db import transaction
from django.db.models import Avg
from django.core.mail import send_mail
from datetime import date

class UserRegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, min_length=8, style={'input_type': 'password'}, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=8, style={'input_type': 'password'}, write_only=True)
    phone_number = serializers.CharField(required=False)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("This username is already in use.")
        if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*[._@$0-9])[A-Za-z0-9.@$]{8,}$', value):
            raise serializers.ValidationError("Username must contain at least one uppercase letter, one lowercase letter, and one of the following characters: '.', '_', '@', or '$'. or a number")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email address is already in use.")
        return value

    def validate_password(self, value):
        if not (8 <= len(value) <= 20):
            raise serializers.ValidationError("Password must be between 8 to 20 characters long.")
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter.")
        if not re.search(r'[a-z]', value):
            raise serializers.ValidationError("Password must contain at least one lowercase letter.")
        if not re.search(r'[._@#$^(){}\[\]%0-9]', value):
            raise serializers.ValidationError("Password must contain at least one of the following characters: '.', '_', '@', '#', '$', '^', '(', ')', '{', '}', '[', ']', '%', or a number.")
        return value

    def validate(self, data):
        if data.get('password') != data.get('confirm_password'):
            raise serializers.ValidationError("The passwords do not match.")
        return data
    @transaction.atomic
    def create(self, validated_data):
        """Handles user registration process."""
        token = str(uuid.uuid4())
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            is_active=False,
            phone_number=validated_data['phone_number']
        )

        # Fetch the Free plan
        free_plan = Plan.objects.filter(plan_name="Free").first()
        if not free_plan:
            raise serializers.ValidationError("The Free plan is not available.")

        # Create a Subscription entry (expire_date is None for Free plan)
        Subscription.objects.create(
            user=user,
            plan=free_plan,
            start_date=now(),
            expire_date=None,  # No expiration for Free plan
            is_active=True
        )

        EmailVerificationToken.objects.create(user=user, token=token)
        subject = "Verify Email to Activate Your Account"

        send_verification_mail(self=self, email = validated_data['email'],user=user,token=token,subject = subject, template ='emails/email_verification.html',reverse_name='verify_email')

        return user

class UserLoginSerializer(serializers.Serializer):
    email_or_username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email_or_username = data.get('email_or_username')
        password = data.get('password')

        if not email_or_username or not password:
            raise serializers.ValidationError("Email/Username and password are required.")

        user = self.authenticate_user(email_or_username, password)
        if not user:
            print('user Not Found')
            raise serializers.ValidationError("Invalid credentials.")
        if user.is_banned:
            raise serializers.ValidationError("Your account is Banned. Please contact support.")
        if user.is_email_verified == False:
            email_verification_token = EmailVerificationToken.objects.filter(user=user).first()
            if not email_verification_token:
                email_verification_token = EmailVerificationToken.objects.create(user=user)
            new_token = str(uuid.uuid4())
            email_verification_token.token = new_token
            email_verification_token.save()
            subject = "Verify Email to Activate Your Account"
            
            send_verification_mail(self=self, email = user.email,user=user,token=new_token,subject = subject, template ='emails/email_verification.html',reverse_name='verify_email')
            
            raise serializers.ValidationError('Can\'t Login. Please Verify your email first. Mail is send.')
        # if user.is_local_expert:
        #     le = LocalExpertForm.objects.filter(user=user).first()
        #     if le.status != "approved":
        #         if le.status == "pending":
        #             raise serializers.ValidationError('Your Request is under Process')
        #         if le.status == "rejected":
        #             raise serializers.ValidationError('You Have been Rejected for becoming the local Expert')
        user.is_active=True
        user.save()

        data['user'] = user
        return data

    def authenticate_user(self, email_or_username, password):
        user = User.objects.filter(Q(email=email_or_username) | Q(username = email_or_username)).first()
        if user and user.check_password(password):
            return user
        return None
    
class ResendEmailVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
class ForgotPasswordSerializer(serializers.Serializer):
    email_or_username = serializers.CharField(required=True)


class ForgetResetPasswordSerializer(serializers.Serializer):
    new_password =serializers.CharField(style={'input_type':'password'}, write_only=True)
    confirm_new_password =serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(style={'input_type': 'password'}, write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)


    def validate(self, data):
        if data['new_password'] != data['confirm_new_password']:
            raise serializers.ValidationError({"confirm_new_password": "New password and confirm password do not match."})
        return data

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user
    
class UserSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    trip_planned = serializers.SerializerMethodField()
    preferences = serializers.SerializerMethodField()
    current_trips = serializers.SerializerMethodField()
    upcoming_trips = serializers.SerializerMethodField()
    current_trip_count = serializers.SerializerMethodField()
    upcoming_trip_count = serializers.SerializerMethodField()
    trips_with_services = serializers.SerializerMethodField()

    class Meta:
        model = User
        # fields = "__all__"
        exclude = ('password','last_login','is_active','is_staff','is_superuser','deleted')
    def get_image(self, obj):
        request = self.context.get('request')
        if obj.image and hasattr(obj.image, 'url'):
            return request.build_absolute_uri(obj.image.url)
        return None

    def get_cover_image(self, obj):
        request = self.context.get('request')
        if obj.cover_image and hasattr(obj.cover_image, 'url'):
            return request.build_absolute_uri(obj.cover_image.url)
        return None
    
    def get_trip_planned(self, obj):
        """
        Get the total number of trips for the authenticated user.
        """
        user = self.context['request'].user  # Access the authenticated user
        return Trip.objects.filter(user=user).count()

    def get_preferences(self, obj):
        """
        Get the preferences of the user from the Trip model.
        This will be a list of preferences from all trips of the user.
        """
        user = self.context['request'].user  # Access the authenticated user
        trips = Trip.objects.filter(user=user)
        preferences = set()
        for trip in trips:
            if isinstance(trip.preferences, dict):
                preferences.update(trip.preferences.keys())
            elif isinstance(trip.preferences, list):
                preferences.update(trip.preferences)
        return list(preferences) 
    
    def get_current_trips(self, obj):
        user = self.context['request'].user
        today = date.today()
        current_trips = Trip.objects.filter(user=user, start_date__lte=today, end_date__gte=today)
        return [
            {
                'id': trip.id,
                'title': trip.title,
                'destination': trip.destination,
                'start_date': trip.start_date,
                'end_date': trip.end_date,
            }
            for trip in current_trips
        ]

    def get_upcoming_trips(self, obj):
        user = self.context['request'].user
        today = date.today()
        upcoming_trips = Trip.objects.filter(user=user, start_date__gt=today).order_by('start_date')
        return [
            {
                'id': trip.id,
                'title': trip.title,
                'destination': trip.destination,
                'start_date': trip.start_date,
                'end_date': trip.end_date,
            }
            for trip in upcoming_trips
        ]

    def get_current_trip_count(self, obj):
        user = self.context['request'].user
        today = date.today()
        return Trip.objects.filter(user=user, start_date__lte=today, end_date__gte=today).count()

    def get_upcoming_trip_count(self, obj):
        user = self.context['request'].user
        today = date.today()
        return Trip.objects.filter(user=user, start_date__gt=today).count()
    
    def get_trips_with_services(self, obj):
        user = self.context['request'].user
        trips = Trip.objects.filter(user=user)
        return TripWithServicesSerializer(trips, many=True).data


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name','last_name','cover_image','image','country','city','about_me','dob','phone_number']

class ReviewRatingSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.get_full_name', read_only=True)  # Optional for more info

    class Meta:
        model = ReviewRating
        fields = ['id', 'reviewer', 'reviewer_name', 'review', 'rating', 'created_at']


class UserWithReviewsSerializer(serializers.ModelSerializer):
    reviews = ReviewRatingSerializer(source='reviews_received', many=True, read_only=True)
    average_rating = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = ('password', 'last_login', 'is_active', 'is_staff', 'is_superuser', 'deleted')

    def get_average_rating(self, obj):
        avg_rating = obj.reviews_received.aggregate(avg=Avg('rating'))['avg']
        return round(avg_rating, 2) if avg_rating is not None else 0.0
    
class TravelPreferenceSerializer(serializers.Serializer):
    travel_style = serializers.ListField(child=serializers.CharField())
    preferred_months = serializers.ListField(child=serializers.CharField())
    meal_preference = serializers.CharField(allow_blank=True, allow_null=True, required=False)

class LocalExpertCreateSerializer(serializers.ModelSerializer):
    # first_name = serializers.CharField(required=True)
    # last_name = serializers.CharField(required=True)
    # email = serializers.EmailField(required=True)
    # phone = serializers.CharField(required=True)
    # country = serializers.CharField(required=True)
    # city = serializers.CharField(required=True)
    # dob = serializers.DateField(required=True)
    # about_me = serializers.CharField(required=True)
    # image = serializers.FileField(required=True)

    class Meta:
        model = LocalExpertForm
        exclude = ['user','status', 'created_at']

    def create(self, validated_data):

        # user_data = {
        #     'first_name': first_name,
        #     'last_name': last_name,
        #     'email': validated_data.pop('email'),
        #     'phone_number': validated_data.pop('phone'),
        #     'country': validated_data.pop('country'),
        #     'city': validated_data.pop('city'),
        #     'dob': validated_data.pop('dob'),
        #     'about_me': validated_data.pop('about_me'),
        #     'username': generate_unique_username(first_name, last_name),
        #     'image': validated_data.pop('image')
        # }
        # raw_password = generate_random_password(length=10)
        request = self.context.get('request')
        user = request.user

        return LocalExpertForm.objects.create(user=user,**validated_data)


class LocalExpertFormListSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    gov_id = serializers.SerializerMethodField()
    travel_licence = serializers.SerializerMethodField()

    class Meta:
        model = LocalExpertForm
        fields = "__all__"

    def get_gov_id(self, obj):
        request = self.context.get('request')
        if obj.gov_id and hasattr(obj.gov_id, 'url'):
            return request.build_absolute_uri(obj.gov_id.url)
        return None

    def get_travel_licence(self, obj):
        request = self.context.get('request')
        if obj.travel_licence and hasattr(obj.travel_licence, 'url'):
            return request.build_absolute_uri(obj.travel_licence.url)
        return None
    
class LocalExpertRegisterationStatusSerializer(serializers.ModelSerializer):
    rejection_message = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = LocalExpertForm
        fields = ['status', 'rejection_message']

    def validate_status(self, value):
        if value not in ['approved', 'rejected']:
            raise serializers.ValidationError("Status must be either 'approved' or 'rejected'")
        return value

    def update(self, instance, validated_data):
        status = validated_data.get('status')
        rejection_message = validated_data.get('rejection_message', '')

        instance.status = status
        instance.save()

        user = instance.user
        if not user:
            return instance

        if status == "approved":
            user.is_local_expert = True
            user.save()

            subject = "Local Expert Application Approved"
            message = f"""Hi {user.first_name},

Your request to become a Local Expert has been approved!

You can log in here: https://traveloure.com/ with the same credentials.

Make sure to change your password after your first login. This password is system-generated and we do not store it.

Best regards,
TravelDNA Team
"""
        else:
            subject = "Local Expert Application Rejected"
            message = f"""Hi {user.first_name},

Unfortunately, your request to become a Local Expert has been rejected.

**Reason:** {rejection_message}

You can review and apply again in the future.

Best regards,
TravelDNA Team
"""

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[user.email],
            fail_silently=False
        )

        return instance
    


class ServiceProviderCreateFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceProviderForm
        exclude = ['user', 'status', 'created_at']


class ServiceProviderFormSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    class Meta:
        model = ServiceProviderForm
        fields = '__all__'


class AdminServiceProviderUpdateStatusSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=[('approved', 'Approved'), ('rejected', 'Rejected')])
    rejection_message = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ServiceProviderForm
        fields = ['status', 'rejection_message']

    def update(self, instance, validated_data):
        status = validated_data.get('status')
        rejection_message = validated_data.get('rejection_message', '')

        instance.status = status
        instance.save()

        user = instance.user
        if not user:
            return instance

        if status == "approved":
            user.is_local_expert = True
            user.save()

            raw_password = generate_random_password(length=12)
            new_user_username = generate_unique_username(first_name=user.first_name, last_name=user.last_name)

            new_user = User.objects.create(
            username=new_user_username,
            email=instance.email,
            first_name = user.first_name,
            last_name = user.last_name,
            phone_number = instance.mobile,
            country = instance.country,
            city = user.city,
            about_me = instance.description,
            is_service_provider = True,
            is_email_verified = False
            )

            new_user.set_password(raw_password)
            new_user.save()
            subject = "Service Provider Application Approved"
            message = f"""Hi {user.first_name},

Your request to become a Service Provider has been approved!

You can log in here: https://traveloure.com/ with these credentials:
Email: {instance.email}
Password : {raw_password}

Make sure to change your password after your first login. This password is system-generated and we do not store it.

Best regards,
TravelDNA Team
"""
        else:
            subject = "Service Provider Application Rejected"
            message = f"""Hi {user.first_name},

Unfortunately, your request to become a Service Provider has been rejected.

**Reason:** {rejection_message}

You can review and apply again in the future.

Best regards,
TravelDNA Team
"""

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[instance.email],
            fail_silently=False
        )

        return instance