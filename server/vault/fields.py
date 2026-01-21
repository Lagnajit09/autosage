from django.db import models
from django.conf import settings
from cryptography.fernet import Fernet
import base64
import hashlib

def get_fernet():
    key = settings.VAULT_ENCRYPTION_KEY
    if not key:
        raise ValueError("VAULT_ENCRYPTION_KEY is not set")
    # Derive a 32-byte url-safe base64 encoded key
    k = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
    return Fernet(k)

class EncryptedFieldMixin:
    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None:
            return None
        f = get_fernet()
        return f.encrypt(str(value).encode()).decode()

    def from_db_value(self, value, expression, connection):
        if value is None:
            return None
        f = get_fernet()
        try:
            return f.decrypt(value.encode()).decode()
        except Exception:
            return value

class EncryptedCharField(EncryptedFieldMixin, models.CharField):
    pass

class EncryptedTextField(EncryptedFieldMixin, models.TextField):
    pass
