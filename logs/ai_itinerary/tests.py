from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from authentication.models import LocalExpertForm

User = get_user_model()

class LocalExpertListAPITestCase(APITestCase):
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        
        # Create a local expert form
        self.local_expert = LocalExpertForm.objects.create(
            user=self.user,
            languages=['English', 'Hindi'],
            years_in_city=5,
            short_bio='Test bio',
            services=['Tour Guide', 'Local Knowledge'],
            service_availability=20,
            price_expectation=1000,
            status='approved'
        )
    
    def test_local_expert_list_api(self):
        """Test that the local experts list API returns correct data"""
        url = reverse('local-experts-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['data']), 1)
        
        expert_data = response.data['data'][0]
        self.assertEqual(expert_data['user']['first_name'], 'Test')
        self.assertEqual(expert_data['user']['last_name'], 'User')
        self.assertEqual(expert_data['status'], 'approved')
        self.assertEqual(expert_data['languages'], ['English', 'Hindi'])
