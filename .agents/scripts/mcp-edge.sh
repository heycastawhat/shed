#!/usr/bin/env bash
# Malformed and unusual requests to /mcp. Same requirements as mcp-tools.sh.
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar
.agents/scripts/login.sh >/dev/null || exit 1
KEY=$(curl -s -H 'Origin: http://localhost:5173' -H 'x-sveltekit-action: true' -b $J -F name=other -F repos=ada/sample localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
post() { curl -s -o /dev/stdout -w "  [%{http_code}]\n" -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d "$1" | cut -c1-230; }
echo "bad json:";            post '{nope'
echo "batch:";               post '[{"jsonrpc":"2.0","id":1,"method":"ping"}]'
echo "notification:";        post '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo "tools/call no params:"; post '{"jsonrpc":"2.0","id":1,"method":"tools/call"}'
echo "missing args:";        post '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_pull_request","arguments":{"repo":"ada/sample"}}}'
echo "unknown method:";      post '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
echo "list_repositories (key limited to ada/sample):"; post '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_repositories","arguments":{}}}'
echo "tool count: $(curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["result"]["tools"]))')"
