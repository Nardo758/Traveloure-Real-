from rest_framework import serializers
from .models import FAQ

class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ['id', 'question', 'answer', 'attachment', 'created_at']
    
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.attachment:
            request = self.context.get('request')
            if request is not None:
                representation['attachment'] = request.build_absolute_uri(instance.attachment.url)
            else:
                representation['attachment'] = instance.attachment.url
        return representation