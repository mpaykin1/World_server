$ErrorActionPreference = 'Stop'
function Has($name) { return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }
Write-Host '== Pixel Panorama 360 V4 bootstrap =='
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'winget is required for automatic bootstrap' }
if (-not (Has 'ffmpeg')) { winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent }
if (-not (Has 'magick')) { winget install --id ImageMagick.ImageMagick --accept-source-agreements --accept-package-agreements --silent }
if (Has 'py') { py -m pip install --upgrade pillow numpy requests }
elseif (Has 'python') { python -m pip install --upgrade pillow numpy requests }
if ((-not (Has 'oxipng')) -and (Has 'cargo')) { cargo install oxipng --locked }
Write-Host 'Run npm install from World_server root to install sharp/libvips.'
node scripts/pixel-panorama-360-tools-verify.cjs
