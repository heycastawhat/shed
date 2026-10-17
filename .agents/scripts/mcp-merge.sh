#!/usr/bin/env bash
# The opt-in merge tool: hidden and refused for a key without it, queued when the key asks first, and run (as a scheduled auto-merge, then cancelled) when allowed.
# Same requirements as mcp-tools.sh; needs the CI runner up so the PR's checks are pending. Cleans up after itself (run mcp-clean.sh for the keys).
set -uo pipefail
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar; PW=$(cat dev/forgejo/.admin-password); FJ=(-u "ada:$PW" -H 'content-type: application/json'); R=localhost:3000/api/v1/repos/ada/sample
B=agent/merge-test-$RANDOM
.agents/scripts/login.sh >/dev/null || exit 1
key() { curl -s -H 'Origin: http://localhost:5173' -b $J -H 'x-sveltekit-action: true' -F name=$1 -F repos=ada/sample "${@:2}" localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1; }
rpc() { curl -s -H "authorization: Bearer $1" -H 'content-type: application/json' localhost:5173/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$2\",\"params\":$3}"; }
call() { rpc $1 tools/call "{\"name\":\"$2\",\"arguments\":$3}" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(("ERROR: " if r.get("isError") else "")+r["content"][0]["text"])'; }
listed() { rpc $1 tools/list '{}' | python3 -c 'import sys,json;print("merge_pull_request" in [t["name"] for t in json.load(sys.stdin)["result"]["tools"]])'; }
OFF=$(key merge-off); ON=$(key merge-on -F allow=merge_pull_request); ASK=$(key merge-ask -F allow=merge_pull_request -F ask=merge_pull_request)
curl -s -o /dev/null -w "branch: %{http_code}\n" "${FJ[@]}" -X POST $R/contents/mcp-merge-test.txt -d "{\"new_branch\":\"$B\",\"message\":\"merge test\",\"content\":\"$(echo hi | base64)\"}"
N=$(curl -s "${FJ[@]}" -X POST $R/pulls -d "{\"head\":\"$B\",\"base\":\"main\",\"title\":\"MCP merge test (throwaway)\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["number"])')
A="{\"repo\":\"ada/sample\",\"number\":$N,\"when_checks_pass\":true}"
echo "--- off: listed=$(listed $OFF)"; call $OFF merge_pull_request "$A"
echo "--- ask: listed=$(listed $ASK)"; call $ASK merge_pull_request "$A"
echo "--- on: listed=$(listed $ON)"; call $ON merge_pull_request "$A"
echo "timeline: $(curl -s "${FJ[@]}" $R/issues/$N/timeline | python3 -c 'import sys,json;print([e["type"] for e in json.load(sys.stdin)])')"
echo "--- cleanup"
curl -s -o /dev/null -w "cancel auto-merge: %{http_code}\n" "${FJ[@]}" -X DELETE $R/pulls/$N/merge
curl -s -o /dev/null -w "delete PR: %{http_code}\n" "${FJ[@]}" -X DELETE $R/issues/$N
curl -s -o /dev/null -w "delete branch: %{http_code}\n" "${FJ[@]}" -X DELETE "$R/branches/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$B',safe=''))")"
