#!/usr/bin/env bash
G="$(cd "$(dirname "$0")/.." && pwd)"
PORT=${PORT:-18931}
pid=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
[ -n "$pid" ] && kill "$pid" && sleep 0.5
[ "${1:-}" = stop ] && exit 0
cd "$G/app"
PORT=$PORT nohup bun .output/server/index.mjs > "$G/out/server.log" 2>&1 &
sleep 2
