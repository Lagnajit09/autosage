"""Vault-metadata tool — `list_vault_resources`.

Gives the LLM the inventory it needs to bind action nodes to real
Vault/Server/Credential UUIDs WITHOUT exposing any secret material.

Defense in depth:
  1. Django's CredentialSerializer marks secret fields as write_only.
  2. This wrapper additionally whitelists the fields each resource type
     can expose — if a future Django refactor drops write_only, the
     wrapper still won't leak.
  3. The system prompt tells the LLM never to invent UUIDs or embed
     secrets.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)


# Fields outside these whitelists are dropped before handing to the LLM.
_VAULT_FIELDS = ("id", "name", "description")
_SERVER_FIELDS = (
    "id", "name", "host", "port", "connection_method",
)
_CREDENTIAL_FIELDS = (
    "id", "name", "credential_type", "username",
)


def _pick(d: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: d.get(k) for k in keys}


def _django_error(status_code: int, body: Any, default: str) -> dict[str, Any]:
    msg = None
    if isinstance(body, dict):
        msg = body.get("message") or body.get("detail")
    return {"error": msg or f"{default} (HTTP {status_code})"}


async def _handler_list_vault_resources(
    args: dict[str, Any],
    jwt: str,
) -> dict[str, Any]:
    """Return the user's vaults with nested servers + credentials.

    Output is metadata only — no secret values.
    """
    client = get_django_client()
    try:
        s, body = await client.request(
            method="GET", path="/api/vault/vaults/", jwt=jwt,
        )
    except DjangoUnavailable as e:
        return {"error": f"Storage unreachable: {e}"}
    if s != 200:
        return _django_error(s, body, "Failed to list vault resources")

    raw_vaults = (body or {}).get("data") or []
    vaults_out: list[dict[str, Any]] = []
    for v in raw_vaults:
        if not isinstance(v, dict):
            continue
        servers_out = []
        for srv in v.get("servers") or []:
            if not isinstance(srv, dict):
                continue
            entry = _pick(srv, _SERVER_FIELDS)
            # Surface only the credential id; the LLM looks up the
            # credential from the credentials list at the same level.
            cred_details = srv.get("credential_details")
            if isinstance(cred_details, dict):
                entry["credential_id"] = cred_details.get("id")
            else:
                entry["credential_id"] = srv.get("credential")
            servers_out.append(entry)

        credentials_out = []
        for c in v.get("credentials") or []:
            if not isinstance(c, dict):
                continue
            credentials_out.append(_pick(c, _CREDENTIAL_FIELDS))

        vault_entry = _pick(v, _VAULT_FIELDS)
        vault_entry["servers"] = servers_out
        vault_entry["credentials"] = credentials_out
        vaults_out.append(vault_entry)

    return {"vaults": vaults_out}


register_tool(ToolDefinition(
    name="list_vault_resources",
    description=(
        "List the user's Vault inventory — every vault with its nested "
        "servers and credentials. Returns METADATA ONLY (ids, names, "
        "hosts, ports, connection_method, credential_type, username). "
        "Plaintext secrets (passwords, SSH keys, certificates) are "
        "NEVER returned — the LLM must reference credentials by id, "
        "never inline secret values. Use this tool to fetch the real "
        "UUIDs to bind to a workflow's action nodes (vaultDetails. "
        "vaultId / serverId / credentialId)."
    ),
    parameters_schema={
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
    handler=_handler_list_vault_resources,
))
