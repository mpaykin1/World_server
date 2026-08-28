@echo off
cd /d "C:\Users\user\Desktop\World_server"
powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command "& 'C:\Program Files\nodejs\node.exe' 'C:\Users\user\Desktop\World_server\scripts\desktop-ai-session-recovery.cjs' watchdog >> 'C:\Users\user\Desktop\World_server\state\session-recovery\watchdog.log' 2>&1"
