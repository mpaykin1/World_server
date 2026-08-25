@echo off
setlocal
cd /d "%~dp0\.."
node desktop\cpu-night-autopilot.cjs --force
endlocal
