@echo off
setlocal EnableExtensions
set "ROOT=C:\Users\user\Desktop\World_server"
set "PKG=%~dp0"
set "WORK=%TEMP%\World_server_pqv10"
if not exist "%ROOT%\.git" (echo ERROR: World_server not found & exit /b 2)
cd /d "%ROOT%"
git fetch origin
if exist "%WORK%" rmdir /S /Q "%WORK%"
git worktree add -b opencode/procedural-quality-v10 "%WORK%" origin/master
if errorlevel 1 exit /b 3
node "%PKG%scripts\install-into-repo.js" "%WORK%" || exit /b 4
cd /d "%WORK%"
call npm install || exit /b 5
call npm run procedural:vision:build || exit /b 6
call npm run procedural:models || exit /b 7
call npm run procedural:models:verify || exit /b 8
call npm run procedural:three-patch || exit /b 9
call npm run procedural:inject || exit /b 10
call npm run procedural:doctor || exit /b 11
call npm run procedural:check || exit /b 12
call npm run release:gate || exit /b 13
call npm run procedural:evidence || exit /b 14
git add -A
git commit -m "feat(procedural-quality): V10 temporal pacing thermal replay canary"
git push -u origin opencode/procedural-quality-v10 || exit /b 15
echo V10 BRANCH PUSHED. WAIT FOR VERCEL PREVIEW THEN RUN VERIFY_AFTER_INSTALL.bat URL
endlocal
