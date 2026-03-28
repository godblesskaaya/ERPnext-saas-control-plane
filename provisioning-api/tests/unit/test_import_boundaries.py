from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_import_boundary_guard_passes() -> None:
    project_root = Path(__file__).resolve().parents[2]
    script = project_root / "tools" / "check_import_boundaries.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )

    output = (result.stdout or "") + (result.stderr or "")
    assert result.returncode == 0, output
    assert "Import boundary check passed" in output
