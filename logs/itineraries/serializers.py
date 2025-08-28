from rest_framework import serializers
from .models import ItineraryCategory, Itinerary, ItineraryDay, ItineraryPoint, ItineraryMedia, SavedItinerary, ItineraryLike, ItineraryReport
import mimetypes

class ItineraryCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryCategory
        fields = ['id', 'title', 'slug', 'created_at', 'updated_at']
        read_only_fields = ['slug', 'created_at', 'updated_at']

class ItineraryReportDisplay(serializers.ModelSerializer):
    class Meta:
        model = ItineraryReport
        fields = ['reason']

class ItinerarySerializer(serializers.ModelSerializer):
    reports = ItineraryReportDisplay(read_only=True, many=True)
    class Meta:
        model = Itinerary
        fields = [
            'id', 'trip_planner', 'category', 'city', 'title', 'slug', 'thumbnail',
            'description', 'highlights', 'days', 'nights', 'featured', 'is_ai_itinerary',
            'is_approved', 'created_at', 'updated_at','reports'
        ]
        read_only_fields = ['slug', 'created_at', 'updated_at', 'trip_planner','reports']

    def validate(self, data):
        days = data.get('days')
        nights = data.get('nights')

        if days is not None and nights is not None and days <= nights:
            raise serializers.ValidationError("Days should be greater than nights.")

        return data
    
class ItineraryDaySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryDay
        fields = ['id', 'itinerary', 'day_number', 'description']

    # def validate(self, data):
    #     itinerary = data.get('itinerary')
    #     day_number = data.get('day_number')
    #     instance = self.instance  # None for create, set for update
    #     print('self.instance = = ', self.instance)
    #     print('instance = = ', instance)
    #     # Ensure day_number is within the range of the itinerary's days
    #     if day_number < 1 or day_number > itinerary.days:
    #         raise serializers.ValidationError(f"Day number must be between 1 and {itinerary.days}.")

    #     # Check for duplicate day_number for the same itinerary
    #     queryset = ItineraryDay.objects.filter(itinerary=itinerary, day_number=day_number)
    #     if instance:
    #         queryset = queryset.exclude(pk=instance.pk)

    #     if queryset.exists():
    #         raise serializers.ValidationError("Day number must be unique for the given itinerary.")
        
    #     return data

class ItineraryPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryPoint
        fields = ['id', 'itinerary_day', 'title', 'description', 'point_type', 'latitude', 'longitude', 'created_at', 'updated_at']

    def validate(self, data):
        itinerary_day = data.get('itinerary_day')
        user = self.context['request'].user

        # Ensure user owns the itinerary associated with the day
        if itinerary_day.itinerary.trip_planner != user:
            raise serializers.ValidationError("You can only add points to your own itinerary days.")

        return data
    
class ItineraryMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryMedia
        fields = ['id', 'itinerary_point', 'media', 'media_type', 'created_at']

    def validate(self, data):
        user = self.context['request'].user
        itinerary_point = data.get('itinerary_point', self.instance.itinerary_point if self.instance else None)
        media_type = data.get('media_type', self.instance.media_type if self.instance else None)
        media_file = data.get('media', self.instance.media if self.instance else None)

        # Ensure user owns the itinerary point
        if itinerary_point and itinerary_point.itinerary_day.itinerary.trip_planner != user:
            raise serializers.ValidationError("You can only add or update media for your own itinerary points.")

        # Check for duplicates of media type for this itinerary point
        if ItineraryMedia.objects.filter(
            itinerary_point=itinerary_point,
            media_type=media_type
        ).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError("Media of this type already exists for this itinerary point.")

        # Validate the media type matches the file type
        if media_file:
            # Get the file extension and mime type
            file_extension = media_file.name.split('.')[-1].lower()
            mime_type, _ = mimetypes.guess_type(media_file.name)

            # Validate if file type matches media type
            if media_type == 'image':
                valid_image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff']
                if file_extension not in valid_image_extensions:
                    raise serializers.ValidationError(f"The file must be an image (extensions: {', '.join(valid_image_extensions)}).")

                if not mime_type or not mime_type.startswith('image'):
                    raise serializers.ValidationError("The file must be an image.")

            elif media_type == 'video':
                valid_video_extensions = ['mp4', 'mkv', 'mov', 'avi', 'webm']
                if file_extension not in valid_video_extensions:
                    raise serializers.ValidationError(f"The file must be a video (extensions: {', '.join(valid_video_extensions)}).")

                if not mime_type or not mime_type.startswith('video'):
                    raise serializers.ValidationError("The file must be a video.")

        return data



class ItineraryDetailMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryMedia
        fields = ['id', 'itinerary_point', 'media', 'media_type', 'created_at']

class ItineraryDetailPointSerializer(serializers.ModelSerializer):
    media = ItineraryDetailMediaSerializer(many=True, read_only=True)

    class Meta:
        model = ItineraryPoint
        fields = ['id', 'itinerary_day', 'title', 'description', 'point_type', 'latitude', 'longitude', 'created_at', 'updated_at', 'media']

class ItineraryDetailDaySerializer(serializers.ModelSerializer):
    points = ItineraryDetailPointSerializer(many=True, read_only=True)

    class Meta:
        model = ItineraryDay
        fields = ['id', 'itinerary', 'day_number', 'description', 'points']

class ItineraryDetailSerializer(serializers.ModelSerializer):
    days = ItineraryDetailDaySerializer(many=True, read_only=True, source='itinerary_days')

    class Meta:
        model = Itinerary
        fields = [
            'id', 'trip_planner', 'category', 'city', 'title', 'slug', 'thumbnail',
            'description', 'highlights', 'days', 'nights', 'featured', 'is_ai_itinerary',
            'is_approved', 'created_at', 'updated_at', 'days'
        ]

class ItineraryDetailCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItineraryCategory
        fields = ['id', 'title', 'slug', 'created_at', 'updated_at']

class SavedItinerarySerializer(serializers.ModelSerializer):
    itinerary = ItineraryDetailSerializer(read_only=True)
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = SavedItinerary
        fields = ['id', 'user', 'itinerary', 'saved_at']
        read_only_fields = ['saved_at']

    def validate(self, data):
        user = self.context['request'].user
        itinerary_id = self.initial_data.get('itinerary')

        try:
            itinerary = Itinerary.objects.get(id=itinerary_id)
        except Itinerary.DoesNotExist:
            raise serializers.ValidationError("Invalid itinerary.")
        if itinerary.is_deleted:
            raise serializers.ValidationError('Itenary Not Found')
        if SavedItinerary.objects.filter(user=user, itinerary=itinerary).exists():
            raise serializers.ValidationError("You have already saved this itinerary.")

        data['itinerary'] = itinerary
        return data

    def create(self, validated_data):
        user = self.context['request'].user
        itinerary = validated_data['itinerary']
        return SavedItinerary.objects.create(user=user, itinerary=itinerary)

class ItineraryLikeSerializer(serializers.ModelSerializer):
    itinerary_id = serializers.IntegerField()

    class Meta:
        model = ItineraryLike
        fields = ['itinerary_id']

    def validate_itinerary_id(self, value):
        itinerary = Itinerary.objects.filter(id=value).first()
        if (not itinerary) or (itinerary.is_deleted == True):
            raise serializers.ValidationError("Invalid Itinerary.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        itinerary_id = self.validated_data['itinerary_id']
        itinerary = Itinerary.objects.get(id=itinerary_id)

        like, created = ItineraryLike.objects.get_or_create(user=user, itinerary=itinerary)
        if not created:  # If already liked, dislike (remove like)
            like.delete()
            return "Disliked"
        return "Liked"

class ItineraryReportSerializer(serializers.ModelSerializer):
    itinerary_id = serializers.IntegerField()
    reason = serializers.CharField(max_length=255)

    class Meta:
        model = ItineraryReport
        fields = ['itinerary_id', 'reason']

    def validate_itinerary_id(self, value):
        itinerary = Itinerary.objects.filter(id=value).first()
        if (not itinerary) or (itinerary.is_deleted == True):
            raise serializers.ValidationError("Invalid Itinerary.")
        return value

    def validate(self, data):
        user = self.context['request'].user
        itinerary_id = data['itinerary_id']
        if ItineraryReport.objects.filter(user=user, itinerary_id=itinerary_id).exists():
            raise serializers.ValidationError("You have already reported this itinerary.")
        return data

    def save(self, **kwargs):
        user = self.context['request'].user
        itinerary = Itinerary.objects.get(id=self.validated_data['itinerary_id'])
        reason = self.validated_data['reason']

        report = ItineraryReport.objects.create(user=user, itinerary=itinerary, reason=reason)
        return report

class ItineraryLikeListSerializer(serializers.ModelSerializer):
    itinerary = ItineraryDetailSerializer(read_only=True)  # Include full itinerary details

    class Meta:
        model = ItineraryLike
        fields = ['id', 'user', 'itinerary', 'created_at']

class ItineraryReportListSerializer(serializers.ModelSerializer):
    itinerary = ItineraryDetailSerializer(read_only=True)

    class Meta:
        model = ItineraryReport
        fields = ['id', 'user', 'itinerary', 'reason', 'created_at']
