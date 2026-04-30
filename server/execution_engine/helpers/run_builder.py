"""Builds and enqueues a WorkflowRun, decoupled from the HTTP layer.

Shared by the manual trigger view (``trigger_workflow_run``) and the public
HTTP trigger view (``trigger_workflow_via_http``). On validation failure the
helper raises :class:`RunBuildError`; the caller maps the error to an HTTP
response (the messages here are returned verbatim to clients to preserve
existing API contracts).
"""
from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth import get_user_model

from execution_engine.helpers.graph import (
    NODE_TYPE_ACTION,
    build_dag,
    topological_order,
    validate_executable_nodes,
)
from execution_engine.models import WorkflowNodeRun, WorkflowRun
from execution_engine.tasks import execute_workflow
from scripts.models import Script
from vault.models import Credential, Server, Vault
from workflows.models import Workflow

logger = logging.getLogger(__name__)
User = get_user_model()


class RunBuildError(Exception):
    """Validation failure while preparing a workflow run."""

    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


def enqueue_workflow_run(
    *,
    workflow: Workflow,
    user,
    inputs: dict[str, Any] | None = None,
    send_email: bool = False,
    user_email: str = "",
) -> WorkflowRun:
    """Validate the workflow, persist a WorkflowRun + WorkflowNodeRuns, and
    dispatch the Celery executor task. Returns the persisted run.

    The ``user`` argument is the run's owner. For manual triggers it's the
    caller; for HTTP triggers it's the workflow's owner.
    """
    inputs = inputs or {}

    try:
        G = build_dag(workflow.nodes, workflow.edges)
        topo_order = topological_order(G)
    except ValueError as exc:
        raise RunBuildError(
            code="graph",
            message="Workflow graph validation failed.",
            detail=str(exc),
        ) from exc

    missing = validate_executable_nodes(workflow.nodes)
    if missing:
        raise RunBuildError(
            code="missing_bindings",
            message=f"Missing script or credential bindings in nodes: {missing}",
        )

    for node in workflow.nodes:
        if node.get("type") != NODE_TYPE_ACTION:
            continue
        data = node.get("data", {})
        action_type = data.get("type")

        if action_type == "script":
            script_id = (data.get("selectedScript") or {}).get("scriptId")
            vd = data.get("vaultDetails") or {}
            vault_id = vd.get("vaultId")
            server_id = vd.get("serverId")
            credential_id = vd.get("credentialId")

            try:
                if not Script.objects.filter(id=script_id, owner=user).exists():
                    raise ValueError(
                        f"Script ID {script_id} not found or access denied for node {node.get('id')}"
                    )
                if not Vault.objects.filter(id=vault_id, owner=user).exists():
                    raise ValueError(
                        f"Vault ID {vault_id} not found or access denied for node {node.get('id')}"
                    )
                if not Server.objects.filter(id=server_id, vault_id=vault_id).exists():
                    raise ValueError(
                        f"Server ID {server_id} not found in vault {vault_id}"
                    )
                if not Credential.objects.filter(id=credential_id, vault_id=vault_id).exists():
                    raise ValueError(
                        f"Credential ID {credential_id} not found in vault {vault_id}"
                    )
            except (ValueError, Exception) as exc:
                logger.error("Validation error for workflow %s: %s", workflow.id, exc)
                raise RunBuildError(
                    code="invalid_action",
                    message="One or more script or credential bindings are invalid or inaccessible.",
                    detail=str(exc),
                ) from exc

        elif action_type == "email":
            smtp = data.get("smtpConfig") or {}
            vault_id = smtp.get("vaultId")
            credential_id = smtp.get("credentialId")

            try:
                if not smtp.get("host") or not str(smtp.get("host")).strip():
                    raise ValueError(f"SMTP host missing for email node {node.get('id')}")
                port = smtp.get("port")
                if not isinstance(port, int) or port <= 0 or port > 65535:
                    raise ValueError(f"SMTP port invalid for email node {node.get('id')}")
                if not data.get("subject") or not str(data.get("subject")).strip():
                    raise ValueError(f"Email subject missing for node {node.get('id')}")
                recipients = [r for r in (data.get("to") or []) if r and str(r).strip()]
                if not recipients:
                    raise ValueError(
                        f"At least one 'to' recipient required for email node {node.get('id')}"
                    )
                if not Vault.objects.filter(id=vault_id, owner=user).exists():
                    raise ValueError(
                        f"Vault ID {vault_id} not found or access denied for email node {node.get('id')}"
                    )
                if not Credential.objects.filter(
                    id=credential_id,
                    vault_id=vault_id,
                    credential_type="username_password",
                ).exists():
                    raise ValueError(
                        f"SMTP credential ID {credential_id} not found in vault {vault_id} "
                        f"for email node {node.get('id')}"
                    )
            except (ValueError, Exception) as exc:
                logger.error(
                    "Email node validation error for workflow %s: %s", workflow.id, exc
                )
                raise RunBuildError(
                    code="invalid_email",
                    message=f"Invalid email node configuration: {exc}",
                ) from exc

    # Mask password parameters before persisting
    masked_inputs = dict(inputs)
    password_param_ids: set[str] = set()
    for node in workflow.nodes:
        for p in (node.get("data", {}).get("parameters") or []):
            if p.get("type") == "password":
                pid = p.get("id")
                if pid:
                    password_param_ids.add(pid)
    for pid in password_param_ids:
        if pid in masked_inputs and masked_inputs[pid]:
            masked_inputs[pid] = "*****"

    # Defense-in-depth: scrub plaintext SMTP credential payloads from any
    # email node before logging/queueing. Mirrors trigger_workflow_run.
    for node in workflow.nodes:
        smtp_cfg = node.get("data", {}).get("smtpConfig")
        if isinstance(smtp_cfg, dict):
            smtp_cfg.pop("selectedCredential", None)
            smtp_cfg.pop("password", None)
            smtp_cfg.pop("username", None)

    workflow_run = WorkflowRun.objects.create(
        workflow=workflow,
        user=user,
        status="queued",
        inputs=masked_inputs,
        send_email=send_email,
        notification_email=user_email if send_email else "",
    )

    execution_order = 0
    for node_id in topo_order:
        node_data = G.nodes[node_id]

        script_id = None
        vault_id = None
        server_id = None
        credential_id = None

        if node_data.get("type") == NODE_TYPE_ACTION:
            data_dict = node_data.get("data", {})
            action_type = data_dict.get("type")

            if action_type == "script":
                script_id_raw = (data_dict.get("selectedScript") or {}).get("scriptId")
                if script_id_raw:
                    try:
                        script_id = int(script_id_raw)
                    except (ValueError, TypeError):
                        script_id = None
                vd = data_dict.get("vaultDetails") or {}
                vault_id = vd.get("vaultId")
                server_id = vd.get("serverId")
                credential_id = vd.get("credentialId")

            elif action_type == "email":
                smtp = data_dict.get("smtpConfig") or {}
                vault_id = smtp.get("vaultId")
                credential_id = smtp.get("credentialId")

        WorkflowNodeRun.objects.create(
            workflow_run=workflow_run,
            node_id=node_id,
            node_label=node_data.get("data", {}).get("label", node_id),
            script_id=script_id,
            vault_id=vault_id,
            server_id=server_id,
            credential_id=credential_id,
            status="pending",
            execution_order=execution_order,
        )
        execution_order += 1

    task = execute_workflow.delay(str(workflow_run.id), raw_inputs=inputs)
    workflow_run.celery_task_id = task.id
    workflow_run.save(update_fields=["celery_task_id"])

    return workflow_run
