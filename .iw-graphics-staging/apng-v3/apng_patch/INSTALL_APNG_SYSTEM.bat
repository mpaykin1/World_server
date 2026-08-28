@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_APNG_SYSTEM.ps1" -RepoPath "C:\Users\user\Desktop\World_server"
if errorlevel 1 (
  echo.
  echo APNG V3 INSTALL FAILED. No unsafe master overwrite was performed. See the error above.
  pause
  exit /b 1
)
echo.
echo APNG V3 INSTALL + VERIFY PASS.
pause
