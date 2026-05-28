"""Vault-metadata tool (T15) — `list_vault_resources`.

This tool gives the LLM the inventory it needs to bind workflow action
nodes to real Vault / Server / Credential UUIDs — WITHOUT exposing any
secret material. The LLM should never see plaintext passwords, SSH
private keys, key passphrases, or certificate bodies. The platform's
`CredentialRevealView` is the only sanctioned way to reveal a secret,
and Autobot does NOT call it from the LLM-driven path (T17 will read
plaintext only for the LLM API key, after explicit user opt-in).

Defense in depth:

  1. Django's CredentialSerializer marks `password`, `ssh_key`,
     `key_passphrase`, and `cert_pem` as `write_only` — they are never
     serialized in responses. So a one-call pass-through would already
     be safe.
  2. We layer a SECOND check here: explicitly whitelist the fields
     each resource type exposes. If a future Django refactor
     accidentally drops `write_only` from a secret field, this wrapper
     still won't leak it.
  3. The system prompt also tells the LLM "never invent UUIDs; never
     embed secrets". Defense at three layers, any of which catches a
     leak.

Endpoint shape: `GET /api/vault/vaults/` returns a list of vaults each
with nested `servers` and `credentials` arrays — one Django round-trip
covers everything the LLM needs.
"""

from __future__ import annotations

import logging
from typing import Any

from conversation.persistence import DjangoUnavailable, get_django_client
from llm.tools import ToolDefinition, register_tool

logger = logging.getLogger(__name__)


# Allowed fields per resource type. Anything outside these whitelists
# is dropped before handing the result to the LLM.
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

    Output shape (every field is non-secret metadata):
      {
        "vaults": [
          {
            "id": "<uuid>",
            "name": "Production",
            "description": "...",
            "servers": [
              {
                "id": "<uuid>",
                "name": "prod-web-01",
                "host": "192.168.1.10",
                "port": 22,
                "connection_method": "ssh",
                "credential_id": "<uuid>"  // null if unlinked
              }
            ],
            "credentials": [
              {
                "id": "<uuid>",
                "name": "Prod SSH Key",
                "credential_type": "ssh_key",
                "username": null
              }
            ]
          }
        ]
      }
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
            # Server nests credential as `credential_details` (full
            # object) or just `credential` (id). Surface only the id —
            # the LLM looks the credential up by id in the credentials
            # list at the same level.
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
