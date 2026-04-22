import logging
import random
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from bookings.models import Booking
from shops.models import Shop, ShopMechanic

from .models import Account, EmailVerification
from utils.email import build_verification_email_html, send_html_email, send_html_email_async


logger = logging.getLogger(__name__)

DEACTIVATION_GRACE_DAYS = 30
DEACTIVATION_VERIFICATION_MINUTES = 15

CLIENT_ACTIVE_BOOKING_STATUSES = {
    Booking.Status.ACCEPTED,
    Booking.Status.ON_THE_WAY,
    Booking.Status.AT_LOCATION,
    Booking.Status.DIAGNOSING,
    Booking.Status.ACTIVE,
    Booking.Status.PAUSED,
    Booking.Status.FINISHED,
    Booking.Status.PENDING_PAYMENT,
}

MECHANIC_ACTIVE_BOOKING_STATUSES = {
    Booking.Status.ACCEPTED,
    Booking.Status.ON_THE_WAY,
    Booking.Status.AT_LOCATION,
    Booking.Status.DIAGNOSING,
    Booking.Status.ACTIVE,
    Booking.Status.PAUSED,
    Booking.Status.FINISHED,
    Booking.Status.PENDING_PAYMENT,
}

SHOP_ACTIVE_BOOKING_STATUSES = {
    Booking.Status.ACCEPTED,
    Booking.Status.ON_THE_WAY,
    Booking.Status.AT_LOCATION,
    Booking.Status.DIAGNOSING,
    Booking.Status.ACTIVE,
    Booking.Status.PAUSED,
    Booking.Status.FINISHED,
    Booking.Status.PENDING_PAYMENT,
}


def _mask_email(email):
    email = (email or '').strip()
    if '@' not in email:
        return email or '***'

    local_part, domain = email.split('@', 1)
    if len(local_part) <= 2:
        masked_local = f'{local_part[:1]}***'
    else:
        masked_local = f'{local_part[:1]}***{local_part[-1:]}'
    return f'{masked_local}@{domain}'


def get_deactivation_deadline(account):
    if not getattr(account, 'deactivated_at', None):
        return None
    return account.deactivated_at + timedelta(days=DEACTIVATION_GRACE_DAYS)


def purge_expired_deactivated_account(account):
    deadline = get_deactivation_deadline(account)
    if not deadline or account.is_active:
        return False, deadline

    if timezone.now() <= deadline:
        return False, deadline

    account.delete()
    return True, deadline


def get_account_deactivation_blockers(account):
    blockers = []
    role_names = set(account.accountrole_set.values_list('account_role', flat=True))

    if 'client' in role_names:
        active_count = Booking.objects.filter(
            request__client__account=account,
            status__in=CLIENT_ACTIVE_BOOKING_STATUSES,
        ).count()
        if active_count:
            blockers.append({
                'role': 'client',
                'code': 'active_bookings',
                'message': 'Clients cannot deactivate while they have active or ongoing bookings.',
            })

        dispute_count = Booking.objects.filter(
            request__client__account=account,
            dispute_status=Booking.DisputeState.ACTIVE,
        ).count()
        if dispute_count:
            blockers.append({
                'role': 'client',
                'code': 'unresolved_disputes',
                'message': 'Clients cannot deactivate while they have unresolved disputes.',
            })

    if 'mechanic' in role_names:
        active_count = Booking.objects.filter(
            request__provider=account,
            status__in=MECHANIC_ACTIVE_BOOKING_STATUSES,
        ).count()
        if active_count:
            blockers.append({
                'role': 'mechanic',
                'code': 'active_bookings',
                'message': 'Mechanics cannot deactivate while they have active or ongoing bookings.',
            })

        pending_payment_count = Booking.objects.filter(
            request__provider=account,
            status__in={Booking.Status.FINISHED, Booking.Status.PENDING_PAYMENT, Booking.Status.COMPLETED},
            payment_status__in={Booking.PaymentStatus.UNPAID, Booking.PaymentStatus.PARTIALLY_PAID},
        ).count()
        if pending_payment_count:
            blockers.append({
                'role': 'mechanic',
                'code': 'pending_payments',
                'message': 'Mechanics cannot deactivate while they have pending payments.',
            })

        dispute_count = Booking.objects.filter(
            request__provider=account,
            dispute_status=Booking.DisputeState.ACTIVE,
        ).count()
        if dispute_count:
            blockers.append({
                'role': 'mechanic',
                'code': 'unresolved_disputes',
                'message': 'Mechanics cannot deactivate while they have unresolved disputes.',
            })

    if 'shop_owner' in role_names:
        shop_owner = getattr(account, 'shopowner', None)
        shop = None
        if shop_owner and getattr(shop_owner, 'owns_shop', False):
            shop = Shop.objects.filter(shop_owner=shop_owner).first()

        if shop:
            mechanic_links = ShopMechanic.objects.filter(shop=shop)
            mechanic_account_ids = list(
                mechanic_links.values_list('mechanic__account_id', flat=True),
            )

            if mechanic_links.exists():
                blockers.append({
                    'role': 'shop_owner',
                    'code': 'shop_mechanics',
                    'message': 'Shop owners cannot deactivate while mechanics are still assigned to the shop.',
                })

            active_count = Booking.objects.filter(
                Q(request__shop=shop) | Q(request__provider_id__in=mechanic_account_ids),
                status__in=SHOP_ACTIVE_BOOKING_STATUSES,
            ).count()
            if active_count:
                blockers.append({
                    'role': 'shop_owner',
                    'code': 'active_bookings',
                    'message': 'Shop owners cannot deactivate while they have active bookings.',
                })

        pending_wallet_balance = int(getattr(shop_owner, 'tokens_balance', 0) or 0) if shop_owner else 0
        if pending_wallet_balance > 0:
            blockers.append({
                'role': 'shop_owner',
                'code': 'pending_wallet_balance',
                'message': 'Shop owners cannot deactivate while they have a wallet balance to settle.',
            })

    return blockers


