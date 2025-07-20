from django.core.management.base import BaseCommand
from subscription.models import Plan

class Command(BaseCommand):
    help = 'Creates a default Free plan if it does not already exist.'

    def handle(self, *args, **kwargs):
        plan_name = "Free"

        plan, created = Plan.objects.get_or_create(
            plan_name=plan_name,
            defaults={
                "amount": 0.00,
                "manual_itineraries": 10,
                "ai_itineraries": 2,
                "is_active": True,
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"Default '{plan_name}' plan created successfully."))
        else:
            self.stdout.write(self.style.WARNING(f" '{plan_name}' plan already exists."))
