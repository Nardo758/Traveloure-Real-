from django.core.management.base import BaseCommand
from subscription.models import Wallet
from authentication.models import User

class Command(BaseCommand):
    help = 'Creates default wallets for users who do not have one.'

    def handle(self, *args, **kwargs):
        # Get all users who don't have a wallet
        users_without_wallet = User.objects.filter(wallet__isnull=True)
        
        wallets_created = 0
        for user in users_without_wallet:
            wallet, created = Wallet.objects.get_or_create(
                user=user,
                defaults={
                    "balance": 0.00,
                }
            )
            if created:
                wallets_created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Created wallet for user: {user.email}")
                )

        if wallets_created > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Successfully created {wallets_created} wallet(s).")
            )
        else:
            self.stdout.write(
                self.style.WARNING("All users already have wallets.")
            )
