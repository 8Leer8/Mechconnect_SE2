"""
Utility functions for handling media file URLs.
Provides consistent URL handling for both local and S3 storage.
"""
from django.conf import settings


def get_media_url(file_field, request=None):
    """
    Get the appropriate URL for a media file field.
    
    Args:
        file_field: Django FileField/ImageField instance
        request: Django request object (required for local storage URLs)
    
    Returns:
        str: Full URL to the media file
        None: If file_field is None or empty
    
    Usage:
        profile_photo_url = get_media_url(obj.profile_photo, request)
    """
    if not file_field:
        return None
    
    # When using S3, the file_field.url already contains the full S3 URL
    if settings.USE_S3:
        return file_field.url
    
    # For local storage, build absolute URI
    if request:
        return request.build_absolute_uri(file_field.url)
    
    # Fallback: return relative URL (not ideal but prevents errors)
    return file_field.url
