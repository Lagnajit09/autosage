import json
import uuid
from django.http import JsonResponse
from rest_framework.request import Request as DRFRequest


class RunTargetError(Exception):
    """A script-run target (vault/server/credential/script) was not found or
    is not owned by the caller. Carries an HTTP-ish status so both the
    streaming and async views can map it to the same response.
    """

    def __init__(self, message: str, status_code: int = 404):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def resolve_run_targets(user, validated_data: dict):
    """Resolve + ownership-check the vault/server/credential/script for a
    one-shot script run. Shared by the streaming ``execute_script`` view and
    the fire-and-forget ``run_script_async`` task so the two paths can never
    drift on authorization.

    Synchronous (plain ORM) — async callers wrap it in ``sync_to_async``.
    Returns ``(script, vault, server, credential, inputs)``. Raises
    :class:`RunTargetError` on any missing / cross-owner reference.
    """
    # Local imports keep this module importable from both sync and async
    # contexts without pulling models at module load.
    from vault.models import Vault, Server, Credential
    from scripts.models import Script

    script_details = validated_data["script_details"]
    vault_details = validated_data["vault_details"]
    # Convert UUIDs in inputs to strings to avoid JSON serialization errors
    # downstream (DB JSONField + worker payload).
    inputs = uuid_to_str(validated_data)

    try:
        vault = Vault.objects.get(id=vault_details["vault_id"], owner=user)
    except Vault.DoesNotExist:
        raise RunTargetError("Vault not found or access denied.")

    try:
        server = Server.objects.get(id=vault_details["server_id"], vault=vault)
    except Server.DoesNotExist:
        raise RunTargetError("Server not found in vault.")

    try:
        credential = Credential.objects.get(id=vault_details["credential_id"], vault=vault)
    except Credential.DoesNotExist:
        raise RunTargetError("Credential not found in vault.")

    try:
        script = Script.objects.get(id=script_details["script_id"], owner=user)
    except Script.DoesNotExist:
        raise RunTargetError("Script not found or access denied.")

    return script, vault, server, credential, inputs


def build_worker_payload(execution_id, script, server, credential, inputs: dict) -> dict:
    """Build the exec-worker request payload for a one-shot script run.
    Shared by the streaming view and the async task so the worker contract
    stays single-sourced.
    """
    server_host = server.host.strip()
    if server_host.startswith(('http://', 'https://')):
        server_host = server_host.split('://', 1)[1]

    return {
        "execution_id": str(execution_id),
        "script": {
            "id": str(script.id),
            "name": script.name,
            "pathname": script.pathname,
            "blob_url": script.blob_url,
        },
        "server": {
            "id": str(server.id),
            "host": server_host,
            "port": server.port or 22,
            "connection_method": server.connection_method,
            "os_type": "windows" if server.connection_method == "winrm" else "linux",
            "winrm_port": server.port or 5985,
            "winrm_use_ssl": False,
            "winrm_transport": "ntlm",
        },
        "credentials": {
            "username": credential.username or "",
            "password": credential.password or "",
            "ssh_key": credential.ssh_key or "",
            "key_passphrase": credential.key_passphrase or "",
        },
        "inputs": inputs,
    }


def json_response(success: bool, message: str, data=None, errors=None, status_code: int = 200) -> JsonResponse:
    """Async-safe replacement for api_response() that returns JsonResponse."""
    return JsonResponse(
        {"success": success, "message": message, "data": data, "errors": errors},
        status=status_code,
    )

def sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event frame."""
    from django.core.serializers.json import DjangoJSONEncoder
    return f"event: {event}\ndata: {json.dumps(data, cls=DjangoJSONEncoder)}\n\n"

def uuid_to_str(data):
    """Recursively convert UUID objects to strings."""
    if isinstance(data, dict):
        return {k: uuid_to_str(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [uuid_to_str(v) for v in data]
    elif isinstance(data, uuid.UUID):
        return str(data)
    return data

def check_throttle(request, throttle_class):
    """
    Run a DRF throttle against the raw Django request.
    Returns True when the request is allowed.
    """
    throttle = throttle_class()
    # DRF throttles need a DRF Request wrapper; we build a minimal one.
    drf_request = DRFRequest(request)
    drf_request._user = request.user
    return throttle.allow_request(drf_request, None)
