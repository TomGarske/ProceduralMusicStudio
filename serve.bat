@echo off
title ProceduralMusicStudio — http://localhost:8080
cd /d "%~dp0"
echo Serving: %CD%
echo Open: http://localhost:8080
echo Press Ctrl+C to stop.
echo.
python -m http.server 8080
pause
