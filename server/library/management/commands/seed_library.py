"""
Seed the Library with starter scripts, pre-configured nodes, and workflows.

Idempotent: safe to run repeatedly. Shared "scripts-library" scripts are owned
by a dedicated system account (``autosage-library``) and uploaded to GCS with
``is_library=True`` so any user can fork/run them. Library workflows and nodes
reference those scripts by id (resolved at seed time).

Usage:
    python manage.py seed_library
    python manage.py seed_library --dry-run   # preview without touching GCS/DB
"""

import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from google.cloud.exceptions import GoogleCloudError

from library.models import LibraryItem
from scripts.gcs import build_blob_path, upload_script
from scripts.models import Script
from scripts.serializers import ScriptCreateSerializer

User = get_user_model()

SYSTEM_USERNAME = "autosage-library"

# Map a script language to the frontend's selectedScript.type label.
SCRIPT_TYPE_LABEL = {
    "powershell": "Powershell Script",
    "shell": "Shell Script",
    "bash": "Shell Script",
    "python": "Python Script",
}

# ── Shared library scripts ──────────────────────────────────────────────── #
# key -> definition. `key` is used to wire nodes/workflows to the real id.
SEED_SCRIPTS = {
    "system_health_check": {
        "name": "system_health_check",
        "language": "powershell",
        "category": "Monitoring",
        "description": "Reports CPU and memory utilisation as JSON.",
        "content": """# Reports basic system health as JSON.
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os  = Get-CimInstance Win32_OperatingSystem
$memUsed = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)
$result = @{ cpu_percent = $cpu; memory_percent = $memUsed; hostname = $env:COMPUTERNAME }
$result | ConvertTo-Json -Compress
""",
    },
    "disk_cleanup": {
        "name": "disk_cleanup",
        "language": "shell",
        "category": "Maintenance",
        "description": "Removes files older than N days from a target directory.",
        "content": """#!/usr/bin/env bash
# Removes files older than DAYS days from TARGET_DIR.
set -euo pipefail
TARGET_DIR="${TARGET_DIR:-/tmp}"
DAYS="${DAYS:-7}"
echo "Cleaning files older than ${DAYS} days in ${TARGET_DIR}"
find "$TARGET_DIR" -type f -mtime +"$DAYS" -print -delete
echo "Cleanup complete."
""",
    },
    "notify_webhook": {
        "name": "notify_webhook",
        "language": "python",
        "category": "Notifications",
        "description": "Posts a JSON message to a webhook URL.",
        "content": """#!/usr/bin/env python3
\"\"\"Post a message to a webhook URL.\"\"\"
import json
import os
import urllib.request

def main():
    url = os.environ.get("WEBHOOK_URL", "")
    message = os.environ.get("MESSAGE", "Hello from Autosage")
    if not url:
        print("WEBHOOK_URL not set; nothing to do.")
        return
    payload = json.dumps({"text": message}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"Webhook responded: {resp.status}")

if __name__ == "__main__":
    main()
""",
    },
}


def _pid():
    """Short stable-ish parameter id."""
    return str(uuid.uuid4())


