"""
Google Cloud Storage utility for script file management.
Bucket: autosagex-drive
Path structure: scripts/<user_id>/<script_id>/<filename>
"""

from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.api_core.exceptions import NotFound
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

BUCKET_NAME = "autosagex-drive"


def _get_client() -> storage.Client:
    """Return an authenticated GCS client."""
    credentials_path = getattr(settings, 'GOOGLE_APPLICATION_CREDENTIALS', '')
    try:
        if credentials_path:
            return storage.Client.from_service_account_json(credentials_path)
        return storage.Client()
    except Exception as e:
        logger.error(f"Failed to initialize GCS client: {e}")
        raise GoogleCloudError(f"Cloud Storage authentication failed: {e}")



def _get_bucket() -> storage.Bucket:
    return _get_client().bucket(BUCKET_NAME)


def build_blob_path(user_id: int, script_id: int, filename: str) -> str:
    """
    Build the canonical GCS blob path for a script.
    Pattern: scripts/<user_id>/<script_id>/<filename>
    """
    return f"scripts/{user_id}/{script_id}/{filename}"


def build_public_url(blob_path: str) -> str:
    """Return the public GCS URL for a blob path."""
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"


def upload_script(blob_path: str, content: bytes, content_type: str) -> str:
    """
    Upload script content to GCS.

    Returns:
        Public URL of the uploaded object.

    Raises:
        GoogleCloudError: on upload failure.
    """
    bucket = _get_bucket()
    blob = bucket.blob(blob_path)
    blob.upload_from_string(content, content_type=content_type)
    logger.info(f"Uploaded script to GCS: {blob_path}")
    return build_public_url(blob_path)


def download_script(blob_path: str) -> str:
    """
    Download script content from GCS and return as a string.

    Raises:
        NotFound: if the blob does not exist.
        GoogleCloudError: on other download failures.
    """
    bucket = _get_bucket()
    blob = bucket.blob(blob_path)
    content = blob.download_as_text(encoding='utf-8')
    logger.info(f"Downloaded script from GCS: {blob_path}")
    return content


def delete_script(blob_path: str) -> None:
    """
    Delete a script blob from GCS.
    Logs a warning if the blob is not found rather than raising.
    """
    bucket = _get_bucket()
    blob = bucket.blob(blob_path)
    try:
        blob.delete()
        logger.info(f"Deleted script from GCS: {blob_path}")
    except NotFound:
        logger.warning(f"GCS blob not found during delete (already gone?): {blob_path}")
    except GoogleCloudError as e:
        logger.error(f"GCS error during delete of {blob_path}: {e}")
        raise


def copy_script(src_path: str, dst_path: str) -> str:
    """
    Server-side copy a blob to a new path (used for rename).

    Returns:
        Public URL of the new object.

    Raises:
        GoogleCloudError: on copy failure.
    """
    bucket = _get_bucket()
    src_blob = bucket.blob(src_path)
    bucket.copy_blob(src_blob, bucket, dst_path)
    logger.info(f"Copied GCS blob from {src_path} to {dst_path}")
    return build_public_url(dst_path)