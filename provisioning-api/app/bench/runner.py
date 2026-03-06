from __future__ import annotations

import subprocess
from dataclasses import dataclass

from app.config import get_settings


settings = get_settings()


@dataclass
class BenchResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str


class BenchCommandError(RuntimeError):
    def __init__(self, result: BenchResult):
        super().__init__(f"Bench command failed: {' '.join(result.command)}")
        self.result = result


def run_bench_command(command: list[str]) -> BenchResult:
    if settings.bench_exec_mode == "mock":
        return BenchResult(command=command, returncode=0, stdout="MOCK_OK", stderr="")

    proc = subprocess.run(
        command,
        capture_output=True,
        text=True,
        cwd=settings.bench_workdir,
        timeout=settings.bench_timeout_seconds,
        check=False,
    )
    result = BenchResult(command=command, returncode=proc.returncode, stdout=proc.stdout, stderr=proc.stderr)
    if proc.returncode != 0:
        raise BenchCommandError(result)
    return result
