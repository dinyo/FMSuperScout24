@echo off
title FMSuperScout 24
cd /d "%~dp0app"
start "" http://localhost:8766
node server.js
pause
