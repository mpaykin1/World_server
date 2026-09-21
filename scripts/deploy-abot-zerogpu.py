#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import secrets
from pathlib import Path

from huggingface_hub import HfApi


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy World Server ABot-Recon to free Hugging Face ZeroGPU")
    parser.add_argument("--repo-id", help="username/world-server-abot-recon; defaults to authenticated username")
    parser.add_argument("--source-dir", default="deploy/huggingface/abot-recon-zero-gpu")
    args = parser.parse_args()

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise SystemExit("HF_TOKEN is required. Create a Hugging Face write token and export it before running.")
    api = HfApi(token=token)
    who = api.whoami()
    username = str(who.get("name") or "").strip()
    if not username:
        raise SystemExit("Could not resolve Hugging Face username from HF_TOKEN.")
    repo_id = args.repo_id or f"{username}/world-server-abot-recon"
    worker_secret = os.environ.get("ABOT_RECON_ZEROGPU_SECRET", "").strip() or secrets.token_urlsafe(36)

    api.create_repo(
        repo_id=repo_id,
        repo_type="space",
        space_sdk="gradio",
        space_hardware="zero-a10g",
        private=False,
        exist_ok=True,
    )
    api.add_space_secret(repo_id=repo_id, key="ABOT_WORKER_SECRET", value=worker_secret)
    api.upload_folder(
        repo_id=repo_id,
        repo_type="space",
        folder_path=str(Path(args.source_dir).resolve()),
        commit_message="Deploy World Server ABot-Recon ZeroGPU worker",
    )
    subdomain = repo_id.replace("/", "-")
    print(f"ABOT_RECON_ZEROGPU_URL=https://{subdomain}.hf.space")
    print(f"ABOT_RECON_ZEROGPU_SECRET={worker_secret}")
    print("Store both values only in server/worker secrets; never commit the secret.")


if __name__ == "__main__":
    main()
