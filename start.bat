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

REM Check for API key
if "%ANTHROPIC_API_KEY%"=="" (
    echo.
    echo =======================================
    echo    SETUP REQUIRED
    echo =======================================
    echo You need an Anthropic API key to use this app.
    echo.
    echo 1. Go to: https://console.anthropic.com
    echo 2. Create an account and get an API key
    echo 3. Set your API key by running:
    echo    set ANTHROPIC_API_KEY=your-key-here
    echo.
    echo Then run this script again.
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

REM Start the server
npm start