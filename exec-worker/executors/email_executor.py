"""
EmailExecutor — async SMTP sender for the Email action node.

Streams NDJSON-shaped chunks back to the FastAPI route so the Django
orchestrator can publish them as workflow log events:

    {"type": "email_queued",  "data": "..."}
    {"type": "email_sending", "data": "..."}
    {"type": "email_sent",    "data": "..."}
    {"type": "email_error",   "data": "..."}
    {"type": "exit_code",     "data": 0|1}

The user-provided body is rendered into the Autosage HTML template via the
``{{ email_body }}`` variable. A plain-text alternative is built from the raw
body so non-HTML clients still receive the message.
"""

from __future__ import annotations

import asyncio
import logging
import re
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from typing import AsyncGenerator, Optional

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

# ── Template loader (cached at import time) ───────────────────────────────────
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "htm"]),
    keep_trailing_newline=True,
)

DEFAULT_BODY_HTML = (
    '<p style="margin:0;">This message was sent automatically by an Autosage '
    'workflow.</p>'
)
DEFAULT_BODY_TEXT = "This message was sent automatically by an Autosage workflow."


def _body_to_html(raw: str) -> str:
    """
    Convert the user's body to safe-ish HTML.

    The user input is escaped by Jinja's autoescape when fed through a
    template, but here we want to preserve paragraph and line breaks. We
    escape first, then convert blank-line-separated chunks to <p> elements
    and single newlines to <br>.
    """
    if not raw or not raw.strip():
        return DEFAULT_BODY_HTML

    from html import escape

    escaped = escape(raw.strip())
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", escaped) if p.strip()]
    return "".join(
        f'<p style="margin:0 0 12px 0;">{p.replace(chr(10), "<br/>")}</p>'
        for p in paragraphs
    )


def _body_to_text(raw: str) -> str:
    if not raw or not raw.strip():
        return DEFAULT_BODY_TEXT
    return raw.strip()


class EmailExecutor:
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        secure: bool,
        sender: str,
        to: list[str],
        cc: Optional[list[str]] = None,
        bcc: Optional[list[str]] = None,
        subject: str = "",
        body: str = "",
        workflow_run_id: Optional[str] = None,
        node_label: Optional[str] = None,
        attached_outputs: Optional[list[dict]] = None,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.secure = secure  # True → SMTPS (465); False → STARTTLS on submission ports
        self.sender = sender or username
        self.to = to or []
        self.cc = cc or []
        self.bcc = bcc or []
        self.subject = "|AUTOSAGE| " + (subject or "Email Node Execution Details")
        self.body = body or ""
        self.workflow_run_id = workflow_run_id or ""
        self.node_label = node_label or ""
        # List of {"name": str, "value": str} to render in a codeblock under the body.
        self.attached_outputs = [
            {"name": str(item.get("name", "")), "value": str(item.get("value", ""))}
            for item in (attached_outputs or [])
            if item and item.get("name")
        ]

    def _plain_outputs_block(self) -> str:
        """Build a plain-text appendix of attached outputs, or empty string."""
        if not self.attached_outputs:
            return ""
        lines = ["", "─" * 32, "Outputs:"]
        for item in self.attached_outputs:
            lines.append("")
            lines.append(f"{item['name']}:")
            lines.append(item["value"])
        return "\n".join(lines)

    def _build_message(self) -> EmailMessage:
        msg = EmailMessage()
        msg["Subject"] = self.subject
        msg["From"] = formataddr(("Autosage", self.sender)) if self.sender else self.username
        msg["To"] = ", ".join(self.to)
        if self.cc:
            msg["Cc"] = ", ".join(self.cc)
        # Note: Bcc is intentionally NOT added as a header; aiosmtplib uses
        # the recipients argument for envelope delivery.
        msg["Message-ID"] = make_msgid(domain="autosage.local")

        plain = _body_to_text(self.body) + self._plain_outputs_block()
        msg.set_content(plain)

        template = _jinja_env.get_template("node_execution_details.html")
        rendered_html = template.render(
            subject=self.subject,
            email_body=_body_to_html(self.body),
            workflow_run_id=self.workflow_run_id,
            node_label=self.node_label,
            attached_outputs=self.attached_outputs,
        )
        msg.add_alternative(rendered_html, subtype="html")
        return msg

    async def stream(
        self,
        stop_event: Optional[asyncio.Event] = None,
    ) -> AsyncGenerator[dict, None]:
        recipients = list[str](self.to) + list[str](self.cc) + list[str](self.bcc)

        if not recipients:
            yield {"type": "email_error", "data": "No recipients provided."}
            yield {"type": "exit_code", "data": 1}
            return

        try:
            msg = self._build_message()
        except Exception as exc:
            logger.exception("Failed to build email message")
            yield {"type": "email_error", "data": f"Message build failed: {exc}"}
            yield {"type": "exit_code", "data": 1}
            return

        yield {
            "type": "email_queued",
            "data": (
                f"Queued email to {len(self.to)} to / {len(self.cc)} cc / "
                f"{len(self.bcc)} bcc via {self.host}:{self.port}"
            ),
        }

        if stop_event is not None and stop_event.is_set():
            yield {"type": "email_error", "data": "Cancelled before send."}
            yield {"type": "exit_code", "data": 1}
            return

        try:
            yield {
                "type": "email_sending",
                "data": f"Connecting to SMTP server {self.host}:{self.port}",
            }

            if self.secure:
                # Implicit TLS (SMTPS)
                smtp = aiosmtplib.SMTP(
                    hostname=self.host,
                    port=self.port,
                    use_tls=True,
                    timeout=30,
                )
                await smtp.connect()
            else:
                # Plain connect, then upgrade with STARTTLS where supported
                smtp = aiosmtplib.SMTP(
                    hostname=self.host,
                    port=self.port,
                    use_tls=False,
                    timeout=30,
                )
                await smtp.connect()
                try:
                    await smtp.starttls()
                except aiosmtplib.SMTPException:
                    # Server does not support STARTTLS — proceed unencrypted.
                    # In production, callers should prefer secure=True.
                    pass

            try:
                await smtp.login(self.username, self.password)
                yield {"type": "email_sending", "data": "Authenticated, sending message"}

                await smtp.send_message(msg, recipients=recipients)
                yield {
                    "type": "email_sent",
                    "data": f"Delivered to {len(recipients)} recipient(s)",
                }
                yield {"type": "exit_code", "data": 0}
            finally:
                try:
                    await smtp.quit()
                except Exception:
                    pass

        except aiosmtplib.SMTPAuthenticationError as exc:
            yield {"type": "email_error", "data": f"SMTP authentication failed: {exc}"}
            yield {"type": "exit_code", "data": 1}
        except aiosmtplib.SMTPException as exc:
            yield {"type": "email_error", "data": f"SMTP error: {exc}"}
            yield {"type": "exit_code", "data": 1}
        except asyncio.TimeoutError:
            yield {"type": "email_error", "data": "SMTP timeout."}
            yield {"type": "exit_code", "data": 1}
        except Exception as exc:
            logger.exception("Unexpected error during email send")
            yield {"type": "email_error", "data": f"Unexpected error: {exc}"}
            yield {"type": "exit_code", "data": 1}
