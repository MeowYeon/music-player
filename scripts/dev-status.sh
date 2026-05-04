#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

print_status() {
  local name="$1"
  local pid_file="$2"
  local url="$3"

  if [[ -f "$pid_file" ]] && [[ -n "$(cat "$pid_file")" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running pid $(cat "$pid_file")"
  else
    echo "$name: stopped"
  fi

  if curl --noproxy "*" -fsS "$url" >/dev/null 2>&1; then
    echo "$name URL: reachable at $url"
  else
    echo "$name URL: not reachable at $url"
  fi
}

print_status "Backend" "$BACKEND_PID_FILE" "http://127.0.0.1:8080/api/health"
print_status "Frontend" "$FRONTEND_PID_FILE" "http://127.0.0.1:5173"
