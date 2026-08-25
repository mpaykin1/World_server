@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>&1 || (
  echo Node.js not found.
  exit /b 2
)
node "%~dp0install-pwa-self-improve.cjs" %*
set CODE=%ERRORLEVEL%
if not "%CODE%"=="0" exit /b %CODE%
endlocal
