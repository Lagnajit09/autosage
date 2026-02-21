"""
Shell Script Executor using Fabric.

Handles SSH-based execution of shell scripts on remote Linux servers.
Supports both password and SSH private key authentication.
"""

import logging
import io
from dataclasses import dataclass, field
from typing import Optional

import paramiko

from fabric import Connection
from invoke.exceptions import UnexpectedExit
from paramiko.ssh_exception import (
    AuthenticationException,
    NoValidConnectionsError,
    SSHException,
)

logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    """Structured result from a script execution."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    error: Optional[str] = None


class ShellExecutor:
    """
    Execute shell scripts on remote Linux servers over SSH using Fabric.

    Supports two authentication modes:
      - Password auth:  provide `password`
      - SSH key auth:   provide `ssh_key` (private key as a string)

    Usage (password):
        executor = ShellExecutor(
            host="192.168.1.10",
            username="deploy",
            password="secret",
        )
        result = executor.run(script_content)

    Usage (SSH key):
        executor = ShellExecutor(
            host="192.168.1.10",
            username="deploy",
            ssh_key="-----BEGIN OPENSSH PRIVATE KEY-----\n...",
        )
        result = executor.run(script_content)
    """

    DEFAULT_PORT = 22
    DEFAULT_TIMEOUT = 60  # seconds

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

    @staticmethod
    def _load_pkey(key_str: str, passphrase: Optional[str] = None) -> paramiko.PKey:
        """
        Load a private key from a raw string.
        Tries OpenSSH, RSA, Ed25519, and ECDSA key formats.
        """
        key_file = io.StringIO(key_str)
        key_classes = [
            paramiko.Ed25519Key,
            paramiko.RSAKey,
            paramiko.ECDSAKey,
        ]

        for cls in key_classes:
            try:
                key_file.seek(0)
                return cls.from_private_key(key_file, password=passphrase)
            except (paramiko.SSHException, ValueError):
                continue

        raise ValueError(
            "Unable to parse private key. Supported formats: Ed25519, RSA, ECDSA."
        )

    def _build_connection(self) -> Connection:
        """Create a Fabric Connection with password or SSH key auth."""
        connect_kwargs = {
            "look_for_keys": False,
            "allow_agent": False,
        }

        if self.ssh_key:
            pkey = self._load_pkey(self.ssh_key, self.key_passphrase)
            connect_kwargs["pkey"] = pkey
            logger.info("Using SSH key authentication")
        else:
            connect_kwargs["password"] = self.password
            logger.info("Using password authentication")

        return Connection(
            host=self.host,
            port=self.port,
            user=self.username,
            connect_kwargs=connect_kwargs,
            connect_timeout=self.timeout,
        )

    def run(self, script_content: str) -> ExecutionResult:
        """
        Execute a shell script on the remote server.

        Steps:
          1. Open SSH connection.
          2. Upload script content to a temp file on the remote host.
          3. Make it executable and run it via bash.
          4. Capture stdout, stderr, and exit code.
          5. Clean up the temp file.

        Args:
            script_content: The raw shell script text to execute.

        Returns:
            ExecutionResult with stdout, stderr, exit_code, and success flag.
        """
        remote_script_path = "/tmp/exec_worker_script.sh"
        conn = self._build_connection()

        try:
            logger.info(
                "Connecting to %s@%s:%d", self.username, self.host, self.port
            )
            conn.open()

            # Upload script content as a file
            script_bytes = io.BytesIO(script_content.encode("utf-8"))
            conn.put(script_bytes, remote=remote_script_path)
            logger.info("Uploaded script to %s", remote_script_path)

            # Make executable & run
            conn.run(f"chmod +x {remote_script_path}", hide=True)
            result = conn.run(
                f"bash {remote_script_path}",
                hide=True,
                warn=True,  # Don't raise on non-zero exit
                timeout=self.timeout,
            )

            return ExecutionResult(
                success=result.exited == 0,
                exit_code=result.exited,
                stdout=result.stdout,
                stderr=result.stderr,
            )

        except AuthenticationException as e:
            logger.error("Authentication failed for %s@%s: %s", self.username, self.host, e)
            return ExecutionResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr="",
                error=f"Authentication failed: {str(e)}",
            )

        except NoValidConnectionsError as e:
            logger.error("Cannot connect to %s:%d: %s", self.host, self.port, e)
            return ExecutionResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr="",
                error=f"Connection refused: {str(e)}",
            )

        except SSHException as e:
            logger.error("SSH error on %s: %s", self.host, e)
            return ExecutionResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr="",
                error=f"SSH error: {str(e)}",
            )

        except UnexpectedExit as e:
            logger.error("Unexpected exit on %s: %s", self.host, e)
            return ExecutionResult(
                success=False,
                exit_code=e.result.exited if e.result else -1,
                stdout=e.result.stdout if e.result else "",
                stderr=e.result.stderr if e.result else "",
                error=f"Script exited unexpectedly: {str(e)}",
            )

        except Exception as e:
            logger.error("Unexpected error executing on %s: %s", self.host, e)
            return ExecutionResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr="",
                error=f"Unexpected error: {str(e)}",
            )

        finally:
            # Clean up remote temp file
            try:
                conn.run(f"rm -f {remote_script_path}", hide=True, warn=True)
            except Exception:
                pass
            conn.close()
