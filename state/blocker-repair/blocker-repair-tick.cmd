@echo off
cd /d "C:\Users\user\Desktop\World_server"
powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Desktop\World_server\state\blocker-repair\unified-tick.ps1" >> "C:\Users\user\Desktop\World_server\state\blocker-repair\scheduler.log" 2>&1

