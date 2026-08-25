$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
node .\install-world-quality-autopilot.cjs --verify-full
if ($LASTEXITCODE -ne 0) { throw "World Quality Autopilot installer failed with code $LASTEXITCODE" }
