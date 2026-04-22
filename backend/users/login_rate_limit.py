"""
Simple login brute-force protection using the default Django cache.
Counts failed attempts per client IP; after too many failures, blocks further
logins for a cooldown period.

Use ``scope`` to keep separate counters (e.g. mobile app vs admin portal).
"""
import time

from django.conf import settings
from django.core.cache import cache


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()[:200]
    return (request.META.get('REMOTE_ADDR') or 'unknown')[:200]


def _lock_key(ip, scope):
    return f'{scope}_lock_until:{ip}'


def _fails_key(ip, scope):
    return f'{scope}_fails:{ip}'


def _config():
    return {
        'max_attempts': int(getattr(settings, 'LOGIN_MAX_ATTEMPTS', 5)),
        'window_seconds': int(getattr(settings, 'LOGIN_FAIL_WINDOW_SECONDS', 900)),
        'lockout_seconds': int(getattr(settings, 'LOGIN_LOCKOUT_SECONDS', 900)),
    }


def lock_remaining_seconds(ip, scope='login'):
    until = cache.get(_lock_key(ip, scope))
    if until is None:
        return 0
    return max(0, int(until - time.time()))


def assert_login_not_locked(request, scope='login'):
    ip = _client_ip(request)
    remaining = lock_remaining_seconds(ip, scope=scope)
    if remaining > 0:
        return False, ip, remaining
    return True, ip, 0


def record_login_failure(ip, scope='login'):
    cfg = _config()
    fails = int(cache.get(_fails_key(ip, scope), 0)) + 1
    cache.set(_fails_key(ip, scope), fails, timeout=cfg['window_seconds'])
    if fails >= cfg['max_attempts']:
        until = time.time() + cfg['lockout_seconds']
        cache.set(_lock_key(ip, scope), until, timeout=cfg['lockout_seconds'] + 60)
        return True, max(1, int(cfg['lockout_seconds']))
    return False, 0


def clear_login_attempts(ip, scope='login'):
    cache.delete(_fails_key(ip, scope))
    cache.delete(_lock_key(ip, scope))
