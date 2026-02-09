#!/bin/bash

# Poker Simulator Launch Script
# Double-click this file to start the Poker Simulator

# Change to the directory containing this script
cd "$(dirname "$0")"

PORT=3000
PIDFILE="/tmp/poker-simulator-$$.pid"

# Load shell environment to get PATH (for nvm, homebrew, etc.)
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null
elif [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc" 2>/dev/null
elif [ -f "$HOME/.bash_profile" ]; then
  source "$HOME/.bash_profile" 2>/dev/null
fi

# Also check common Node.js installation locations
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

# Try to find node in nvm if it exists
if [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null
fi

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down Poker Simulator..."
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        kill $PID 2>/dev/null
        rm -f "$PIDFILE"
    fi
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    echo "Goodbye!"
    exit 0
}

# Set up signal handlers
trap cleanup EXIT INT TERM

echo "╔════════════════════════════════════════════════╗"
echo "║           Poker Simulator v1.0                 ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
NODE_PATH=$(which node 2>/dev/null)
if [ -z "$NODE_PATH" ]; then
    # Try common locations directly
    for try_path in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
        if [ -x "$try_path" ]; then
            NODE_PATH="$try_path"
            export PATH="$(dirname "$NODE_PATH"):$PATH"
            break
        fi
    done
fi

if [ -z "$NODE_PATH" ] || [ ! -x "$NODE_PATH" ]; then
    echo "❌ Error: Node.js is not installed."
    echo "   Please install Node.js from https://nodejs.org"
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo "✓ Node.js found: $($NODE_PATH --version) at $NODE_PATH"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies (first run)..."
    npm install
    echo "✓ Dependencies installed"
fi

# Check if built
if [ ! -f "packages/web/dist/server.js" ]; then
    echo ""
    echo "🔨 Building application (first run)..."
    npm run build
    echo "✓ Build complete"
fi

# Create data directory
mkdir -p "$(pwd)/data"

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo ""
    echo "⚠️  Port $PORT is in use, stopping existing process..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    sleep 1
fi

echo ""
echo "🚀 Starting server..."

# Start the server
cd packages/web
"$NODE_PATH" dist/server.js &
SERVER_PID=$!
echo $SERVER_PID > "$PIDFILE"
cd ../..

# Wait for server to start
echo -n "   Waiting for server"
for i in {1..30}; do
    if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
        echo " ✓"
        break
    fi
    echo -n "."
    sleep 0.5
done

# Check if server started successfully
if ! curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
    echo ""
    echo "❌ Failed to start server. Please check port $PORT is available."
    echo ""
    echo "Press any key to exit..."
    read -n 1
    cleanup
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  ✓ Poker Simulator is running!"
echo ""
echo "  🌐 Open in browser: http://localhost:$PORT"
echo ""
echo "  Press Ctrl+C or close this window to stop."
echo "════════════════════════════════════════════════"
echo ""

# Open browser
open "http://localhost:$PORT"

# Wait for user to close or Ctrl+C
wait $SERVER_PID
