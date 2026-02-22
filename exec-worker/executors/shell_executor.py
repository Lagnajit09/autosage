"""
Shell Script Executor using Fabric / Paramiko.

Handles SSH-based execution of shell scripts on remote Linux servers.
Supports both password and SSH private key authentication.

Two execution modes:
  - run()    – blocking, collects full output, returns ExecutionResult
  - stream() – async generator, yields output line-by-line in real time
"""

import asyncio
import io
import logging
import select
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

import paramiko
from paramiko.ssh_exception import (
    AuthenticationException,
    NoValidConnectionsError,
    SSHException,
)

logger = logging.getLogger(__name__)


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ExecutionResult:
    """Structured result from a blocking script execution."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    error: Optional[str] = None


# ── Chunk types emitted by stream() ──────────────────────────────────────────

CHUNK_STDOUT = "stdout"
CHUNK_STDERR = "stderr"
CHUNK_EXIT_CODE = "exit_code"
CHUNK_ERROR = "error"


# ── Executor ──────────────────────────────────────────────────────────────────

class ShellExecutor:
    """
    Execute shell scripts on remote Linux servers over SSH using Paramiko.

    Supports two authentication modes:
      - Password auth:  provide `password`
      - SSH key auth:   provide `ssh_key` (private key as a string)

    Streaming usage:
        executor = ShellExecutor(host=..., username=..., password=...)
        async for chunk in executor.stream(script_content):
            # chunk = {"type": "stdout"|"stderr"|"exit_code"|"error", "data": ...}
            print(chunk)

    Blocking usage:
        result = executor.run(script_content)
    """

    DEFAULT_PORT = 22
    DEFAULT_TIMEOUT = 30        # SSH connect timeout (seconds)
    EXEC_TIMEOUT = 3600         # max script runtime (seconds, 1 hour)
    READ_CHUNK = 4096           # bytes per channel read

    def __init__(
        self,
        host: str,
        username: str,
        password: Optional[str] = None,
        ssh_key: Optional[str] = None,
        key_passphrase: Optional[str] = None,
        port: int = DEFAULT_PORT,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        if not password and not ssh_key:
            raise ValueError("Either password or ssh_key must be provided.")

        self.host = host
        self.username = username
        self.password = password
        self.ssh_key = ssh_key
        self.key_passphrase = key_passphrase
        self.port = port
        self.timeout = timeout

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _load_pkey(key_str: str, passphrase: Optional[str] = None) -> paramiko.PKey:
        """
        Load a private key from a raw string.
        Tries Ed25519, RSA, and ECDSA key formats.
        """
        key_file = io.StringIO(key_str)
        key_classes = [paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey]

        for cls in key_classes:
            try:
                key_file.seek(0)
                return cls.from_private_key(key_file, password=passphrase)
            except (paramiko.SSHException, ValueError):
                continue

        raise ValueError(
            "Unable to parse private key. Supported formats: Ed25519, RSA, ECDSA."
        )

    def _build_client(self) -> paramiko.SSHClient:
        """Create and connect a raw Paramiko SSHClient."""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        connect_kwargs: dict = {
            "hostname": self.host,
            "port": self.port,
            "username": self.username,
            "timeout": self.timeout,
            "look_for_keys": False,
            "allow_agent": False,
        }

        if self.ssh_key:
            connect_kwargs["pkey"] = self._load_pkey(self.ssh_key, self.key_passphrase)
            logger.info("Using SSH key authentication for %s@%s", self.username, self.host)
        else:
            connect_kwargs["password"] = self.password
            logger.info("Using password authentication for %s@%s", self.username, self.host)

        client.connect(**connect_kwargs)
        return client

    # ── Streaming execution ───────────────────────────────────────────────────

    async def stream(self, script_content: str) -> AsyncGenerator[dict, None]:
        """
        Async generator that executes a shell script on the remote server and
        yields output chunks in real time as the script runs.

        Each yielded dict has:
            {"type": "stdout"|"stderr"|"exit_code"|"error", "data": <str|int>}

        The SSH channel is polled in a thread-pool executor so it doesn't block
        the asyncio event loop.
        """
        loop = asyncio.get_event_loop()

        try:
            # Connect (blocking I/O offloaded to thread pool)
            client = await loop.run_in_executor(None, self._build_client)
        except AuthenticationException as e:
            yield {"type": CHUNK_ERROR, "data": f"Authentication failed: {e}"}
            return
        except NoValidConnectionsError as e:
            yield {"type": CHUNK_ERROR, "data": f"Connection refused: {e}"}
            return
        except SSHException as e:
            yield {"type": CHUNK_ERROR, "data": f"SSH error: {e}"}
            return
        except Exception as e:
            yield {"type": CHUNK_ERROR, "data": f"Failed to connect: {e}"}
            return

        remote_path = "/tmp/_exec_worker_script.sh"

        try:
            # ── Upload script ─────────────────────────────────────────────
            sftp = await loop.run_in_executor(None, client.open_sftp)
            try:
                await loop.run_in_executor(
                    None,
                    lambda: sftp.putfo(
                        io.BytesIO(script_content.encode("utf-8")),
                        remote_path,
                    ),
                )
            finally:
                await loop.run_in_executor(None, sftp.close)

            logger.info("Uploaded script to %s on %s", remote_path, self.host)

            # ── Open exec channel ─────────────────────────────────────────
            transport = client.get_transport()
            channel = transport.open_session()
            channel.set_combine_stderr(False)          # Keep stderr separate
            channel.exec_command(f"bash {remote_path}")

            stdout_buf = b""
            stderr_buf = b""

            # ── Real-time read loop ───────────────────────────────────────
            #
            # We poll the channel every ~50 ms.  When data arrives on stdout
            # or stderr we decode it line-by-line and yield immediately.
            # Partial lines (no trailing \n yet) are held in a buffer until
            # the next chunk arrives or the channel closes.

            while True:
                # Yield control to the event loop briefly
                await asyncio.sleep(0.05)

                # Check for data (non-blocking via select with 0 timeout)
                readable = await loop.run_in_executor(
                    None, lambda: select.select([channel], [], [], 0)[0]
                )

                if readable:
                    # Read stdout
                    if channel.recv_ready():
                        raw = await loop.run_in_executor(
                            None, lambda: channel.recv(self.READ_CHUNK)
                        )
                        stdout_buf += raw
                        # Flush complete lines immediately
                        while b"\n" in stdout_buf:
                            line, stdout_buf = stdout_buf.split(b"\n", 1)
                            text = line.decode("utf-8", errors="replace").rstrip("\r")
                            if text:
                                yield {"type": CHUNK_STDOUT, "data": text}

                    # Read stderr
                    if channel.recv_stderr_ready():
                        raw = await loop.run_in_executor(
                            None, lambda: channel.recv_stderr(self.READ_CHUNK)
                        )
                        stderr_buf += raw
                        while b"\n" in stderr_buf:
                            line, stderr_buf = stderr_buf.split(b"\n", 1)
                            text = line.decode("utf-8", errors="replace").rstrip("\r")
                            if text:
                                yield {"type": CHUNK_STDERR, "data": text}

                # Check if channel is done
                if channel.exit_status_ready():
                    # Drain any remaining buffered data
                    while channel.recv_ready():
                        raw = await loop.run_in_executor(
                            None, lambda: channel.recv(self.READ_CHUNK)
                        )
                        stdout_buf += raw

                    while channel.recv_stderr_ready():
                        raw = await loop.run_in_executor(
                            None, lambda: channel.recv_stderr(self.READ_CHUNK)
                        )
                        stderr_buf += raw

                    # Flush remaining partial lines (no trailing newline)
                    for buf, chunk_type in [
                        (stdout_buf, CHUNK_STDOUT),
                        (stderr_buf, CHUNK_STDERR),
                    ]:
                        if buf:
                            text = buf.decode("utf-8", errors="replace").rstrip("\r\n")
                            if text:
                                yield {"type": chunk_type, "data": text}

                    exit_code = channel.recv_exit_status()
                    yield {"type": CHUNK_EXIT_CODE, "data": exit_code}
                    logger.info(
                        "Script finished on %s with exit code %d", self.host, exit_code
                    )
                    break

        except Exception as e:
            logger.exception("Error during streaming execution on %s: %s", self.host, e)
            yield {"type": CHUNK_ERROR, "data": f"Execution error: {e}"}

        finally:
            # Clean up remote temp file and close connection
            try:
                _, _, _ = client.exec_command(f"rm -f {remote_path}")
            except Exception:
                pass
            try:
                client.close()
            except Exception:
                pass

    # ── Blocking execution (kept for compatibility) ───────────────────────────

    def run(self, script_content: str) -> ExecutionResult:
        """
        Execute a shell script synchronously and return the full result.
        For real-time output, use stream() instead.
        """
        remote_path = "/tmp/_exec_worker_script.sh"

        try:
            client = self._build_client()
            logger.info("Connecting to %s@%s:%d", self.username, self.host, self.port)

            # Upload script
            sftp = client.open_sftp()
            try:
                sftp.putfo(io.BytesIO(script_content.encode("utf-8")), remote_path)
            finally:
                sftp.close()

            logger.info("Uploaded script to %s", remote_path)

            # Execute
            stdin, stdout, stderr = client.exec_command(f"bash {remote_path}")
            stdout_text = stdout.read().decode("utf-8", errors="replace")
            stderr_text = stderr.read().decode("utf-8", errors="replace")
            exit_code = stdout.channel.recv_exit_status()

            return ExecutionResult(
                success=exit_code == 0,
                exit_code=exit_code,
                stdout=stdout_text,
                stderr=stderr_text,
            )

        except AuthenticationException as e:
            return ExecutionResult(success=False, exit_code=-1, stdout="", stderr="",
                                   error=f"Authentication failed: {e}")
        except NoValidConnectionsError as e:
            return ExecutionResult(success=False, exit_code=-1, stdout="", stderr="",
                                   error=f"Connection refused: {e}")
        except SSHException as e:
            return ExecutionResult(success=False, exit_code=-1, stdout="", stderr="",
                                   error=f"SSH error: {e}")
        except Exception as e:
            logger.exception("Unexpected error executing on %s: %s", self.host, e)
            return ExecutionResult(success=False, exit_code=-1, stdout="", stderr="",
                                   error=f"Unexpected error: {e}")
        finally:
            try:
                client.exec_command(f"rm -f {remote_path}")
                client.close()
            except Exception:
                pass