class Command(BaseCommand):
    help = "Seed the Library with starter scripts, nodes, and workflows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be created without writing to GCS or the DB.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be made.\n"))
            self.stdout.write(f"Would ensure system user '{SYSTEM_USERNAME}'")
            self.stdout.write(f"Would seed {len(SEED_SCRIPTS)} shared scripts: "
                              f"{', '.join(SEED_SCRIPTS)}")
            self.stdout.write("Would seed 3 nodes and 2 workflows referencing them, "
                              "plus 3 script catalog entries.")
            return

        try:
            with transaction.atomic():
                system_user = self._ensure_system_user()
                script_ids = self._seed_scripts(system_user)
                self._seed_script_items(script_ids)
                self._seed_nodes(script_ids)
                self._seed_workflows(script_ids)
        except GoogleCloudError as e:
            self.stderr.write(self.style.ERROR(
                f"GCS upload failed — check GOOGLE_APPLICATION_CREDENTIALS. "
                f"No changes were committed. Error: {e}"
            ))
            return

        self.stdout.write(self.style.SUCCESS("\nLibrary seeded successfully."))

    # ------------------------------------------------------------------ #

    def _ensure_system_user(self):
        user, created = User.objects.get_or_create(
            username=SYSTEM_USERNAME,
            defaults={"is_active": True, "email": "library@autosage.local"},
        )
        verb = "Created" if created else "Found"
        self.stdout.write(f"{verb} system user '{SYSTEM_USERNAME}' (id={user.id})")
        return user

    def _seed_scripts(self, user):
        """Create/refresh shared library scripts. Returns {key: script_id}."""
        ids = {}
        for key, spec in SEED_SCRIPTS.items():
            lang = ScriptCreateSerializer.LANGUAGE_MAP[spec["language"]]
            ext, ctype = lang["ext"], lang["content_type"]
            filename = f"{spec['name']}.{ext}"
            pathname = f"scripts/{filename}"
            content_bytes = spec["content"].encode("utf-8")

            script, created = Script.objects.get_or_create(
                owner=user,
                pathname=pathname,
                defaults={
                    "name": filename,
                    "blob_url": "",
                    "download_url": "",
                    "content_type": ctype,
                    "file_size": len(content_bytes),
                    "version": 1,
                    "is_library": True,
                },
            )
            if not script.is_library:
                script.is_library = True

            # (Re)upload content so the blob always matches the seed definition.
            blob_path = build_blob_path(user.id, script.id, filename)
            gcs_url = upload_script(blob_path, content_bytes, ctype)
            script.blob_url = gcs_url
            script.download_url = gcs_url
            script.file_size = len(content_bytes)
            script.save()

            ids[key] = script.id
            verb = "Created" if created else "Updated"
            self.stdout.write(f"  {verb} script '{filename}' (id={script.id})")
        return ids

    def _seed_script_items(self, script_ids):
        """Catalog entries (type=script) so scripts are browsable/forkable."""
        for key, spec in SEED_SCRIPTS.items():
            self._upsert_item(
                item_type=LibraryItem.ItemType.SCRIPT,
                name=spec["name"],
                description=spec["description"],
                category=spec["category"],
                tags=[spec["language"], spec["category"].lower()],
                content={"script_id": script_ids[key]},
                is_verified=True,
            )

    def _seed_nodes(self, script_ids):
        """Pre-configured single-node building blocks (type=node)."""
        nodes = [
            {
                "name": "System Health Check",
                "description": "Action node that runs the system health-check script and emits JSON.",
                "category": "Monitoring",
                "tags": ["powershell", "monitoring"],
                "content": {
                    "nodeType": "action",
                    "data": self._script_action_data(
                        label="System Health Check",
                        language="powershell",
                        script_id=script_ids["system_health_check"],
                        output_format="json",
                        parameters=[],
                    ),
                },
            },
            {
                "name": "Disk Cleanup",
                "description": "Action node that deletes files older than N days in a directory.",
                "category": "Maintenance",
                "tags": ["shell", "maintenance"],
                "content": {
                    "nodeType": "action",
                    "data": self._script_action_data(
                        label="Disk Cleanup",
                        language="shell",
                        script_id=script_ids["disk_cleanup"],
                        parameters=[
                            {"id": _pid(), "name": "TARGET_DIR", "type": "string",
                             "value": "/tmp", "sourceType": "manual"},
                            {"id": _pid(), "name": "DAYS", "type": "number",
                             "value": "7", "sourceType": "manual"},
                        ],
                    ),
                },
            },
            {
                "name": "CPU Threshold Check",
                "description": "Decision node that branches when CPU usage exceeds a threshold.",
                "category": "Monitoring",
                "tags": ["decision", "monitoring"],
                "content": {
                    "nodeType": "decision",
                    "data": {
                        "label": "CPU > 80%",
                        "conditions": [{
                            "id": _pid(),
                            "field": "{{cpu_percent}}",
                            "fieldSource": "output",
                            "operator": ">",
                            "value": "80",
                            "valueSource": "manual",
                        }],
                        "combinator": "&&",
                        "trueLabel": [],
                        "falseLabel": [],
                    },
                },
            },
        ]
        for node in nodes:
            self._upsert_item(
                item_type=LibraryItem.ItemType.NODE,
                name=node["name"],
                description=node["description"],
                category=node["category"],
                tags=node["tags"],
                content=node["content"],
                is_verified=True,
            )

    def _seed_workflows(self, script_ids):
        """Full workflow templates (type=workflow)."""
        # 1) Server Health Monitor: manual -> health check -> decision -> notify
        health_wf = {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 80, "y": 200},
                 "data": {"type": "manual", "label": "Manual Trigger"}},
                {"id": "action-1", "type": "action", "position": {"x": 380, "y": 200},
                 "data": self._script_action_data(
                     label="System Health Check", language="powershell",
                     script_id=script_ids["system_health_check"], output_format="json",
                     parameters=[])},
                {"id": "decision-1", "type": "decision", "position": {"x": 700, "y": 200},
                 "data": {
                     "label": "CPU > 80%",
                     "conditions": [{
                         "id": _pid(), "field": "{{action-1.cpu_percent}}",
                         "fieldSource": "output", "operator": ">",
                         "value": "80", "valueSource": "manual",
                     }],
                     "combinator": "&&",
                     "trueLabel": ["action-2"],
                     "falseLabel": [],
                 }},
                {"id": "action-2", "type": "action", "position": {"x": 1020, "y": 120},
                 "data": self._script_action_data(
                     label="Notify Webhook", language="python",
                     script_id=script_ids["notify_webhook"],
                     parameters=[{"id": _pid(), "name": "MESSAGE", "type": "string",
                                  "value": "High CPU alert", "sourceType": "manual"}])},
            ],
            "edges": [
                {"id": "e-t1-a1", "source": "trigger-1", "target": "action-1", "type": "smoothstep"},
                {"id": "e-a1-d1", "source": "action-1", "target": "decision-1", "type": "smoothstep"},
                {"id": "e-d1-a2", "source": "decision-1", "target": "action-2",
                 "sourceHandle": "true", "type": "smoothstep"},
            ],
        }
        self._upsert_item(
            item_type=LibraryItem.ItemType.WORKFLOW,
            name="Server Health Monitor",
            description="Runs a health check and alerts a webhook when CPU exceeds 80%.",
            category="Monitoring",
            tags=["monitoring", "alerting"],
            content=health_wf,
            is_verified=True,
        )

        # 2) Nightly Disk Cleanup: schedule -> disk cleanup
        cleanup_wf = {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 80, "y": 180},
                 "data": {"type": "schedule", "label": "Daily at 2 AM",
                          "schedule": "0 2 * * *", "scheduleConfigured": True}},
                {"id": "action-1", "type": "action", "position": {"x": 400, "y": 180},
                 "data": self._script_action_data(
                     label="Disk Cleanup", language="shell",
                     script_id=script_ids["disk_cleanup"],
                     parameters=[
                         {"id": _pid(), "name": "TARGET_DIR", "type": "string",
                          "value": "/tmp", "sourceType": "manual"},
                         {"id": _pid(), "name": "DAYS", "type": "number",
                          "value": "7", "sourceType": "manual"},
                     ])},
            ],
            "edges": [
                {"id": "e-t1-a1", "source": "trigger-1", "target": "action-1", "type": "smoothstep"},
            ],
        }
        self._upsert_item(
            item_type=LibraryItem.ItemType.WORKFLOW,
            name="Nightly Disk Cleanup",
            description="Deletes files older than 7 days from a directory on a daily schedule.",
            category="Maintenance",
            tags=["maintenance", "scheduled"],
            content=cleanup_wf,
            is_verified=True,
        )

    # ------------------------------------------------------------------ #

    def _script_action_data(self, label, language, script_id, parameters,
                            output_format="text"):
        """Build a script action node's NodeData (no vault binding — user sets it)."""
        return {
            "type": "script",
            "label": label,
            "selectedScript": {
                "type": SCRIPT_TYPE_LABEL[language],
                "scriptId": str(script_id),
            },
            "executionMode": "remote",
            "outputFormat": output_format,
            "parameters": parameters,
        }

    def _upsert_item(self, item_type, name, description, category, tags,
                     content, is_verified):
        item, created = LibraryItem.objects.update_or_create(
            type=item_type,
            name=name,
            defaults={
                "description": description,
                "category": category,
                "tags": tags,
                "content": content,
                "is_verified": is_verified,
                "is_published": True,
            },
        )
        verb = "Created" if created else "Updated"
        self.stdout.write(f"  {verb} {item_type} item '{name}'")
        return item
