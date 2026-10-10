@echo off
title Build FMSuperScout24
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\build-exe.ps1"
set "BUILD_EXIT=%ERRORLEVEL%"
if "%BUILD_EXIT%"=="0" (
  echo.
  echo Build completed successfully.
) else (
  echo.
  echo Build failed with exit code %BUILD_EXIT%.
)
pause
exit /b %BUILD_EXIT%
