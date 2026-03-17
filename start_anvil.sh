#!/bin/bash

# Start Anvil Flow Editor (Next.js frontend + FastAPI backend)
# Ports: Frontend uses ANVIL_PORT_RANGE (default 4000-4010), backend uses ANVIL_BACKEND_PORT (default 8001).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANVIL_DIR="$SCRIPT_DIR/platform/anvil"
ANVIL_BACKEND_DIR="$SCRIPT_DIR/platform/anvil-backend"

ANVIL_PORT_RANGE=${ANVIL_PORT_RANGE:-4000-4010}
ANVIL_BACKEND_PORT_RANGE=${ANVIL_BACKEND_PORT_RANGE:-9000-9010}
LOGS_DIR="$SCRIPT_DIR/logs"
STATE_FILE="$SCRIPT_DIR/.anvil-port"

# ── Helpers ──────────────────────────────────────────────────────
port_is_in_use() {
  local p=$1
  if command -v ss &>/dev/null; then
    if ss -tlnp 2>/dev/null | grep -qE ":${p}(\$|[^0-9])"; then
      return 0
    fi
  fi
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(('', $p))
    exit(1)
except OSError:
    exit(0)
finally:
    s.close()
" 2>/dev/null
  return $?
}

find_available_port() {
  local start end p
  start=${1%-*}
  end=${1#*-}
  for ((p=start; p<=end; p++)); do
    if ! port_is_in_use "$p"; then
      echo "$p"
      return
    fi
  done
  echo ""
}

# ── Port selection ───────────────────────────────────────────────
if [ -n "${ANVIL_PORT:-}" ]; then
  PORT=$ANVIL_PORT
else
  PORT=$(find_available_port "$ANVIL_PORT_RANGE")
  [ -z "$PORT" ] && { echo "No free port in range $ANVIL_PORT_RANGE"; exit 1; }
fi

mkdir -p "$LOGS_DIR"

# ── Colors ───────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  Anvil Flow Editor - Startup"
echo "=========================================="
echo ""

# ── Dependencies ─────────────────────────────────────────────────
cd "$ANVIL_DIR"
if [ ! -d "node_modules/.bin" ]; then
  echo -e "${BLUE}[ANVIL]${NC} Installing dependencies..."
  npm install || { echo -e "${YELLOW}[ANVIL]${NC} npm install failed"; exit 1; }
  echo -e "${GREEN}[ANVIL]${NC} Dependencies ready"
fi

# ── Backend port selection ────────────────────────────────────────
if [ -n "${ANVIL_BACKEND_PORT:-}" ]; then
  BACKEND_PORT=$ANVIL_BACKEND_PORT
else
  BACKEND_PORT=$(find_available_port "$ANVIL_BACKEND_PORT_RANGE")
  [ -z "$BACKEND_PORT" ] && { echo "No free port in range $ANVIL_BACKEND_PORT_RANGE"; exit 1; }
fi

# ── Start Backend ─────────────────────────────────────────────────
echo -e "${BLUE}[ANVIL]${NC} Starting backend on port $BACKEND_PORT..."
cd "$ANVIL_BACKEND_DIR"
uv run uvicorn app.main:app --reload --port "$BACKEND_PORT" > "$LOGS_DIR/anvil-backend.log" 2>&1 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
echo -e "${GREEN}[ANVIL]${NC} Backend started (PID: $BACKEND_PID)"

# ── Start Frontend ────────────────────────────────────────────────
echo -e "${BLUE}[ANVIL]${NC} Starting frontend on port $PORT..."
cd "$ANVIL_DIR"
PORT=$PORT npm run dev > "$LOGS_DIR/anvil.log" 2>&1 &

ANVIL_PID=$!
cd "$SCRIPT_DIR"

echo -e "${GREEN}[ANVIL]${NC} Frontend started (PID: $ANVIL_PID)"
echo ""
echo "=========================================="
echo -e "${GREEN}Anvil is running!${NC}"
echo "=========================================="
echo ""
echo "  Frontend: http://localhost:$PORT"
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo "  Ping:     http://localhost:$BACKEND_PORT/ping"
echo ""
echo "  Logs: $LOGS_DIR/anvil.log (frontend)"
echo "        $LOGS_DIR/anvil-backend.log (backend)"
echo ""
echo -e "View logs with: ${BLUE}tail -f $LOGS_DIR/anvil*.log${NC}"
echo ""

# ── Port-forward hint ────────────────────────────────────────────
SSH_USER="${USER:-$(whoami 2>/dev/null)}"
SSH_HOST="$(curl -s --connect-timeout 2 -4 ifconfig.me 2>/dev/null || curl -s --connect-timeout 2 -4 icanhazip.com 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo 'this-host')"
echo "--- Port-forward from your local machine (SSH) ---"
echo "  ssh -N -L ${PORT}:localhost:${PORT} ${SSH_USER}@${SSH_HOST}"
echo "  Then open: http://localhost:$PORT"
echo ""
echo "Stop with: kill $ANVIL_PID $BACKEND_PID  or Ctrl+C"
echo "=========================================="
echo ""

# ── State file ───────────────────────────────────────────────────
{
  echo "ANVIL_PORT=$PORT"
  echo "ANVIL_PID=$ANVIL_PID"
  echo "ANVIL_BACKEND_PORT=$BACKEND_PORT"
  echo "BACKEND_PID=$BACKEND_PID"
} > "$STATE_FILE"

# ── Cleanup on exit ──────────────────────────────────────────────
trap "echo ''; echo 'Stopping Anvil...'; kill $ANVIL_PID $BACKEND_PID 2>/dev/null; rm -f \"$STATE_FILE\"; exit" INT TERM

wait
