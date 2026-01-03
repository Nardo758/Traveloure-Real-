from .models import *
from rest_framework import serializers
import re
import uuid
from django.conf import settings
from django.db.models import Q
from .utils import send_verification_mail, generate_unique_username, generate_random_password
from django.utils.timezone import now
import stripe
from ai_itinerary.models import ReviewRating, Trip, GeneratedItinerary
from ai_itinerary.serializers import TripWithServicesSerializer, GeneratedItinerarySerializer
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
    credits = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        # fields = "__all__"
        exclude = ('password','last_login','is_active','is_staff','is_superuser','deleted')
    def get_role(self, obj):
        if obj.is_local_expert:
            return 'local_expert'
        elif obj.is_service_provider:
            return 'service_provider'
        else:
            return 'user'
        
    def get_credits(self, obj):
        """Get user's credit balance from wallet"""
        try:
            from subscription.models import Wallet
            wallet, created = Wallet.objects.get_or_create(user=obj)
            return wallet.credits
        except Exception:
            return 0
    
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
        result = []
        for trip in current_trips:
            itinerary = GeneratedItinerary.objects.filter(trip=trip).first()
            if itinerary:
                result.append(GeneratedItinerarySerializer(itinerary).data)
        return result

    def get_upcoming_trips(self, obj):
        user = self.context['request'].user
        today = date.today()
        upcoming_trips = Trip.objects.filter(user=user, start_date__gt=today).order_by('start_date')
        result = []
        for trip in upcoming_trips:
            itinerary = GeneratedItinerary.objects.filter(trip=trip).first()
            if itinerary:
                result.append(GeneratedItinerarySerializer(itinerary).data)
        return result

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
    
    def to_representation(self, instance):
        data = super().to_representation(instance)

        if (instance.is_local_expert or instance.is_service_provider) and not instance.stripe_onboarding_complete:
            try:
                if instance.stripe_account_id:
                    # Try retrieving the account to ensure it exists
                    try:
                        stripe.Account.retrieve(instance.stripe_account_id)
                    except stripe.error.InvalidRequestError:
                        # If account does not exist, reset it
                        instance.stripe_account_id = None
                        instance.save()

                if not instance.stripe_account_id:
                    # Create a new Stripe account
                    stripe_account = stripe.Account.create(
                        type='express',
                        country='US',
                        email=instance.email,
                        capabilities={
                            'card_payments': {'requested': True},
                            'transfers': {'requested': True},
                        },
                    )
                    instance.stripe_account_id = stripe_account.id
                    instance.save()

                # Now create onboarding link
                onboarding_link = stripe.AccountLink.create(
                    account=instance.stripe_account_id,
                    refresh_url=f'{settings.FRONTEND_URL}/refresh',
                    return_url=f'{settings.FRONTEND_URL}/local-expert/chats',
                    type='account_onboarding',
                )
                data["onboarding_url"] = onboarding_link.url

            except Exception as e:
                # Log the error (optional) and continue without onboarding_url
                print(f"Stripe error: {e}")
                data["onboarding_url"] = None  # or omit this key entirely

        return data


