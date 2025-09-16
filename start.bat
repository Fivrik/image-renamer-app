@echo off
title AI Image Renamer
echo =======================================
echo    AI Image Renamer - Starting...
echo =======================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Check if app is built
if not exist "dist" (
    echo Building the app...
    call npm run build
    if errorlevel 1 (
        echo ERROR: Failed to build the app!
        pause
        exit /b 1
    )
)

REM Load API key from .env file
for /f "tokens=2 delims==" %%i in ('findstr "ANTHROPIC_API_KEY" .env 2^>nul') do set ANTHROPIC_API_KEY=%%i

REM Check if API key was loaded
if "%ANTHROPIC_API_KEY%"=="" (
    echo.
    echo =======================================
    echo    API KEY MISSING
    echo =======================================
    echo Please make sure your .env file contains:
    echo ANTHROPIC_API_KEY=your-key-here
    echo.
    pause
    exit /b 1
)

echo Starting AI Image Renamer...
echo.
echo The app will open in your browser at:
echo http://localhost:3000
echo.
echo To stop the app, close this window or press Ctrl+C
echo.

REM Start the server and open browser
start "" "http://localhost:3000"
npm start