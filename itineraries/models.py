from django.db import models
from django.utils.text import slugify
from django.core.exceptions import ValidationError
from authentication.models import User

class ItineraryCategory(models.Model):
    title = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(unique=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title

class Itinerary(models.Model):
    trip_planner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="itineraries")
    category = models.ForeignKey(ItineraryCategory, on_delete=models.CASCADE, related_name="itineraries")
    city = models.CharField(max_length=100)  # Consider adding a City model later
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True, db_index=True)
    thumbnail = models.ImageField(upload_to='itineraries/thumbnails/')
    description = models.TextField()
    highlights = models.TextField()
    days = models.PositiveIntegerField()
    nights = models.PositiveIntegerField()
    featured = models.BooleanField(default=False)
    is_ai_itinerary = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.days <= self.nights:
            raise ValidationError("Days should be greater than nights.")

    def save(self, *args, **kwargs):
        if not self.slug:
            original_slug = slugify(self.title)
            slug = original_slug
            counter = 1
            # Ensure slug is unique by appending a counter if needed
            while Itinerary.objects.filter(slug=slug).exists():
                slug = f"{original_slug}-{counter}"
                counter += 1
            self.slug = slug
        self.full_clean()  # for days > nights check
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self.is_deleted = True
        self.save()

    def __str__(self):
        return f"{self.title} ({self.days} Days, {self.nights} Nights)"

class ItineraryDay(models.Model):
    itinerary = models.ForeignKey(Itinerary, on_delete=models.CASCADE, related_name="itinerary_days")
    day_number = models.PositiveIntegerField()
    description = models.TextField()

    class Meta:
        unique_together = ("itinerary", "day_number")

    def __str__(self):
        return f"Day {self.day_number} - {self.itinerary.title}"

class ItineraryPoint(models.Model):
    itinerary_day = models.ForeignKey(ItineraryDay, on_delete=models.CASCADE, related_name="points")
    title = models.CharField(max_length=255)
    description = models.TextField()
    point_type = models.CharField(max_length=50, choices=[('food', 'Food'), ('travel', 'Travel'), ('stay', 'Stay')])
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.itinerary_day.itinerary.title} (Day {self.itinerary_day.day_number})"

class ItineraryMedia(models.Model):
    itinerary_point = models.ForeignKey(ItineraryPoint, on_delete=models.CASCADE, related_name="media")
    media = models.FileField(upload_to='itineraries/media/')
    media_type = models.CharField(max_length=50, choices=[('image', 'Image'), ('video', 'Video')])
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Media for {self.itinerary_point.title}"

class SavedItinerary(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='saved_itineraries')
    itinerary = models.ForeignKey(Itinerary, on_delete=models.CASCADE, related_name='saved_by')
    saved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'itinerary')

    def __str__(self):
        return f"{self.user.username} saved {self.itinerary.title}"

class ItineraryLike(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='liked_itineraries')
    itinerary = models.ForeignKey(Itinerary, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'itinerary')

    def __str__(self):
        return f"{self.user.username} liked {self.itinerary.title}"

class ItineraryReport(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports')
    itinerary = models.ForeignKey(Itinerary, on_delete=models.CASCADE, related_name='reports')
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} reported {self.itinerary.title}"