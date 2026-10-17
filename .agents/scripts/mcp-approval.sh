#!/usr/bin/env bash
# Approval queue end to end: a key that must ask before opening PRs queues the call; approve runs it, deny doesn't, a second decision is refused.
# Same requirements and cleanup as mcp-tools.sh. Leaves nothing behind.
set -uo pipefail
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar; PW=$(cat dev/forgejo/.admin-password); FJ=(-u "ada:$PW" -H 'content-type: application/json'); AO=(-H 'Origin: http://localhost:5173' -H 'x-sveltekit-action: true' -b $J)
.agents/scripts/login.sh >/dev/null || exit 1
KEY=$(curl -s "${AO[@]}" -F name=ask-test -F repos=ada/sample -F ask=open_pull_request localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
rpc() { curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(("ERROR: " if r.get("isError") else "")+r["content"][0]["text"])'; }
branch() { curl -s -o /dev/null "${FJ[@]}" -X POST localhost:3000/api/v1/repos/ada/sample/contents/$1.txt -d "{\"new_branch\":\"agent/$1\",\"branch\":\"main\",\"message\":\"t\",\"content\":\"$(echo x | base64)\"}"; }
S=$RANDOM; branch ok-$S; branch no-$S
queue() { rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"agent/$1-$S\",\"title\":\"Approval test $1 (throwaway)\"}" | command grep -oP 'as request \K[0-9a-f]{8}'; }
status() { rpc check_request "{\"id\":\"$1\"}" | tr -d '\n '; echo; }
A=$(queue ok); D=$(queue no); echo "queued: $A $D"
echo "PRs before decision: $(curl -s "${FJ[@]}" 'localhost:3000/api/v1/repos/ada/sample/pulls?state=open' | python3 -c 'import sys,json;print(sum("Approval test" in p["title"] for p in json.load(sys.stdin)))')"
echo "status: $(status $A)"
[ -n "${SHOT:-}" ] && bun .agents/tmp/pending-shot.ts
echo "--- approve";  curl -s "${AO[@]}" -F id=$A localhost:5173/settings/agents?/approve | cut -c1-80
echo "status: $(status $A)"
echo "--- deny";     curl -s "${AO[@]}" -F id=$D localhost:5173/settings/agents?/deny | cut -c1-80
echo "status: $(status $D)"
echo "--- approve again (expect 409)"; curl -s "${AO[@]}" -F id=$A localhost:5173/settings/agents?/approve | cut -c1-120
echo "--- other key can't read it"; KEY=$(curl -s "${AO[@]}" -F name=other localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1); rpc check_request "{\"id\":\"$A\"}"
echo "--- cleanup"
for n in $(curl -s "${FJ[@]}" 'localhost:3000/api/v1/repos/ada/sample/pulls?state=all' | python3 -c 'import sys,json;[print(p["number"]) for p in json.load(sys.stdin) if "Approval test" in p["title"]]'); do curl -s -o /dev/null -w "delete PR $n: %{http_code}\n" "${FJ[@]}" -X DELETE localhost:3000/api/v1/repos/ada/sample/issues/$n; done
for b in ok-$S no-$S; do curl -s -o /dev/null -w "delete branch $b: %{http_code}\n" "${FJ[@]}" -X DELETE "localhost:3000/api/v1/repos/ada/sample/branches/agent%2F$b"; done
