from __future__ import annotations

from typing import Any, Mapping, MutableMapping, Optional

from django.utils import timezone

from .models import Notification

# Display strings for notification title prefix (e.g. "[Client] Booking Accepted").
ROLE_BADGE_LABELS: dict[str, str] = {
    'client': 'Client',
    'mechanic': 'Mechanic',
    'mechanic_shop': 'Mechanic',
    'shopowner': 'Shop Owner',
}


def _badge_for_target_role(target_role: Optional[str]) -> str:
    key = str(target_role or '').strip().lower()
    return ROLE_BADGE_LABELS.get(key, 'Account')


def upsert_notification(
    *,
    receiver_id: int,
    correlation_key: str,
    title: str,
    message: str,
    payload: Optional[Mapping[str, Any]] = None,
    mark_unread: bool = True,
) -> Notification:
    """
    Create or update a single notification row for this receiver + correlation_key.
    Title is stored with a role badge prefix derived from payload['target_role'].
    """
    body_payload: MutableMapping[str, Any] = dict(payload or {})
    target_role = body_payload.get('target_role')
    badge = _badge_for_target_role(str(target_role) if target_role is not None else None)
    body_payload['role_badge'] = badge

    display_title = f'[{badge}] {title}'.strip()
    if len(display_title) > 255:
        display_title = display_title[:252] + '...'

    defaults: dict[str, Any] = {
        'title': display_title,
        'message': message,
        'payload': body_payload,
        'updated_at': timezone.now(),
    }
    if mark_unread:
        defaults['is_read'] = False

    obj, _created = Notification.objects.update_or_create(
        receiver_id=receiver_id,
        correlation_key=correlation_key,
        defaults=defaults,
    )
    return obj
