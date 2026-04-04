from django.contrib.auth.models import AbstractBaseUser
from django.db import models
from .managers import UserManager
import uuid
from django.core.exceptions import ValidationError
import random
import string
# User Model
class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    email = models.EmailField(unique=True, max_length=50)
    username = models.CharField(max_length=20, null=False, blank=False, unique=True)
    first_name = models.CharField(max_length=30, blank=False, null=False)
    last_name = models.CharField(max_length=30, blank=True, null=True)
    is_active = models.BooleanField(default=False)
    is_banned = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    phone_number = models.CharField(blank=True, null=True)
    cover_image = models.ImageField(upload_to='users/covers/', blank=True, null=True)
    image = models.ImageField(upload_to='users/images/', blank=True, null=True)
    country = models.CharField(max_length=30, blank=True, null=True)
    city = models.CharField(max_length=40, blank=True, null=True)
    about_me = models.TextField(blank=True, null=True)
    dob = models.DateField(null=True,blank=True)
    is_local_expert = models.BooleanField(default=False)
    is_service_provider = models.BooleanField(default=False)
    is_post_holiday_package = models.BooleanField(default=False)
    is_sell_packages = models.BooleanField(default=False)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_email_verified = models.BooleanField(default=False)
    travel_style = models.JSONField(default=list)
    preferred_months = models.JSONField(default=list)
    meal_preference = models.CharField(null=True,blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username','first_name','last_name']

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    def get_all_permissions(user=None):
        if user.is_superuser:
            return set()
        
    def soft_delete(self):
        self.deleted = True
        self.save()

    def restore(self):
        self.deleted = False
        self.save()

    def __str__(self):
        return self.email
    def clean(self):
        super().clean()
        if self.is_local_expert and self.is_service_provider:
            raise ValidationError("User cannot be both a Local Expert and a Service Provider.")

    def save(self, *args, **kwargs):
        self.clean()  # ensures validation is run before save
        super().save(*args, **kwargs)


class LoginHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    login_at = models.DateTimeField(auto_now_add=True)
    ip = models.CharField(max_length=25, blank = False)
    location = models.CharField(max_length=100, blank=False)
    browser = models.CharField(max_length= 100, blank=True)


class EmailVerificationToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

class LocalExpertForm(models.Model):

    user = models.OneToOneField(User, on_delete=models.SET_NULL,null=True,blank=True)
    languages = models.JSONField(default=list)
    years_in_city = models.IntegerField(null=False,blank=False)
    offer_service = models.BooleanField(default=False)
    short_bio = models.TextField(null=True, blank=True)  # Added missing field
    gov_id = models.FileField(upload_to='localExpert/',blank=False,null=False)
    travel_licence = models.FileField(upload_to='localExpert/',blank=False,null=False)
    instagram_link = models.TextField(null=True,blank=True)
    facebook_link = models.TextField(null=True,blank=True)
    linkedin_link = models.TextField(null=True, blank=True)
    services = models.JSONField(default=list)
    service_availability = models.IntegerField(default=15)
    price_expectation = models.IntegerField(null=True, blank=True)

    confirm_age = models.BooleanField(default=False)
    t_and_c = models.BooleanField(default=False)
    partnership = models.BooleanField(default=False)
    STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('deleted', 'Deleted'),
]
    status = models.CharField(choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)


class ServiceProviderForm(models.Model):
    user = models.OneToOneField(User, on_delete=models.SET_NULL,null=True,blank=True)
    business_name = models.TextField(null=False, blank=False)
    name = models.CharField(null=False, blank=False)
    email = models.EmailField(null=False, blank=False)
    website = models.TextField(null=True, blank=True)
    mobile = models.CharField(null=False,blank=False)
    whatsapp = models.CharField(null=False,blank=False)
    country = models.CharField(null=False, blank=False)
    address = models.TextField(null=False,blank=False)
    booking_link = models.TextField(null=True, blank=True)
    gst = models.CharField(null=False,blank=False)
    instagram_link = models.TextField(null=True,blank=True)
    facebook_link = models.TextField(null=True,blank=True)
    linkedin_link = models.TextField(null=True, blank=True)
    photo1 = models.FileField(null=True, blank=True, upload_to="serviceProvider/")
    photo2 = models.FileField(null=True, blank=True, upload_to="serviceProvider/")
    photo3 = models.FileField(null=True, blank=True, upload_to="serviceProvider/")
    photo4 = models.FileField(null=True, blank=True, upload_to="serviceProvider/")
    photo5 = models.FileField(null=True, blank=True, upload_to="serviceProvider/")
    business_type = models.CharField(null=False, blank=False)
    service_offers = models.JSONField(default=list)
    description = models.TextField(null=True,blank=True)
    instant_booking = models.BooleanField(default=False)
    business_logo = models.FileField(upload_to="serviceProvider/",null=False, blank=False)
    business_license = models.FileField(upload_to="serviceProvider/",null=False, blank=False)
    business_gst_tax = models.FileField(upload_to="serviceProvider/",null=False, blank=False)
    t_and_c = models.BooleanField(default=False)
    info_confirmation = models.BooleanField(default=False)
    contact_request = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('deleted', 'Deleted'),
]
    status = models.CharField(choices=STATUS_CHOICES, default='pending')