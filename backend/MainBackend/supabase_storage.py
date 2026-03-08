"""
Custom storage backend for Supabase Storage (S3-compatible)
"""
from storages.backends.s3boto3 import S3Boto3Storage
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class SupabaseStorage(S3Boto3Storage):
    """
    Supabase-specific storage backend that handles URL generation correctly
    """
    
    def __init__(self, **settings_override):
        super().__init__(**settings_override)
        logger.info(f"Initialized SupabaseStorage with bucket: {self.bucket_name}")
        logger.info(f"Endpoint URL: {settings.AWS_S3_ENDPOINT_URL}")
    
    def _save(self, name, content):
        """
        Override _save to add logging for debugging
        """
        logger.info(f"SupabaseStorage._save called - Name: {name}")
        logger.info(f"Content type: {getattr(content, 'content_type', 'unknown')}")
        logger.info(f"Content size: {content.size} bytes")
        
        try:
            saved_name = super()._save(name, content)
            logger.info(f"✓ Upload successful - Saved as: {saved_name}")
            return saved_name
        except Exception as e:
            logger.error(f"✗ Upload failed: {str(e)}")
            logger.exception("Full upload error:")
            raise
    
    def url(self, name, parameters=None, expire=None, http_method=None):
        """
        Return the URL for accessing the file.
        For Supabase public buckets, return public URL instead of signed URL.
        """
        # For public buckets, construct public URL
        if not settings.AWS_QUERYSTRING_AUTH:
            # Public URL format: https://PROJECT_ID.supabase.co/storage/v1/object/public/BUCKET/PATH
            project_id = settings.AWS_S3_ENDPOINT_URL.split('.')[0].replace('https://', '')
            public_url = f"https://{project_id}.supabase.co/storage/v1/object/public/{self.bucket_name}/{name}"
            logger.debug(f"Generated public URL: {public_url}")
            return public_url
        
        # For private buckets, use signed URL
        return super().url(name, parameters, expire, http_method)
