#!/usr/bin/env python3
"""
Pen Plotter deploy script.

Usage:
    py deploy.py        # deploy ./app to Cloudflare Pages

Cloud storage (projects / palettes) is served by the shared
`projects-dansemur` worker under the /penplotter path prefix. That worker
is NOT in this repo — its source lives in ../projects-dansemur-worker.

Auth: either run `npx wrangler login` once interactively, OR put
    CLOUDFLARE_API_TOKEN=<token>
in a `.env` file next to this script.
"""

from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "app"
PAGE_PROJECT = "penplotter"
ENV_FILE = ROOT / ".env"


def load_env_file() -> None:
    """Read KEY=value lines from .env into os.environ (without overriding
    anything already set in the shell)."""
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def deploy_page() -> int:
    """Publish ./app to Cloudflare Pages as the `penplotter` project."""
    if not APP_DIR.is_dir():
        print(f"ERROR: {APP_DIR} not found", file=sys.stderr)
        return 1
    cmd = [
        "npx", "wrangler", "pages", "deploy", str(APP_DIR),
        "--project-name", PAGE_PROJECT, "--commit-dirty=true",
    ]
    print(f"\n> {' '.join(cmd)}")
    return subprocess.call(cmd, cwd=ROOT, shell=(sys.platform == "win32"))


if __name__ == "__main__":
    load_env_file()
    sys.exit(deploy_page())
