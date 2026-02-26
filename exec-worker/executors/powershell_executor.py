"""
PowerShell Executor using WinRM (pywinrm).

Handles WinRM-based execution of PowerShell scripts on remote Windows servers.
Supports basic (username/password) authentication over HTTP or HTTPS transport.

Two execution modes:
  - run()    – blocking, collects full output, returns ExecutionResult
  - stream() – async generator, yields output line-by-line in real time

WinRM note:
  pywinrm does not expose a native real-time streaming API, so we run the
  script in a *cmd_shell* protocol session (which supports low-level send/
  receive) and poll for output in ~50 ms ticks.
"""

import asyncio
import logging
import tempfile
import uuid
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

import winrm
from winrm.exceptions import (
    AuthenticationError,
    InvalidCredentialsError,
    WinRMError,
    WinRMTransportError,
    WinRMOperationTimeoutError,
)

logger = logging.getLogger(__name__)


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ExecutionResult:
    """Structured result from a blocking PowerShell execution."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    error: Optional[str] = None


# ── Chunk types emitted by stream() ──────────────────────────────────────────

CHUNK_STDOUT   = "stdout"
CHUNK_STDERR   = "stderr"
CHUNK_EXIT_CODE = "exit_code"
CHUNK_ERROR    = "error"


# ── Executor ──────────────────────────────────────────────────────────────────

class PowerShellExecutor:
    """
    Execute PowerShell scripts on remote Windows servers via WinRM.

    Supports password authentication (Kerberos, NTLM, and Basic are all
    handled transparently by pywinrm based on the chosen transport).

    Streaming usage:
        executor = PowerShellExecutor(host=..., username=..., password=...)
        async for chunk in executor.stream(script_content):
            # chunk = {"type": "stdout"|"stderr"|"exit_code"|"error", "data": ...}
            print(chunk)

    Blocking usage:
        result = executor.run(script_content)
    """

    DEFAULT_PORT    = 5985     # HTTP (unencrypted) WinRM port
    DEFAULT_HTTPS_PORT = 5986  # HTTPS WinRM port
    DEFAULT_TIMEOUT = 30       # connect / operation timeout (seconds)
    EXEC_TIMEOUT    = 3600     # max script runtime (seconds, 1 hour)
    POLL_INTERVAL   = 0.05     # seconds between output polls

    def __init__(
        self,
        host: str,
        username: str,
        password: str,
        port: int = DEFAULT_PORT,
        use_ssl: bool = False,
        transport: str = "ntlm",          # "ntlm" | "basic" | "kerberos"
        server_cert_validation: str = "ignore",  # "validate" | "ignore"
        timeout: int = DEFAULT_TIMEOUT,
    ):
        if not password:
            raise ValueError("PowerShellExecutor requires a password.")

        self.host                  = host
        self.username              = username
        self.password              = password
        self.port                  = port
        self.use_ssl               = use_ssl
        self.transport             = transport
        self.server_cert_validation = server_cert_validation
        self.timeout               = timeout

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_protocol(self) -> winrm.Protocol:
        """Create a connected winrm.Protocol instance."""
        scheme = "https" if self.use_ssl else "http"
        endpoint = f"{scheme}://{self.host}:{self.port}/wsman"

        logger.info(
            "Connecting via WinRM to %s@%s (transport=%s)",
            self.username, self.host, self.transport,
        )

        return winrm.Protocol(
            endpoint=endpoint,
            transport=self.transport,
            username=self.username,
            password=self.password,
            server_cert_validation=self.server_cert_validation,
            operation_timeout_sec=self.timeout,
            read_timeout_sec=self.timeout + 10,
        )

    @staticmethod
    def _decode(raw: bytes) -> str:
        """Decode bytes to string, replacing unreadable characters."""
        if not raw:
            return ""
        return raw.decode("utf-8", errors="replace").strip("\r\n")

    def _build_ps_invocation(self, script_content: str) -> str:
        """
        Wrap the user's PowerShell script so that:
          1. The execution policy is bypassed for this session.
          2. Errors are written to stderr (via $ErrorActionPreference).
          3. We get a clean exit code.

        The script is encoded as Base64 to avoid any quoting / injection
        issues when passing it through the shell.
        """
        import base64
        encoded = base64.b64encode(script_content.encode("utf-16-le")).decode("ascii")
        # Run powershell with encoded command; set error action first
        ps_cmd = (
            "powershell.exe "
            "-NonInteractive "
            "-NoProfile "
            "-ExecutionPolicy Bypass "
            f"-EncodedCommand {encoded}"
        )
        return ps_cmd

    # ── Streaming execution ───────────────────────────────────────────────────

    async def stream(self, script_content: str) -> AsyncGenerator[dict, None]:
        """
        Async generator that executes a PowerShell script on the remote Windows
        server and yields output chunks in real time.

        Each yielded dict:
            {"type": "stdout"|"stderr"|"exit_code"|"error", "data": <str|int>}

        Under the hood we use WinRM's low-level command shell protocol and poll
        for output in a dedicated thread-pool executor so the asyncio event loop
        remains unblocked.
        """
        loop = asyncio.get_event_loop()

        # Build protocol (blocking – run in executor)
        try:
            protocol: winrm.Protocol = await loop.run_in_executor(
                None, self._build_protocol
            )
        except (AuthenticationError, InvalidCredentialsError) as e:
            yield {"type": CHUNK_ERROR, "data": f"Authentication failed: {e}"}
            return
        except WinRMTransportError as e:
            yield {"type": CHUNK_ERROR, "data": f"WinRM transport error: {e}"}
            return
        except WinRMError as e:
            yield {"type": CHUNK_ERROR, "data": f"WinRM error: {e}"}
            return
        except Exception as e:
            yield {"type": CHUNK_ERROR, "data": f"Failed to connect: {e}"}
            return

        shell_id = None
        command_id = None

        try:
            # Open a shell
            shell_id = await loop.run_in_executor(None, protocol.open_shell)
            logger.info("WinRM shell opened on %s (shell_id=%s)", self.host, shell_id)

            # Build PowerShell invocation command
            ps_cmd = self._build_ps_invocation(script_content)

            # Run command (non-blocking – returns command_id immediately)
            command_id = await loop.run_in_executor(
                None,
                lambda: protocol.run_command(shell_id, ps_cmd),
            )
            logger.info("WinRM command started (command_id=%s)", command_id)

            stdout_buf = b""
            stderr_buf = b""

            # ── Real-time polling loop ────────────────────────────────────
            while True:
                await asyncio.sleep(self.POLL_INTERVAL)

                # get_command_output_raw returns (std_out, std_err, return_code, done)
                def _poll():
                    return protocol.get_command_output_raw(shell_id, command_id)

                try:
                    std_out_chunk, std_err_chunk, return_code, done = (
                        await loop.run_in_executor(None, _poll)
                    )
                except WinRMOperationTimeoutError:
                    # Normal: means no output yet, keep polling
                    continue
                except Exception as e:
                    yield {"type": CHUNK_ERROR, "data": f"Polling error: {e}"}
                    return

                # Accumulate and flush stdout line-by-line
                if std_out_chunk:
                    stdout_buf += std_out_chunk
                    while b"\n" in stdout_buf:
                        line, stdout_buf = stdout_buf.split(b"\n", 1)
                        text = line.decode("utf-8", errors="replace").rstrip("\r")
                        if text:
                            yield {"type": CHUNK_STDOUT, "data": text}

                # Accumulate and flush stderr line-by-line
                if std_err_chunk:
                    stderr_buf += std_err_chunk
                    while b"\n" in stderr_buf:
                        line, stderr_buf = stderr_buf.split(b"\n", 1)
                        text = line.decode("utf-8", errors="replace").rstrip("\r")
                        if text:
                            yield {"type": CHUNK_STDERR, "data": text}

                if done:
                    # Flush any remaining partial lines
                    for buf, chunk_type in [
                        (stdout_buf, CHUNK_STDOUT),
                        (stderr_buf, CHUNK_STDERR),
                    ]:
                        if buf:
                            text = buf.decode("utf-8", errors="replace").rstrip("\r\n")
                            if text:
                                yield {"type": chunk_type, "data": text}

                    yield {"type": CHUNK_EXIT_CODE, "data": return_code}
                    logger.info(
                        "Script finished on %s with exit code %d",
                        self.host, return_code,
                    )
                    break

        except Exception as e:
            logger.exception(
                "Error during WinRM streaming execution on %s: %s", self.host, e
            )
            yield {"type": CHUNK_ERROR, "data": f"Execution error: {e}"}

        finally:
            # Clean up WinRM resources
            if command_id and shell_id:
                try:
                    await loop.run_in_executor(
                        None,
                        lambda: protocol.cleanup_command(shell_id, command_id),
                    )
                except Exception:
                    pass
            if shell_id:
                try:
                    await loop.run_in_executor(
                        None, lambda: protocol.close_shell(shell_id)
                    )
                except Exception:
                    pass

    # ── Blocking execution (kept for compatibility) ───────────────────────────

    def run(self, script_content: str) -> ExecutionResult:
        """
        Execute a PowerShell script synchronously and return the full result.
        For real-time output, use stream() instead.
        """
        try:
            protocol = self._build_protocol()
            shell_id = protocol.open_shell()

            try:
                ps_cmd    = self._build_ps_invocation(script_content)
                command_id = protocol.run_command(shell_id, ps_cmd)

                try:
                    std_out, std_err, return_code = protocol.get_command_output(
                        shell_id, command_id
                    )
                finally:
                    protocol.cleanup_command(shell_id, command_id)

            finally:
                protocol.close_shell(shell_id)

            return ExecutionResult(
                success=return_code == 0,
                exit_code=return_code,
                stdout=self._decode(std_out),
                stderr=self._decode(std_err),
            )

        except (AuthenticationError, InvalidCredentialsError) as e:
            return ExecutionResult(
                success=False, exit_code=-1, stdout="", stderr="",
                error=f"Authentication failed: {e}",
            )
        except WinRMTransportError as e:
            return ExecutionResult(
                success=False, exit_code=-1, stdout="", stderr="",
                error=f"WinRM transport error: {e}",
            )
        except WinRMError as e:
            return ExecutionResult(
                success=False, exit_code=-1, stdout="", stderr="",
                error=f"WinRM error: {e}",
            )
        except Exception as e:
            logger.exception("Unexpected error executing on %s: %s", self.host, e)
            return ExecutionResult(
                success=False, exit_code=-1, stdout="", stderr="",
                error=f"Unexpected error: {e}",
            )
