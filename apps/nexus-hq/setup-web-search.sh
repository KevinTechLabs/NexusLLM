#!/usr/bin/env bash
# Sets up private web search for Nexus HQ: runs SearXNG in Docker (only reachable
# from this computer) and points Nexus HQ at it. Safe to run again.
set -e
cd "$(dirname "$0")"

PORT="${SEARXNG_PORT:-8888}"
NAME="nexus-searxng"
CONF="$PWD/searxng"

echo "== Nexus HQ web search setup =="

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't installed. Install it first: https://docs.docker.com/engine/install/ubuntu/"
  exit 1
fi

# 1. SearXNG settings: turn on the JSON output Nexus HQ needs, with a random secret key
mkdir -p "$CONF"
if [ ! -f "$CONF/settings.yml" ]; then
  KEY="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$CONF/settings.yml" <<EOF
use_default_settings: true
server:
  secret_key: "$KEY"
  limiter: false
  image_proxy: false
search:
  safe_search: 1
  formats:
    - html
    - json
EOF
  echo "Created SearXNG settings in $CONF"
fi

# 2. Start (or restart) the container, reachable only from this machine
if sudo docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Restarting existing $NAME container…"
  sudo docker restart "$NAME" >/dev/null
else
  if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "Port $PORT is already in use. Pick another, e.g.:  SEARXNG_PORT=8899 bash setup-web-search.sh"
    exit 1
  fi
  echo "Downloading and starting SearXNG (first time takes a minute)…"
  sudo docker run -d --name "$NAME" --restart unless-stopped \
    -p "127.0.0.1:$PORT:8080" \
    -v "$CONF:/etc/searxng" \
    searxng/searxng >/dev/null
fi

# 3. Wait until it answers
printf "Waiting for SearXNG"
for _ in $(seq 1 40); do
  if curl -fs "http://127.0.0.1:$PORT/search?q=test&format=json" >/dev/null 2>&1; then break; fi
  printf "."; sleep 2
done
echo
if ! curl -fs "http://127.0.0.1:$PORT/search?q=test&format=json" >/dev/null 2>&1; then
  echo "SearXNG didn't answer. See what went wrong with:  sudo docker logs $NAME"
  exit 1
fi

# 4. Point Nexus HQ at it
touch .env
if grep -q '^SEARXNG_URL=' .env; then
  sed -i "s|^SEARXNG_URL=.*|SEARXNG_URL=http://127.0.0.1:$PORT|" .env
else
  printf '\nSEARXNG_URL=http://127.0.0.1:%s\n' "$PORT" >> .env
fi

if systemctl list-unit-files 2>/dev/null | grep -q '^nexus-hq.service'; then
  sudo systemctl restart nexus-hq && echo "Restarted Nexus HQ."
else
  echo "Now restart Nexus HQ (Ctrl+C, then: node server.js)."
fi
echo "Done. Web search is on. Refresh Nexus HQ in your browser."