def create_account_verification_code(account, *, subject='MechConnect - Verification Code'):
    email = (account.email or '').strip().lower()
    verification_code = ''.join(str(random.randint(0, 9)) for _ in range(6))
    expires_at = timezone.now() + timedelta(minutes=DEACTIVATION_VERIFICATION_MINUTES)

    EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.PENDING,
    ).update(status=EmailVerification.Status.EXPIRED)

    EmailVerification.objects.create(
        email=email,
        verification_code=verification_code,
        expires_at=expires_at,
    )

    first_name = account.firstname or account.username or 'there'
    html_content = build_verification_email_html(
        first_name=first_name,
        verification_code=verification_code,
        expires_in_minutes=DEACTIVATION_VERIFICATION_MINUTES,
    )

    queued = send_html_email_async(
        to_email=email,
        subject=subject,
        html_content=html_content,
    )

    if not queued:
        email_sent = send_html_email(
            to_email=email,
            subject=subject,
            html_content=html_content,
        )
        if not email_sent:
            logger.warning('Verification code generated but email sending failed for %s', email)

    return {
        'email': _mask_email(email),
        'expires_in_minutes': DEACTIVATION_VERIFICATION_MINUTES,
    }


def validate_account_verification_code(account, code):
    email = (account.email or '').strip().lower()
    normalized_code = ''.join(ch for ch in (code or '').strip() if ch.isdigit())
    if len(normalized_code) != 6:
        return None, 'Please enter a valid 6-digit code'

    pending_qs = EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.PENDING,
    )

    verification = pending_qs.filter(
        verification_code=normalized_code,
    ).order_by('-created_at').first()

    if not verification:
        latest_pending = pending_qs.order_by('-created_at').first()
        if not latest_pending:
            return None, 'No pending verification found. Please request a new code.'

        if timezone.now() > latest_pending.expires_at:
            pending_qs.update(status=EmailVerification.Status.EXPIRED)
            return None, 'Verification code has expired. Please request a new one.'

        return None, 'Invalid verification code'

    if timezone.now() > verification.expires_at:
        verification.status = EmailVerification.Status.EXPIRED
        verification.save(update_fields=['status'])
        return None, 'Verification code has expired. Please request a new one.'

    verification.status = EmailVerification.Status.VERIFIED
    verification.verified_at = timezone.now()
    verification.save(update_fields=['status', 'verified_at'])

    pending_qs.exclude(id=verification.id).update(status=EmailVerification.Status.EXPIRED)

    return verification, None


def deactivate_account(account):
    account.is_active = False
    account.deactivated_at = timezone.now()
    account.save(update_fields=['is_active', 'deactivated_at'])

    EmailVerification.objects.filter(
        email__iexact=(account.email or '').strip().lower(),
        status=EmailVerification.Status.PENDING,
    ).update(status=EmailVerification.Status.EXPIRED)
