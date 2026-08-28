@echo off
setlocal EnableExtensions
set "ROOT=C:\Users\user\Desktop\World_server"
set "SRC=%~dp0"

if not exist "%ROOT%\.git" (
  echo ERROR: World_server not found at %ROOT%
  exit /b 2
)

cd /d "%ROOT%"

git checkout -b opencode/lowfi-25d-server-scene 2>nul
if errorlevel 1 git checkout opencode/lowfi-25d-server-scene
if errorlevel 1 exit /b 3

if not exist "%ROOT%\apps\lowfi-25d" mkdir "%ROOT%\apps\lowfi-25d"
copy /Y "%SRC%apps\lowfi-25d\index.html" "%ROOT%\apps\lowfi-25d\index.html" >nul
copy /Y "%SRC%api\lowfi-25d-scene.js" "%ROOT%\api\lowfi-25d-scene.js" >nul

git add apps/lowfi-25d/index.html api/lowfi-25d-scene.js
git commit -m "feat(lowfi): server-driven procedural 2.5D scene"
git push -u origin opencode/lowfi-25d-server-scene

echo.
echo PATCH INSTALLED.
echo App path: /apps/lowfi-25d/
echo API path: /api/lowfi-25d-scene
echo Vercel/Git integration should create a preview deployment automatically.
endlocal
