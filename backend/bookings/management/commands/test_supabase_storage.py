"""
Django management command to test Supabase S3 storage connection
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from django.core.files.base import ContentFile
import boto3
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Test Supabase S3 storage connection and upload'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Testing Supabase S3 Storage Connection...'))
        self.stdout.write('-' * 50)
        
        # Print configuration
        self.stdout.write(f"Endpoint: {settings.AWS_S3_ENDPOINT_URL}")
        self.stdout.write(f"Bucket: {settings.AWS_STORAGE_BUCKET_NAME}")
        self.stdout.write(f"Region: {settings.AWS_S3_REGION_NAME}")
        self.stdout.write(f"Access Key ID: {settings.AWS_ACCESS_KEY_ID[:10]}...")
        self.stdout.write('-' * 50)
        
        # Create S3 client
        try:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
                region_name=settings.AWS_S3_REGION_NAME,
                config=boto3.session.Config(signature_version='s3v4')
            )
            self.stdout.write(self.style.SUCCESS('✓ S3 client created successfully'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Failed to create S3 client: {str(e)}'))
            return
        
        # Test bucket access
        try:
            response = s3_client.list_objects_v2(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                MaxKeys=1
            )
            self.stdout.write(self.style.SUCCESS(f'✓ Bucket access successful'))
            self.stdout.write(f"  Bucket contains {response.get('KeyCount', 0)} objects (showing max 1)")
        except ClientError as e:
            self.stdout.write(self.style.ERROR(f'✗ Bucket access failed: {e.response["Error"]["Message"]}'))
            self.stdout.write(f"  Error Code: {e.response['Error']['Code']}")
            return
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Bucket access failed: {str(e)}'))
            return
        
        # Test file upload
        test_content = b'Test upload from Django'
        test_key = 'test/django_test.txt'
        
        try:
            s3_client.put_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=test_key,
                Body=test_content,
                ContentType='text/plain'
            )
            self.stdout.write(self.style.SUCCESS(f'✓ Test file uploaded: {test_key}'))
            
            # Generate URL
            file_url = f"{settings.MEDIA_URL}{test_key}"
            self.stdout.write(f"  Public URL: {file_url}")
            
        except ClientError as e:
            self.stdout.write(self.style.ERROR(f'✗ Upload failed: {e.response["Error"]["Message"]}'))
            self.stdout.write(f"  Error Code: {e.response['Error']['Code']}")
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Upload failed: {str(e)}'))
        
        # Test using Django storage backend
        self.stdout.write('-' * 50)
        self.stdout.write('Testing Django storage backend...')
        
        try:
            from django.core.files.storage import default_storage
            
            test_file = ContentFile(b'Django storage test', name='test/django_storage_test.txt')
            saved_path = default_storage.save('test/django_storage_test.txt', test_file)
            
            self.stdout.write(self.style.SUCCESS(f'✓ Django storage upload successful'))
            self.stdout.write(f"  Saved path: {saved_path}")
            self.stdout.write(f"  URL: {default_storage.url(saved_path)}")
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Django storage upload failed: {str(e)}'))
            logger.exception("Full exception:")
        
        self.stdout.write('-' * 50)
        self.stdout.write(self.style.SUCCESS('Test complete!'))
