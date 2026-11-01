"""Celery tasks for the users app."""

from celery import shared_task


@shared_task(name="users.send_new_device_email", ignore_result=True, max_retries=0)
def send_new_device_email(api_key_id: str) -> None:
    """Email the user that SageCode was signed in on a new device."""
    from users.emails import send_new_device_email as send

    send(api_key_id)
