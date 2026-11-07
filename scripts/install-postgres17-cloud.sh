#!/usr/bin/env bash
# Debian13 amd64 user-local PostgreSQL17.11. Never changes system/repo files.
# Packages and SHA256 values were verified against Debian's signed indexes.
# No database is initialized or started; LOCAL_FIXTURE tests own their clusters.
set -euo pipefail
umask 077

pg17_base=/workspace/.cache/world-server-pg17
pg17_version=17.11-0+deb13u1
pg17_server=postgresql-17_${pg17_version}_amd64.deb
pg17_client=postgresql-client-17_${pg17_version}_amd64.deb
pg17_server_sha=d2ce1ddffafa783f9acda4c92c86fc21e8288bff3782d739294f14fa797d7886
pg17_client_sha=9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae
pg17_config=$pg17_base/apt/apt.conf
pg17_packages=$pg17_base/packages
pg17_root=$pg17_base/root
pg17_bin=$pg17_root/usr/lib/postgresql/17/bin

for pg17_dependency in /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/dpkg-deb /usr/bin/dpkg /usr/bin/sha256sum; do
  test -x "$pg17_dependency" || { printf 'Required tool missing: %s\n' "$pg17_dependency" >&2; exit 1; }
done
command -v python3 >/dev/null || { printf 'python3 is required for archive/tree verification\n' >&2; exit 1; }
test "$(/usr/bin/dpkg --print-architecture)" = amd64 || { printf 'This verified recipe requires Debian13 amd64\n' >&2; exit 1; }
test -r /usr/share/keyrings/debian-archive-keyring.pgp || { printf 'Debian archive trust keyring is required\n' >&2; exit 1; }

mkdir -p "$pg17_base/apt/etc/apt.conf.d" "$pg17_base/apt/etc/sources.list.d" \
  "$pg17_base/apt/etc/preferences.d" "$pg17_base/apt/state/lists/partial" \
  "$pg17_base/apt/cache/archives/partial" "$pg17_packages" "$pg17_root"
cat > "$pg17_config" <<'EOF'
Dir::Etc "/workspace/.cache/world-server-pg17/apt/etc";
Dir::Etc::sourcelist "sources.list";
Dir::Etc::sourceparts "sources.list.d";
Dir::Etc::main "apt.conf";
Dir::Etc::parts "apt.conf.d";
Dir::State "/workspace/.cache/world-server-pg17/apt/state";
Dir::State::status "/var/lib/dpkg/status";
Dir::Cache "/workspace/.cache/world-server-pg17/apt/cache";
Dir::Log "/workspace/.cache/world-server-pg17/apt/log";
APT::Install-Recommends "false";
APT::Install-Suggests "false";
Acquire::Languages "none";
Acquire::Retries "2";
EOF
cat > "$pg17_base/apt/etc/sources.list" <<'EOF'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.pgp] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.pgp] https://deb.debian.org/debian-security trixie-security main
EOF

if ! test -f "$pg17_packages/$pg17_server" || ! test -f "$pg17_packages/$pg17_client"; then
  # /usr/bin bypasses the system wrapper that tries to edit global APT files.
  # APT_CONFIG isolates all state/config; signature, expiry, TLS and package
  # checksum verification retain their secure defaults.
  APT_CONFIG="$pg17_config" /usr/bin/apt-get update
  pg17_signed_server_sha=$(APT_CONFIG="$pg17_config" /usr/bin/apt-cache show "postgresql-17=$pg17_version" | awk '/^SHA256:/{print $2; exit}')
  pg17_signed_client_sha=$(APT_CONFIG="$pg17_config" /usr/bin/apt-cache show "postgresql-client-17=$pg17_version" | awk '/^SHA256:/{print $2; exit}')
  test "$pg17_signed_server_sha" = "$pg17_server_sha" && test "$pg17_signed_client_sha" = "$pg17_client_sha" || {
    printf 'Pinned package SHA256 differs from signed repository metadata; refusing install\n' >&2; exit 1;
  }
  pg17_incoming=$(mktemp -d "$pg17_base/incoming.XXXXXXXX")
  trap 'rm -rf -- "$pg17_incoming"' EXIT
  (
    cd "$pg17_incoming"
    APT_CONFIG="$pg17_config" /usr/bin/apt-get download "postgresql-17=$pg17_version" "postgresql-client-17=$pg17_version"
    printf '%s  %s\n%s  %s\n' "$pg17_server_sha" "$pg17_server" "$pg17_client_sha" "$pg17_client" | /usr/bin/sha256sum --check --strict
  )
  for pg17_package in "$pg17_server" "$pg17_client"; do
    if ! test -e "$pg17_packages/$pg17_package"; then mv "$pg17_incoming/$pg17_package" "$pg17_packages/$pg17_package"; fi
  done
  rm -rf -- "$pg17_incoming"
  trap - EXIT
