#!/usr/bin/env python3
"""
Pen Plotter deploy script — Python version.

Usage:
    py deploy.py            # deploy app to Cloudflare Pages (default)
    py deploy.py page       # same as no args
    py deploy.py worker     # deploy the cloud worker
    py deploy.py both       # page + worker
    py deploy.py secret     # set the worker's API_KEY secret (interactive)

Auth: either run `npx wrangler login` once interactively, OR put
    CLOUDFLARE_API_TOKEN=<token>
in a `.env` file next to this script. Token from
https://dash.cloudflare.com/profile/api-tokens (use the "Edit Cloudflare
Workers" template — that scope covers Pages + Workers + R2).
"""

from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "app"
CLOUD_DIR = ROOT / "cloud"
PAGE_PROJECT = "penplotter"
ENV_FILE = ROOT / ".env"


def load_env_file() -> None:
    """Read KEY=value lines from .env into os.environ (without overriding
    anything that's already set in the shell). Quoted values and blank /
    commented lines are handled."""
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


def run(cmd: list[str], cwd: Path | None = None) -> int:
    """Run a command, streaming output. Returns the exit code."""
    # ASCII-only — Windows consoles default to cp1252 which rejects "→".
    print(f"\n> {' '.join(cmd)}{f'   ({cwd})' if cwd else ''}")
    return subprocess.call(cmd, cwd=cwd, shell=(sys.platform == "win32"))


def deploy_page() -> int:
    """Publish ./app to Cloudflare Pages as the `penplotter` project."""
    if not APP_DIR.is_dir():
        print(f"ERROR: {APP_DIR} not found", file=sys.stderr)
        return 1
    return run([
        "npx", "wrangler", "pages", "deploy",
        str(APP_DIR),
        "--project-name", PAGE_PROJECT,
        "--commit-dirty=true",
    ], cwd=ROOT)


def deploy_worker() -> int:
    """Deploy the cloud worker from ./cloud."""
    if not (CLOUD_DIR / "wrangler.toml").is_file():
        print(f"ERROR: {CLOUD_DIR}/wrangler.toml not found", file=sys.stderr)
        return 1
    return run(["npx", "wrangler", "deploy"], cwd=CLOUD_DIR)


def set_secret() -> int:
    """Set the worker's API_KEY secret (wrangler will prompt for the value)."""
    return run(["npx", "wrangler", "secret", "put", "API_KEY"], cwd=CLOUD_DIR)


def main() -> int:
    load_env_file()
    target = (sys.argv[1] if len(sys.argv) > 1 else "page").lower()
    if target == "page":
        return deploy_page()
    if target == "worker":
        return deploy_worker()
    if target == "both":
        rc = deploy_page()
        return rc or deploy_worker()
    if target == "secret":
        return set_secret()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
