#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_URL="http://127.0.0.1:8080"
FRONTEND_URL="http://127.0.0.1:5173"
GO_BIN="$ROOT_DIR/.tools/go-sdk/go/bin/go"

mkdir -p "$LOG_DIR"

if [[ ! -x "$GO_BIN" ]]; then
  GO_BIN="$(command -v go || true)"
fi

if [[ -z "$GO_BIN" ]]; then
  echo "Go is not available. Expected .tools/go-sdk/go/bin/go or go on PATH." >&2
  exit 1
fi

is_pid_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

wait_for_url() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 120); do
    if curl --noproxy "*" -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "$name did not become ready at $url" >&2
  echo "Check logs in $LOG_DIR" >&2
  return 1
}

listener_pid() {
  local port="$1"
  ss -ltnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
}

cd "$ROOT_DIR"

if curl --noproxy "*" -fsS "$BACKEND_URL/api/health" >/dev/null 2>&1; then
  echo "Backend already reachable at $BACKEND_URL."
  listener_pid 8080 >"$BACKEND_PID_FILE" || true
elif is_pid_running "$BACKEND_PID_FILE"; then
  echo "Backend already running with pid $(cat "$BACKEND_PID_FILE")."
else
  echo "Starting backend..."
  setsid "$GO_BIN" run ./cmd/server >"$LOG_DIR/backend.log" 2>&1 &
  echo "$!" >"$BACKEND_PID_FILE"
fi
wait_for_url "$BACKEND_URL/api/health" "Backend"
listener_pid 8080 >"$BACKEND_PID_FILE" || true

if curl --noproxy "*" -fsS "$FRONTEND_URL" >/dev/null 2>&1; then
  echo "Frontend already reachable at $FRONTEND_URL."
  listener_pid 5173 >"$FRONTEND_PID_FILE" || true
elif is_pid_running "$FRONTEND_PID_FILE"; then
  echo "Frontend already running with pid $(cat "$FRONTEND_PID_FILE")."
else
  echo "Starting frontend..."
  setsid npm run dev -- --host 127.0.0.1 --port 5173 --strictPort >"$LOG_DIR/frontend.log" 2>&1 &
  echo "$!" >"$FRONTEND_PID_FILE"
fi
wait_for_url "$FRONTEND_URL" "Frontend"
listener_pid 5173 >"$FRONTEND_PID_FILE" || true

echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo "Logs:     $LOG_DIR"
