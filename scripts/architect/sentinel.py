import logging
import subprocess
import sys
from pathlib import Path

# UTF-8 encoding support on Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

# ==============================================================================
# 🛡️ Antigravity Sentinel (v3.0.1)
# ==============================================================================
# This script monitors critical files for unauthorized changes and triggers
# automated security audits via the --doctor command.

CRITICAL_FILES = [".env", ".agent/rules/02_security.md", "scripts/architect/cli.py", "scripts/architect/sentinel.py"]


def run_audit() -> None:
    logging.info("🕵️ Sentinel: Triggering Security Audit...")
    try:
        cli_path = Path(__file__).resolve().parent / "cli.py"
        result = subprocess.run(
            [sys.executable, str(cli_path), "--doctor", ".", "--fix"],
            capture_output=True,
            text=True,
            encoding="utf-8"
        )
        print(result.stdout)
        if result.returncode == 0:
            logging.info("✅ Sentinel: Audit completed successfully.")
        else:
            logging.error(f"❌ Sentinel: Audit failed with exit code {result.returncode}")
    except Exception as e:
        logging.error(f"❌ Sentinel: Audit exception: {e}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    run_audit()
