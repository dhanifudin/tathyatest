#!/bin/sh
# Reproduce the evaluation reported in the article: Blade, Inertia, then SauceDemo, one stack at a time
# (a small machine cannot hold two app servers and three browsers at once). Reports land in
# metrics/<stack>/ (and the merged metrics/report.*); SauceDemo is reported to metrics-saucedemo/.
#
#   make paper-eval            # all three stacks
#   STACKS="blade" make paper-eval
set -eu

cd "$(dirname "$0")/.."
TT="node generator/dist/cli/main.js"
CONFIG="tathya.paper.config.yaml"
STACKS="${STACKS:-blade inertia saucedemo}"
SERVER_PID=""

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
trap stop_server EXIT INT TERM

wait_for() {
  i=0
  until curl -fsS -o /dev/null "$1"; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { echo "server at $1 did not start" >&2; exit 1; }
    sleep 2
  done
}

for stack in $STACKS; do
  echo "== evaluating $stack"
  case "$stack" in
    blade)   make serve STACK=blade >/dev/null 2>&1 & SERVER_PID=$!; wait_for http://127.0.0.1:8000/login ;;
    inertia) make serve STACK=inertia >/dev/null 2>&1 & SERVER_PID=$!; wait_for http://127.0.0.1:8001/login ;;
    saucedemo) ;;
    *) echo "unknown stack: $stack" >&2; exit 1 ;;
  esac
  $TT -c "$CONFIG" eval --stack "$stack"
  stop_server
done
