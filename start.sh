#!/bin/bash

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   AI Image Renamer - Starting...${NC}"
echo -e "${BLUE}=======================================${NC}"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed!${NC}"
    echo "Please download and install Node.js from: https://nodejs.org"
    echo
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Failed to install dependencies!${NC}"
        exit 1
    fi
fi

# Check if app is built
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}Building the app...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Failed to build the app!${NC}"
        exit 1
    fi
fi

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo
    echo -e "${YELLOW}=======================================${NC}"
    echo -e "${YELLOW}   SETUP REQUIRED${NC}"
    echo -e "${YELLOW}=======================================${NC}"
    echo "You need an Anthropic API key to use this app."
    echo
    echo "1. Go to: https://console.anthropic.com"
    echo "2. Create an account and get an API key"
    echo "3. Set your API key by running:"
    echo -e "   ${GREEN}export ANTHROPIC_API_KEY=your-key-here${NC}"
    echo
    echo "Then run this script again."
    echo
    exit 1
fi

echo -e "${GREEN}Starting AI Image Renamer...${NC}"
echo
echo "The app will open in your browser at:"
echo -e "${BLUE}http://localhost:3000${NC}"
echo
echo "To stop the app, press Ctrl+C"
echo

# Start the server
npm start