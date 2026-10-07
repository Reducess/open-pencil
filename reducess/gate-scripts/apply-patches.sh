#!/usr/bin/env bash
# Reaplica os patches do gate na cópia instalada (node_modules). Idempotente.
set -euo pipefail
G="$(cd "$(dirname "$0")/.." && pwd)"
cd "$G/app"
for f in "$G"/patches/*.diff; do
  [ -e "$f" ] || continue
  if patch -p1 -N --dry-run -s -d node_modules/@open-pencil < "$f" >/dev/null 2>&1; then
    patch -p1 -N -s -d node_modules/@open-pencil < "$f" && echo "aplicado: $(basename "$f")"
  else echo "ja aplicado ou nao aplica: $(basename "$f")"; fi
done
