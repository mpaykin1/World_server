from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def remove_path(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def main() -> int:
    p = argparse.ArgumentParser(description='Restore a World Server texture pipeline backup created by V10 installer')
    p.add_argument('--repo', required=True)
    p.add_argument('--backup', required=True, help='Exact .texture-pipeline-backup/v10-* directory')
    a = p.parse_args()
    repo = Path(a.repo).expanduser().resolve()
    backup = Path(a.backup).expanduser().resolve()
    allowed_root = (repo / '.texture-pipeline-backup').resolve()
    if allowed_root != backup.parent and allowed_root not in backup.parents:
        raise SystemExit('Refusing backup outside repo/.texture-pipeline-backup')
    manifest_path = backup / 'rollback-manifest.json'
    if not manifest_path.is_file():
        raise SystemExit('rollback-manifest.json not found in requested backup')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries = manifest.get('entries') or []
    if not entries:
        raise SystemExit('Rollback manifest has no entries')
    restored = 0
    removed = 0
    for entry in entries:
        rel = Path(str(entry['path']))
        target = (repo / rel).resolve()
        if repo != target and repo not in target.parents:
            raise SystemExit(f'Unsafe target outside repo: {target}')
        saved = backup / rel
        remove_path(target)
        if entry.get('existedBefore'):
            if not saved.exists():
                raise SystemExit(f'Backup is incomplete: {saved}')
            target.parent.mkdir(parents=True, exist_ok=True)
            if saved.is_dir():
                shutil.copytree(saved, target)
            else:
                shutil.copy2(saved, target)
            restored += 1
        else:
            removed += 1
    print(json.dumps({'ok': True, 'backup': str(backup), 'restoredExistingPaths': restored, 'removedPatchOnlyPaths': removed}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
