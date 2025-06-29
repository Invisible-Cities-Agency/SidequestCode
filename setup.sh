#!/bin/bash

# Code Quality Orchestrator Setup Script
# Prepares the project for development and testing

set -e

echo "=' Setting up Code Quality Orchestrator..."

# Check Node.js version
NODE_VERSION=$(node --version)
echo "=æ Node.js version: $NODE_VERSION"

if ! command -v npm &> /dev/null; then
    echo "L npm is required but not installed"
    exit 1
fi

# Install dependencies
echo "=å Installing dependencies..."
npm install

# Build the project
echo "<×  Building TypeScript..."
npm run build

# Run type checking
echo "= Type checking..."
npm run typecheck

# Run tests
echo ">ê Running tests..."
npm test

# Create database directory
echo "=Ä  Setting up database directory..."
mkdir -p data

echo " Setup complete!"
echo ""
echo "=€ Quick start:"
echo "  npm run watch          # Start watching with auto-detected colors"
echo "  npm run watch:dark     # Force dark mode"
echo "  npm run watch:light    # Force light mode" 
echo "  npm run watch:enhanced # Include ESLint analysis"
echo ""
echo "=Ú For more options, run:"
echo "  npx cqo --help"
echo ""
echo "<‰ Ready to monitor your code quality!"