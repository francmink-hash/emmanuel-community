@echo off
echo ========================================
echo Starting Local HTTP Server
echo ========================================
echo.
echo Server will run at: http://localhost:8080
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.
cd /d "%~dp0"
python -m http.server 8080 --bind 127.0.0.1
pause
