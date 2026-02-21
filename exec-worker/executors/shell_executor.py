"""
Shell Script Executor using Fabric.

Handles SSH-based execution of shell scripts on remote Linux servers.
Uses username/password authentication via Fabric's Connection.
"""

import logging
import io
from dataclasses import dataclass, field
from typing import Optional

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

    Usage:
        executor = ShellExecutor(
            host="192.168.1.10",
            username="deploy",
            password="secret",
            port=22,
        )
        result = executor.run(script_content)
    """

    DEFAULT_PORT = 22
    DEFAULT_TIMEOUT = 60  # seconds

    def __init__(
        self,
        host: str,
        username: str,
        password: str,
        port: int = DEFAULT_PORT,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.timeout = timeout

    def _build_connection(self) -> Connection:
        """Create a Fabric Connection with password auth."""
        return Connection(
            host=self.host,
            port=self.port,
            user=self.username,
            connect_kwargs={
                "password": self.password,
                "look_for_keys": False,
                "allow_agent": False,
            },
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
