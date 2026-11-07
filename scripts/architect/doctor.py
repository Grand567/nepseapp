#!/usr/bin/env python3
"""Antigravity Architect Doctor script.

Validates the integrity of an Antigravity project structure.
Usage:
    python scripts/architect/doctor.py [project_path] [--fix]
"""
import sys
from pathlib import Path

# Force UTF-8 output on Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

# Add architect directory to path
architect_dir = Path(__file__).resolve().parent
if str(architect_dir) not in sys.path:
    sys.path.insert(0, str(architect_dir))

from antigravity_architect.cli import doctor_project

def main():
    args = sys.argv[1:]
    fix = "--fix" in args
    filtered_args = [a for a in args if a != "--fix"]
    project_path = filtered_args[0] if filtered_args else "."
    
    success = doctor_project(project_path, fix=fix)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
