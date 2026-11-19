#!/usr/bin/env bash
# End-to-end test runner — see test/e2e/README.md.
# Usage: test/e2e/run.sh [restaurant|gym|clinic|agent]   (default: restaurant)
set -u
E="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$E/../.." && pwd)"
SUITE="${1:-restaurant}"

# 1. Local MongoDB 7 in Docker (a fresh, throwaway database — never Atlas).
if ! docker info >/dev/null 2>&1; then (dockerd >/tmp/dockerd.log 2>&1 &); for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done; fi
if ! docker ps --format '{{.Names}}' | grep -q '^lm-mongo$'; then
  docker start lm-mongo >/dev/null 2>&1 || docker run -d --name lm-mongo -p 27017:27017 mirror.gcr.io/library/mongo:7 >/dev/null
  sleep 5
fi
# Wait until Mongo accepts connections, then wipe; never run on yesterday's data.
for i in $(seq 1 30); do docker exec lm-mongo mongosh --quiet --eval 'db.getSiblingDB("lm_e2e").dropDatabase().ok' 2>/dev/null | grep -q 1 && break; sleep 1; done
[ "$(docker exec lm-mongo mongosh --quiet --eval 'db.getSiblingDB("lm_e2e").getCollectionNames().length' 2>/dev/null)" = "0" ] || { echo "Could not wipe the lm_e2e database — is lm-mongo up?"; exit 1; }
rm -f "$E/calls.jsonl"; rm -rf "$E/shots"

# 2. Backend from dist/ in production mode, outbound AI/email/Meta calls faked.
pkill -f "dist/main" 2>/dev/null; sleep 1
(cd "$BACKEND" && nohup env $(grep -v '^#' "$E/e2e.env" | xargs) node -r "$E/fake-net.cjs" dist/main.js > "$E/backend.log" 2>&1 </dev/null &)
for i in $(seq 1 40); do curl -s localhost:4000/health >/dev/null && break; sleep 1; done

# 3. The "restaurant's own website" that embeds the widget.
pkill -f "http.server 3500" 2>/dev/null; sleep 1
(cd "$E/site" && nohup python3 -m http.server 3500 >/dev/null 2>&1 </dev/null &)

# 4. Frontend must already be running on :3410 (see README).
curl -s -o /dev/null localhost:3410 || { echo "Start the frontend first: npm run build && npx next start -p 3410 (frontend repo)"; exit 1; }

cd "$E" && node "$SUITE-e2e.cjs"
