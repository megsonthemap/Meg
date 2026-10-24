@echo off
rem Reel Studio setup for Windows 10/11. Double-click this file, or run it from a terminal.
rem   setup-windows.cmd            install everything + smoke test
rem   setup-windows.cmd doctor     check everything, change nothing
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Get the Windows installer ^(LTS^) from https://nodejs.org,
  echo run it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
node setup.mjs %*
echo.
pause