fi
(
  cd "$pg17_packages"
  printf '%s  %s\n%s  %s\n' "$pg17_server_sha" "$pg17_server" "$pg17_client_sha" "$pg17_client" | /usr/bin/sha256sum --check --strict
)

# Derive SHA256 receipts from verified archive bytes, not an existing receipt or
# an executable's self-reported version. Verify every packaged regular file and
# symlink before deciding to reuse a toolchain. A repair extracts only packages
# already verified above. No service/package maintainer scripts are executed.
python3 - "$pg17_root" "$pg17_packages/$pg17_server" "$pg17_packages/$pg17_client" "$pg17_base/verified-files.json" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

root = Path(sys.argv[1])
packages = sys.argv[2:4]
receipt = Path(sys.argv[4])
expected = {}
for package in packages:
    child = subprocess.Popen(['/usr/bin/dpkg-deb', '--fsys-tarfile', package], stdout=subprocess.PIPE)
    with tarfile.open(fileobj=child.stdout, mode='r|') as archive:
        for member in archive:
            name = member.name.removeprefix('./')
            if not name or name == '.':
                continue
            if Path(name).is_absolute() or '..' in Path(name).parts:
                raise SystemExit('Unexpected unsafe package member')
            if member.isfile():
                digest = hashlib.sha256()
                stream = archive.extractfile(member)
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
                expected[name] = {'kind': 'file', 'sha256': digest.hexdigest()}
            elif member.issym():
                expected[name] = {'kind': 'symlink', 'target': member.linkname}
            elif not member.isdir():
                raise SystemExit('Unsupported package member type')
    if child.wait() != 0:
        raise SystemExit('Cannot inspect verified Debian package')

def valid_tree():
    for name, info in expected.items():
        installed = root / name
        if info['kind'] == 'symlink':
            if not installed.is_symlink() or os.readlink(installed) != info['target']:
                return False
        else:
            if installed.is_symlink() or not installed.is_file():
                return False
            digest = hashlib.sha256()
            with installed.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != info['sha256']:
                return False
    return True

reused = valid_tree()
if not reused:
    for package in packages:
        subprocess.run(['/usr/bin/dpkg-deb', '-x', package, str(root)], check=True)
    if not valid_tree():
        raise SystemExit('Extracted PostgreSQL files failed SHA256 verification')
with receipt.open('w') as stream:
    json.dump({'packages': [Path(p).name for p in packages], 'files': expected}, stream, sort_keys=True)
os.chmod(receipt, 0o600)
print(json.dumps({'toolchain': 'PostgreSQL 17.11', 'verified_packaged_files': len(expected), 'reused_verified_tree': reused}))
PY

for pg17_binary in psql pg_dump pg_restore initdb pg_ctl postgres; do
  pg17_observed=$("$pg17_bin/$pg17_binary" --version)
  case "$pg17_observed" in *'17.11 (Debian 17.11-0+deb13u1)'*) ;; *) printf 'Unexpected PostgreSQL binary version\n' >&2; exit 1 ;; esac
done
# Existing Debian13 runtime libraries must resolve without LD_LIBRARY_PATH.
if ldd "$pg17_bin/postgres" "$pg17_bin/psql" 2>&1 | grep -q 'not found'; then
  printf 'Required PostgreSQL runtime library missing\n' >&2; exit 1
fi
cat > "$pg17_base/env.sh" <<'EOF'
# Verified user-local PostgreSQL17.11. No database initialized or started.
export WORLD_SERVER_PG17_ROOT=/workspace/.cache/world-server-pg17/root
export WORLD_SERVER_PG17_BIN=/workspace/.cache/world-server-pg17/root/usr/lib/postgresql/17/bin
export WS_PG_BIN_DIR="$WORLD_SERVER_PG17_BIN"
case ":$PATH:" in *":$WORLD_SERVER_PG17_BIN:"*) ;; *) export PATH="$WORLD_SERVER_PG17_BIN:$PATH" ;; esac
EOF
printf 'Verified PostgreSQL17.11 ready; source %s/env.sh to activate. No database started.\n' "$pg17_base"
