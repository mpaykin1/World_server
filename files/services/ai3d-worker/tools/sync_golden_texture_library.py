from __future__ import annotations
import argparse, json, os, shutil, subprocess
from pathlib import Path

p=argparse.ArgumentParser(description='Sync Golden Texture Library using rclone when configured')
p.add_argument('--local', default=os.environ.get('TEXTURE_GOLDEN_LIBRARY_DIR'))
p.add_argument('--remote', default=os.environ.get('TEXTURE_GOLDEN_REMOTE'))
p.add_argument('--direction', choices=['push','pull'], default='push')
p.add_argument('--dry-run', action='store_true')
a=p.parse_args()
if not a.local or not a.remote:
    raise SystemExit('Both --local/TEXTURE_GOLDEN_LIBRARY_DIR and --remote/TEXTURE_GOLDEN_REMOTE are required')
rclone=shutil.which('rclone')
if not rclone:
    raise SystemExit('rclone is not installed; remote persistence remains unverified')
local=str(Path(a.local).expanduser())
source, target=(local, a.remote) if a.direction=='push' else (a.remote, local)
cmd=[rclone,'sync',source,target,'--checksum','--create-empty-src-dirs']
if a.dry_run: cmd.append('--dry-run')
proc=subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
print(json.dumps({'ok':proc.returncode==0,'direction':a.direction,'command':cmd,'logTail':proc.stdout[-4000:]}, ensure_ascii=False, indent=2))
raise SystemExit(proc.returncode)
