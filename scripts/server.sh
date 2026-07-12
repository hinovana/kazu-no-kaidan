#!/usr/bin/env bash
set -euo pipefail

HOST="127.0.0.1"
PORT="${1:-8765}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./server.sh [port]

Starts a local HTTP server for the worksheet generators and opens the default
browser at the generator index.

Examples:
  ./server.sh
  ./server.sh 9000
EOF
}

if [[ "${PORT}" == "-h" || "${PORT}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "error: port must be an integer from 1 to 65535: ${PORT}" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required" >&2
  exit 1
fi

server_pid=""
cleanup() {
  if [[ -n "${server_pid}" ]] && kill -0 "${server_pid}" >/dev/null 2>&1; then
    kill "${server_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"
python3 -m http.server "${PORT}" --bind "${HOST}" &
server_pid="$!"

ready=0
for _ in {1..50}; do
  if ! kill -0 "${server_pid}" >/dev/null 2>&1; then
    wait "${server_pid}"
    exit $?
  fi

  if python3 - "${HOST}" "${PORT}" <<'PY' >/dev/null 2>&1
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
with socket.create_connection((host, port), timeout=0.2):
    pass
PY
  then
    ready=1
    break
  fi
  sleep 0.1
done

if (( ready != 1 )); then
  echo "error: server did not become ready on http://${HOST}:${PORT}/" >&2
  exit 1
fi

url="http://${HOST}:${PORT}/"
echo "Serving ${ROOT_DIR}"
echo "Open ${url}"

if [[ "${NO_OPEN:-0}" != "1" ]]; then
  open "${url}"
fi

wait "${server_pid}"
