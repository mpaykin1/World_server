@echo off
setlocal EnableExtensions
if "%~1"=="" (echo Usage: VERIFY_AFTER_INSTALL.bat https://preview.vercel.app & exit /b 2)
set "URL=%~1"
set "ROOT=%TEMP%\World_server_pqv10"
cd /d "%ROOT%"
call npm run procedural:doctor || exit /b 3
call npm run procedural:native-audit || exit /b 4
call npm run procedural:golden:record -- "%URL%" "apps/procedural-quality-lab,apps/ai3d-voxel-city,apps/procedural-quality-certification" || exit /b 5
call npm run procedural:golden:verify || exit /b 6
node scripts/procedural-quality-device-certification.js "%URL%"
node scripts/procedural-quality-production-verify.js "%URL%" || exit /b 7
call npm run procedural:check || exit /b 8
call npm run procedural:evidence || exit /b 9
call npm run procedural:canary || exit /b 10
echo PREVIEW PASS. Open /apps/procedural-quality-certification/ on real devices. Production canary stays blocked until device + golden evidence exist.
endlocal
