@echo off
title HapticPDF Server
echo.
echo  Starting HapticPDF...
echo  Open: http://localhost:3000
echo  Press Ctrl+C to stop.
echo.

:: Open the browser after a short delay (runs async)
start "" /B cmd /C "timeout /t 1 /nobreak >nul && start http://localhost:3000"

:: Start the server (keeps this window open; Ctrl+C stops everything)
node "%~dp0server.js"
