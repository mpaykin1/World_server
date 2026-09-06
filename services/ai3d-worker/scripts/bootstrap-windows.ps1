param([string]$ExternalRoot = "$env:USERPROFILE\Desktop\3дгенерация")
$ErrorActionPreference = "Stop"
$Worker = Split-Path $PSScriptRoot -Parent
Set-Location $Worker

function Find-Repo([string]$Name) {
  $p = Join-Path $ExternalRoot $Name
  if (Test-Path $p) { return (Resolve-Path $p).Path }
  return ""
}
function Find-Blender {
  $cmd = Get-Command blender -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $roots = Get-ChildItem "C:\Program Files\Blender Foundation" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach ($r in $roots) { $exe = Join-Path $r.FullName "blender.exe"; if (Test-Path $exe) { return $exe } }
  return "blender"
}

if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

$depth = Find-Repo "Depth-Anything-V2"
if ($depth) {
  & ".\.venv\Scripts\python.exe" -m pip install torch torchvision opencv-python-headless
}

$secretBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$secret = [Convert]::ToBase64String($secretBytes).Replace('+','-').Replace('/','_').TrimEnd('=')
$building = Find-Repo "BuildingGeneratorThreeJS"
$procgen = Find-Repo "bene-proggen-maps"
$trellis = Find-Repo "TRELLIS.2"
$blender = Find-Blender
@"
AI3D_SHARED_SECRET=$secret
AI3D_ALLOWED_ORIGINS=*
AI3D_MAX_UPLOAD_MB=25
AI3D_MAX_WORKERS=1
AI3D_RUNTIME_DIR=$Worker\runtime
AI3D_MODEL_DIR=$Worker\runtime\models
DEPTH_ANYTHING_HOME=$depth
BUILDING_GENERATOR_HOME=$building
PROCGEN_MAPS_HOME=$procgen
TRELLIS2_HOME=$trellis
BLENDER_BIN=$blender
"@ | Set-Content ".env" -Encoding UTF8

Write-Host "AI3D worker configured."
Write-Host "Depth path: $depth"
Write-Host "Building path: $building"
Write-Host "Procgen path: $procgen"
Write-Host "TRELLIS.2 path: $trellis"
Write-Host "NOTE: upstream TRELLIS.2 is Linux-only and requires NVIDIA GPU with 24GB+ VRAM. Use the Linux GPU worker for image-to-3D."
Write-Host "Start local worker: .\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8787"
