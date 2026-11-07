#!/usr/bin/env python3
"""Antigravity Architect SBOM Generator script.

Generates CycloneDX-style SBOM for a project.
Usage:
    python scripts/architect/sbom.py [project_path]
"""
import os
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

from antigravity_architect.core.engine import AntigravityEngine
from antigravity_architect.core.governance import AntigravityGovernance

def main():
    args = sys.argv[1:]
    project_path = args[0] if args else "."
    resolved_path = Path(project_path).resolve()
    
    print(f"📦 Generating SBOM for: {resolved_path}")
    sbom = AntigravityGovernance.generate_sbom(str(resolved_path), resolved_path.name)
    output_dir = resolved_path / "docs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "SBOM.json"
    AntigravityEngine.write_file(str(output_file), sbom, exist_ok=True)
    print(f"✅ SBOM generated at: {output_file}")

if __name__ == "__main__":
    main()