class LeanUserSerializer(serializers.ModelSerializer):
    """
    A lean version of UserSerializer for admin list views that only includes essential user information
    without trip details and other heavy data
    """
    image = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'phone_number',
            'country', 'city', 'dob', 'about_me', 'image', 'cover_image',
            'is_local_expert', 'is_service_provider', 'created_at'
        ]

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
    # User profile fields that can be updated
    first_name = serializers.CharField(required=False, source='user.first_name')
    last_name = serializers.CharField(required=False, source='user.last_name')
    email = serializers.EmailField(required=False, source='user.email')
    phone_number = serializers.CharField(required=False, source='user.phone_number')
    country = serializers.CharField(required=False, source='user.country')
    city = serializers.CharField(required=False, source='user.city')
    dob = serializers.DateField(required=False, source='user.dob')
    about_me = serializers.CharField(required=False, source='user.about_me')
    image = serializers.FileField(required=False, source='user.image')
    
    # Direct fields for form-data compatibility
    user_country = serializers.CharField(required=False, write_only=True)
    user_city = serializers.CharField(required=False, write_only=True)
    user_first_name = serializers.CharField(required=False, write_only=True)
    user_last_name = serializers.CharField(required=False, write_only=True)
    user_email = serializers.EmailField(required=False, write_only=True)
    user_phone_number = serializers.CharField(required=False, write_only=True)
    user_dob = serializers.DateField(required=False, write_only=True)
    user_about_me = serializers.CharField(required=False, write_only=True)

    class Meta:
        model = LocalExpertForm
        exclude = ['user','status', 'created_at']

    def create(self, validated_data):
        request = self.context.get('request')
        user = request.user
        
        
        # Extract user profile fields (these come from source='user.field_name')
        user_fields = {}
        for field in ['first_name', 'last_name', 'email', 'phone_number', 'country', 'city', 'dob', 'about_me', 'image']:
            if field in validated_data:
                user_fields[field] = validated_data.pop(field)
        
        # Extract direct form-data fields (user_country, user_city, etc.)
        direct_fields = {
            'country': 'user_country',
            'city': 'user_city', 
            'first_name': 'user_first_name',
            'last_name': 'user_last_name',
            'email': 'user_email',
            'phone_number': 'user_phone_number',
            'dob': 'user_dob',
            'about_me': 'user_about_me'
        }
        
        for user_field, direct_field in direct_fields.items():
            if direct_field in validated_data:
                user_fields[user_field] = validated_data.pop(direct_field)
        
        # Handle nested user data structure
        if 'user' in validated_data and isinstance(validated_data['user'], dict):
            nested_user_data = validated_data.pop('user')
            for field, value in nested_user_data.items():
                if field in ['first_name', 'last_name', 'email', 'phone_number', 'country', 'city', 'dob', 'about_me', 'image']:
                    user_fields[field] = value
        
        
        # Remove user field if it exists in validated_data to avoid duplicate
        if 'user' in validated_data:
            validated_data.pop('user')
        
        # Update user profile if fields provided
        if user_fields:
            # Check for email conflicts before updating
            if 'email' in user_fields and user_fields['email']:
                new_email = user_fields['email']
                if new_email != user.email and User.objects.filter(email=new_email).exists():
                    raise serializers.ValidationError({
                        'email': f'User with email {new_email} already exists. Please use a different email.'
                    })
            
            for field, value in user_fields.items():
                if value:  # Only update if value is not empty
                    setattr(user, field, value)
            user.save()
        
        return LocalExpertForm.objects.create(user=user, **validated_data)


class LocalExpertFormListSerializer(serializers.ModelSerializer):
    user = LeanUserSerializer()
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
        if value not in ['approved', 'rejected', 'deleted']:
            raise serializers.ValidationError("Status must be either 'approved', 'rejected', or 'deleted'")
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

You can log in here: {settings.FRONTEND_URL}/ with the same credentials.

Make sure to change your password after your first login. This password is system-generated and we do not store it.

Best regards,
TravelDNA Team
"""
        elif status == "deleted":
            # Delete the user account
            user.deleted = True
            user.is_local_expert = False
            user.save()
            
            subject = "Local Expert Account Deleted"
            message = f"""Hi {user.first_name},

Your Local Expert account has been deleted by the administrator.

**Reason:** {rejection_message}

If you believe this was done in error, please contact support.

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
    user = LeanUserSerializer()
    class Meta:
        model = ServiceProviderForm
        fields = '__all__'


class AdminServiceProviderUpdateStatusSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=[('approved', 'Approved'), ('rejected', 'Rejected'), ('deleted', 'Deleted')])
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
            # Update the existing user instead of creating a new one
            user.is_service_provider = True
            user.phone_number = instance.mobile
            user.country = instance.country
            user.about_me = instance.description
            stripe.api_key = settings.STRIPE_SECRET_KEY
            
            
            # Validate phone number format for Stripe
            phone_number = user.phone_number or instance.mobile or ''
            print(f"📱 Combined phone_number: '{phone_number}'")
            
            # Clean and format phone number - FORCE US FORMAT FOR STRIPE
            if phone_number:
                # Remove all non-digit characters
                clean_phone = ''.join(filter(str.isdigit, phone_number))
                print(f"📱 Clean phone (digits only): '{clean_phone}' (length: {len(clean_phone)})")
                
                # ALWAYS convert to US format for Stripe compatibility
                if len(clean_phone) >= 10:
                    # Take last 10 digits and add US country code
                    us_phone = clean_phone[-10:]  # Get last 10 digits
                    phone_number = f'+1{us_phone}'
                    print(f"📱 Converted to US format: '{phone_number}' (from {clean_phone})")
                else:
                    # If less than 10 digits, skip phone number
                    phone_number = ''
                    print(f"📱 Less than 10 digits → setting empty: '{phone_number}'")
            else:
                print(f"📱 No phone number provided")
            
            print(f"📱 Final phone for Stripe: '{phone_number}' (length: {len(phone_number) if phone_number else 0})")
            print(f"📱 Will send to Stripe: {'YES' if phone_number and len(phone_number) >= 12 else 'NO (empty field)'}")
            
            try:
                print(f"🚀 CREATING STRIPE ACCOUNT")
                print(f"📧 Email: {user.email}")
                print(f"👤 First name: '{user.first_name or 'User'}'")
                print(f"👤 Last name: '{user.last_name or 'Account'}'")
                final_phone = phone_number if phone_number and len(phone_number) >= 12 else ''
                print(f"📱 Phone field value: '{final_phone}'")
                
                stripe_account = stripe.Account.create(
                        type='standard',  # Use 'express' or 'custom' if needed
                        country='US',  # Hardcoded to US to avoid country code issues
                        email=user.email,
                        business_type='individual',  # or 'company' based on your use case
                        individual={
                            'email': user.email,
                            'first_name': user.first_name or 'User',
                            'last_name': user.last_name or 'Account',
                            'phone': final_phone,
                            # Add more fields like 'dob' or 'address' if available and required
                        },  # Individual info for Stripe account
                        business_profile={
                            'product_description': instance.description or 'Travel services',
                            'url': 'https://traveloure.com',  # Hardcoded valid URL
                        },
                        capabilities={
                            'card_payments': {'requested': True},
                            'transfers': {'requested': True},
                        },
                    )
                    # Store the Stripe account ID in the User model
                user.stripe_account_id = stripe_account.id
                user.save()
                print(f"✅ STRIPE ACCOUNT CREATED SUCCESSFULLY")
                print(f"🆔 Account ID: {stripe_account.id}")
                
            except stripe.error.InvalidRequestError as e:
                error_msg = str(e)
                print(f"❌ STRIPE ERROR: {error_msg}")
                print(f"❌ Full error details: {e}")
                
                if 'phone number' in error_msg:
                    print(f"❌ Phone number validation failed")
                    print(f"❌ Phone sent to Stripe: '{final_phone}'")
                    raise serializers.ValidationError(
                        'Please provide a valid phone number with country code (e.g., +1234567890)'
                    )
                elif 'email' in error_msg:
                    raise serializers.ValidationError(
                        'Please provide a valid email address'
                    )
                elif 'country' in error_msg:
                    raise serializers.ValidationError(
                        'Invalid country code provided'
                    )
                else:
                    raise serializers.ValidationError(
                        f'Unable to create payment account: {error_msg}'
                    )
            except Exception as e:
                print(f"❌ GENERAL ERROR: {str(e)}")
                print(f"❌ Error type: {type(e)}")
                raise serializers.ValidationError(
                    f'Failed to approve service provider: {str(e)}'
                )

            # Generate a new password for the existing user
            raw_password = generate_random_password(length=12)
            user.set_password(raw_password)
            user.save()
            subject = "Service Provider Application Approved"
            message = f"""Hi {user.first_name},

Your request to become a Service Provider has been approved!

You can log in here: {settings.FRONTEND_URL}/ with these credentials:
Email: {user.email}
Password : {raw_password}

Make sure to change your password after your first login. This password is system-generated and we do not store it.

Best regards,
TravelDNA Team
"""
        elif status == "deleted":
            # Delete the user account
            user.deleted = True
            user.is_service_provider = False
            user.save()
            
            subject = "Service Provider Account Deleted"
            message = f"""Hi {user.first_name},

Your Service Provider account has been deleted by the administrator.

**Reason:** {rejection_message}

If you believe this was done in error, please contact support.

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
            recipient_list=[user.email],
            fail_silently=False
        )

        return instance
    
class ManageServiceProviderLISTSerializer(serializers.ModelSerializer):
    # These fields are coming from the related ServiceProviderForm
    status = serializers.SerializerMethodField()
    business_name = serializers.SerializerMethodField()
    mobile = serializers.SerializerMethodField()
    website = serializers.SerializerMethodField()
    business_type = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = [
            'password', 'last_login', 'is_active', 'is_staff', 'is_superuser', 'deleted',
            "is_local_expert", "is_service_provider", "is_post_holiday_package",
            "is_sell_packages", "travel_style", "preferred_months", "meal_preference", 'is_banned','updated_at'
        ]

    def get_service_provider_form(self, user):
        """Helper to safely fetch the related ServiceProviderForm."""
        try:
            return ServiceProviderForm.objects.get(user=user)
        except ServiceProviderForm.DoesNotExist:
            return None

    def get_status(self, obj):
        form = self.get_service_provider_form(obj)
        return form.status if form else None

    def get_business_name(self, obj):
        form = self.get_service_provider_form(obj)
        return form.business_name if form else None

    def get_mobile(self, obj):
        form = self.get_service_provider_form(obj)
        return form.mobile if form else None

    def get_website(self, obj):
        form = self.get_service_provider_form(obj)
        return form.website if form else None

    def get_business_type(self, obj):
        form = self.get_service_provider_form(obj)
        return form.business_type if form else None
    

class ManageLocalExpertLISTSerializer(serializers.ModelSerializer):
    # These fields are coming from the related ServiceProviderForm
    status = serializers.SerializerMethodField()
    # business_name = serializers.SerializerMethodField()
    # mobile = serializers.SerializerMethodField()
    # website = serializers.SerializerMethodField()
    # business_type = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = [
            'password', 'last_login', 'is_active', 'is_staff', 'is_superuser', 'deleted',
            "is_local_expert", "is_service_provider", "is_post_holiday_package",
            "is_sell_packages", "travel_style", "preferred_months", "meal_preference", 'is_banned','updated_at'
        ]

    def get_expert_form(self, user):
        """Helper to safely fetch the related ServiceProviderForm."""
        try:
            return LocalExpertForm.objects.get(user=user)
        except LocalExpertForm.DoesNotExist:
            return None

    def get_status(self, obj):
        form = self.get_expert_form(obj)
        return form.status if form else None

    # def get_business_name(self, obj):
    #     form = self.get_service_provider_form(obj)
    #     return form.business_name if form else None

    # def get_mobile(self, obj):
    #     form = self.get_service_provider_form(obj)
    #     return form.mobile if form else None

    # def get_website(self, obj):
    #     form = self.get_service_provider_form(obj)
    #     return form.website if form else None

    # def get_business_type(self, obj):
    #     form = self.get_service_provider_form(obj)
    #     return form.business_type if form else None


class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubCategory
        fields = '__all__'

class CategorySerializer(serializers.ModelSerializer):
    number_of_sub_category = serializers.IntegerField(source='subcategory_set.count',read_only=True)
    subcategories = SubCategorySerializer(
        source='subcategory_set', many=True, read_only=True
    )
    class Meta:
        model = Category
        fields = '__all__'

class RoleToggleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[('user', 'user'), ('local_expert', 'local_expert'), ('service_provider', 'service_provider')])

    def update(self, instance, validated_data):
        instance.toggle_role = validated_data["role"]
        instance.save()
        return instance
    
class LocalExpertBusinessProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    class Meta:
        fields = "__all__"
        model = LocalExpertForm