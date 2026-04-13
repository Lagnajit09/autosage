"""
Google Cloud Storage utility for execution log management.
Bucket: autosagex-logs
Path structure: scripts-execution/<user_id>/<execution_id>/{stdout.log,stderr.log,logs.json}
"""

import json
import logging
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.api_core.exceptions import NotFound
from django.conf import settings

logger = logging.getLogger(__name__)

LOGS_BUCKET_NAME = "autosagex-logs"


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


def _get_logs_bucket() -> storage.Bucket:
    return _get_client().bucket(LOGS_BUCKET_NAME)


def build_log_blob_path(user_id, execution_id: str, filename: str) -> str:
    """
    Build the canonical GCS blob path for an execution log.
    Pattern: scripts-execution/<user_id>/<execution_id>/<filename>
    """
    return f"scripts-execution/{user_id}/{execution_id}/{filename}"


def build_log_url(blob_path: str) -> str:
    """Return the public GCS URL for a log blob path."""
    return f"https://storage.googleapis.com/{LOGS_BUCKET_NAME}/{blob_path}"


def upload_log(blob_path: str, content: str, content_type: str = "text/plain") -> str:
    """
    Upload log content to GCS.

    Returns:
        Public URL of the uploaded object.

    Raises:
        GoogleCloudError: on upload failure.
    """
    bucket = _get_logs_bucket()
    blob = bucket.blob(blob_path)
    blob.upload_from_string(content.encode("utf-8"), content_type=content_type)
    logger.info(f"Uploaded log to GCS: {blob_path}")
    return build_log_url(blob_path)


def upload_execution_logs(user_id, execution_id: str, stdout: str, stderr: str, logs: list) -> dict:
    """
    Upload stdout, stderr, and logs (as JSON) to GCS for a given execution.

    Returns:
        dict with keys: stdout_log_url, stderr_log_url, logs_url
    """
    stdout_path = build_log_blob_path(user_id, execution_id, "stdout.log")
    stderr_path = build_log_blob_path(user_id, execution_id, "stderr.log")
    logs_path   = build_log_blob_path(user_id, execution_id, "logs.json")

    from django.core.serializers.json import DjangoJSONEncoder
    stdout_url = upload_log(stdout_path, stdout or "", content_type="text/plain")
    stderr_url = upload_log(stderr_path, stderr or "", content_type="text/plain")
    logs_url   = upload_log(logs_path, json.dumps(logs, cls=DjangoJSONEncoder, indent=2), content_type="application/json")

    return {
        "stdout_log_url": stdout_url,
        "stderr_log_url": stderr_url,
        "logs_url": logs_url,
    }


import datetime

def generate_signed_url(blob_path: str, expiration_minutes: int = 30) -> str:
    """
    Generate a V4 signed URL for a log blob.
    Note: Requires service account credentials with serviceaccounttokencreator role
    if signing for another service account.
    """
    if not blob_path:
        return ""
    try:
        bucket = _get_logs_bucket()
        blob = bucket.blob(blob_path)
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="GET",
        )
        return url
    except Exception as e:
        logger.error(f"Failed to generate signed URL for {blob_path}: {e}")
        return ""


def get_blob_path_from_url(url: str) -> str:
    """Extract the blob path from a standard GCS storage.googleapis.com URL."""
    if not url:
        return ""
    prefix = f"https://storage.googleapis.com/{LOGS_BUCKET_NAME}/"
    if url.startswith(prefix):
        return url[len(prefix):]
    return ""


def download_log(blob_path: str) -> str:
    """
    Download log content from GCS and return as a string.

    Raises:
        NotFound: if the blob does not exist.
        GoogleCloudError: on other download failures.
    """
    bucket = _get_logs_bucket()
    blob = bucket.blob(blob_path)
    content = blob.download_as_text(encoding="utf-8")
    logger.info(f"Downloaded log from GCS: {blob_path}")
    return content
