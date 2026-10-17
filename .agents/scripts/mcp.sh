#!/usr/bin/env bash
# Starts Forgejo and the dev server, creates an agent key through Settings -> Agents, and exercises /mcp with it.
# Needs FORGE_SECRET in .env. Stops both servers when done.
set -uo pipefail
cd "$(dirname "$0")/../.."
# Only starts (and later stops) what isn't already running.
up() { curl -s -o /dev/null "localhost:$1"; }
PIDS=()
rm -f data/forge.json
up 3000 || { (cd dev/forgejo && exec ./forgejo web >/tmp/forgejo.log 2>&1) & PIDS+=($!); }
up 5173 || { (exec bun run dev --port 5173 --strictPort >/tmp/app.log 2>&1) & APP_PID=$!; PIDS+=($APP_PID); }
trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT
for i in $(seq 60); do curl -s -o /dev/null localhost:3000/api/v1/version && curl -s -o /dev/null localhost:5173/ && break; sleep 1; done
curl -s -o /dev/null localhost:3000/api/v1/version && curl -s -o /dev/null localhost:5173/ || { echo 'servers did not start'; tail -n 20 /tmp/forgejo.log /tmp/app.log; exit 1; }
.agents/scripts/login.sh || { tail -n 20 /tmp/app.log; exit 1; }
J=.agents/tmp/app.jar
O=(-H 'Origin: http://localhost:5173')
OUT=$(curl -s "${O[@]}" -b $J -c $J -H 'x-sveltekit-action: true' -F name=test-agent -F repos=ada/sample localhost:5173/settings/agents?/create)
KEY=$(echo "$OUT" | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
echo "key: ${KEY:0:10}…"
[ -n "$KEY" ] || { echo "$OUT"; exit 1; }
rpc() { curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d "$1"; echo; }
echo "--- no key";  curl -s -o /dev/null -w '%{http_code}\n' localhost:5173/mcp -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
echo "--- init";    rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
echo "--- tools";   rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | head -c 400; echo
echo "--- list";    rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_pull_requests","arguments":{"repo":"ada/sample","state":"all"}}}'
echo "--- read";    rpc '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_pull_request","arguments":{"repo":"ada/sample","number":7}}}' | head -c 1500; echo
echo "--- denied";  rpc '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_pull_requests","arguments":{"repo":"other/repo"}}}'
echo "--- browser still logged in:"; curl -s -b $J -o /dev/null -w '%{http_code}\n' localhost:5173/ada/sample

# Drop cached tokens by re-evaluating the server modules (vite dev), so browser and key must both refresh from the one stored chain, concurrently.
touch src/lib/server/store.ts src/lib/server/auth.ts src/lib/server/agents.ts; sleep 2
if true; then
  echo "--- after module reload, 6 concurrent calls (expect 200 x3, key ok x3):"
  for i in 1 2 3; do curl -s -b $J -o /dev/null -w 'browser %{http_code}\n' localhost:5173/ada/sample & done
  for i in 1 2 3; do rpc '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"list_pull_requests","arguments":{"repo":"ada/sample"}}}' | head -c 70 & done
  wait
  echo "--- and again later (second refresh chain link works):"
  curl -s -b $J -o /dev/null -w 'browser %{http_code}\n' localhost:5173/ada/sample
fi
