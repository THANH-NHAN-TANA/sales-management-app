#!/bin/bash

echo "🛠️ Setting up local development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "Run: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "Then: sudo apt-get install -y nodejs"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Run: sudo apt-get update && sudo apt-get install -y docker.io"
    echo "Then: sudo usermod -aG docker $USER && newgrp docker"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd src/app
npm install

echo "✅ Dependencies installed"

# Check if main.js exists
if [ ! -f "main.js" ]; then
    echo "⚠️ main.js not found. Please copy it from Claude artifacts."
    echo "You need to copy the Enhanced main.js content to src/app/main.js"
    exit 1
fi

echo "🚀 Starting development server..."
echo "📱 Application will be available at: http://localhost:3000"
echo "🏥 Health Check: http://localhost:3000/health"
echo "📊 API: http://localhost:3000/api/products"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start development server
npm run dev
