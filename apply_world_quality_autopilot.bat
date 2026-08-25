@echo off
setlocal
cd /d "%~dp0"
node install-world-quality-autopilot.cjs --verify-full
if errorlevel 1 (
  echo.
  echo WORLD QUALITY AUTOPILOT INSTALL FAILED. See errors above.
  pause
  exit /b 1
)
echo.
echo WORLD QUALITY AUTOPILOT PATCH APPLIED AND VERIFIED.
pause
