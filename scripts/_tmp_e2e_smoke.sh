#!/usr/bin/env bash
# Skrip sementara: jalankan e2e terhadap DB yang ditentukan env MYSQL_*.
set -u
cd "$(dirname "$0")/.."
node --env-file-if-exists=.env .output/server/index.mjs > /tmp/e2e-server.log 2>&1 &
APP_PID=$!
cleanup() { kill "$APP_PID" 2>/dev/null; wait "$APP_PID" 2>/dev/null; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3999/auth || true)
  if [ "$code" = "200" ]; then break; fi
  sleep 1
done
echo "APP_UP"
npx playwright test "$@"
