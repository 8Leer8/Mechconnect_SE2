"""
Signal handlers for the users app.

These signals automatically update cached values when related data changes:
- Updates Mechanic.average_rating when reviews are created, updated, or deleted
- Auto-creates Wallet when Account is created
"""

from decimal import Decimal
from django.db.models import Avg
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import MechanicReview, Mechanic, Account, Wallet


def update_mechanic_average_rating(mechanic):
    """
    Recalculates and updates the average rating for a given mechanic.
    Uses all reviews for that mechanic and rounds to 2 decimal places.
    
    Args:
        mechanic: Mechanic instance to update
    """
    # Calculate average rating from all reviews
    avg_rating = mechanic.reviews.aggregate(Avg('rating'))['rating__avg']
    
    if avg_rating is not None:
        # Round to 2 decimal places
        mechanic.average_rating = Decimal(str(round(avg_rating, 2)))
    else:
        # No reviews yet, set to 0
        mechanic.average_rating = Decimal('0.00')
    
    mechanic.save(update_fields=['average_rating'])


@receiver(post_save, sender=MechanicReview)
def mechanic_review_saved(sender, instance, **kwargs):
    """
    Signal handler: Updates mechanic's average rating when a review is created or updated.
    
    Why signals? This ensures the cached average_rating is always in sync with reviews,
    regardless of how reviews are created (admin, API, shell, etc.).
    """
    update_mechanic_average_rating(instance.mechanic)


@receiver(post_delete, sender=MechanicReview)
def mechanic_review_deleted(sender, instance, **kwargs):
    """
    Signal handler: Updates mechanic's average rating when a review is deleted.
    
    Why signals? Automatically maintains data consistency when reviews are removed.
    """
    update_mechanic_average_rating(instance.mechanic)


@receiver(post_save, sender=Account)
def create_wallet_for_account(sender, instance, created, **kwargs):
    """
    Signal handler: Automatically creates a Wallet when a new Account is created.
    
    This ensures every account has a wallet for storing token/credit balance.
    Uses get_or_create to prevent duplicate wallets if signal fires multiple times.
    """
    if created:
        Wallet.objects.get_or_create(
            account=instance,
            defaults={'balance': Decimal('0.00')}
        )
